// ============================================================================
// Simulated Sametime presence. Derived deterministically from the buddy's
// display name so the buddy list and every chat window always agree.
// ============================================================================

export type Presence = "online" | "away" | "offline";

export function presenceOf(name: string): Presence {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const r = h % 3;
  return r === 0 ? "online" : r === 1 ? "away" : "offline";
}
