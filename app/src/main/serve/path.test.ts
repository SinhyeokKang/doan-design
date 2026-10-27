import { describe, expect, test } from "vitest";
import { inScope, parseServePath, relInside } from "./path";

const token = "a1b2c3";
const prefix = `/t/${token}/k9`;

describe("parseServePath", () => {
  test("splits a token path into folder key and repo-relative path", () => {
    expect(parseServePath(`${prefix}/doan/a.html`, token)).toEqual({ folderKey: "k9", rel: "doan/a.html" });
    expect(parseServePath(`${prefix}/tokens.css`, token)).toEqual({ folderKey: "k9", rel: "tokens.css" });
  });

  test("ignores the query and fragment", () => {
    expect(parseServePath(`${prefix}/doan/a.html?x=1#y`, token)).toEqual({ folderKey: "k9", rel: "doan/a.html" });
    expect(parseServePath(`${prefix}/doan/a.html#/../../.env`, token)).toEqual({ folderKey: "k9", rel: "doan/a.html" });
  });

  test("decodes each segment once", () => {
    expect(parseServePath(`${prefix}/doan/a%20b.html`, token)).toEqual({ folderKey: "k9", rel: "doan/a b.html" });
    expect(parseServePath(`${prefix}/doan/%2541.html`, token)).toEqual({ folderKey: "k9", rel: "doan/%41.html" });
  });

  test("decodes percent-encoded Korean names without normalizing them", () => {
    const nfc = "디자인.html";
    const nfd = nfc.normalize("NFD");
    expect(parseServePath(`${prefix}/doan/${encodeURIComponent(nfc)}`, token)).toEqual({ folderKey: "k9", rel: `doan/${nfc}` });
    expect(parseServePath(`${prefix}/doan/${encodeURIComponent(nfd)}`, token)).toEqual({ folderKey: "k9", rel: `doan/${nfd}` });
  });

  test("rejects a different token", () => {
    expect(parseServePath(`/t/zzzzzz/k9/doan/a.html`, token)).toBeNull();
    expect(parseServePath(`/t/${token}0/k9/doan/a.html`, token)).toBeNull();
    expect(parseServePath(`/t/a1b2c/k9/doan/a.html`, token)).toBeNull();
    expect(parseServePath(`/t/%611b2c3/k9/doan/a.html`, token)).toBeNull();
  });

  test("rejects paths outside the token prefix", () => {
    expect(parseServePath("/.env", token)).toBeNull();
    expect(parseServePath("/doan/a.html", token)).toBeNull();
    expect(parseServePath(`/T/${token}/k9/doan/a.html`, token)).toBeNull();
    expect(parseServePath(`t/${token}/k9/doan/a.html`, token)).toBeNull();
    expect(parseServePath("", token)).toBeNull();
  });

  test("rejects an empty token", () => {
    expect(parseServePath("/t//k9/doan/a.html", "")).toBeNull();
  });

  test("rejects a missing folder key or path", () => {
    expect(parseServePath(`/t/${token}`, token)).toBeNull();
    expect(parseServePath(`/t/${token}/`, token)).toBeNull();
    expect(parseServePath(`/t/${token}//doan/a.html`, token)).toBeNull();
    expect(parseServePath(prefix, token)).toBeNull();
    expect(parseServePath(`${prefix}/`, token)).toBeNull();
  });

  test("rejects empty segments", () => {
    expect(parseServePath(`${prefix}/doan//a.html`, token)).toBeNull();
    expect(parseServePath(`/${prefix}/doan/a.html`, token)).toBeNull();
  });

  test("rejects a trailing slash", () => {
    expect(parseServePath(`${prefix}/doan/`, token)).toBeNull();
  });

  test("rejects dot segments", () => {
    expect(parseServePath(`${prefix}/./doan/a.html`, token)).toBeNull();
    expect(parseServePath(`${prefix}/doan/../.env`, token)).toBeNull();
    expect(parseServePath(`${prefix}/..`, token)).toBeNull();
  });

  test("rejects percent-encoded dot segments", () => {
    expect(parseServePath(`${prefix}/doan/%2e%2e/.env`, token)).toBeNull();
    expect(parseServePath(`${prefix}/doan/%2E%2E/.env`, token)).toBeNull();
    expect(parseServePath(`${prefix}/doan/.%2e/.env`, token)).toBeNull();
    expect(parseServePath(`${prefix}/%2e/doan/a.html`, token)).toBeNull();
  });

  test("rejects encoded separators", () => {
    expect(parseServePath(`${prefix}/doan%2f..%2f.env`, token)).toBeNull();
    expect(parseServePath(`${prefix}/doan%2F..%2F.env`, token)).toBeNull();
    expect(parseServePath(`${prefix}/design%5c..%5c.env`, token)).toBeNull();
    expect(parseServePath(`${prefix}/design%5C..%5C.env`, token)).toBeNull();
    expect(parseServePath(`${prefix}/design\\..\\.env`, token)).toBeNull();
  });

  test("rejects NUL", () => {
    expect(parseServePath(`${prefix}/doan/a.html%00.png`, token)).toBeNull();
    expect(parseServePath(`${prefix}/doan/a\u0000.html`, token)).toBeNull();
  });

  test("rejects malformed percent encoding", () => {
    expect(parseServePath(`${prefix}/doan/%`, token)).toBeNull();
    expect(parseServePath(`${prefix}/doan/a%zz.html`, token)).toBeNull();
    expect(parseServePath(`${prefix}/doan/a%2.html`, token)).toBeNull();
    expect(parseServePath(`${prefix}/doan/%c3.html`, token)).toBeNull();
    expect(parseServePath(`${prefix}/doan/%ff.html`, token)).toBeNull();
  });
});

