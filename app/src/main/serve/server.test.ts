import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { connect } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { openNoFollow, startServer, type LocalServer } from "./server";

interface Response {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

// Raw `http.request` keeps `..`, `%2e%2e` and `\` in the path exactly as written;
// `fetch`/`new URL()` would normalize them before they reach the server.
function send(port: number, path: string, options: { method?: string; host?: string } = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path, method: options.method ?? "GET", headers: { Host: options.host ?? `127.0.0.1:${port}` }, agent: false },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString() }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function corsHeaders(headers: IncomingHttpHeaders): string[] {
  return Object.keys(headers).filter((name) => name.startsWith("access-control-"));
}

function expectNotFound(res: Response): void {
  expect(res.status).toBe(404);
  expect(res.body).toBe("");
  expect(res.headers["content-length"]).toBe("0");
  expect(res.headers["transfer-encoding"]).toBeUndefined();
  expect(corsHeaders(res.headers)).toEqual([]);
}

const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-serve-")));
const repo = join(tmp, "repo");
const dotRepo = join(tmp, "dot-repo");
const outside = join(tmp, "outside");
const nfc = "한글.html";
const caseInsensitive = (() => {
  mkdirSync(join(tmp, "probe"));
  return existsSync(join(tmp, "PROBE"));
})();
const normalizationInsensitive = (() => {
  writeFileSync(join(tmp, nfc), "");
  return existsSync(join(tmp, nfc.normalize("NFD")));
})();
const isRoot = process.getuid?.() === 0;
const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find((entry) => entry && entry.family === "IPv4" && !entry.internal)?.address;

function refused(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    socket.on("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(true));
  });
}

let server: LocalServer;
let key: string;
let dotKey: string;
let base: string;

beforeAll(async () => {
  mkdirSync(join(repo, "doan", "sub"), { recursive: true });
  mkdirSync(join(repo, "design-x"));
  mkdirSync(join(repo, "src"));
  mkdirSync(outside);
  writeFileSync(join(repo, "doan", "a.html"), "<!doctype html><title>A</title>");
  writeFileSync(join(repo, "doan", "a.css"), "body{}");
  writeFileSync(join(repo, "doan", "sub", "b.css"), "p{}");
  writeFileSync(join(repo, "doan", nfc), "nfc");
  writeFileSync(join(repo, "doan", "locked.css"), "locked");
  chmodSync(join(repo, "doan", "locked.css"), 0o000);
  writeFileSync(join(repo, "doan", "big.bin"), Buffer.alloc(8 * 1024 * 1024, 1));
  writeFileSync(join(repo, "doan", "short.bin"), Buffer.alloc(8 * 1024 * 1024, 1));
  writeFileSync(join(repo, "doan", "grow.bin"), Buffer.alloc(16 * 1024 * 1024, 1));
  writeFileSync(join(repo, "doan", "empty.css"), "");
  mkdirSync(join(repo, "doan", "real-dir"));
  writeFileSync(join(repo, "doan", "real-dir", "s.txt"), "inside");
  mkdirSync(join(outside, "real-dir"));
  writeFileSync(join(outside, "real-dir", "s.txt"), "outside");
  symlinkSync(outside, join(repo, "doan", "swapped"));
  writeFileSync(join(repo, "design-x", "a.css"), "x{}");
  writeFileSync(join(repo, "tokens.css"), ":root{}");
  writeFileSync(join(repo, ".env"), "SECRET=1");
  writeFileSync(join(repo, "src", "secret.ts"), "export const secret = 1;");
  writeFileSync(join(outside, "secret.txt"), "outside");
  symlinkSync(join(outside, "secret.txt"), join(repo, "doan", "link-out"));
  symlinkSync("missing.css", join(repo, "doan", "dangling.css"));
  symlinkSync("loop", join(repo, "doan", "loop"));

  mkdirSync(dotRepo);
  symlinkSync(".", join(dotRepo, "doan"));
  writeFileSync(join(dotRepo, ".env"), "SECRET=1");
  writeFileSync(join(dotRepo, "a.html"), "<!doctype html>");

  server = await startServer();
  key = server.addFolder({ root: repo, scope: ["doan", "tokens.css"] });
  // Worst case on purpose: even if `doan -> .` reached the scope, realpath
  // must turn `doan/.env` back into `.env`.
  dotKey = server.addFolder({ root: dotRepo, scope: ["doan"] });
  base = `/t/${server.token}/${key}`;
});

afterAll(async () => {
  await server.close();
  chmodSync(join(repo, "doan", "locked.css"), 0o644);
  rmSync(tmp, { recursive: true, force: true });
});

