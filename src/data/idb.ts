// ============================================================================
// Lotus Notes — IndexedDB-backed persistence
// A zustand-compatible async storage (the StateStorage shape: string in/out,
// Promises allowed). Documents now live in IndexedDB ("lotus-notes" / store
// "kv") instead of localStorage so the workspace survives larger datasets.
//
// Safe fallback: in environments without IndexedDB (Node / jsdom under Vitest)
// the storage transparently uses localStorage, so the app and the test suite
// keep working unchanged. On the first read for a key that IndexedDB does not
// yet hold but localStorage does (migration from the old backend), the
// localStorage value is returned and best-effort copied into IndexedDB.
// ============================================================================

const DB_NAME = "lotus-notes";
const STORE_NAME = "kv";

/** True when a usable IndexedDB implementation is present (browser runtime). */
function hasIndexedDB(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

/** True when a usable localStorage is present (guarded for SSR / sandboxes). */
function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

/** Open (once) the database, creating the object store on first use. */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  return dbPromise;
}

/** Run a transaction against the kv store and resolve with its request value. */
async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = fn(store);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function idbGet(name: string): Promise<string | null> {
  const value = await withStore<unknown>("readonly", (store) => store.get(name));
  return typeof value === "string" ? value : null;
}

async function idbSet(name: string, value: string): Promise<void> {
  await withStore("readwrite", (store) => store.put(value, name));
}

async function idbDelete(name: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(name));
}

/**
 * The zustand StateStorage object. All methods are async (Promise-returning),
 * which zustand's persist middleware supports natively (hydration is async).
 */
export const idbStorage = {
  async getItem(name: string): Promise<string | null> {
    if (!hasIndexedDB()) {
      return hasLocalStorage() ? localStorage.getItem(name) : null;
    }
    try {
      const value = await idbGet(name);
      if (value !== null) return value;
      // Migrate a value left behind by the previous localStorage backend.
      if (hasLocalStorage()) {
        const legacy = localStorage.getItem(name);
        if (legacy !== null) {
          // Best-effort copy into IndexedDB; ignore failures.
          try {
            await idbSet(name, legacy);
          } catch {
            /* ignore */
          }
          return legacy;
        }
      }
      return null;
    } catch {
      // If IndexedDB misbehaves, fall back to localStorage so the app still loads.
      return hasLocalStorage() ? localStorage.getItem(name) : null;
    }
  },

  async setItem(name: string, value: string): Promise<void> {
    if (!hasIndexedDB()) {
      if (hasLocalStorage()) localStorage.setItem(name, value);
      return;
    }
    try {
      await idbSet(name, value);
    } catch {
      if (hasLocalStorage()) localStorage.setItem(name, value);
    }
  },

  async removeItem(name: string): Promise<void> {
    if (!hasIndexedDB()) {
      if (hasLocalStorage()) localStorage.removeItem(name);
      return;
    }
    try {
      await idbDelete(name);
    } catch {
      if (hasLocalStorage()) localStorage.removeItem(name);
    }
  },
};
