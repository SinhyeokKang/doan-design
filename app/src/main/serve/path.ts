export interface ServePath {
  folderKey: string;
  rel: string;
}

// Parses the raw request path by hand: `new URL()` would already have resolved
// `..` and `%2e%2e` and turned `\` into `/`, hiding exactly what must be rejected.
export function parseServePath(rawPath: string, token: string): ServePath | null {
  const end = rawPath.search(/[?#]/);
  const path = end === -1 ? rawPath : rawPath.slice(0, end);
  const [empty, prefix, pathToken, folderKey, ...rest] = path.split("/");
  if (empty !== "" || prefix !== "t" || token === "" || pathToken !== token || !folderKey || rest.length === 0) {
    return null;
  }
  const segments: string[] = [];
  for (const raw of rest) {
    const segment = decodeSegment(raw);
    if (segment === null) return null;
    segments.push(segment);
  }
  return { folderKey, rel: segments.join("/") };
}

function decodeSegment(raw: string): string | null {
  let segment: string;
  try {
    segment = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (segment === "" || segment === "." || segment === ".." || /[/\\\0]/.test(segment)) return null;
  return segment;
}

// Compares by path segment so `/repo2` is not inside `/repo` (ARCHITECTURE §13).
export function relInside(realRoot: string, realPath: string): string | null {
  if (realPath === realRoot) return "";
  const prefix = realRoot.endsWith("/") ? realRoot : `${realRoot}/`;
  return realPath.startsWith(prefix) ? realPath.slice(prefix.length) : null;
}

// Same rule as `doan check` (`css_not_served`): equal to an entry or under it.
export function inScope(rel: string, scope: readonly string[]): boolean {
  return scope.some((entry) => rel === entry || rel.startsWith(`${entry}/`));
}