describe("relInside", () => {
  test("returns an empty path for the root itself", () => {
    expect(relInside("/repo", "/repo")).toBe("");
  });

  test("returns the relative path under the root", () => {
    expect(relInside("/repo", "/repo/doan/a.html")).toBe("doan/a.html");
    expect(relInside("/repo", "/repo/tokens.css")).toBe("tokens.css");
  });

  test("compares by segment, not string prefix", () => {
    expect(relInside("/repo", "/repo2")).toBeNull();
    expect(relInside("/repo", "/repo2/doan/a.html")).toBeNull();
    expect(relInside("/repo", "/repo-x/a")).toBeNull();
  });

  test("returns null outside the root", () => {
    expect(relInside("/repo", "/etc/passwd")).toBeNull();
    expect(relInside("/repo", "/")).toBeNull();
    expect(relInside("/a/repo", "/a")).toBeNull();
  });

  test("handles the filesystem root as the root", () => {
    expect(relInside("/", "/repo/a.html")).toBe("repo/a.html");
    expect(relInside("/", "/")).toBe("");
  });
});

describe("inScope", () => {
  test("matches a file entry exactly", () => {
    expect(inScope("tokens.css", ["doan", "tokens.css"])).toBe(true);
    expect(inScope("tokens.css.map", ["tokens.css"])).toBe(false);
  });

  test("matches paths under a directory entry", () => {
    expect(inScope("doan/a.html", ["doan"])).toBe(true);
    expect(inScope("doan/sub/b.css", ["doan"])).toBe(true);
    expect(inScope("assets/fonts/x.woff2", ["assets/fonts"])).toBe(true);
  });

  test("does not treat a sibling with the same prefix as under the entry", () => {
    expect(inScope("design2/a.html", ["doan"])).toBe(false);
    expect(inScope("design-x/a.html", ["doan"])).toBe(false);
    expect(inScope("assets/fonts2/x.woff2", ["assets/fonts"])).toBe(false);
  });

  test("leaves paths outside every entry out", () => {
    expect(inScope(".env", ["doan", "tokens.css"])).toBe(false);
    expect(inScope("src/secret.ts", ["doan", "tokens.css"])).toBe(false);
    expect(inScope("assets", ["assets/fonts"])).toBe(false);
  });

  test("compares spelling exactly", () => {
    expect(inScope("DESIGN/a.html", ["doan"])).toBe(false);
  });

  test("an empty scope serves nothing", () => {
    expect(inScope("doan/a.html", [])).toBe(false);
  });

  test("the root itself is never in scope", () => {
    expect(inScope("", ["doan"])).toBe(false);
  });
});