describe("in-scope files", () => {
  test("serve 200 with type, no-store and only the null-origin CORS header", async () => {
    const res = await send(server.port, `${base}/doan/a.html`);
    expect(res.status).toBe(200);
    expect(res.body).toBe("<!doctype html><title>A</title>");
    expect(res.headers["content-type"]).toMatch(/^text\/html/);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["content-length"]).toBe(String(res.body.length));
    expect(res.headers["access-control-allow-origin"]).toBe("null");
    expect(corsHeaders(res.headers)).toEqual(["access-control-allow-origin"]);
  });

  test("serve the token CSS and nested files with their content type", async () => {
    const tokens = await send(server.port, `${base}/tokens.css`);
    expect(tokens.status).toBe(200);
    expect(tokens.headers["content-type"]).toMatch(/^text\/css/);
    const nested = await send(server.port, `${base}/doan/sub/b.css`);
    expect(nested.status).toBe(200);
    expect(nested.body).toBe("p{}");
  });

  test("ignore the query string", async () => {
    expect((await send(server.port, `${base}/doan/a.html?x=1`)).status).toBe(200);
  });

  test("an empty file is 200 with an empty body", async () => {
    const res = await send(server.port, `${base}/doan/empty.css`);
    expect(res.status).toBe(200);
    expect(res.headers["content-length"]).toBe("0");
    expect(res.body).toBe("");
  });

  test("HEAD is 200 with the same headers and no body", async () => {
    const res = await send(server.port, `${base}/doan/a.html`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.body).toBe("");
    expect(res.headers["content-length"]).toBe("31");
    expect(res.headers["access-control-allow-origin"]).toBe("null");
  });

  test.skipIf(!caseInsensitive)("DOAN/A.CSS serves doan/a.css", async () => {
    const res = await send(server.port, `${base}/DOAN/A.CSS`);
    expect(res.status).toBe(200);
    expect(res.body).toBe("body{}");
  });

  test.skipIf(!normalizationInsensitive)("an NFC name requested in NFD is served", async () => {
    const res = await send(server.port, `${base}/doan/${encodeURIComponent(nfc.normalize("NFD"))}`);
    expect(res.status).toBe(200);
    expect(res.body).toBe("nfc");
  });
});

describe("everything else is the same bodiless 404", () => {
  test.each([
    [".env"],
    ["src/secret.ts"],
    ["design-x/a.css"],
    ["doan"],
    ["doan/sub"],
    ["doan/link-out"],
    ["doan/dangling.css"],
    ["doan/loop"],
    ["doan/missing.html"],
    ["tokens.css/x.css"],
    [`doan/${"a".repeat(300)}.html`],
  ])("%s", async (rel) => {
    expectNotFound(await send(server.port, `${base}/${rel}`));
  });

  test.skipIf(isRoot)("a file the app cannot read (EACCES)", async () => {
    expectNotFound(await send(server.port, `${base}/doan/locked.css`));
  });

  test.each([
    ["doan/../.env"],
    ["doan/%2e%2e/.env"],
    ["doan/%2E%2E/.env"],
    ["doan%2f..%2f.env"],
    ["design%5c..%5c.env"],
    ["design\\..\\.env"],
    ["doan/a.html%00"],
    ["doan/%zz"],
  ])("raw path %s", async (rel) => {
    expectNotFound(await send(server.port, `${base}/${rel}`));
  });

  test("paths outside the token prefix", async () => {
    expectNotFound(await send(server.port, "/.env"));
    expectNotFound(await send(server.port, "/doan/a.html"));
    expectNotFound(await send(server.port, `/t/${server.token}`));
  });

  test("a different token", async () => {
    const other = server.token.replace(/^./, (c) => (c === "0" ? "1" : "0"));
    expectNotFound(await send(server.port, `/t/${other}/${key}/doan/a.html`));
  });

  test("an unknown folder key", async () => {
    expectNotFound(await send(server.port, `/t/${server.token}/${"0".repeat(32)}/doan/a.html`));
  });

  test("a closed folder's key", async () => {
    const closed = server.addFolder({ root: repo, scope: ["doan"] });
    expect((await send(server.port, `/t/${server.token}/${closed}/doan/a.html`)).status).toBe(200);
    server.removeFolder(closed);
    expectNotFound(await send(server.port, `/t/${server.token}/${closed}/doan/a.html`));
  });

  test("a different Host header", async () => {
    for (const host of [`localhost:${server.port}`, `evil.test:${server.port}`, "127.0.0.1", `127.0.0.1:${server.port + 1}`]) {
      expectNotFound(await send(server.port, `${base}/doan/a.html`, { host }));
    }
  });

  test("methods other than GET and HEAD", async () => {
    for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
      expectNotFound(await send(server.port, `${base}/doan/a.html`, { method }));
    }
  });

  test("a `doan -> .` repo does not expose the repo root", async () => {
    expectNotFound(await send(server.port, `/t/${server.token}/${dotKey}/doan/.env`));
    expectNotFound(await send(server.port, `/t/${server.token}/${dotKey}/doan/a.html`));
  });
});

