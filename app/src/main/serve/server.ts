import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath, type FileHandle } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname } from "node:path";
import { inScope, parseServePath, relInside } from "./path";

export interface ServedFolder {
  root: string;
  scope: readonly string[];
}

export interface LocalServer {
  readonly host: string;
  readonly port: number;
  readonly token: string;
  addFolder(folder: ServedFolder): string;
  updateFolder(key: string, folder: ServedFolder): void;
  removeFolder(key: string): void;
  close(): Promise<void>;
}

const HOST = "127.0.0.1";

// macOS `O_NOFOLLOW_ANY` (<sys/fcntl.h>): fail with ELOOP if any component of
// the path is a symlink. Node does not export it. The app is Mac-only (PRODUCT).
const O_NOFOLLOW_ANY = 0x20000000;

// The server opens only realpath results, which contain no links. Opening them
// with O_NOFOLLOW_ANY means a directory swapped for a link between the realpath
// check and the open fails instead of leading the open outside the scope.
export function openNoFollow(path: string): Promise<FileHandle> {
  return open(path, O_NOFOLLOW_ANY | constants.O_RDONLY);
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

export async function startServer(): Promise<LocalServer> {
  const token = randomBytes(32).toString("hex");
  const folders = new Map<string, ServedFolder>();
  let port = 0;

  const server = createServer((req, res) => {
    handle(req, res).catch(() => fail(res));
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // The token alone does not stop DNS rebinding: a canvas script can read it
    // from `location` and hand it to a page on another name that resolves here.
    if (req.headers.host !== `${HOST}:${port}` || (req.method !== "GET" && req.method !== "HEAD")) return notFound(res);
    const parsed = parseServePath(req.url ?? "", token);
    const folder = parsed && folders.get(parsed.folderKey);
    if (!parsed || !folder) return notFound(res);

    // `fs.promises.realpath` returns the on-disk spelling (letter case and
    // NFC/NFD, PoC 4), so the scope comparison needs no separate step. The JS
    // `fs.realpath`/`realpathSync` keep the request's spelling and must not be used.
    let realRoot: string;
    let realFile: string;
    try {
      realRoot = await realpath(folder.root);
      realFile = await realpath(`${realRoot}/${parsed.rel}`);
    } catch {
      return notFound(res);
    }
    const rel = relInside(realRoot, realFile);
    if (rel === null || !inScope(rel, folder.scope)) return notFound(res);

    // Everything after this works on the fd, so the file served is the one
    // opened here; ELOOP from a swapped link is a 404 like any other error.
    let file: FileHandle | undefined;
    try {
      file = await openNoFollow(realFile);
    } catch {
      return notFound(res);
    }
    try {
      const stat = await file.stat();
      if (!stat.isFile()) return notFound(res);
      res.writeHead(200, {
        "Content-Type": TYPES[extname(realFile).toLowerCase()] ?? "application/octet-stream",
        "Content-Length": stat.size,
        "Cache-Control": "no-store",
        // The sandboxed iframe's origin is opaque, and Chromium fetches fonts and
        // module scripts in CORS mode, so in-scope files need this (ARCHITECTURE §3).
        "Access-Control-Allow-Origin": "null",
      });
      if (req.method === "HEAD" || stat.size === 0) {
        res.end();
        return;
      }
      // Stop at the fstat size: a file that grows mid-transfer would otherwise
      // write past Content-Length into the keep-alive connection, and the
      // browser would read the extra bytes as the start of the next response.
      const stream = file.createReadStream({ start: 0, end: stat.size - 1 });
      file = undefined;
      stream.on("error", () => res.destroy());
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    } finally {
      await file?.close();
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("local server has no TCP address");
  port = address.port;

  return {
    // Read back from the socket rather than echoing HOST, so a test can tell
    // a wildcard bind apart from loopback.
    host: address.address,
    port,
    token,
    addFolder(folder) {
      const key = randomBytes(16).toString("hex");
      folders.set(key, folder);
      return key;
    },
    updateFolder(key, folder) {
      if (folders.has(key)) folders.set(key, folder);
    },
    removeFolder(key) {
      folders.delete(key);
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}

// One answer for every refusal, so a caller cannot tell a wrong token from a
// file outside the scope. `Content-Length: 0` keeps it from going out chunked.
function notFound(res: ServerResponse): void {
  res.writeHead(404, { "Content-Length": 0 });
  res.end();
}

function fail(res: ServerResponse): void {
  if (res.headersSent) res.destroy();
  else notFound(res);
}
