import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  class Window extends EventEmitter {
    static instances: Window[] = [];
    // What the next frame script resolves to; a function runs at call time.
    static frame: () => Promise<unknown> = async () => ({ x: 0, y: 0, width: 1280, height: 800 });
    destroyed = false;
    webContents = Object.assign(new EventEmitter(), {
      executeJavaScript: vi.fn((_script: string) => Window.frame()),
      capturePage: vi.fn(async (_rect: unknown) => ({ isEmpty: () => false, resize: vi.fn((options: { width: number }) => ({ toPNG: () => Buffer.from(`png${options.width}`) })) })),
    });
    loadURL = vi.fn(async (_url: string) => {});
    setContentSize = vi.fn();
    destroy = vi.fn(() => { this.destroyed = true; });
    isDestroyed = () => this.destroyed;
    constructor(readonly options: unknown) {
      super();
      Window.instances.push(this);
    }
  }
  return { Window };
});
vi.mock("electron", () => ({ BrowserWindow: mocks.Window }));

const { CAPTURE_WINDOW_TITLE, createWindowCapturer, frameScript, hostPage, LOAD_LIMIT_MS, SETTLE_MS } = await import("./thumbnailWindow");
const URL_A = "http://127.0.0.1:1/t/tok/k/design/a.html";

beforeEach(() => {
  mocks.Window.instances.length = 0;
  mocks.Window.frame = async () => ({ x: 0, y: 0, width: 1280, height: 800 });
});
afterEach(() => vi.useRealTimers());

function only() {
  const window = mocks.Window.instances.at(-1);
  if (!window) throw new Error("no window");
  return window;
}

test("the host is a data: page whose CSP allows only local frames and inline style", () => {
  const url = hostPage(1280, 800);
  expect(url.startsWith("data:text/html;charset=utf-8,")).toBe(true);
  const html = decodeURIComponent(url.slice("data:text/html;charset=utf-8,".length));
  expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://127.0.0.1:*; style-src 'unsafe-inline'">`);
  expect(html).toContain("width:1280px;height:800px");
  expect(html).not.toContain("<script");
});

// Runs the page script against a stand-in document to pin its timing.
function runFrameScript(onCreate: (frame: { onload?: () => void }) => void) {
  const frames: { sandbox?: string; src?: string; onload?: () => void; getBoundingClientRect(): unknown }[] = [];
  const document = {
    createElement: (tag: string) => {
      expect(tag).toBe("iframe");
      const frame = { getBoundingClientRect: () => ({ x: 0, y: 0, width: 1280, height: 800 }) };
      frames.push(frame);
      return frame;
    },
    body: { append: (frame: { onload?: () => void }) => onCreate(frame) },
  };
  const result = new Function("document", "setTimeout", `return ${frameScript(URL_A)}`)(document, setTimeout) as Promise<unknown>;
  return { result, frames };
}

test("the frame script makes a sandboxed iframe and settles 500 ms after load", async () => {
  vi.useFakeTimers();
  let settled = false;
  const { result, frames } = runFrameScript((frame) => setTimeout(() => frame.onload?.(), 100));
  void result.then(() => { settled = true; });
  expect(frames[0]).toMatchObject({ sandbox: "allow-scripts", src: URL_A });
  await vi.advanceTimersByTimeAsync(100 + SETTLE_MS - 1);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toEqual({ x: 0, y: 0, width: 1280, height: 800 });
});

test("a load that never ends is captured as painted at 8 s, not failed", async () => {
  vi.useFakeTimers();
  let settled = false;
  const { result } = runFrameScript(() => {});
  void result.then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(LOAD_LIMIT_MS - 1);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toEqual({ x: 0, y: 0, width: 1280, height: 800 });
});

