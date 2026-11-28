import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  interface Frame {
    frameTreeNodeId: number; processId: number; routingId: number; parent: Frame | null; frames: Frame[];
    executeJavaScript: ReturnType<typeof vi.fn<(script: string) => Promise<unknown>>>;
  }
  interface Image { isEmpty(): boolean; resize(options: { width: number }): { toPNG(): Buffer } }
  const frames = new Map<string, Frame>();
  let nextId = 1;
  // A script main runs in a canvas frame: what the canvas answers. No frame by default.
  let canvas: (script: string, frame: Frame) => Promise<unknown> = async () => null;
  function frame(parent: Frame | null): Frame {
    const id = nextId++;
    const result: Frame = {
      frameTreeNodeId: id, processId: 10, routingId: id, parent, frames: [],
      executeJavaScript: vi.fn((script: string) => canvas(script, result)),
    };
    parent?.frames.push(result);
    frames.set(`10:${id}`, result);
    return result;
  }
  const setCanvas = (answer: typeof canvas) => { canvas = answer; };
  const webFrameMain = { fromId: (process: number, routing: number) => frames.get(`${process}:${routing}`) };
  class Window extends EventEmitter {
    static instances: Window[] = [];
    // What the next frame script resolves to; a function runs at call time.
    static frame: () => Promise<unknown> = async () => ({ x: 0, y: 0, width: 1280, height: 800 });
    destroyed = false;
    outer: Frame | undefined;
    mainFrame = frame(null);
    webContents = Object.assign(new EventEmitter(), {
      mainFrame: this.mainFrame,
      executeJavaScript: vi.fn((_script: string) => {
        // Each job loads a fresh host page, which holds only the new iframe.
        this.mainFrame.frames.length = 0;
        this.outer = frame(this.mainFrame);
        this.webContents.emit("frame-created", {}, { frame: this.outer });
        return Window.frame();
      }),
      capturePage: vi.fn(async (_rect: unknown): Promise<Image> => ({ isEmpty: () => false, resize: vi.fn((options: { width: number }) => ({ toPNG: () => Buffer.from(`png${options.width}`) })) })),
    });
    loadURL = vi.fn(async (_url: string) => {});
    // The size the window really took: a window can be clamped below what was asked.
    static maxContent: [number, number] = [100_000, 100_000];
    contentSize: [number, number] = [0, 0];
    setContentSize = vi.fn((width: number, height: number) => { this.contentSize = [width, height]; });
    getContentSize = vi.fn((): [number, number] => [Math.min(this.contentSize[0], Window.maxContent[0]), Math.min(this.contentSize[1], Window.maxContent[1])]);
    destroy = vi.fn(() => { this.destroyed = true; });
    isDestroyed = () => this.destroyed;
    constructor(readonly options: unknown) {
      super();
      Window.instances.push(this);
    }
  }
  return { Window, frame, frames, setCanvas, webFrameMain };
});
vi.mock("electron", () => ({ BrowserWindow: mocks.Window, webFrameMain: mocks.webFrameMain }));

const { CAPTURE_WINDOW_TITLE, createWindowCapturer, frameScript, hostPage, JOB_LIMIT_MS, LOAD_LIMIT_MS, MEASURE_LIMIT_MS, READ_FRAME, SCROLL_TO_FRAME, SETTLE_MS } = await import("./thumbnailWindow");
const URL_A = "http://127.0.0.1:1/t/tok/k/.doan/canvases/a.html";

