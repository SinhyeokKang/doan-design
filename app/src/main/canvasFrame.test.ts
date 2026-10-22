import { describe, expect, test } from "vitest";
import { allowFrameNavigation, childOfTopFrame, frameNavigationAllowed, fromAppFrame, isCanvasFrame, navigationGate, startedByApp, type FrameLike } from "./canvasFrame";

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

  test("childOfTopFrame is true only when the parent has no parent", () => {
    const top = { url: "file:///app/index.html", parent: null };
    const canvas = { url: current, parent: top };
    expect(childOfTopFrame(canvas)).toBe(true);
    expect(childOfTopFrame(top)).toBe(false);
    expect(childOfTopFrame({ url: "https://embed.example/", parent: canvas })).toBe(false);
    expect(childOfTopFrame({ url: current, parent: { url: "x" } as never })).toBe(false);
    expect(childOfTopFrame(null)).toBe(false);
  });

  test("rejects userinfo in the URL", () => {
    expect(isCanvasFrame("http://127.0.0.1:4000@evil.example/t/tok/key/a.html", base, true)).toBe(false);
    expect(isCanvasFrame("http://user:pw@127.0.0.1:4000/t/tok/key/a.html", base, true)).toBe(false);
  });
});

describe("allowFrameNavigation", () => {
  test("allows a canvas link inside the same folder key", () => {
    expect(allowFrameNavigation(current, `${base}key/design/b.html`, base, false)).toBe(true);
    expect(allowFrameNavigation(current, `${base}key/design/b.html#top`, base, false)).toBe(true);
    expect(allowFrameNavigation(current, `${current}?x=1`, base, false)).toBe(true);
  });

  test("allows the app's first src of a new iframe", () => {
    expect(allowFrameNavigation("about:blank", `${base}key/design/a.html`, base, true)).toBe(true);
    expect(allowFrameNavigation("", `${base}key/design/a.html`, base, true)).toBe(true);
  });

  test("allows the app to point the same iframe at another folder key", () => {
    expect(allowFrameNavigation(current, `${base}other/design/a.html`, base, true)).toBe(true);
  });

  test("allows the app to reload from about:blank, an error page or a CSP-blocked URL", () => {
    for (const from of ["about:blank", "chrome-error://chromewebdata/", "https://example.com/"]) {
      expect(allowFrameNavigation(from, current, base, true)).toBe(true);
    }
  });

  test("denies the app a src outside the token path", () => {
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
      "http://127.0.0.1:4000@evil.example/t/tok/key/a.html",
    ]) {
      expect(allowFrameNavigation("about:blank", next, base, true)).toBe(false);
      expect(allowFrameNavigation(current, next, base, true)).toBe(false);
    }
  });

  test("denies a canvas-started navigation to another folder key", () => {
    expect(allowFrameNavigation(current, `${base}other/design/a.html`, base, false)).toBe(false);
  });

  test("denies a canvas-started navigation from about:blank, an error page or an empty URL", () => {
    for (const from of ["about:blank", "", "chrome-error://chromewebdata/"]) {
      expect(allowFrameNavigation(from, `${base}key/design/a.html`, base, false)).toBe(false);
    }
  });

  test("denies a token path prefix that only matches as a string", () => {
    expect(allowFrameNavigation(current, "http://127.0.0.1:4000/t/tokx/key/design/a.html", base, false)).toBe(false);
  });

  test("denies a folder key that only matches as a string prefix", () => {
    expect(allowFrameNavigation(current, `${base}keyx/design/a.html`, base, false)).toBe(false);
    expect(allowFrameNavigation(current, `${base}key`, base, false)).toBe(false);
  });

  test("denies other ports and hosts", () => {
    expect(allowFrameNavigation(current, "http://127.0.0.1:4001/t/tok/key/a.html", base, false)).toBe(false);
    expect(allowFrameNavigation(current, "http://localhost:4000/t/tok/key/a.html", base, false)).toBe(false);
    expect(allowFrameNavigation(current, "https://127.0.0.1:4000/t/tok/key/a.html", base, false)).toBe(false);
  });

  test("denies traversal out of the folder key, plain or percent-encoded", () => {
    expect(allowFrameNavigation(current, `${base}key/../other/a.html`, base, false)).toBe(false);
    expect(allowFrameNavigation(current, `${base}key/%2e%2e/other/a.html`, base, false)).toBe(false);
    expect(allowFrameNavigation(current, `${base}key/%2E%2E/%2e%2e/x`, base, false)).toBe(false);
    expect(allowFrameNavigation(current, `${base}key/..`, base, false)).toBe(false);
    expect(allowFrameNavigation(current, `${base}key/design/..\\..\\x`, base, false)).toBe(false);
  });

  test("denies userinfo that disguises the host", () => {
    expect(allowFrameNavigation(current, "http://127.0.0.1:4000@evil.example/t/tok/key/a.html", base, false)).toBe(false);
    expect(allowFrameNavigation(current, "http://user:pw@127.0.0.1:4000/t/tok/key/a.html", base, false)).toBe(false);
  });

  test("denies data:, javascript: and other schemes", () => {
    for (const next of ["data:text/html,hi", "javascript:alert(1)", "file:///etc/passwd", "blob:http://127.0.0.1:4000/x", "about:blank"]) {
      expect(allowFrameNavigation(current, next, base, false)).toBe(false);
    }
  });

  test("denies a canvas-started navigation when the current URL is outside the token path", () => {
    expect(allowFrameNavigation("https://example.com/", `${base}key/a.html`, base, false)).toBe(false);
    expect(allowFrameNavigation("http://127.0.0.1:4000/t/tokx/key/a.html", `${base}key/a.html`, base, false)).toBe(false);
  });

  test("denies a canvas-started navigation when the current URL has no folder key", () => {
    expect(allowFrameNavigation(`${base}`, `${base}key/a.html`, base, false)).toBe(false);
  });

  test("denies unparsable URLs and an unparsable base", () => {
    for (const fromApp of [true, false]) {
      expect(allowFrameNavigation(current, "http://", base, fromApp)).toBe(false);
      expect(allowFrameNavigation(current, "", base, fromApp)).toBe(false);
      expect(allowFrameNavigation(current, `${base}key/a.html`, "not a url", fromApp)).toBe(false);
      expect(allowFrameNavigation(current, `${base}key/a.html`, "", fromApp)).toBe(false);
    }
  });

  test("treats a base without a trailing slash as a path segment boundary", () => {
    const loose = "http://127.0.0.1:4000/t/tok";
    expect(allowFrameNavigation("about:blank", "http://127.0.0.1:4000/t/tokx/key/a.html", loose, true)).toBe(false);
    expect(allowFrameNavigation("about:blank", `${base}key/a.html`, loose, true)).toBe(true);
  });
});