test("captures the iframe area at 16:10 and scales it to 480 px", async () => {
  const capturer = createWindowCapturer();
  expect(await capturer.capture(URL_A, 1280)).toEqual(Buffer.from("png480"));
  const window = only();
  expect(window.options).toMatchObject({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  expect(window.setContentSize).toHaveBeenCalledWith(1280, 800);
  expect(window.loadURL).toHaveBeenCalledWith(hostPage(1280, 800));
  expect(window.webContents.executeJavaScript).toHaveBeenCalledWith(frameScript(URL_A));
  expect(window.webContents.capturePage).toHaveBeenCalledWith({ x: 0, y: 0, width: 1280, height: 800 });
});

test("one window, but a fresh host page and iframe for every canvas", async () => {
  const capturer = createWindowCapturer();
  await capturer.capture(URL_A, 1280);
  await capturer.capture(URL_A, 2400);
  expect(mocks.Window.instances).toHaveLength(1);
  expect(only().loadURL.mock.calls.map((call) => call[0])).toEqual([hostPage(1280, 800), hostPage(2400, 1500)]);
  expect(only().webContents.executeJavaScript).toHaveBeenCalledTimes(2);
});

test("the window carries a fixed title from creation, which no page replaces", async () => {
  await createWindowCapturer().capture(URL_A, 1280);
  expect(only().options).toMatchObject({ title: CAPTURE_WINDOW_TITLE, show: false });
  const event = { preventDefault: vi.fn() };
  only().emit("page-title-updated", event, "Other", true);
  expect(event.preventDefault).toHaveBeenCalledOnce();
});

test.each([
  ["a canvas frame that fails to load", (window: InstanceType<typeof mocks.Window>) => window.webContents.emit("did-fail-load", {}, -105, "ERR", URL_A, false)],
  ["a canvas frame answered with 404", (window: InstanceType<typeof mocks.Window>) => window.webContents.emit("did-frame-navigate", {}, URL_A, 404, "Not Found", false)],
])("%s is a failure", async (_name, fail) => {
  const capturer = createWindowCapturer();
  mocks.Window.frame = async () => {
    fail(only());
    return { x: 0, y: 0, width: 1280, height: 800 };
  };
  expect(await capturer.capture(URL_A, 1280)).toBeNull();
  // The next canvas starts without the earlier failure.
  mocks.Window.frame = async () => ({ x: 0, y: 0, width: 1280, height: 800 });
  expect(await capturer.capture(URL_A, 1280)).toEqual(Buffer.from("png480"));
});

test("a main-frame load failure or a 200 frame is not a canvas failure", async () => {
  const capturer = createWindowCapturer();
  mocks.Window.frame = async () => {
    only().webContents.emit("did-fail-load", {}, -3, "ABORTED", "data:", true);
    only().webContents.emit("did-frame-navigate", {}, URL_A, 200, "OK", false);
    return { x: 0, y: 0, width: 1280, height: 800 };
  };
  expect(await capturer.capture(URL_A, 1280)).toEqual(Buffer.from("png480"));
});

test("a job past its whole limit fails and the next job gets a new window", async () => {
  const capturer = createWindowCapturer(50);
  mocks.Window.frame = () => new Promise(() => {});
  expect(await capturer.capture(URL_A, 1280)).toBeNull();
  const stuck = only();
  expect(stuck.destroy).toHaveBeenCalledOnce();
  mocks.Window.frame = async () => ({ x: 0, y: 0, width: 1280, height: 800 });
  expect(await capturer.capture(URL_A, 1280)).toEqual(Buffer.from("png480"));
  expect(mocks.Window.instances).toHaveLength(2);
});

test("an error or an unusable rectangle is a failure", async () => {
  const capturer = createWindowCapturer();
  mocks.Window.frame = async () => { throw new Error("gone"); };
  expect(await capturer.capture(URL_A, 1280)).toBeNull();
  for (const rect of [null, { x: 0, y: 0, width: 0, height: 800 }, { x: 0, y: 0, width: Number.NaN, height: 800 }, { x: "0", y: 0, width: 1, height: 1 }]) {
    mocks.Window.frame = async () => rect;
    expect(await capturer.capture(URL_A, 1280)).toBeNull();
  }
});

test("close destroys the window, and nothing is left to destroy twice", async () => {
  const capturer = createWindowCapturer();
  capturer.close();
  expect(mocks.Window.instances).toHaveLength(0);
  await capturer.capture(URL_A, 1280);
  capturer.close();
  capturer.close();
  expect(only().destroy).toHaveBeenCalledOnce();
});