beforeEach(() => {
  mocks.Window.instances.length = 0;
  mocks.Window.frame = async () => ({ x: 0, y: 0, width: 1280, height: 800 });
  mocks.setCanvas(async () => null);
  mocks.Window.maxContent = [100_000, 100_000];
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

test("the runtime probes tell the capture window apart by main's title", async () => {
  const runtime = await import("../../runtime/windows");
  expect(runtime.CAPTURE_WINDOW_TITLE).toBe(CAPTURE_WINDOW_TITLE);
});

test("the window carries a fixed title from creation, which no page replaces", async () => {
  await createWindowCapturer().capture(URL_A, 1280);
  expect(only().options).toMatchObject({ title: CAPTURE_WINDOW_TITLE, show: false });
  const event = { preventDefault: vi.fn() };
  only().emit("page-title-updated", event, "Other", true);
  expect(event.preventDefault).toHaveBeenCalledOnce();
});

test.each([
  ["a canvas frame that fails to load", (window: InstanceType<typeof mocks.Window>) => window.webContents.emit("did-fail-load", {}, -105, "ERR", URL_A, false, window.outer!.processId, window.outer!.routingId)],
  ["a canvas frame answered with 404", (window: InstanceType<typeof mocks.Window>) => window.webContents.emit("did-frame-navigate", {}, URL_A, 404, "Not Found", false, window.outer!.processId, window.outer!.routingId)],
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
  await capturer.capture(URL_A, 1280);
  capturer.close();
  capturer.close();
  expect(only().destroy).toHaveBeenCalledOnce();
});

// Quit closes the window under a running capture; the queue's next job must
// not open another, or the app never reaches will-quit.
test("after close a capture fails without opening a window", async () => {
  const capturer = createWindowCapturer();
  capturer.close();
  expect(await capturer.capture(URL_A, 1280)).toBeNull();
  expect(mocks.Window.instances).toHaveLength(0);
});

test("a capture running at close fails, and the next opens no window", async () => {
  const capturer = createWindowCapturer();
  let finish: (rect: unknown) => void = () => {};
  mocks.Window.frame = () => new Promise((resolve) => { finish = resolve; });
  const running = capturer.capture(URL_A, 1280);
  await vi.waitFor(() => expect(only().webContents.executeJavaScript).toHaveBeenCalled());
  capturer.close();
  finish({ x: 0, y: 0, width: 1280, height: 800 });
  expect(await running).toBeNull();
  expect(await capturer.capture(URL_A, 1280)).toBeNull();
  expect(mocks.Window.instances).toHaveLength(1);
});

function failFrame(window: InstanceType<typeof mocks.Window>, frame: NonNullable<typeof window.outer>, kind: "http" | "network", url = URL_A) {
  if (kind === "http") window.webContents.emit("did-frame-navigate", {}, url, 404, "Not Found", false, frame.processId, frame.routingId);
  else window.webContents.emit("did-fail-load", {}, -102, "ERR_CONNECTION_REFUSED", url, false, frame.processId, frame.routingId);
}

test.each(["http", "network"] as const)("a nested %s failure sharing the outer URL still captures the outer canvas", async (kind) => {
  mocks.Window.frame = async () => {
    const window = only();
    const nested = mocks.frame(window.outer!);
    window.webContents.emit("frame-created", {}, { frame: nested });
    failFrame(window, nested, kind);
    return { x: 0, y: 0, width: 1280, height: 800 };
  };
  expect(await createWindowCapturer().capture(URL_A, 1280)).toEqual(Buffer.from("png480"));
});

test("redirected outer failure with a new renderer identity is still unavailable", async () => {
  mocks.Window.frame = async () => {
    const window = only();
    const redirected = { ...window.outer!, processId: 20, routingId: 99 };
    mocks.frames.set("20:99", redirected);
    failFrame(window, redirected, "http", "http://127.0.0.1:1/redirected");
    return { x: 0, y: 0, width: 1280, height: 800 };
  };
  expect(await createWindowCapturer().capture(URL_A, 1280)).toBeNull();
});

test("an obsolete outer frame failure cannot poison a later job in the same window", async () => {
  const capturer = createWindowCapturer();
  await capturer.capture(URL_A, 1280);
  const previous = only().outer!;
  mocks.Window.frame = async () => {
    failFrame(only(), previous, "http");
    failFrame(only(), previous, "network");
    return { x: 0, y: 0, width: 1280, height: 800 };
  };
  expect(await capturer.capture(URL_A, 1280)).toEqual(Buffer.from("png480"));
});

test("a timed-out window's events and late script result cannot affect its replacement", async () => {
  const capturer = createWindowCapturer(50);
  let finish: (value: unknown) => void = () => {};
  mocks.Window.frame = () => new Promise(resolve => { finish = resolve; });
  expect(await capturer.capture(URL_A, 1280)).toBeNull();
  const previous = only();
  mocks.Window.frame = async () => {
    failFrame(previous, previous.outer!, "network");
    finish({ x: 0, y: 0, width: 1280, height: 800 });
    return { x: 0, y: 0, width: 1280, height: 800 };
  };
  expect(await capturer.capture(URL_A, 1280)).toEqual(Buffer.from("png480"));
  expect(previous.webContents.capturePage).not.toHaveBeenCalled();
});

test("an outer failure during capturePage still rejects the PNG", async () => {
  mocks.Window.frame = async () => {
    const window = only();
    window.webContents.capturePage.mockImplementationOnce(async () => {
      failFrame(window, window.outer!, "network");
      return { isEmpty: () => false, resize: vi.fn(() => ({ toPNG: () => Buffer.from("wrong") })) };
    });
    return { x: 0, y: 0, width: 1280, height: 800 };
  };
  expect(await createWindowCapturer().capture(URL_A, 1280)).toBeNull();
});

// The first top-level frame: read, then scrolled to and read again, in the job's outer canvas frame only.
const FIRST_SCREEN = { x: 0, y: 0, width: 960, height: 600 };
const SCROLLED = { x: 40, y: 0, width: 880, height: 500 };
// The canvas answers as the scripts send them.
const BELOW = "40 700 880 500";
const SCROLLED_ANSWER = "40 0 880 500";
type CanvasFrame = NonNullable<InstanceType<typeof mocks.Window>["outer"]>;
const firstScreenWindow = async () => FIRST_SCREEN;

function canvasAnswers(read: () => Promise<unknown>, scroll: () => Promise<unknown> = async () => SCROLLED_ANSWER) {
  mocks.setCanvas((script) => {
    if (script === READ_FRAME) return read();
    if (script === SCROLL_TO_FRAME) return scroll();
    return Promise.reject(new Error(`unexpected script ${script}`));
  });
}
const scripts = (frame: CanvasFrame | undefined) => frame?.executeJavaScript.mock.calls.map((call) => call[0]) ?? [];
const captured = () => only().webContents.capturePage.mock.calls.map((call) => call[0]);
const image = (bytes: string) => ({ isEmpty: () => false, resize: vi.fn(() => ({ toPNG: () => Buffer.from(bytes) })) });

// The page before the scroll and after it give different images.
function imagesBeforeAndAfterScroll() {
  const before = mocks.Window.frame;
  mocks.Window.frame = async () => {
    const window = only();
    let scrolled = false;
    window.webContents.capturePage.mockImplementation(async () => image(scrolled ? "after" : "before"));
    const outer = window.outer!;
    const answer = outer.executeJavaScript.getMockImplementation();
    outer.executeJavaScript.mockImplementation((script: string) => {
      if (script === SCROLL_TO_FRAME) scrolled = true;
      return answer!(script);
    });
    return before();
  };
}

test("the canvas scripts read the first frame and scroll it into view with two frames painted", () => {
  expect(READ_FRAME).toContain('document.querySelector("[data-doan-frame]")');
  expect(READ_FRAME).not.toContain("scrollIntoView");
  expect(SCROLL_TO_FRAME).toContain('scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" })');
  expect(SCROLL_TO_FRAME.match(/requestAnimationFrame/g)).toHaveLength(2);
  expect(MEASURE_LIMIT_MS).toBe(1000);
});

// Runs a canvas script against a stand-in page whose own code faked what the script reads.
async function runCanvasScript(script: string, rect: unknown, scroll: unknown = 0, querySelector?: () => unknown) {
  const element = { getBoundingClientRect: () => rect, scrollIntoView: () => {} };
  const document = { querySelector: querySelector ?? (() => element) };
  const requestAnimationFrame = (callback: () => void) => setTimeout(callback, 0);
  return (new Function("document", "scrollX", "scrollY", "requestAnimationFrame", `return ${script}`) as (...args: unknown[]) => Promise<unknown>)(
    document, scroll, scroll, requestAnimationFrame);
}

test.each([READ_FRAME, SCROLL_TO_FRAME])("a canvas script sends four plain numbers whatever the page fakes", async (script) => {
  expect(await runCanvasScript(script, { x: 40, y: 0, width: 880, height: 500 })).toBe("40 0 880 500");
  const huge = "9".repeat(100_000);
  const fakes: unknown[] = [
    { x: huge, y: { nested: { deeper: [huge] } }, width: [1, 2, 3], height: "500" },
    { x: { valueOf: () => { throw new Error(huge); } }, y: 0, width: 1, height: 1 },
    { x: 10n, y: 0, width: 1, height: 1 },
    { x: Symbol("x"), y: 0, width: 1, height: 1 },
    null,
  ];
  for (const rect of fakes) {
    const sent = await runCanvasScript(script, rect, huge);
    expect(sent === null || (typeof sent === "string" && sent.length < 128)).toBe(true);
  }
  expect(await runCanvasScript(script, null, 0, () => { throw new Error(huge); })).toBeNull();
  expect(await runCanvasScript(script, null, 0, () => null)).toBeNull();
});

test("a frame below the first screen is scrolled to and only its rectangle is stored", async () => {
  mocks.Window.frame = firstScreenWindow;
  canvasAnswers(async () => BELOW);
  imagesBeforeAndAfterScroll();
  expect(await createWindowCapturer().capture(URL_A, 960)).toEqual(Buffer.from("after"));
  expect(scripts(only().outer)).toEqual([READ_FRAME, SCROLL_TO_FRAME]);
  // The first screen is taken before the scroll, in case the frame cannot be.
  expect(captured()).toEqual([FIRST_SCREEN, SCROLLED]);
});

test("a narrow frame's capture is cut at 16:10", async () => {
  mocks.Window.frame = firstScreenWindow;
  canvasAnswers(async () => "40 300 390 844", async () => "40 0 390 844");
  await createWindowCapturer().capture(URL_A, 960);
  expect(captured()).toEqual([FIRST_SCREEN, { x: 40, y: 0, width: 390, height: 244 }]);
});

test.each([
  ["no frame", async () => null],
  ["a 0 x 0 frame", async () => "0 700 0 0"],
  ["a frame wider than the board", async () => "0 0 4000 500"],
  ["a faked NaN rectangle", async () => "NaN -5 10000000 10000000"],
  ["an object instead of numbers", async () => ({ x: 40, y: 700, width: 880, height: 500 })],
  ["a read that throws", async () => { throw new Error("canvas threw"); }],
])("%s is not scrolled, and the first screen is captured once", async (_name, read) => {
  mocks.Window.frame = firstScreenWindow;
  canvasAnswers(read);
  expect(await createWindowCapturer().capture(URL_A, 960)).toEqual(Buffer.from("png480"));
  expect(scripts(only().outer)).toEqual([READ_FRAME]);
  expect(captured()).toEqual([FIRST_SCREEN]);
});

test("a read past the measurement limit is abandoned and the first screen captured, not a job failure", async () => {
  mocks.Window.frame = firstScreenWindow;
  let answer: (value: unknown) => void = () => {};
  canvasAnswers(() => new Promise((resolve) => { answer = resolve; }));
  expect(await createWindowCapturer(JOB_LIMIT_MS, 20).capture(URL_A, 960)).toEqual(Buffer.from("png480"));
  expect(captured()).toEqual([FIRST_SCREEN]);
  // A late answer changes nothing: no scroll follows it.
  answer(BELOW);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(scripts(only().outer)).toEqual([READ_FRAME]);
});

test.each([
  ["a scroll answered after the measurement limit", () => new Promise(() => {})],
  ["a scroll that throws", async () => { throw new Error("canvas threw"); }],
  ["a scroll that answers no frame", async () => null],
  ["a scrolled rectangle still outside the viewport", async () => BELOW],
  ["a faked scrolled rectangle", async () => "-1 0 10000000 500"],
])("%s keeps the image taken before the scroll", async (_name, scroll) => {
  mocks.Window.frame = firstScreenWindow;
  canvasAnswers(async () => BELOW, scroll);
  imagesBeforeAndAfterScroll();
  expect(await createWindowCapturer(JOB_LIMIT_MS, 20).capture(URL_A, 960)).toEqual(Buffer.from("before"));
  expect(scripts(only().outer)).toEqual([READ_FRAME, SCROLL_TO_FRAME]);
  expect(captured()).toEqual([FIRST_SCREEN]);
});

test("an empty frame capture keeps the image taken before the scroll", async () => {
  mocks.Window.frame = async () => {
    only().webContents.capturePage.mockImplementationOnce(async () => image("before"))
      .mockImplementationOnce(async () => ({ isEmpty: () => true, resize: vi.fn(() => ({ toPNG: () => Buffer.from("empty") })) }));
    return FIRST_SCREEN;
  };
  canvasAnswers(async () => BELOW);
  expect(await createWindowCapturer().capture(URL_A, 960)).toEqual(Buffer.from("before"));
});

test("the frame capture is cut to the window's real content size", async () => {
  mocks.Window.maxContent = [1440, 900];
  mocks.Window.frame = async () => ({ x: 0, y: 0, width: 2000, height: 1250 });
  canvasAnswers(async () => "1200 700 600 500", async () => "1200 0 600 500");
  await createWindowCapturer().capture(URL_A, 2000);
  expect(captured()).toEqual([{ x: 0, y: 0, width: 2000, height: 1250 }, { x: 1200, y: 0, width: 240, height: 150 }]);
});

test("a frame outside the window's real content keeps the image taken before the scroll", async () => {
  mocks.Window.maxContent = [1440, 900];
  mocks.Window.frame = async () => ({ x: 0, y: 0, width: 2000, height: 1250 });
  canvasAnswers(async () => "1600 700 300 500", async () => "1600 0 300 500");
  imagesBeforeAndAfterScroll();
  expect(await createWindowCapturer().capture(URL_A, 2000)).toEqual(Buffer.from("before"));
  expect(captured()).toEqual([{ x: 0, y: 0, width: 2000, height: 1250 }]);
});

test("the outer frame is found again after load, not used from frame-created", async () => {
  let replaced: CanvasFrame | undefined;
  mocks.Window.frame = async () => {
    const window = only();
    // A redirect gave the outer frame a new renderer; the frame-created object is disposed.
    const stale = window.outer!;
    stale.executeJavaScript.mockImplementation(() => { throw new Error("Render frame was disposed"); });
    replaced = { ...stale, processId: 20, frames: [], executeJavaScript: vi.fn((script: string) => Promise.resolve(script === READ_FRAME ? BELOW : SCROLLED_ANSWER)) };
    window.mainFrame.frames.splice(0, 1, replaced);
    return FIRST_SCREEN;
  };
  await createWindowCapturer().capture(URL_A, 960);
  expect(only().outer!.executeJavaScript).not.toHaveBeenCalled();
  expect(scripts(replaced)).toEqual([READ_FRAME, SCROLL_TO_FRAME]);
  expect(captured()).toEqual([FIRST_SCREEN, SCROLLED]);
});

test("an outer frame gone after load gives the first screen", async () => {
  mocks.Window.frame = async () => {
    only().mainFrame.frames.length = 0;
    return FIRST_SCREEN;
  };
  canvasAnswers(async () => BELOW);
  expect(await createWindowCapturer().capture(URL_A, 960)).toEqual(Buffer.from("png480"));
  expect(captured()).toEqual([FIRST_SCREEN]);
});

test("a host page whose frames cannot be listed gives the first screen", async () => {
  mocks.Window.frame = async () => {
    Object.defineProperty(only().mainFrame, "frames", { get: () => { throw new Error("Render frame was disposed"); } });
    return FIRST_SCREEN;
  };
  canvasAnswers(async () => BELOW);
  expect(await createWindowCapturer().capture(URL_A, 960)).toEqual(Buffer.from("png480"));
  expect(captured()).toEqual([FIRST_SCREEN]);
});

test("no script runs in a nested frame", async () => {
  let nested: CanvasFrame | undefined;
  mocks.Window.frame = async () => {
    const window = only();
    nested = mocks.frame(window.outer!);
    window.webContents.emit("frame-created", {}, { frame: nested });
    return FIRST_SCREEN;
  };
  canvasAnswers(async () => BELOW);
  await createWindowCapturer().capture(URL_A, 960);
  expect(nested!.executeJavaScript).not.toHaveBeenCalled();
  expect(scripts(only().outer)).toEqual([READ_FRAME, SCROLL_TO_FRAME]);
});

test("a canvas faking its rectangle affects only its own thumbnail", async () => {
  mocks.Window.frame = firstScreenWindow;
  const capturer = createWindowCapturer();
  canvasAnswers(async () => "0 0 960 1000000000");
  expect(await capturer.capture(URL_A, 960)).toEqual(Buffer.from("png480"));
  canvasAnswers(async () => BELOW);
  expect(await capturer.capture(URL_A, 960)).toEqual(Buffer.from("png480"));
  expect(captured()).toEqual([FIRST_SCREEN, FIRST_SCREEN, SCROLLED]);
});

test("a capture closed while the frame is read neither scrolls nor captures", async () => {
  mocks.Window.frame = firstScreenWindow;
  let answer: (value: unknown) => void = () => {};
  canvasAnswers(() => new Promise((resolve) => { answer = resolve; }));
  const capturer = createWindowCapturer();
  const running = capturer.capture(URL_A, 960);
  await vi.waitFor(() => expect(scripts(only().outer)).toEqual([READ_FRAME]));
  capturer.close();
  answer(BELOW);
  expect(await running).toBeNull();
  expect(scripts(only().outer)).toEqual([READ_FRAME]);
  expect(only().webContents.capturePage).not.toHaveBeenCalled();
});

test("a capture closed while the frame is scrolled to stores nothing", async () => {
  mocks.Window.frame = firstScreenWindow;
  let answer: (value: unknown) => void = () => {};
  canvasAnswers(async () => BELOW, () => new Promise((resolve) => { answer = resolve; }));
  const capturer = createWindowCapturer();
  const running = capturer.capture(URL_A, 960);
  await vi.waitFor(() => expect(scripts(only().outer)).toEqual([READ_FRAME, SCROLL_TO_FRAME]));
  capturer.close();
  answer(SCROLLED_ANSWER);
  expect(await running).toBeNull();
  expect(captured()).toEqual([FIRST_SCREEN]);
});

test.each(["read", "scroll"] as const)("an outer failure while the frame is %s rejects the PNG", async (step) => {
  mocks.Window.frame = firstScreenWindow;
  const fail = async (value: string) => {
    const window = only();
    failFrame(window, window.outer!, "network");
    return value;
  };
  canvasAnswers(step === "read" ? () => fail(BELOW) : async () => BELOW, step === "scroll" ? () => fail(SCROLLED_ANSWER) : undefined);
  expect(await createWindowCapturer().capture(URL_A, 960)).toBeNull();
});

test("a rejected frame capture keeps the image taken before the scroll", async () => {
  mocks.Window.frame = async () => {
    only().webContents.capturePage.mockImplementationOnce(async () => image("before"))
      .mockImplementationOnce(async () => { throw new Error("surface gone"); });
    return FIRST_SCREEN;
  };
  canvasAnswers(async () => BELOW);
  expect(await createWindowCapturer().capture(URL_A, 960)).toEqual(Buffer.from("before"));
  expect(mocks.Window.instances).toHaveLength(1);
  expect(only().destroy).not.toHaveBeenCalled();
});

test.each([
  ["the capture is closed", (capturer: ReturnType<typeof createWindowCapturer>) => capturer.close()],
  ["the outer frame fails", () => failFrame(only(), only().outer!, "network")],
])("a rejected frame capture stores nothing when %s during it", async (_name, interrupt) => {
  const capturer = createWindowCapturer();
  mocks.Window.frame = async () => {
    only().webContents.capturePage.mockImplementationOnce(async () => image("before"))
      .mockImplementationOnce(async () => { interrupt(capturer); throw new Error("surface gone"); });
    return FIRST_SCREEN;
  };
  canvasAnswers(async () => BELOW);
  expect(await capturer.capture(URL_A, 960)).toBeNull();
});

test("no scroll is sent once the measurement limit passed during the first-screen capture", async () => {
  vi.useFakeTimers();
  mocks.Window.frame = async () => {
    only().webContents.capturePage.mockImplementationOnce(() => new Promise((resolve) => { setTimeout(() => resolve(image("before")), MEASURE_LIMIT_MS + 500); }));
    return FIRST_SCREEN;
  };
  canvasAnswers(async () => BELOW);
  const running = createWindowCapturer().capture(URL_A, 960);
  await vi.advanceTimersByTimeAsync(MEASURE_LIMIT_MS + 1000);
  expect(await running).toEqual(Buffer.from("before"));
  expect(scripts(only().outer)).toEqual([READ_FRAME]);
  expect(captured()).toEqual([FIRST_SCREEN]);
});