describe("the server", () => {
  test("reports the address it is bound to, which is 127.0.0.1", () => {
    expect(server.host).toBe("127.0.0.1");
  });

  test("refuses IPv6 loopback", async () => {
    expect(await refused("::1", server.port)).toBe(true);
  });

  test.skipIf(lanAddress === undefined)("refuses a non-loopback IPv4 address", async () => {
    expect(await refused(lanAddress ?? "", server.port)).toBe(true);
  });

  test("uses a new random token on every start", async () => {
    const other = await startServer();
    try {
      expect(server.token).toMatch(/^[0-9a-f]{64}$/);
      expect(other.token).toMatch(/^[0-9a-f]{64}$/);
      expect(other.token).not.toBe(server.token);
    } finally {
      await other.close();
    }
  });

  test("gives every opened folder a new random key", () => {
    const a = server.addFolder({ root: repo, scope: [] });
    const b = server.addFolder({ root: repo, scope: [] });
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(b).not.toBe(a);
    server.removeFolder(a);
    server.removeFolder(b);
  });

  test("serves the scope it was last given", async () => {
    const k = server.addFolder({ root: repo, scope: ["doan"] });
    expect((await send(server.port, `/t/${server.token}/${k}/tokens.css`)).status).toBe(404);
    server.updateFolder(k, { root: repo, scope: ["doan", "tokens.css"] });
    expect((await send(server.port, `/t/${server.token}/${k}/tokens.css`)).status).toBe(200);
    server.removeFolder(k);
  });

  test.each([
    ["deleted", (file: string) => unlinkSync(file), "big.bin"],
    ["truncated", (file: string) => writeFileSync(file, ""), "short.bin"],
  ])("survives a file %s while it is being sent", async (_label, change, name) => {
    const file = join(repo, "doan", name);
    await new Promise<void>((resolve) => {
      const req = httpRequest(
        { host: "127.0.0.1", port: server.port, path: `${base}/doan/${name}`, agent: false },
        (res) => {
          change(file);
          res.on("data", () => {});
          res.on("end", resolve);
          res.on("error", () => resolve());
          res.on("aborted", resolve);
        },
      );
      req.on("error", () => resolve());
      req.end();
    });
    expect((await send(server.port, `${base}/doan/a.html`)).status).toBe(200);
  });

  test("never sends more than Content-Length when the file grows mid-transfer", async () => {
    const file = join(repo, "doan", "grow.bin");
    // A raw socket sees every byte on the wire; an HTTP client would stop at
    // Content-Length and hide the overflow.
    const raw = await new Promise<Buffer>((resolve, reject) => {
      const socket = connect({ host: "127.0.0.1", port: server.port }, () => {
        socket.write(`GET ${base}/doan/grow.bin HTTP/1.1\r\nHost: 127.0.0.1:${server.port}\r\nConnection: close\r\n\r\n`);
      });
      const chunks: Buffer[] = [];
      let grown = false;
      socket.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        if (!grown) {
          grown = true;
          socket.pause();
          appendFileSync(file, Buffer.alloc(4 * 1024 * 1024, 2));
          socket.resume();
        }
      });
      socket.on("end", () => resolve(Buffer.concat(chunks)));
      socket.on("error", reject);
    });
    const split = raw.indexOf("\r\n\r\n");
    const head = raw.subarray(0, split).toString();
    expect(head).toMatch(/^HTTP\/1\.1 200/);
    expect(head).toMatch(/content-length: 16777216/i);
    expect(raw.length - split - 4).toBe(16 * 1024 * 1024);
  });
});

describe("openNoFollow", () => {
  test("opens a path without links", async () => {
    const file = await openNoFollow(join(repo, "doan", "real-dir", "s.txt"));
    try {
      expect((await file.readFile()).toString()).toBe("inside");
    } finally {
      await file.close();
    }
  });

  // Stands in for a directory swapped for a link after the realpath step: the
  // path the server checked now runs through a link, and must not open.
  test("refuses a path with a link in any component", async () => {
    await expect(openNoFollow(join(repo, "doan", "swapped", "real-dir", "s.txt"))).rejects.toMatchObject({ code: "ELOOP" });
    await expect(openNoFollow(join(repo, "doan", "link-out"))).rejects.toMatchObject({ code: "ELOOP" });
  });
});
