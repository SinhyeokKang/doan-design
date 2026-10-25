import { afterEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useComments } from "./useComments";
import { initialCanvasState, type CanvasController, type CanvasState } from "./CanvasController";
import { createTransitionGuard, type TransitionRequest } from "../main/comments/transitions";
import type { CommentRequest } from "../main/comments/service";

const harness = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[], states: [] as unknown[], index: 0, refs: [] as { current: unknown }[], refIndex: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect); },
  useRef: (initial: unknown = null) => {
    const i = harness.refIndex++;
    return harness.refs[i] ??= { current: initial };
  },
  useState: (initial: unknown) => {
    const i = harness.index++;
    if (!(i in harness.states)) harness.states[i] = typeof initial === "function" ? initial() : initial;
    return [harness.states[i], vi.fn()];
  },
}));
afterEach(() => { vi.unstubAllGlobals(); harness.effects = []; harness.states = []; harness.index = 0; harness.refs = []; harness.refIndex = 0; });

test("public main transition wiring separates blocked removal from exceptional quit and authenticates each answer", async () => {
  let listener: ((request: TransitionRequest) => void) | undefined;
  const main = createTransitionGuard(request => listener?.(request));
  const answer = vi.fn(async value => { main.answer(value); });
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), doan: {
    onCommentsInvalidated: () => () => {},
    onCommentTransition: (callback: typeof listener) => { listener = callback; return () => { listener = undefined; }; },
    answerCommentTransition: answer,
    setCommentDraftGuard: async (guarded: boolean) => { main.set(guarded); },
    commentsList: async (r: CommentRequest) => ({ ok: true, identity: r, value: { project: 1, comments: [], warnings: [], canvasHash: "hash" } }),
    commentsAuthor: async (r: CommentRequest) => ({ ok: true, identity: r, value: { kind: "human", name: "A" } }),
    commentsBegin: async (r: CommentRequest) => ({ ok: true, identity: r, value: { project: 1, origin: "origin", hash: "hash", target: {} } }),
    commentsMutate: async (r: CommentRequest) => ({ ok: true, identity: r, value: { state: "unknown", recovery: "child-exit-required" } }),
  } });
  const showWorkspace = vi.fn();
  const render = () => { harness.index = 0; harness.refIndex = 0; return useComments(initialCanvasState(), { current: null }, showWorkspace, []); };
  const { session } = render();
  for (const effect of harness.effects) effect();
  await session.open({ root: "/repo", path: "design/a.html", canvas: "a" });
  await session.create("canvas"); session.body("immutable"); await session.save();
  const before = structuredClone(session.draft);
  const remove = vi.fn(), cancel = vi.fn(), quit = vi.fn();
  main.request({ kind: "remove-projects", roots: ["/repo"] }, remove, cancel);
  await Promise.resolve();
  expect(cancel).toHaveBeenCalledOnce(); expect(remove).not.toHaveBeenCalled();
  expect(renderToStaticMarkup(render().dialog)).toContain("cannot leave this draft");
  session.answerUncertain(session.uncertainTransition!.id, false);
  main.request({ kind: "quit" }, quit, cancel);
  const firstID = session.uncertainTransition!.id;
  expect(renderToStaticMarkup(render().dialog)).toContain("Quit anyway");
  main.request({ kind: "quit" }, quit);
  expect(session.uncertainTransition?.id).toBe(firstID);
  session.answerUncertain(firstID, false); await Promise.resolve();
  expect(quit).not.toHaveBeenCalled();
  main.request({ kind: "quit" }, quit);
  session.answerUncertain(firstID, true); expect(quit).not.toHaveBeenCalled();
  session.answerUncertain(session.uncertainTransition!.id, true); await Promise.resolve();
  expect(quit).toHaveBeenCalledOnce(); expect(session.draft).toEqual(before);
  expect(remove).not.toHaveBeenCalled();
});

