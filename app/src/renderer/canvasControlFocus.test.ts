// Runs the hook's effects without a DOM (no jsdom here): React's hooks are stand-ins that keep refs and collect effects.
import { afterEach, expect, test, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  useRef<T>(initial: T) { return { current: initial }; },
  useEffect(effect: () => void | (() => void)) { hooks.effects.push(effect); },
}));
vi.mock("react", () => hooks);
const { useControlFocusRecovery } = await import("./canvasControlFocus");
const { CanvasViewStore } = await import("./CanvasController");

afterEach(() => { hooks.effects = []; vi.unstubAllGlobals(); vi.useRealTimers(); });

class Element {}
// Zoom in at 320% with focus, then pressed to 400% (MAX_SCALE): the publish moves only the zoom, so only the header
// redraws and the button turns disabled under focus without the pane rendering again.
test("a zoom button that turns disabled under focus at a scale limit hands focus to the canvas area at once", () => {
  vi.useFakeTimers();
  vi.stubGlobal("HTMLElement", Element);
  let focusin: (event: { target: unknown }) => void = () => {};
  const body = new Element();
  const doc = { activeElement: body as unknown, body, addEventListener: (_: string, listener: typeof focusin) => { focusin = listener; }, removeEventListener: () => {} };
  vi.stubGlobal("document", doc);
  let disabled = false;
  const zoomIn = Object.assign(new Element(), { isConnected: true, matches: (selector: string) => selector === ":disabled" ? disabled : selector.startsWith("button"), closest: () => null });
  const panel = { current: { contains: (target: unknown) => target === zoomIn } } as never;
  const area = { focus: vi.fn() };
  const view = new CanvasViewStore({ zoom: 320, scale: 3.2, currentFrame: 0 });
  useControlFocusRecovery(panel, { current: area } as never, false, view);
  const cleanups = hooks.effects.map(effect => effect()).filter(Boolean) as (() => void)[];
  vi.advanceTimersByTime(0);
  focusin({ target: zoomIn });
  doc.activeElement = zoomIn;
  vi.advanceTimersByTime(0);
  expect(area.focus).not.toHaveBeenCalled();
  disabled = true;
  view.set({ zoom: 400, scale: 4, currentFrame: 0 });
  vi.advanceTimersByTime(0);
  expect(area.focus).toHaveBeenCalledOnce();
  cleanups.forEach(cleanup => cleanup());
});
