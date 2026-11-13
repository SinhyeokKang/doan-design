// The opt-in prototype mark on a `data-doan-frame` element: the viewport the prototype window first opens at.
// Pure and Electron-free: the renderer imports it for playability, and `doan check` implements the same grammar in Go.

export const PROTOTYPE_MARK_ATTRIBUTE = "data-doan-prototype";

// What the board's `layout` message may carry as the raw value. The longest valid mark is 11 characters; the cap only
// keeps a junk value from growing the message, it is not part of the grammar.
export const MAX_PROTOTYPE_MARK = 32;

export interface PrototypeSize {
  width: number;
  height: number;
}

// ASCII digits only, no leading zero, one lowercase `x`. JavaScript's `$` without the `m` flag matches only at the
// very end, so a trailing newline fails here as it does in Go; nothing is trimmed, so a BOM or NBSP fails too.
const MARK = /^([1-9][0-9]{0,4})x([1-9][0-9]{0,4})$/;

export function parsePrototypeMark(value: unknown): PrototypeSize | null {
  if (typeof value !== "string") return null;
  const match = MARK.exec(value);
  if (match === null) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}
