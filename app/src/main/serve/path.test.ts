import { describe, expect, test } from "vitest";
import { inScope, parseServePath, relInside } from "./path";

const token = "a1b2c3";
const prefix = `/t/${token}/k9`;

describe("parseServePath", () => {
  test("splits a token path into folder key and repo-relative path", () => {
    expect(parseServePath(`${prefix}/design/a.html`, token)).toEqual({ folderKey: "k9", rel: "design/a.html" });
    expect(parseServePath(`${prefix}/tokens.css`, token)).toEqual({ folderKey: "k9", rel: "tokens.css" });
  });

  test("ignores the query and fragment", () => {
    expect(parseServePath(`${prefix}/design/a.html?x=1#y`, token)).toEqual({ folderKey: "k9", rel: "design/a.html" });
    expect(parseServePath(`${prefix}/design/a.html#/../../.env`, token)).toEqual({ folderKey: "k9", rel: "design/a.html" });
  });

  test("decodes each segment once", () => {
    expect(parseServePath(`${prefix}/design/a%20b.html`, token)).toEqual({ folderKey: "k9", rel: "design/a b.html" });
    expect(parseServePath(`${prefix}/design/%2541.html`, token)).toEqual({ folderKey: "k9", rel: "design/%41.html" });
  });

  test("decodes percent-encoded Korean names without normalizing them", () => {
    const nfc = "디자인.html";
    const nfd = nfc.normalize("NFD");
    expect(parseServePath(`${prefix}/design/${encodeURIComponent(nfc)}`, token)).toEqual({ folderKey: "k9", rel: `design/${nfc}` });
    expect(parseServePath(`${prefix}/design/${encodeURIComponent(nfd)}`, token)).toEqual({ folderKey: "k9", rel: `design/${nfd}` });
  });

  test("rejects a different token", () => {
    expect(parseServePath(`/t/zzzzzz/k9/design/a.html`, token)).toBeNull();
    expect(parseServePath(`/t/${token}0/k9/design/a.html`, token)).toBeNull();
    expect(parseServePath(`/t/a1b2c/k9/design/a.html`, token)).toBeNull();
    expect(parseServePath(`/t/%611b2c3/k9/design/a.html`, token)).toBeNull();
  });

  test("rejects paths outside the token prefix", () => {
    expect(parseServePath("/.env", token)).toBeNull();
    expect(parseServePath("/design/a.html", token)).toBeNull();
    expect(parseServePath(`/T/${token}/k9/design/a.html`, token)).toBeNull();
    expect(parseServePath(`t/${token}/k9/design/a.html`, token)).toBeNull();
    expect(parseServePath("", token)).toBeNull();
  });

  test("rejects an empty token", () => {
    expect(parseServePath("/t//k9/design/a.html", "")).toBeNull();
  });

  test("rejects a missing folder key or path", () => {
    expect(parseServePath(`/t/${token}`, token)).toBeNull();
    expect(parseServePath(`/t/${token}/`, token)).toBeNull();
    expect(parseServePath(`/t/${token}//design/a.html`, token)).toBeNull();
    expect(parseServePath(prefix, token)).toBeNull();
    expect(parseServePath(`${prefix}/`, token)).toBeNull();
  });

  test("rejects empty segments", () => {
    expect(parseServePath(`${prefix}/design//a.html`, token)).toBeNull();
    expect(parseServePath(`/${prefix}/design/a.html`, token)).toBeNull();
  });

  test("rejects a trailing slash", () => {
    expect(parseServePath(`${prefix}/design/`, token)).toBeNull();
  });

  test("rejects dot segments", () => {
    expect(parseServePath(`${prefix}/./design/a.html`, token)).toBeNull();
    expect(parseServePath(`${prefix}/design/../.env`, token)).toBeNull();
    expect(parseServePath(`${prefix}/..`, token)).toBeNull();
  });

  test("rejects percent-encoded dot segments", () => {
    expect(parseServePath(`${prefix}/design/%2e%2e/.env`, token)).toBeNull();
    expect(parseServePath(`${prefix}/design/%2E%2E/.env`, token)).toBeNull();
    expect(parseServePath(`${prefix}/design/.%2e/.env`, token)).toBeNull();
    expect(parseServePath(`${prefix}/%2e/design/a.html`, token)).toBeNull();
  });

  test("rejects encoded separators", () => {
    expect(parseServePath(`${prefix}/design%2f..%2f.env`, token)).toBeNull();
    expect(parseServePath(`${prefix}/design%2F..%2F.env`, token)).toBeNull();
    expect(parseServePath(`${prefix}/design%5c..%5c.env`, token)).toBeNull();
    expect(parseServePath(`${prefix}/design%5C..%5C.env`, token)).toBeNull();
    expect(parseServePath(`${prefix}/design\\..\\.env`, token)).toBeNull();
  });

  test("rejects NUL", () => {
    expect(parseServePath(`${prefix}/design/a.html%00.png`, token)).toBeNull();
    expect(parseServePath(`${prefix}/design/a\u0000.html`, token)).toBeNull();
  });

  test("rejects malformed percent encoding", () => {
    expect(parseServePath(`${prefix}/design/%`, token)).toBeNull();
    expect(parseServePath(`${prefix}/design/a%zz.html`, token)).toBeNull();
    expect(parseServePath(`${prefix}/design/a%2.html`, token)).toBeNull();
    expect(parseServePath(`${prefix}/design/%c3.html`, token)).toBeNull();
    expect(parseServePath(`${prefix}/design/%ff.html`, token)).toBeNull();
  });
});

describe("relInside", () => {
  test("returns an empty path for the root itself", () => {
    expect(relInside("/repo", "/repo")).toBe("");
  });

  test("returns the relative path under the root", () => {
    expect(relInside("/repo", "/repo/design/a.html")).toBe("design/a.html");
    expect(relInside("/repo", "/repo/tokens.css")).toBe("tokens.css");
  });

  test("compares by segment, not string prefix", () => {
    expect(relInside("/repo", "/repo2")).toBeNull();
    expect(relInside("/repo", "/repo2/design/a.html")).toBeNull();
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
    expect(inScope("tokens.css", ["design", "tokens.css"])).toBe(true);
    expect(inScope("tokens.css.map", ["tokens.css"])).toBe(false);
  });

  test("matches paths under a directory entry", () => {
    expect(inScope("design/a.html", ["design"])).toBe(true);
    expect(inScope("design/sub/b.css", ["design"])).toBe(true);
    expect(inScope("assets/fonts/x.woff2", ["assets/fonts"])).toBe(true);
  });

  test("does not treat a sibling with the same prefix as under the entry", () => {
    expect(inScope("design2/a.html", ["design"])).toBe(false);
    expect(inScope("design-x/a.html", ["design"])).toBe(false);
    expect(inScope("assets/fonts2/x.woff2", ["assets/fonts"])).toBe(false);
  });

  test("leaves paths outside every entry out", () => {
    expect(inScope(".env", ["design", "tokens.css"])).toBe(false);
    expect(inScope("src/secret.ts", ["design", "tokens.css"])).toBe(false);
    expect(inScope("assets", ["assets/fonts"])).toBe(false);
  });

  test("compares spelling exactly", () => {
    expect(inScope("DESIGN/a.html", ["design"])).toBe(false);
  });

  test("an empty scope serves nothing", () => {
    expect(inScope("design/a.html", [])).toBe(false);
  });

  test("the root itself is never in scope", () => {
    expect(inScope("", ["design"])).toBe(false);
  });
});
