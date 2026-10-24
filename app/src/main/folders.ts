export function add(list: readonly string[], path: string): string[] {
  return list.includes(path) ? [...list] : [...list, path];
}

export function remove(list: readonly string[], path: string): string[] {
  return list.filter((entry) => entry !== path);
}

// A broken folders.json must not keep the app from starting, so anything
// unexpected starts from an empty list. A hand-edited file may repeat a path;
// keep it once, as `add` does, so one folder never gets two keys and watchers.
export function load(text: string): string[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) return [];
  return [...new Set(value.filter((entry) => entry !== ""))];
}

// Undo puts a removed folder back where it was. An index past the end appends,
// and a path that is already stored stays where it is.
export function insertAt(list: readonly string[], path: string, index: number): string[] {
  if (list.includes(path)) return [...list];
  const at = Math.min(Math.max(Math.trunc(index) || 0, 0), list.length);
  return [...list.slice(0, at), path, ...list.slice(at)];
}

// Locate swaps a missing folder for the one picked, in the same place. If the
// picked folder is already stored elsewhere, only the old entry goes, so one
// folder never gets two keys and watchers.
export function replaceAt(list: readonly string[], from: string, to: string): string[] {
  if (!list.includes(from) || from === to) return [...list];
  if (list.includes(to)) return remove(list, from);
  return list.map((entry) => (entry === from ? to : entry));
}
