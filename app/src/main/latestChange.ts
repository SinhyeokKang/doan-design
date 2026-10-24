// The newest canvas mtime of a folder, for the home row's "last change". A
// canvas deleted between `doan ls` and the stat has no value and is skipped.
export function latestChange(mtimes: readonly (number | undefined)[]): number | undefined {
  let latest: number | undefined;
  for (const mtime of mtimes) {
    if (mtime === undefined || !Number.isFinite(mtime)) continue;
    if (latest === undefined || mtime > latest) latest = mtime;
  }
  return latest;
}