describe("startedByApp", () => {
  test("is true only for an initiator without a parent", () => {
    expect(startedByApp({ parent: null })).toBe(true);
    expect(startedByApp({ parent: { parent: null } })).toBe(false);
  });

  test("is false for a missing initiator", () => {
    expect(startedByApp(null)).toBe(false);
    expect(startedByApp(undefined)).toBe(false);
  });

  test("is false when the parent is not exactly null", () => {
    expect(startedByApp({ parent: undefined })).toBe(false);
    expect(startedByApp({})).toBe(false);
  });
});

describe("navigationGate", () => {
  const top = { url: "file:///app/index.html", parent: null };
  const canvas = { url: current, parent: top };

  test("refuses when Electron gives no frame", () => {
    expect(navigationGate(null)).toBe("refuse");
    expect(navigationGate(undefined)).toBe("refuse");
  });

  test("skips only a proven grandchild", () => {
    expect(navigationGate({ url: "https://embed.example/", parent: canvas })).toBe("skip");
    expect(navigationGate({ url: "https://embed.example/", parent: { url: "x", parent: canvas } })).toBe("skip");
  });

  test("checks a canvas frame, a frame without a parent, and a frame whose ancestry is unknown", () => {
    expect(navigationGate(canvas)).toBe("check");
    expect(navigationGate(top)).toBe("check");
    expect(navigationGate({ url: current, parent: { url: "x" } as never })).toBe("check");
  });
});

describe("frameNavigationAllowed", () => {
  const top = { url: "file:///app/index.html", parent: null };
  const canvas = { url: current, parent: top };
  const blank = { url: "about:blank", parent: top };

  test("allows the app's src and refuses a canvas-started jump to another folder key", () => {
    expect(frameNavigationAllowed({ url: `${base}other/a.html`, frame: canvas, initiator: top }, base)).toBe(true);
    expect(frameNavigationAllowed({ url: `${base}other/a.html`, frame: canvas, initiator: canvas }, base)).toBe(false);
  });

  test("refuses a canvas that went to about:blank by itself and then leaves its folder key", () => {
    expect(frameNavigationAllowed({ url: `${base}other/a.html`, frame: blank, initiator: blank }, base)).toBe(false);
  });

  test("treats a missing initiator as not the app", () => {
    expect(frameNavigationAllowed({ url: `${base}other/a.html`, frame: canvas, initiator: null }, base)).toBe(false);
    expect(frameNavigationAllowed({ url: `${base}other/a.html`, frame: canvas }, base)).toBe(false);
    expect(frameNavigationAllowed({ url: `${base}key/b.html`, frame: canvas }, base)).toBe(true);
  });

  test("refuses when the frame is missing, even for the app", () => {
    expect(frameNavigationAllowed({ url: current, frame: null, initiator: top }, base)).toBe(false);
  });

  test("restricts a frame without a parent instead of treating it as nested", () => {
    expect(frameNavigationAllowed({ url: "https://example.com/", frame: top, initiator: top }, base)).toBe(false);
  });

  test("leaves a proven grandchild alone", () => {
    const embed = { url: "https://embed.example/", parent: canvas };
    expect(frameNavigationAllowed({ url: "https://other.example/", frame: embed, initiator: embed }, base)).toBe(true);
  });

  // will-navigate also refuses these; the frame rule must not lean on it.
  test("refuses the window's main frame even for an app-started token URL", () => {
    expect(frameNavigationAllowed({ url: current, frame: top, initiator: top }, base)).toBe(false);
    expect(frameNavigationAllowed({ url: `${base}key/b.html`, frame: top }, base)).toBe(false);
  });

  // A disposed WebFrameMain throws on property access. The throw must become a
  // refusal here, or the listener would skip preventDefault.
  const throwing = (name: "url" | "parent", other: Partial<FrameLike>): FrameLike =>
    Object.defineProperty({ ...other }, name, {
      get() {
        throw new Error("frame disposed");
      },
    }) as FrameLike;

  test("refuses when reading the frame throws", () => {
    expect(frameNavigationAllowed({ url: `${base}key/b.html`, frame: throwing("parent", { url: current }), initiator: top }, base)).toBe(false);
    expect(frameNavigationAllowed({ url: `${base}key/b.html`, frame: throwing("url", { parent: top }), initiator: top }, base)).toBe(false);
  });

  test("refuses when reading the initiator throws", () => {
    expect(frameNavigationAllowed({ url: `${base}other/a.html`, frame: canvas, initiator: throwing("parent", { url: current }) }, base)).toBe(false);
    expect(frameNavigationAllowed({ url: `${base}key/b.html`, frame: canvas, initiator: throwing("parent", { url: current }) }, base)).toBe(false);
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
