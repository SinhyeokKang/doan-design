import { describe, expect, test } from "vitest";
import { allowFrameNavigation, fromAppFrame, isCanvasFrame } from "./canvasFrame";

const base = "http://127.0.0.1:4000/t/tok/";
const current = `${base}key/design/a.html`;

describe("isCanvasFrame", () => {
  test("accepts a child of the main frame under the token path", () => {
    expect(isCanvasFrame(current, base, true)).toBe(true);
  });

  test("rejects a frame whose parent is not the main frame", () => {
    expect(isCanvasFrame(current, base, false)).toBe(false);
  });

  test("rejects other ports, tokens, hosts and schemes", () => {
    for (const url of [
      "http://127.0.0.1:4001/t/tok/key/a.html",
      "http://127.0.0.1:4000/t/other/key/a.html",
      "http://127.0.0.1:4000/t/tokx/key/a.html",
      "http://localhost:4000/t/tok/key/a.html",
      "https://127.0.0.1:4000/t/tok/key/a.html",
      "https://example.com/",
      "about:blank",
      "",
      "not a url",
      `${base}../x`,
      `${base}%2e%2e/x`,
    ]) {
      expect(isCanvasFrame(url, base, true)).toBe(false);
    }
  });

  test("rejects a URL that only shares the token as a prefix without the slash", () => {
    expect(isCanvasFrame("http://127.0.0.1:4000/t/tok", base, true)).toBe(false);
  });

  test("rejects userinfo in the URL", () => {
    expect(isCanvasFrame("http://127.0.0.1:4000@evil.example/t/tok/key/a.html", base, true)).toBe(false);
    expect(isCanvasFrame("http://user:pw@127.0.0.1:4000/t/tok/key/a.html", base, true)).toBe(false);
  });
});