describe("a new comment blocked by a reload", () => {
  const row = { path: "design/a.html", id: "a", url: "http://localhost/a.html", width: 600, open: 0, resolved: 0 };
  const label = { tag: "label", frame: { id: "shipping" }, frameIndex: 0, element: { doanId: "address", selector: "label", html: "<label/>" }, path: [] };
  const pay = { tag: "button", frame: { id: "payment" }, frameIndex: 1, element: { doanId: "pay", selector: "button", html: "<button/>" }, path: [] };
  const layout = (document: string) => ({ type: "layout" as const, href: row.url, height: 150, viewport: 150, frames: [], truncated: false, document });
  function setup() {
    const guard = vi.fn(async (_active: boolean) => {});
    const begin = vi.fn(async (r: CommentRequest & { scope: string }) => ({ ok: true, identity: r, value: { project: 1, origin: "origin", hash: "hash", target: r.scope === "canvas" ? {} : { frame: "payment", element: pay.element } } }));
    const mutate = vi.fn(async (r: CommentRequest) => ({ ok: true, identity: r, value: { state: "unknown" } }));
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), doan: {
      onCommentsInvalidated: () => () => {}, onCommentTransition: () => () => {}, answerCommentTransition: vi.fn(),
      setCommentDraftGuard: guard, commentsBegin: begin, commentsMutate: mutate,
      commentsList: async (r: CommentRequest) => ({ ok: true, identity: r, value: { project: 1, comments: [], warnings: [], canvasHash: "hash" } }),
      commentsAuthor: async (r: CommentRequest) => ({ ok: true, identity: r, value: { kind: "human", name: "A" } }),
    } });
    const controller = { setTransitionGuard: vi.fn(), setComments: vi.fn(), setDraftGuard: vi.fn() };
    const ref = { current: controller as unknown as CanvasController };
    const base: CanvasState = { ...initialCanvasState(), open: { folder: "/repo", canvas: row.path, row }, shown: row.path, status: null, hasFrame: true, layout: layout("one"), selection: label };
    const render = (over: Partial<CanvasState> = {}) => {
      harness.index = 0; harness.refIndex = 0; harness.effects = [];
      const result = useComments({ ...base, ...over }, ref, vi.fn(), []);
      for (const effect of harness.effects) effect();
      return { ...result, markup: renderToStaticMarkup(<>{result.panel}</>) };
    };
    return { guard, begin, mutate, controller, render };
  }
  async function blocked() {
    const f = setup();
    const { session } = f.render();
    await vi.waitFor(() => expect(session.author.status).toBe("ready"));
    await session.create("selection"); session.body("Mark the required fields.\nKeep the hint.");
    f.render();
    f.render({ status: "loading", layout: null, selection: null, reanchoring: true });
    expect(session.draft.draft?.lost).toBe("reloaded");
    return { ...f, session };
  }

  test("lets same-canvas selection changes through, keeps asking before leaving, and never releases main's guard", async () => {
    const { session, controller, guard, render } = await blocked();
    render({ layout: layout("two"), selection: label });
    expect(controller.setDraftGuard).toHaveBeenLastCalledWith(true, false);
    const transition = controller.setTransitionGuard.mock.lastCall![0] as (destination: "selection" | "navigation") => boolean | Promise<boolean>;
    expect(transition("selection")).toBe(true);
    expect(session.draft.transition).toBeNull();
    const leaving = transition("navigation");
    expect(leaving).toBeInstanceOf(Promise);
    session.answer("continue"); expect(await leaving).toBe(false);
    const hooks = controller.setComments.mock.lastCall![1] as { guard: () => boolean | Promise<boolean> };
    expect(hooks.guard()).toBe(true);
    expect(guard).not.toHaveBeenCalledWith(false);
  });

  test("disables continue with a reason while loading and reanchoring, then continues on the current selection", async () => {
    const { session, begin, guard, render } = await blocked();
    expect(render({ status: "loading", layout: null, selection: null }).markup).toContain(`id="comments-continue-reason">Waiting for the canvas to finish loading.`);
    expect(render({ layout: layout("two"), selection: label, reanchoring: true }).markup).toContain("Finding your selection in the current version…");
    const ready = render({ layout: layout("two"), selection: pay });
    expect(ready.markup).toContain("Continues on Element · pay.");
    expect(ready.markup).not.toContain("Continue on canvas");
    expect(ready.markup).toContain("The canvas reloaded while you were writing.");
    await session.continueDraft("selection");
    expect(begin).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "selection" }));
    const after = render({ layout: layout("two"), selection: pay });
    expect(after.markup).toContain("To: Element · pay");
    expect(after.markup).toContain("Save comment");
    expect(after.markup).toContain("Mark the required fields.\nKeep the hint.");
    expect(guard.mock.calls.map(([active]) => active)).toEqual([true, true]);
  });

  test("offers Continue on canvas when the selection is gone and keeps it after a new selection", async () => {
    const { session, begin, render } = await blocked();
    const gone = render({ layout: layout("two"), selection: null }).markup;
    expect(gone).toContain("Your selection is no longer in the canvas. Select an element or frame, or continue on the whole canvas.");
    expect(gone).toMatch(/<button type="button" class="comments-btn">Continue on canvas<\/button>/);
    const picked = render({ layout: layout("two"), selection: pay }).markup;
    expect(picked).toContain("Continue on canvas");
    expect(picked).toContain("Continues on Element · pay.");
    await session.continueDraft("canvas");
    expect(begin).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "canvas" }));
    expect(render({ layout: layout("two"), selection: pay }).markup).toContain("To: Canvas");
  });

  test("hides continue while the save state is uncertain", async () => {
    const f = setup();
    const { session } = f.render();
    await vi.waitFor(() => expect(session.author.status).toBe("ready"));
    await session.create("canvas"); session.body("unsure"); await session.save();
    f.render();
    f.render({ status: "loading", layout: null });
    expect(session.draft.request).not.toBeNull();
    expect(f.render({ layout: layout("two") }).markup).not.toContain("Continue on current version");
  });

  test("a load of another canvas id at the same path stays unavailable without continue", async () => {
    const { render } = setup();
    const { session } = render();
    await vi.waitFor(() => expect(session.author.status).toBe("ready"));
    await session.create("canvas"); render();
    const other = { ...row, id: "b" };
    const markup = render({ open: { folder: "/repo", canvas: row.path, row: other }, status: "loading", layout: null, selection: null }).markup;
    expect(session.draft.draft?.lost).toBe("unavailable");
    expect(markup).not.toContain("Continue on current version");
  });
});
