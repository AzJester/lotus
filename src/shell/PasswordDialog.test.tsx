// ============================================================================
// PasswordDialog tests: the field shows X's and never what was typed, the
// hieroglyphs are a pure function of the password, and OK, Enter, Esc and the
// Wrong Password message box behave the way Notes did.
// ============================================================================

import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import PasswordDialog, { glyphsFor, maskFor } from "./PasswordDialog";
import { DEFAULT_GLYPHS, HIEROGLYPHS, STOP_ICON } from "./hieroglyphs";
import { PALETTE } from "../components/icons/palette";

afterEach(cleanup);

const WRONG =
  "Wrong Password. (Passwords are case sensitive - be sure to use correct upper and lower case.)";

function setup(mode: "startup" | "locked" = "startup") {
  const onUnlock = vi.fn();
  const onCancel = vi.fn();
  // createElement rather than JSX: the Vitest config has no React plugin, so
  // test files get the classic JSX transform.
  render(createElement(PasswordDialog, { userName: "Sam Rivera/Acme", mode, onUnlock, onCancel }));
  const field = screen.getByLabelText("Password") as HTMLInputElement;
  return { field, onUnlock, onCancel };
}

/** Type one key at a time, the way the keyboard delivers it. */
function type(field: HTMLElement, text: string) {
  for (const key of Array.from(text)) fireEvent.keyDown(field, { key });
}

/** Ids of the four hieroglyphs currently shown in the picture panel. */
const shownGlyphs = () =>
  Array.from(document.querySelectorAll("[data-glyph]")).map((el) => el.getAttribute("data-glyph"));

const idsFor = (password: string) => glyphsFor(password).map((i) => HIEROGLYPHS[i].id);

describe("PasswordDialog field", () => {
  it("autofocuses the password field", () => {
    const { field } = setup();
    expect(document.activeElement).toBe(field);
  });

  it("shows X's for typed characters and never the characters themselves", () => {
    const { field } = setup();
    type(field, "Sphinx9Quokka");
    expect(field.value).toMatch(/^X+$/);
    expect(field.value).toBe(maskFor("Sphinx9Quokka"));
    expect(field.value.length).toBeGreaterThanOrEqual(13);
    expect(field.value.length).toBeLessThanOrEqual(39);
    // Nothing on the page (text, attributes, labels) gives the password away.
    for (const secret of ["Sphinx9Quokka", "Sphinx", "Quokka"]) {
      expect(document.body.innerHTML).not.toContain(secret);
    }
  });

  it("adds 1 to 3 X's per character, so the length gives nothing away", () => {
    const password = "correct horse battery staple";
    const steps = new Set<number>();
    for (let i = 1; i <= password.length; i++) {
      const step = maskFor(password.slice(0, i)).length - maskFor(password.slice(0, i - 1)).length;
      expect(step).toBeGreaterThanOrEqual(1);
      expect(step).toBeLessThanOrEqual(3);
      steps.add(step);
    }
    expect(steps.size).toBe(3);
    expect(maskFor(password)).toBe(maskFor(password));
    expect(maskFor("")).toBe("");
  });

  it("Backspace removes the last character and its X's; paste appends", () => {
    const { field } = setup();
    type(field, "abc");
    fireEvent.keyDown(field, { key: "Backspace" });
    expect(field.value).toBe(maskFor("ab"));
    fireEvent.paste(field, { clipboardData: { getData: () => "xyz\n" } });
    expect(field.value).toBe(maskFor("abxyz"));
    expect(shownGlyphs()).toEqual(idsFor("abxyz"));
  });

  it("re-rolls the pictures on every keystroke", () => {
    const { field } = setup();
    expect(shownGlyphs()).toEqual(idsFor(""));
    let before = shownGlyphs();
    for (const key of "Notes") {
      type(field, key);
      const after = shownGlyphs();
      expect(after).not.toEqual(before);
      before = after;
    }
    expect(before).toEqual(idsFor("Notes"));
  });

  it("names the user ID under the field", () => {
    setup();
    expect(screen.getByText("User ID: Sam Rivera/Acme")).toBeTruthy();
    expect(screen.getByText("Enter your password:")).toBeTruthy();
  });
});

