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
