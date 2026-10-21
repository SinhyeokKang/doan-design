export function add(list: readonly string[], path: string): string[] {
  return list.includes(path) ? [...list] : [...list, path];
}

export function remove(list: readonly string[], path: string): string[] {
  return list.filter((entry) => entry !== path);
}

// A broken folders.json must not keep the app from starting, so anything
// unexpected starts from an empty list.
export function load(text: string): string[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : [];
}
