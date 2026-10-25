import { afterEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useComments } from "./useComments";
import { initialCanvasState, type CanvasController, type CanvasState } from "./CanvasController";
import { createTransitionGuard, type TransitionRequest } from "../main/comments/transitions";
import type { CommentRequest } from "../main/comments/service";
import type { Comment } from "../formats/types";
import type { AnchorSnapshot, CommentHooks } from "./commentAnchors";

const harness = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[], deps: [] as (readonly unknown[] | undefined)[], states: [] as unknown[], setters: [] as ReturnType<typeof vi.fn>[], updates: [] as [number, unknown][], index: 0, refs: [] as { current: unknown }[], refIndex: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  // Like React, an effect whose dependencies did not change since the last render is skipped.
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
    const i = harness.effects.length, previous = harness.deps[i];
    const changed = !deps || !previous || deps.some((value, j) => !Object.is(value, previous[j]));
    harness.deps[i] = deps;
    harness.effects.push(changed ? effect : () => {});
  },
  useRef: (initial: unknown = null) => {
    const i = harness.refIndex++;
    return harness.refs[i] ??= { current: initial };
  },
  useState: (initial: unknown) => {
    const i = harness.index++;
    if (!(i in harness.states)) harness.states[i] = typeof initial === "function" ? initial() : initial;
    // Recorded so a test can see which state a render tried to replace.
    return [harness.states[i], harness.setters[i] = vi.fn((update: unknown) => { harness.updates.push([i, update]); })];
  },
}));
afterEach(() => { vi.unstubAllGlobals(); harness.effects = []; harness.deps = []; harness.states = []; harness.updates = []; harness.setters = []; harness.index = 0; harness.refs = []; harness.refIndex = 0; });

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

const row = { path: "design/a.html", id: "a", url: "http://localhost/a.html", width: 600, open: 0, resolved: 0 };
const label = { tag: "label", frame: { id: "shipping" }, frameIndex: 0, element: { doanId: "address", selector: "label", html: "<label/>" }, path: [] };
const pay = { tag: "button", frame: { id: "payment" }, frameIndex: 1, element: { doanId: "pay", selector: "button", html: "<button/>" }, path: [] };
const layout = (document: string) => ({ type: "layout" as const, href: row.url, height: 150, viewport: 150, frames: [], truncated: false, document });
// useState slots in useComments: 2 = anchors, 3 = filter.
const ANCHORS = 2, FILTER = 3;
// Applies the recorded set-state calls for one slot, as React would before the next render.
function settle(slot: number) {
  for (const [index, update] of harness.updates) if (index === slot) harness.states[slot] = typeof update === "function" ? (update as (value: unknown) => unknown)(harness.states[slot]) : update;
  harness.updates = harness.updates.filter(([index]) => index !== slot);
}
function setup(comments: Comment[] = []) {
  const guard = vi.fn(async (_active: boolean) => {});
  const begin = vi.fn(async (r: CommentRequest & { scope: string }) => ({ ok: true, identity: r, value: { project: 1, origin: "origin", hash: "hash", target: r.scope === "canvas" ? {} : { frame: "payment", element: pay.element } } }));
  const mutate = vi.fn(async (r: CommentRequest) => ({ ok: true, identity: r, value: { state: "unknown" } }));
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), doan: {
    onCommentsInvalidated: () => () => {}, onCommentTransition: () => () => {}, answerCommentTransition: vi.fn(),
    setCommentDraftGuard: guard, commentsBegin: begin, commentsMutate: mutate,
    commentsList: async (r: CommentRequest) => ({ ok: true, identity: r, value: { project: 1, comments, warnings: [], canvasHash: "hash" } }),
    commentsAuthor: async (r: CommentRequest) => ({ ok: true, identity: r, value: { kind: "human", name: "A" } }),
  } });
  const controller = { setTransitionGuard: vi.fn(), setComments: vi.fn(), setDraftGuard: vi.fn(), setFollowGuard: vi.fn() };
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

