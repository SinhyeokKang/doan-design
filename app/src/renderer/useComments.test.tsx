import { afterEach, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useComments } from "./useComments";
import { initialCanvasState } from "./CanvasController";
import { createTransitionGuard, type TransitionRequest } from "../main/comments/transitions";
import type { CommentRequest } from "../main/comments/service";

const harness = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[], states: [] as unknown[], index: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect); },
  useRef: () => ({ current: null }),
  useState: (initial: unknown) => {
    const i = harness.index++;
    if (!(i in harness.states)) harness.states[i] = typeof initial === "function" ? initial() : initial;
    return [harness.states[i], vi.fn()];
  },
}));
afterEach(() => { vi.unstubAllGlobals(); harness.effects = []; harness.states = []; harness.index = 0; });

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
  const render = () => { harness.index = 0; return useComments(initialCanvasState(), { current: null }, showWorkspace, []); };
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