describe("allowFrameNavigation", () => {
  test("allows a link inside the same folder key", () => {
    expect(allowFrameNavigation(current, `${base}key/design/b.html`, base)).toBe(true);
    expect(allowFrameNavigation(current, `${base}key/design/b.html#top`, base)).toBe(true);
    expect(allowFrameNavigation(current, `${current}?x=1`, base)).toBe(true);
  });

  test("allows the first src of a new iframe from about:blank or an empty URL", () => {
    expect(allowFrameNavigation("about:blank", `${base}key/design/a.html`, base)).toBe(true);
    expect(allowFrameNavigation("", `${base}key/design/a.html`, base)).toBe(true);
  });

  test("denies the first src when it is not under the token path", () => {
    for (const next of [
      "http://127.0.0.1:4000/t/tokx/key/a.html",
      "http://127.0.0.1:4001/t/tok/key/a.html",
      "http://localhost:4000/t/tok/key/a.html",
      "https://example.com/",
      "data:text/html,<script>1</script>",
      "javascript:alert(1)",
      "about:blank",
      `${base}../x`,
      `${base}%2e%2e/x`,
    ]) {
      expect(allowFrameNavigation("about:blank", next, base)).toBe(false);
    }
  });

  test("denies a different folder key", () => {
    expect(allowFrameNavigation(current, `${base}other/design/a.html`, base)).toBe(false);
  });

  test("denies a token path prefix that only matches as a string", () => {
    expect(allowFrameNavigation(current, "http://127.0.0.1:4000/t/tokx/key/design/a.html", base)).toBe(false);
  });

  test("denies a folder key that only matches as a string prefix", () => {
    expect(allowFrameNavigation(current, `${base}keyx/design/a.html`, base)).toBe(false);
    expect(allowFrameNavigation(current, `${base}key`, base)).toBe(false);
  });

  test("denies other ports and hosts", () => {
    expect(allowFrameNavigation(current, "http://127.0.0.1:4001/t/tok/key/a.html", base)).toBe(false);
    expect(allowFrameNavigation(current, "http://localhost:4000/t/tok/key/a.html", base)).toBe(false);
    expect(allowFrameNavigation(current, "https://127.0.0.1:4000/t/tok/key/a.html", base)).toBe(false);
  });

  test("denies traversal out of the folder key, plain or percent-encoded", () => {
    expect(allowFrameNavigation(current, `${base}key/../other/a.html`, base)).toBe(false);
    expect(allowFrameNavigation(current, `${base}key/%2e%2e/other/a.html`, base)).toBe(false);
    expect(allowFrameNavigation(current, `${base}key/%2E%2E/%2e%2e/x`, base)).toBe(false);
    expect(allowFrameNavigation(current, `${base}key/..`, base)).toBe(false);
    expect(allowFrameNavigation(current, `${base}key/design/..\\..\\x`, base)).toBe(false);
  });

  test("denies userinfo that disguises the host", () => {
    expect(allowFrameNavigation(current, "http://127.0.0.1:4000@evil.example/t/tok/key/a.html", base)).toBe(false);
    expect(allowFrameNavigation(current, "http://user:pw@127.0.0.1:4000/t/tok/key/a.html", base)).toBe(false);
    expect(allowFrameNavigation("about:blank", "http://127.0.0.1:4000@evil.example/t/tok/key/a.html", base)).toBe(false);
  });

  test("denies data:, javascript: and other schemes", () => {
    for (const next of ["data:text/html,hi", "javascript:alert(1)", "file:///etc/passwd", "blob:http://127.0.0.1:4000/x", "about:blank"]) {
      expect(allowFrameNavigation(current, next, base)).toBe(false);
    }
  });

  test("denies a missing frame (details.frame === null)", () => {
    expect(allowFrameNavigation(null, `${base}key/a.html`, base)).toBe(false);
  });

  test("denies when the current URL is already outside the token path", () => {
    expect(allowFrameNavigation("https://example.com/", `${base}key/a.html`, base)).toBe(false);
    expect(allowFrameNavigation("http://127.0.0.1:4000/t/tokx/key/a.html", `${base}key/a.html`, base)).toBe(false);
  });

  test("denies when the current URL has no folder key", () => {
    expect(allowFrameNavigation(`${base}`, `${base}key/a.html`, base)).toBe(false);
  });

  test("denies unparsable URLs and an unparsable base", () => {
    expect(allowFrameNavigation(current, "http://", base)).toBe(false);
    expect(allowFrameNavigation(current, "", base)).toBe(false);
    expect(allowFrameNavigation(current, `${base}key/a.html`, "not a url")).toBe(false);
  });

  test("treats a base without a trailing slash as a path segment boundary", () => {
    const loose = "http://127.0.0.1:4000/t/tok";
    expect(allowFrameNavigation("about:blank", "http://127.0.0.1:4000/t/tokx/key/a.html", loose)).toBe(false);
    expect(allowFrameNavigation("about:blank", `${base}key/a.html`, loose)).toBe(true);
  });
});

describe("fromAppFrame", () => {
  const webContents = { id: 1 };
  const win = { webContents };
  const mainFrame = { parent: null };

  test("accepts the window's webContents from its main frame", () => {
    expect(fromAppFrame({ sender: webContents, senderFrame: mainFrame }, win)).toBe(true);
  });

  test("rejects another webContents even from a main frame", () => {
    expect(fromAppFrame({ sender: { id: 2 }, senderFrame: mainFrame }, win)).toBe(false);
  });

  test("rejects a subframe of the window", () => {
    expect(fromAppFrame({ sender: webContents, senderFrame: { parent: mainFrame } }, win)).toBe(false);
  });

  test("rejects a null or missing senderFrame", () => {
    expect(fromAppFrame({ sender: webContents, senderFrame: null }, win)).toBe(false);
    expect(fromAppFrame({ sender: webContents, senderFrame: undefined }, win)).toBe(false);
  });

  test("rejects a senderFrame whose parent is not exactly null", () => {
    expect(fromAppFrame({ sender: webContents, senderFrame: { parent: undefined } }, win)).toBe(false);
    expect(fromAppFrame({ sender: webContents, senderFrame: {} }, win)).toBe(false);
  });

  test("rejects when the window has no webContents to compare with", () => {
    expect(fromAppFrame({ sender: undefined, senderFrame: mainFrame }, { webContents: undefined })).toBe(false);
  });
});
