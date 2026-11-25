export function projectNames(paths: readonly string[]): Map<string, string> {
  const parts = (path: string) => path.split("/").filter(Boolean);
  const basename = (path: string) => parts(path).at(-1) ?? path;
  const counts = new Map<string, number>();
  for (const path of paths) counts.set(basename(path), (counts.get(basename(path)) ?? 0) + 1);
  return new Map(paths.map((path) => [path, (counts.get(basename(path)) ?? 0) > 1 ? parts(path).slice(-2).join("/") : basename(path)]));
}
