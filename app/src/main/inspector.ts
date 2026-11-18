// The cap is the selector cap of the canvas messages (UTF-16 units, as `String.length` counts).
const SELECTOR_LIMIT = 1000;

export interface InspectRequest {
  selector: string;
  // The listed canvas the renderer means; main answers only while the window shows that document.
  canvas: { root: string; path: string };
  seq: number;
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}

const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;

// IPC `inspect:get` takes `{selector, canvas: {root, path}, seq}` and nothing else.
export function parseInspectRequest(value: unknown): InspectRequest | null {
  if (!exactKeys(value, ["selector", "canvas", "seq"])) return null;
  const { selector, canvas, seq } = value;
  if (typeof selector !== "string" || selector.length < 1 || selector.length > SELECTOR_LIMIT) return null;
  if (!exactKeys(canvas, ["root", "path"]) || !text(canvas.root) || !text(canvas.path)) return null;
  if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0) return null;
  return { selector, canvas: { root: canvas.root, path: canvas.path }, seq };
}