describe("a new comment blocked by a reload", () => {
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
    const loading = render({ status: "loading", layout: null, selection: null }).markup;
    const reason = /<p class="comments-helper" id="([^"]+)">Waiting for the canvas to finish loading.<\/p>/.exec(loading)?.[1];
    expect(loading).toContain(`aria-describedby="${reason}"`);
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

  test("a move to another path with the same id renames the session and keeps filters and anchors", async () => {
    const { render, controller } = setup();
    const { session } = render();
    await vi.waitFor(() => expect(session.list).not.toBeNull());
    const list = session.list;
    const movedRow = { ...row, path: "design/flows/a.html", url: "http://localhost/flows/a.html" };
    render({ open: { folder: "/repo", canvas: movedRow.path, row: movedRow }, shown: movedRow.path, status: "loading", layout: null });
    // Only the selection effect's own functional update may touch the filter; no reset, no cleared anchors.
    const replaced = harness.setters.slice(2, 4).flatMap(setter => setter.mock.calls.filter(([value]) => typeof value !== "function"));
    expect(replaced).toEqual([]);
    expect(session.identity).toEqual({ root: "/repo", canvas: "a", path: movedRow.path });
    expect(session.list).toBe(list);
    await vi.waitFor(() => expect(controller.setComments).toHaveBeenCalled());
    const other = { ...row, id: "b", path: "design/b.html" };
    render({ open: { folder: "/repo", canvas: other.path, row: other } });
    expect(harness.setters[3]).toHaveBeenCalledWith({ scope: "canvas", status: "open" });
    expect(harness.setters[2]).toHaveBeenCalledWith(null);
  });

  test("a followed move blocks a new comment as reloaded and keeps an edit draft saving to the new path", async () => {
    const { render, mutate } = setup();
    const { session } = render();
    await vi.waitFor(() => expect(session.author.status).toBe("ready"));
    await session.create("canvas"); session.body("keep"); render();
    const movedRow = { ...row, path: "design/flows/a.html", url: "http://localhost/flows/a.html" };
    render({ open: { folder: "/repo", canvas: movedRow.path, row: movedRow }, shown: movedRow.path, status: "loading", layout: null, selection: null });
    expect(session.draft.draft).toMatchObject({ body: "keep", lost: "reloaded" });
    session.answer("discard");
    const c1 = { comment: "c1", body: "Before", status: "open", target: {}, canvasHash: "hash", createdBy: { kind: "human", name: "A" }, createdAt: "t", updatedAt: "t" };
    (window.doan as unknown as { commentsList: unknown }).commentsList = async (r: CommentRequest) => ({ ok: true, identity: r, value: { project: 1, comments: [c1], warnings: [], canvasHash: "hash" } });
    await session.read();
    session.edit("c1"); session.body("after");
    const back = { ...row, path: "design/a.html" };
    render({ open: { folder: "/repo", canvas: back.path, row: back }, shown: back.path, status: "loading", layout: null, selection: null });
    await session.read();
    expect(session.identity?.path).toBe(back.path);
    expect(session.draft.draft).toMatchObject({ body: "after", blocked: null });
    expect(session.saveView.status).toBe("idle");
    await session.save();
    expect(mutate.mock.lastCall?.[0]).toMatchObject({ path: back.path, intent: { type: "edit", comment: "c1" } });
  });

  test("tells the controller whether a move can be followed", async () => {
    const { render, controller } = setup();
    const { session } = render();
    await vi.waitFor(() => expect(session.list).not.toBeNull());
    const follow = (controller.setFollowGuard.mock.lastCall as [() => boolean])[0];
    expect(follow()).toBe(true);
    session.deleteConfirmation = { request: { root: "/repo", path: row.path, canvas: "a", requestID: "r", project: 1, intent: { type: "delete", comment: "c", expected: { body: "", status: "open", updatedAt: "" } } }, comment: {} as never };
    expect(follow()).toBe(false);
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

describe("the Comments scope across a reload or a move (L-13)", () => {
  test("keeps a picked Canvas scope while the same selection is found again, and follows a new or no selection", async () => {
    const { render } = setup();
    const { session } = render();
    settle(FILTER);
    expect(harness.states[FILTER]).toMatchObject({ scope: "selection" });
    harness.states[FILTER] = { scope: "canvas", status: "open" };
    await vi.waitFor(() => expect(session.identity).not.toBeNull());
    // The reload finds the same doanId under a rewritten selector, then the canvas moves.
    render({ selection: { ...label, element: { ...label.element, selector: "form > label" } } });
    const moved = { ...row, path: "design/flows/a.html", url: "http://localhost/flows/a.html" };
    const at = { open: { folder: "/repo", canvas: moved.path, row: moved }, shown: moved.path };
    render({ ...at, selection: { ...label } });
    settle(FILTER);
    expect(harness.states[FILTER]).toEqual({ scope: "canvas", status: "open" });
    render({ ...at, selection: pay });
    settle(FILTER);
    expect(harness.states[FILTER]).toMatchObject({ scope: "selection" });
    render({ ...at, selection: null });
    settle(FILTER);
    expect(harness.states[FILTER]).toEqual({ scope: "canvas", status: "open" });
  });

  test("a rewritten selector is a new element when the element has no doanId", () => {
    const { render } = setup();
    const plain = { ...label, element: { selector: "label", html: "<label/>" } };
    render({ selection: plain });
    settle(FILTER);
    harness.states[FILTER] = { scope: "canvas", status: "open" };
    render({ selection: { ...plain, element: { ...plain.element, selector: "form > label" } } });
    settle(FILTER);
    expect(harness.states[FILTER]).toMatchObject({ scope: "selection" });
  });
});

// A reload of the open canvas keeps its previous layout and a null status
// until the new document lays out; only `reloading` says so (F2, E2 probes).
describe("a reload that has not laid out yet", () => {
  async function drafting() {
    const f = setup();
    const { session } = f.render({ selection: null });
    await vi.waitFor(() => expect(session.author.status).toBe("ready"));
    await session.create("canvas"); session.body("keep"); f.render({ selection: null });
    return { ...f, session };
  }
  const disabled = (markup: string, reason: string) => {
    const id = new RegExp(`<p class="comments-helper" id="([^"]+)">${reason}</p>`).exec(markup)?.[1];
    expect(id).toBeDefined();
    expect(markup).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*aria-describedby="${id}"[^>]*>Continue on current version</button>|<button[^>]*aria-describedby="${id}"[^>]*disabled=""[^>]*>Continue on current version</button>`));
  };

  test("keeps Continue disabled as loading while a second reload is pending (probe2)", async () => {
    const { session, render } = await drafting();
    render({ selection: null, layout: layout("two") });
    expect(session.draft.draft?.lost).toBe("reloaded");
    expect(render({ selection: null, layout: layout("two") }).markup).toContain("Continues on Canvas.");
    disabled(render({ selection: null, layout: layout("two"), reloading: true }).markup, "Waiting for the canvas to finish loading.");
  });

  test("blocks a fresh draft as reloaded when the reload starts, keeps it after a failed load, and continues after Reload canvas (probe)", async () => {
    const { session, render } = await drafting();
    // The first render runs the document effect; the second shows its result.
    const shown = (over: Partial<CanvasState>) => { render(over); return render(over).markup; };
    disabled(shown({ selection: null, reloading: true }), "Waiting for the canvas to finish loading.");
    expect(session.draft.draft).toMatchObject({ body: "keep", lost: "reloaded" });
    const failed = shown({ selection: null, status: "failed" });
    expect(session.draft.draft?.lost).toBe("reloaded");
    const editor = failed.slice(failed.indexOf('class="comments-composer"'));
    expect(editor).toContain("The canvas reloaded while you were writing.");
    expect(editor).not.toContain("The original canvas document is unavailable.");
    disabled(failed, "The current version couldn\u2019t load. Reload the canvas to try again.");
    disabled(shown({ selection: null, status: "loading" }), "Waiting for the canvas to finish loading.");
    const loaded = shown({ selection: null, layout: layout("two") });
    expect(session.draft.draft?.lost).toBe("reloaded");
    expect(loaded).toContain("Continues on Canvas.");
    expect(loaded).not.toMatch(/<button[^>]*disabled=""[^>]*>Continue on current version<\/button>/);
  });

  test("a draft started during the reload is reloaded when that reload fails", async () => {
    const f = setup();
    const { session } = f.render({ selection: null });
    await vi.waitFor(() => expect(session.author.status).toBe("ready"));
    f.render({ selection: null, reloading: true });
    await session.create("canvas"); session.body("keep");
    f.render({ selection: null, reloading: true });
    expect(session.draft.draft?.lost).toBeNull();
    f.render({ selection: null, status: "failed" });
    expect(session.draft.draft).toMatchObject({ body: "keep", lost: "reloaded" });
  });

  test("a row without an id stays unavailable when its reload starts (R-B6)", async () => {
    const { session, render } = await drafting();
    const { id: _id, ...withoutId } = row;
    const markup = render({ open: { folder: "/repo", canvas: row.path, row: withoutId }, selection: null, reloading: true }).markup;
    expect(session.draft.draft?.lost).toBe("unavailable");
    expect(markup).not.toContain("Continue on current version");
  });
});

test("a canvas that loses its id while reloading cannot continue the draft", async () => {
  const { render, begin, controller } = setup();
  const { session } = render({ selection: null });
  await vi.waitFor(() => expect(session.author.status).toBe("ready"));
  await session.create("canvas"); session.body("keep"); render({ selection: null });
  const { id: _id, ...withoutId } = row;
  const open = { folder: "/repo", canvas: row.path, row: withoutId };
  render({ open, status: "loading", layout: null, selection: null });
  expect(session.identity).toBeNull();
  expect(session.draft.draft).toMatchObject({ body: "keep", lost: "unavailable" });
  const loaded = render({ open, layout: layout("two"), selection: null });
  expect(loaded.markup).not.toContain("Continue on current version");
  expect(controller.setDraftGuard).toHaveBeenLastCalledWith(true, true);
  await session.continueDraft("canvas");
  expect(begin).toHaveBeenCalledOnce();
});

describe("comment locations (W-9, T-11)", () => {
  const c1: Comment = { comment: "c1", body: "Mark the field", status: "open", target: { element: { doanId: "address", selector: "label", html: "<label/>" } }, canvasHash: "hash", createdBy: { kind: "human", name: "A" }, createdAt: "t", updatedAt: "t" };
  const snapshot = (status: AnchorSnapshot["status"], nodes: [string, string][] = [], selected: string | null = null): AnchorSnapshot =>
    ({ lookup: { root: "/repo", canvas: "a", generation: 1, nodes: new Map(nodes) }, rects: new Map(), selected, status });
  async function bound(selection: CanvasState["selection"]) {
    const f = setup([c1]);
    const { session } = f.render({ selection });
    settle(FILTER);
    await vi.waitFor(() => expect(session.list).not.toBeNull());
    f.render({ selection });
    const hooks = f.controller.setComments.mock.lastCall![1] as CommentHooks;
    const show = (next: AnchorSnapshot) => { hooks.changed(next); settle(ANCHORS); return f.render({ selection }).markup; };
    return { ...f, show };
  }
  const locate = /<button type="button" class="comments-target"( disabled="")?>Element · address<\/button>/;
  const text = `<span class="comments-target" title="label">Element · address</span>`;

  test("without a document answer there is no badge and the target is text", async () => {
    const { render, show } = await bound(null);
    for (const markup of [render({ selection: null }).markup, show(snapshot("none")), show(snapshot("pending"))]) {
      expect(markup).toContain("Mark the field");
      expect(markup).not.toContain("Location unavailable");
      expect(markup).toContain(text);
      expect(markup).not.toMatch(locate);
    }
    const answered = show(snapshot("answered", [["c1", "n1"]]));
    expect(locate.exec(answered)?.[1]).toBeUndefined();
    expect(show(snapshot("answered"))).toContain("Location unavailable");
  });

  test("keeps the last answer while the canvas reloads and drops it when no document will answer", async () => {
    const { show } = await bound(null);
    expect(show(snapshot("answered", [["c1", "n1"]]))).not.toContain("Location unavailable");
    expect(show(snapshot("pending"))).not.toContain("Location unavailable");
    expect(show(snapshot("answered"))).toContain("Location unavailable");
    expect(show(snapshot("pending"))).toContain("Location unavailable");
    expect(show(snapshot("none"))).not.toContain("Location unavailable");
  });

  test("a retained answer that never gets replaced ends with none and its target turns to text (R-B8)", async () => {
    const { show } = await bound(null);
    expect(locate.exec(show(snapshot("answered", [["c1", "n1"]])))?.[1]).toBeUndefined();
    expect(locate.exec(show(snapshot("pending")))?.[1]).toBeUndefined();
    // The controller's measure limit ends the wait.
    expect(show(snapshot("none"))).toContain(text);
  });

  test("a new selection ends a retained answer, so its list is not the previous element's (R-B8)", async () => {
    const { show, render, controller } = await bound(label);
    show(snapshot("answered", [["c1", "n1"]], "n1"));
    expect(show(snapshot("pending"))).toContain("Mark the field");
    render({ selection: pay });
    settle(FILTER); settle(ANCHORS);
    expect(harness.states[FILTER]).toMatchObject({ scope: "selection" });
    expect(render({ selection: pay }).markup).not.toContain("Mark the field");
    // The wait goes on without the old answer until the document answers.
    (controller.setComments.mock.lastCall![1] as CommentHooks).changed(snapshot("pending"));
    settle(ANCHORS);
    expect(render({ selection: pay }).markup).not.toContain("Mark the field");
    (controller.setComments.mock.lastCall![1] as CommentHooks).changed(snapshot("answered", [["c1", "n1"]], "n2"));
    settle(ANCHORS);
    expect(render({ selection: pay }).markup).not.toContain("Mark the field");
  });

  test("keeps the Selection list until the reloaded document answers", async () => {
    const { show } = await bound(label);
    expect(harness.states[FILTER]).toMatchObject({ scope: "selection" });
    expect(show(snapshot("answered", [["c1", "n1"]], "n1"))).toContain("Mark the field");
    expect(show(snapshot("pending"))).toContain("Mark the field");
    expect(show(snapshot("none"))).not.toContain("Mark the field");
  });
});