describe("glyphsFor", () => {
  it("is deterministic and changes with the password", () => {
    expect(glyphsFor("")).toEqual([...DEFAULT_GLYPHS]);
    expect(glyphsFor("Lotus123")).toEqual(glyphsFor("Lotus123"));
    expect(glyphsFor("Lotus123")).not.toEqual(glyphsFor("Lotus124"));
    expect(glyphsFor("lotus")).not.toEqual(glyphsFor("Lotus"));
    const password = "Lotus123";
    let previous = glyphsFor("");
    for (let i = 1; i <= password.length; i++) {
      const next = glyphsFor(password.slice(0, i));
      expect(next).not.toEqual(previous);
      previous = next;
    }
  });

  it("always deals four different, valid glyphs and uses the whole set", () => {
    const seen = new Set<number>();
    for (let n = 0; n < 300; n++) {
      const picks = glyphsFor("pw" + n.toString(36) + "!");
      expect(picks).toHaveLength(4);
      expect(new Set(picks).size).toBe(4);
      for (const g of picks) {
        expect(Number.isInteger(g)).toBe(true);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThan(HIEROGLYPHS.length);
        seen.add(g);
      }
    }
    expect(seen.size).toBe(HIEROGLYPHS.length);
  });

  it("does not mutate the default set", () => {
    glyphsFor("anything");
    expect(glyphsFor("")).toEqual([...DEFAULT_GLYPHS]);
  });
});

describe("hieroglyph artwork", () => {
  it("has at least 12 well-formed 32x32 glyphs in 2 or 3 colors", () => {
    expect(HIEROGLYPHS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(HIEROGLYPHS.map((g) => g.id)).size).toBe(HIEROGLYPHS.length);
    for (const glyph of HIEROGLYPHS) {
      expect(glyph.art.size).toBe(32);
      expect(glyph.art.rows).toHaveLength(32);
      const colors = new Set<string>();
      for (const row of glyph.art.rows) {
        expect(row).toHaveLength(32);
        for (const key of row) {
          if (key === ".") continue;
          expect(PALETTE[key], `${glyph.id} uses unknown key "${key}"`).toBeDefined();
          colors.add(key);
        }
      }
      expect(colors.size, glyph.id).toBeGreaterThanOrEqual(2);
      expect(colors.size, glyph.id).toBeLessThanOrEqual(3);
    }
  });

  it("has a well-formed message box icon", () => {
    expect(STOP_ICON.rows).toHaveLength(32);
    for (const row of STOP_ICON.rows) expect(row).toHaveLength(32);
  });
});

describe("PasswordDialog buttons and keys", () => {
  it("OK with an empty password shows Wrong Password and does not unlock", () => {
    const { field, onUnlock } = setup();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    const box = screen.getByRole("alertdialog");
    expect(within(box).getByText("Lotus Notes")).toBeTruthy();
    expect(within(box).getByText(WRONG)).toBeTruthy();
    expect(onUnlock).not.toHaveBeenCalled();

    // Dismissing the message box puts focus back in the password field.
    fireEvent.click(within(box).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(field);
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("Enter with an empty password shows the box; Esc closes only the box", () => {
    const { field, onCancel, onUnlock } = setup();
    fireEvent.keyDown(field, { key: "Enter" });
    const box = screen.getByRole("alertdialog");
    const ok = within(box).getByRole("button", { name: "OK" });
    expect(document.activeElement).toBe(ok);
    fireEvent.keyDown(ok, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(field);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("OK with a non-empty password calls onUnlock", () => {
    const { field, onUnlock, onCancel } = setup();
    type(field, "s3cret");
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("Enter in the field is OK", () => {
    const { field, onUnlock } = setup("locked");
    type(field, "s3cret");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("Esc, Cancel and the title bar's close button call onCancel", () => {
    const { field, onCancel, onUnlock } = setup("locked");
    type(field, "abc");
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("keeps keystrokes from reaching the Notes window behind it", () => {
    const behind = vi.fn();
    window.addEventListener("keydown", behind);
    try {
      const { field } = setup("locked");
      type(field, "ab");
      fireEvent.keyDown(field, { key: "Delete" });
      fireEvent.keyDown(field, { key: "n", ctrlKey: true });
      expect(behind).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", behind);
    }
  });

  it("gives focus back to what had it once the dialog closes", () => {
    const before = document.createElement("button");
    document.body.appendChild(before);
    before.focus();
    try {
      const { field } = setup("locked");
      expect(document.activeElement).toBe(field);
      cleanup();
      expect(document.activeElement).toBe(before);
    } finally {
      before.remove();
    }
  });

  it("renders the startup desktop or the locked scrim", () => {
    setup("startup");
    expect(document.querySelector(".pw-backdrop.pw-startup")).toBeTruthy();
    cleanup();
    setup("locked");
    expect(document.querySelector(".pw-backdrop.pw-locked")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Enter Password" })).toBeTruthy();
  });
});
