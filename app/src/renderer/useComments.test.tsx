import { afterEach, describe, expect, test, vi, type Mock } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useComments } from "./useComments";
import { initialCanvasState, MEASURE_ANSWER_MS, type CanvasController, type CanvasState } from "./CanvasController";
import { createTransitionGuard, type TransitionRequest } from "../main/comments/transitions";
import type { CommentRequest } from "../main/comments/service";
import type { Comment } from "../formats/types";
import type { AnchorSnapshot, CommentHooks } from "./commentAnchors";
import { READ_FAILED_EDITOR } from "../comments/panelText";
import { CommentEditor, DeleteCommentDialog, UnsavedCommentDialog, type CommentsPanelProps } from "./CommentsPanel";
import { HandOffDialog, type HandOffDialogProps } from "./HandOffDialog";
import { handoffSummary } from "../comments/handoff";
import type { FolderEntry } from "../main/view";
import type { ReactElement } from "react";

const harness = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[], deps: [] as (readonly unknown[] | undefined)[], states: [] as unknown[], setters: [] as ReturnType<typeof vi.fn>[], updates: [] as [number, unknown][], index: 0, refs: [] as { current: unknown }[], refIndex: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  // CommentEditor is called as a plain function outside a React render.
  useId: () => "r1",
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
  await session.open({ root: "/repo", path: ".doan/canvases/a.html", canvas: "a" });
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

const row = { path: ".doan/canvases/a.html", id: "a", url: "http://localhost/a.html", width: 600, open: 0, resolved: 0 };
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
  // Focus moves read the active element; tests that check them stub it first.
  if (typeof document === "undefined") vi.stubGlobal("document", { body: null, activeElement: null });
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
    expect(ready.markup).toContain("Continues on Element · button pay · in payment.");
    expect(ready.markup).not.toContain("Continue on canvas");
    expect(ready.markup).toContain("The canvas reloaded while you were writing.");
    await session.continueDraft("selection");
    expect(begin).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "selection" }));
    const after = render({ layout: layout("two"), selection: pay });
    expect(after.markup).toContain("To: Element · button pay");
    expect(after.markup).toContain("Save comment");
    expect(after.markup).toContain("Mark the required fields.\nKeep the hint.");
    expect(guard.mock.calls.map(([active]) => active)).toEqual([true, true]);
  });

  test("offers Continue on canvas when the selection is gone and keeps it after a new selection", async () => {
    const { session, begin, render } = await blocked();
    const gone = render({ layout: layout("two"), selection: null }).markup;
    expect(gone).toContain("Your selection is no longer in the canvas. Select an element or frame, or continue on the whole canvas.");
    expect(gone).toMatch(/<button type="button" class="comments-btn doan-button" data-ui-variant="subtle" data-ui-size="sm">Continue on canvas<\/button>/);
    const picked = render({ layout: layout("two"), selection: pay }).markup;
    expect(picked).toContain("Continue on canvas");
    expect(picked).toContain("Continues on Element · button pay · in payment.");
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
    const movedRow = { ...row, path: ".doan/canvases/flows/a.html", url: "http://localhost/flows/a.html" };
    render({ open: { folder: "/repo", canvas: movedRow.path, row: movedRow }, shown: movedRow.path, status: "loading", layout: null });
    // Only the selection effect's own functional update may touch the filter; no reset, no cleared anchors.
    const replaced = harness.setters.slice(2, 4).flatMap(setter => setter.mock.calls.filter(([value]) => typeof value !== "function"));
    expect(replaced).toEqual([]);
    expect(session.identity).toEqual({ root: "/repo", canvas: "a", path: movedRow.path });
    expect(session.list).toBe(list);
    await vi.waitFor(() => expect(controller.setComments).toHaveBeenCalled());
    const other = { ...row, id: "b", path: ".doan/canvases/b.html" };
    render({ open: { folder: "/repo", canvas: other.path, row: other } });
    expect(harness.setters[3]).toHaveBeenCalledWith({ scope: "canvas", status: "open" });
    expect(harness.setters[2]).toHaveBeenCalledWith(null);
  });

  test("a followed move blocks a new comment as reloaded and keeps an edit draft saving to the new path", async () => {
    const { render, mutate } = setup();
    const { session } = render();
    await vi.waitFor(() => expect(session.author.status).toBe("ready"));
    await session.create("canvas"); session.body("keep"); render();
    const movedRow = { ...row, path: ".doan/canvases/flows/a.html", url: "http://localhost/flows/a.html" };
    render({ open: { folder: "/repo", canvas: movedRow.path, row: movedRow }, shown: movedRow.path, status: "loading", layout: null, selection: null });
    expect(session.draft.draft).toMatchObject({ body: "keep", lost: "reloaded" });
    session.answer("discard");
    const c1 = { comment: "c1", body: "Before", status: "open", target: {}, canvasHash: "hash", createdBy: { kind: "human", name: "A" }, createdAt: "t", updatedAt: "t" };
    (window.doan as unknown as { commentsList: unknown }).commentsList = async (r: CommentRequest) => ({ ok: true, identity: r, value: { project: 1, comments: [c1], warnings: [], canvasHash: "hash" } });
    await session.read();
    session.edit("c1"); session.body("after");
    const back = { ...row, path: ".doan/canvases/a.html" };
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
    const moved = { ...row, path: ".doan/canvases/flows/a.html", url: "http://localhost/flows/a.html" };
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
    // The panel's own messages follow the editor, right under the head.
    const start = failed.indexOf('class="comments-composer"');
    const editor = failed.slice(start, failed.indexOf('<div class="comments-message warning">', start));
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
  const locate = /<button type="button" class="comments-target locatable"[^>]*>Element · label address<\/button>/;
  const text = `<span class="comments-target" title="label">Element · label address</span>`;

  test("without a document answer there is no badge and the target is text", async () => {
    const { render, show } = await bound(null);
    for (const markup of [render({ selection: null }).markup, show(snapshot("none")), show(snapshot("pending"))]) {
      expect(markup).toContain("Mark the field");
      expect(markup).not.toContain("Location unavailable");
      expect(markup).toContain(text);
      expect(markup).not.toMatch(locate);
    }
    const answered = show(snapshot("answered", [["c1", "n1"]]));
    expect(answered).toMatch(locate);
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
    expect(show(snapshot("answered", [["c1", "n1"]]))).toMatch(locate);
    expect(show(snapshot("pending"))).toMatch(locate);
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

describe("the panel while comments change underneath (comments-readability task 4)", () => {
  const note: Comment = { comment: "c1", body: "Mark the field", status: "open", target: {}, canvasHash: "hash", createdBy: { kind: "human", name: "A" }, createdAt: "t", updatedAt: "t" };
  const agent: Comment = { ...note, comment: "c2", body: "From the agent", createdBy: { kind: "agent", name: "Claude Code" } };
  const api = () => window.doan as unknown as Record<string, unknown>;
  async function ready(comments: Comment[] = []) {
    const f = setup(comments);
    const rendered = f.render({ selection: null });
    await vi.waitFor(() => { expect(rendered.session.author.status).toBe("ready"); expect(rendered.session.list).not.toBeNull(); });
    return { ...f, session: rendered.session };
  }

  test.each([false, true])("an external comment keeps the composer's input and focus (IME composing: %s)", async composing => {
    let invalidated: ((change: { root: string }) => void) | undefined;
    const field = { focus: vi.fn(), setSelectionRange: vi.fn(), value: "", closest: () => null }, heading = { focus: vi.fn() };
    harness.refs[0] = { current: field }; harness.refs[1] = { current: heading };
    const f = setup();
    api().onCommentsInvalidated = (callback: typeof invalidated) => { invalidated = callback; return () => {}; };
    const { session } = f.render({ selection: null });
    await vi.waitFor(() => { expect(session.author.status).toBe("ready"); expect(session.list).not.toBeNull(); });
    await session.create("canvas"); f.render({ selection: null });
    expect(field.focus).toHaveBeenCalledOnce();
    if (composing) for (const [type, listener] of (window.addEventListener as Mock).mock.calls) if (type === "compositionstart") (listener as () => void)();
    session.body("한글 입력");
    api().commentsList = async (r: CommentRequest) => ({ ok: true, identity: r, value: { project: 1, comments: [agent], warnings: [], canvasHash: "hash" } });
    invalidated?.({ root: "/repo" });
    await vi.waitFor(() => expect(session.list?.comments).toEqual([agent]));
    const { markup } = f.render({ selection: null });
    expect(markup).toContain("From the agent");
    expect(markup).toContain(">한글 입력</textarea>");
    expect(session.draft.draft?.body).toBe("한글 입력");
    expect(session.composing).toBe(composing);
    expect(field.focus).toHaveBeenCalledOnce(); expect(heading.focus).not.toHaveBeenCalled();
  });

  test("while reads fail, an editing draft's Save is disabled and the read failure is one block", async () => {
    const { session, render } = await ready([note]);
    session.edit("c1"); session.body("Changed");
    api().commentsList = async (r: CommentRequest) => ({ ok: false, identity: r, error: "Permission denied." });
    await session.read();
    const { markup } = render({ selection: null });
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Save changes<\/button>/);
    expect(markup).toContain(READ_FAILED_EDITOR);
    expect(markup).toContain("Couldn’t read comments");
    expect(markup).not.toContain("Comments are read-only");
  });

  test.each([
    ["duplicate", "Another canvas uses the ID a"],
    ["invalid", "This canvas ID isn&#x27;t valid"],
    ["missing", "This canvas has no ID"],
  ] as const)("main's %s cause replaces loading, Git name, filters and tools with one block", async (cause, title) => {
    const f = setup();
    api().commentsList = async (r: CommentRequest) => ({ ok: false, identity: r, error: "Canvas identity refused.", cause });
    const { session } = f.render({ selection: null });
    await vi.waitFor(() => expect(session.identityCause).toBe(cause));
    const { markup } = f.render({ selection: null });
    expect(markup).toContain(`<b>${title}</b>`);
    for (const text of ["Loading comments…", "Couldn’t read comments", "Comments are read-only", "Comment on canvas", "Hand off…", "Comment scope"]) expect(markup).not.toContain(text);
  });

  test("a row without a canvas id is the missing block", () => {
    const f = setup();
    const { id: _id, ...withoutId } = row;
    const { markup } = f.render({ open: { folder: "/repo", canvas: row.path, row: withoutId }, selection: null });
    expect(markup).toContain("<b>This canvas has no ID</b>");
    for (const text of ["Loading comments…", "Comments are read-only", "Comment on canvas"]) expect(markup).not.toContain(text);
  });

  test("target lines use the rendered frames' titles", async () => {
    const framed: Comment = { ...note, target: { frame: "shipping" } };
    const { render } = await ready([framed]);
    const shipping = { id: "shipping", title: "Shipping", x: 0, y: 0, width: 10, height: 10 };
    expect(render({ selection: null, layout: { ...layout("one"), frames: [shipping] } }).markup).toContain("Frame · Shipping");
    // Without a layout, the ls row's static frames name it.
    expect(render({ selection: null, layout: null, open: { folder: "/repo", canvas: row.path, row: { ...row, frames: [{ id: "shipping", title: "Ship" }] } } }).markup).toContain("Frame · Ship");
  });

  const b = { ...row, path: ".doan/canvases/b.html", id: "b", url: "http://localhost/b.html", frames: [{ id: "shipping", title: "Ship B" }, { id: "payment", title: "Pay B" }] };
  const onB = { selection: null, layout: null, open: { folder: "/repo", canvas: b.path, row: b } };

  // R-W 🟡1: session.open(B) runs in an effect, so the first render with B's
  // row still holds A's read results.
  test("the first render after switching canvases shows none of the previous canvas's cause, failure or comments", async () => {
    const f = setup();
    api().commentsList = async (r: CommentRequest) => r.canvas === "a" ? { ok: false, identity: r, error: "Canvas identity refused.", cause: "duplicate" } : { ok: true, identity: r, value: { project: 1, comments: [], warnings: [], canvasHash: "hash" } };
    const { session } = f.render({ selection: null });
    await vi.waitFor(() => expect(session.identityCause).toBe("duplicate"));
    const failed = f.render(onB).markup;
    for (const text of ["Another canvas uses the ID", "Couldn’t read comments", "Comments are read-only"]) expect(failed).not.toContain(text);
    expect(failed).toContain("Loading comments…");

    const framed: Comment = { ...note, target: { frame: "shipping" } };
    api().commentsList = async (r: CommentRequest) => ({ ok: true, identity: r, value: { project: 1, comments: r.canvas === "a" ? [framed] : [], warnings: [], canvasHash: "hash" } });
    f.render(); await vi.waitFor(() => expect(session.list?.comments).toEqual([framed]));
    const listed = f.render(onB).markup;
    expect(listed).not.toContain("Mark the field");
    expect(listed).not.toContain("Ship B");
    expect(listed).toContain("Loading comments…");
    await vi.waitFor(() => expect(session.identity?.canvas).toBe("b"));
    await vi.waitFor(() => expect(session.list).not.toBeNull());
    expect(f.render(onB).markup).toContain("No open comments");
  });

  test("a draft left from another canvas names its frame by id, not by the open canvas's titles", async () => {
    const { session, render } = await ready();
    await session.create("selection");
    expect(render({ selection: null }).markup).toContain("To: Element · button pay · in payment");
    render(onB);
    await vi.waitFor(() => expect(session.identity?.canvas).toBe("b"));
    const { markup } = render(onB);
    expect(markup).toContain("To: Element · button pay · in payment");
    expect(markup).not.toContain("Pay B");
  });

  test("while reads fail, the draft dialog cannot save", async () => {
    const { session, controller, render } = await ready();
    await session.create("canvas"); session.body("Ship it");
    render({ selection: null });
    const transition = controller.setTransitionGuard.mock.lastCall![0] as (destination: "selection" | "navigation") => boolean | Promise<boolean>;
    void transition("navigation");
    const save = /<button[^>]*>Save and continue<\/button>/;
    expect(renderToStaticMarkup(render({ selection: null }).dialog)).toMatch(save);
    expect(renderToStaticMarkup(render({ selection: null }).dialog)).not.toContain("disabled");
    api().commentsList = async (r: CommentRequest) => ({ ok: false, identity: r, error: "Permission denied." });
    await session.read();
    const dialog = renderToStaticMarkup(render({ selection: null }).dialog);
    expect(dialog).toContain("Keep this draft?");
    expect(dialog).toMatch(/<button[^>]*disabled=""[^>]*>Save and continue<\/button>/);
  });
});

describe("focus after the composer and pins (comments-readability task 5)", () => {
  const note: Comment = { comment: "c1", body: "Mark the field", status: "open", target: { element: { doanId: "address", selector: "label", html: "<label/>" } }, canvasHash: "hash", createdBy: { kind: "human", name: "A" }, createdAt: "t", updatedAt: "t" };
  type Focusable = { name: string; focus: Mock; isConnected: boolean; hasAttribute: (name: string) => boolean; contains: (node: unknown) => boolean; dataset?: { comment: string } };
  const focusable = (name: string, over: Partial<Focusable> = {}): Focusable => {
    const element: Focusable = { name, focus: vi.fn(), isConnected: true, hasAttribute: () => false, contains: node => node === element, ...over };
    return element;
  };
  // useRef slots in useComments: 0 = input, 1 = heading, 4 = the panel section.
  function dom(cards: string[]) {
    const body = focusable("body"), doc = { body, activeElement: body as unknown };
    vi.stubGlobal("document", doc);
    const field = { ...focusable("input"), setSelectionRange: vi.fn(), value: "", closest: () => null }, heading = focusable("title");
    const elements = cards.map(comment => focusable(`card ${comment}`, { dataset: { comment } }));
    harness.refs[0] = { current: field }; harness.refs[1] = { current: heading };
    harness.refs[4] = { current: { querySelectorAll: () => elements } };
    return { doc, body, field, heading, cards: elements };
  }
  async function ready(comments: Comment[], selection: CanvasState["selection"] = null) {
    const f = setup(comments);
    const { session } = f.render({ selection });
    await vi.waitFor(() => { expect(session.author.status).toBe("ready"); expect(session.list).not.toBeNull(); });
    const panel = () => f.render({ selection }).panel as unknown as { props: CommentsPanelProps };
    // Binds the read list to the controller, as the next React render would.
    panel();
    return { ...f, session, panel };
  }
  const focused = (...elements: Focusable[]) => elements.filter(element => element.focus.mock.calls.length > 0).map(element => element.name);

  test("Save moves focus to the saved card once the list is read again", async () => {
    const page = dom(["c1", "c2"]);
    const { session, render, mutate, panel } = await ready([note]);
    await session.create("canvas"); render({ selection: null }); session.body("New note");
    mutate.mockImplementationOnce(async (r: CommentRequest) => ({ ok: true, identity: r, value: { state: "saved", comment: "c2" } }));
    panel().props.editor!.onSave();
    await vi.waitFor(() => expect(session.savedComment).toBe("c2"));
    render({ selection: null });
    expect(focused(page.heading, ...page.cards)).toEqual(["card c2"]);
    expect(session.savedComment).toBeNull();
  });

  test("Save on a selection waits for the reread list's anchors, then focuses the card", async () => {
    const page = dom([]);
    const { session, render, mutate, panel, controller } = await ready([note], label);
    const hooks = () => controller.setComments.mock.lastCall![1] as CommentHooks;
    const answered = (nodes: [string, string][]): AnchorSnapshot => ({ lookup: { root: "/repo", canvas: "a", generation: 1, nodes: new Map(nodes) }, rects: new Map(), selected: "n1", status: "answered" });
    hooks().changed(answered([["c1", "n1"]])); settle(ANCHORS);
    await session.create("selection"); render({ selection: label }); session.body("On the label");
    mutate.mockImplementationOnce(async (r: CommentRequest) => ({ ok: true, identity: r, value: { state: "saved", comment: "c2" } }));
    panel().props.editor!.onSave();
    await vi.waitFor(() => expect(session.savedComment).toBe("c2"));
    render({ selection: label });
    // The composer is gone and the card is not listed yet: the title holds focus meanwhile.
    expect(focused(page.heading)).toEqual(["title"]);
    page.heading.focus.mockClear();
    page.cards.push(focusable("card c2", { dataset: { comment: "c2" } }));
    hooks().changed(answered([["c1", "n1"], ["c2", "n1"]])); settle(ANCHORS);
    render({ selection: label });
    expect(focused(page.heading, ...page.cards)).toEqual(["card c2"]);
    hooks().changed(answered([["c1", "n1"], ["c2", "n1"]])); settle(ANCHORS);
    render({ selection: label });
    expect(page.cards[0]!.focus).toHaveBeenCalledOnce();
  });

  test("Save of a card the list no longer shows moves focus to the Comments title", async () => {
    const page = dom(["c1"]);
    const { session, render, mutate, panel } = await ready([note]);
    await session.create("canvas"); render({ selection: null }); session.body("Filtered out");
    mutate.mockImplementationOnce(async (r: CommentRequest) => ({ ok: true, identity: r, value: { state: "saved", comment: "c9" } }));
    panel().props.editor!.onSave();
    await vi.waitFor(() => expect(session.savedComment).toBe("c9"));
    render({ selection: null });
    expect(focused(page.heading, ...page.cards)).toEqual(["title"]);
  });

  test("Save and continue from the draft dialog leaves focus to its destination, not the card", async () => {
    const page = dom(["c1", "c2"]);
    const { session, render, mutate } = await ready([note]);
    await session.create("canvas"); render({ selection: null }); session.body("Moving on");
    const row = focusable("row"); page.doc.activeElement = row;
    const leaving = session.guard();
    mutate.mockImplementationOnce(async (r: CommentRequest) => ({ ok: true, identity: r, value: { state: "saved", comment: "c2" } }));
    (render({ selection: null }).dialog as unknown as { props: { onSave: () => void } }).props.onSave();
    expect(await leaving).toBe(true);
    await vi.waitFor(() => expect(session.savedComment).toBe("c2"));
    render({ selection: null });
    expect(focused(page.heading, ...page.cards)).toEqual([]);
    expect(session.savedComment).toBeNull();
  });

  test.each(["create", "edit"] as const)("Cancel of a %s draft returns focus to the button that opened it", async mode => {
    const page = dom(["c1"]);
    const { session, panel } = await ready([note]);
    const opener = focusable("opener");
    page.doc.activeElement = opener;
    if (mode === "create") { panel().props.onCreate("canvas"); await vi.waitFor(() => expect(session.draft.draft).not.toBeNull()); }
    else panel().props.onComment("edit", "c1");
    // The Cancel button goes with the composer, so focus starts on <body>.
    page.doc.activeElement = page.body;
    panel().props.editor!.onCancel();
    expect(session.draft.draft).toBeNull();
    panel();
    expect(focused(opener, page.heading, ...page.cards)).toEqual(["opener"]);
  });

  test("Cancel falls back to the Comments title when the opening button is gone", async () => {
    const page = dom(["c1"]);
    const { panel } = await ready([note]);
    const opener = focusable("opener", { isConnected: false });
    page.doc.activeElement = opener;
    panel().props.onComment("edit", "c1");
    page.doc.activeElement = page.body;
    panel().props.editor!.onCancel();
    panel();
    expect(focused(opener, page.heading)).toEqual(["title"]);
  });

  test("a composer closed any other way never leaves focus on <body>, and keeps focus that moved elsewhere", async () => {
    const page = dom(["c1"]);
    const { session, panel } = await ready([note]);
    session.edit("c1"); panel();
    const leaving = session.guard(); session.answer("discard"); await leaving;
    panel();
    expect(focused(page.heading)).toEqual(["title"]);
    page.heading.focus.mockClear();
    session.edit("c1"); panel();
    const row = focusable("row"); page.doc.activeElement = row;
    const again = session.guard(); session.answer("discard"); await again;
    panel();
    expect(focused(page.heading, row)).toEqual([]);
  });

  describe("a deferred focus move belongs to the action that asked for it (R-L)", () => {
    const answered = (nodes: [string, string][], selected = "n1"): AnchorSnapshot => ({ lookup: { root: "/repo", canvas: "a", generation: 1, nodes: new Map(nodes) }, rects: new Map(), selected, status: "answered" });
    // Saves a Selection comment; its card is listed only once the reread list's anchors answer.
    async function savedWaiting() {
      const page = dom([]);
      const f = await ready([note], label);
      const hooks = () => f.controller.setComments.mock.lastCall![1] as CommentHooks;
      hooks().changed(answered([["c1", "n1"]])); settle(ANCHORS);
      await f.session.create("selection"); f.render({ selection: label }); f.session.body("First note");
      f.mutate.mockImplementationOnce(async (r: CommentRequest) => ({ ok: true, identity: r, value: { state: "saved", comment: "c2" } }));
      f.panel().props.editor!.onSave();
      await vi.waitFor(() => expect(f.session.savedComment).toBe("c2"));
      // The late answer lists the saved card.
      const arrive = (over: Partial<CanvasState> = { selection: label }) => {
        page.cards.push(focusable("card c2", { dataset: { comment: "c2" } }));
        hooks().changed(answered([["c1", "n1"], ["c2", "n1"]])); settle(ANCHORS);
        f.render(over);
      };
      return { ...f, page, arrive };
    }

    test.each([false, true])("a late answer leaves a newer composer's focus and Cancel target alone (IME composing: %s)", async composing => {
      const { page, session, render, panel, arrive } = await savedWaiting();
      render({ selection: label });
      const opener = focusable("opener"); page.doc.activeElement = opener;
      panel().props.onCreate("selection");
      await vi.waitFor(() => expect(session.draft.draft).not.toBeNull());
      render({ selection: label });
      page.doc.activeElement = page.field;
      session.body("Second note"); session.composing = composing;
      page.heading.focus.mockClear(); page.field.focus.mockClear();
      arrive();
      expect(focused(page.heading, ...page.cards)).toEqual([]);
      page.doc.activeElement = page.body;
      panel().props.editor!.onCancel(); panel();
      expect(focused(opener, page.heading, ...page.cards)).toEqual(["opener"]);
    });

    test("a late answer does not pull focus out of the Hand off dialog (agent-handoff)", async () => {
      const { page, session, render, panel, arrive } = await savedWaiting();
      render({ selection: label });
      panel().props.onHandOff(null);
      expect(session.handoff).not.toBeNull();
      page.heading.focus.mockClear();
      arrive();
      expect(focused(page.heading, ...page.cards)).toEqual([]);
    });

    test("a filter change ends the wait", async () => {
      const { page, render, panel, arrive } = await savedWaiting();
      render({ selection: label });
      panel().props.onFilter({ scope: "canvas", status: "open" }); settle(FILTER); render({ selection: label });
      page.heading.focus.mockClear();
      arrive();
      expect(focused(page.heading, ...page.cards)).toEqual([]);
    });

    test("another selection ends the wait", async () => {
      const { page, render, arrive } = await savedWaiting();
      render({ selection: label });
      render({ selection: pay });
      page.heading.focus.mockClear();
      arrive({ selection: pay });
      expect(focused(page.heading, ...page.cards)).toEqual([]);
    });

    test("another canvas ends the wait", async () => {
      const { page, render, arrive } = await savedWaiting();
      render({ selection: label });
      const other = { ...row, path: ".doan/canvases/b.html", id: "b", url: "http://localhost/b.html" };
      const open = { open: { folder: "/repo", canvas: other.path, row: other }, shown: other.path, selection: null };
      render(open);
      page.heading.focus.mockClear();
      arrive(open);
      expect(focused(page.heading, ...page.cards)).toEqual([]);
    });

    test("focus moved elsewhere ends the wait", async () => {
      const { page, render, arrive } = await savedWaiting();
      render({ selection: label });
      page.doc.activeElement = focusable("row");
      page.heading.focus.mockClear();
      arrive();
      expect(focused(page.heading, ...page.cards)).toEqual([]);
    });

    test("the title taking focus while the card waits is not focus moved elsewhere", async () => {
      const { page, render, arrive } = await savedWaiting();
      page.heading.focus.mockImplementation(() => { page.doc.activeElement = page.heading; });
      page.doc.activeElement = page.body;
      render({ selection: label });
      expect(page.doc.activeElement).toBe(page.heading);
      arrive();
      expect(focused(...page.cards)).toEqual(["card c2"]);
    });

    // The reread list's anchors may never answer; the title keeps focus (R-L ⚪1).
    test.each([[MEASURE_ANSWER_MS - 1, ["card c2"]], [MEASURE_ANSWER_MS, []]])("an answer %i ms after the save moves focus to: %j", async (elapsed, expected) => {
      const { page, render, arrive } = await savedWaiting();
      vi.useFakeTimers();
      try {
        render({ selection: label });
        expect(focused(page.heading)).toEqual(["title"]);
        page.heading.focus.mockClear();
        vi.advanceTimersByTime(elapsed);
        arrive();
        expect(focused(page.heading, ...page.cards)).toEqual(expected);
      } finally { vi.useRealTimers(); }
    });
  });

  // feature revision-recheck task 6 (design status-lines).
  describe("a card that leaves the list", () => {
    const open = (comment: string): Comment => ({ ...note, comment, target: {} });
    const listed = (comments: Comment[]) => { (window.doan as unknown as Record<string, unknown>).commentsList = async (r: CommentRequest) => ({ ok: true, identity: r, value: { project: 1, comments, warnings: [], canvasHash: "hash" } }); };
    // The person's pointer press, as the window's capture listeners see it.
    const press = (target: unknown, detail = 1) => {
      for (const [type, listener] of (window.addEventListener as Mock).mock.calls) if (type === "pointerdown") (listener as (event: { target: unknown; detail: number }) => void)({ target, detail: 0 });
      for (const [type, listener] of (window.addEventListener as Mock).mock.calls) if (type === "mousedown") (listener as (event: { target: unknown; detail: number }) => void)({ target, detail });
    };
    // Focus on the card's Resolve button, then the person resolves it: the
    // button disables (focus drops to <body>) and the reread list leaves it out.
    async function resolveFocused(ids: string[], leaving: string) {
      const page = dom(ids);
      const f = await ready(ids.map(open));
      const card = page.cards.find(card => card.dataset?.comment === leaving)!;
      const button = focusable(`resolve ${leaving}`);
      card.contains = node => node === card || node === button;
      page.doc.activeElement = button; f.panel();
      f.mutate.mockImplementationOnce(async (r: CommentRequest) => ({ ok: true, identity: r, value: { state: "saved" } }));
      listed(ids.filter(id => id !== leaving).map(open));
      // The press on the card's own button is not focus leaving the card; no
      // render comes between it and the click.
      const props = f.panel().props;
      press(button);
      props.onComment("resolve", leaving);
      page.doc.activeElement = page.body; f.panel();
      await vi.waitFor(() => expect(f.session.statusLine).not.toBeNull());
      page.cards.splice(page.cards.indexOf(card), 1);
      return { ...f, page, button };
    }
    test("focus moves to the next card's article, and the status line stands before it", async () => {
      const { page, panel, button } = await resolveFocused(["c1", "c2", "c3"], "c1");
      const props = panel().props;
      expect(focused(page.heading, button, ...page.cards)).toEqual(["card c2"]);
      expect(props.statusLine).toEqual({ comment: "c1", text: "Resolved — moved to Resolved.", before: "c2" });
    });
    test("a locate on another card while the change saves keeps the status line's place", async () => {
      const page = dom(["c1", "c2", "c3"]);
      const f = await ready(["c1", "c2", "c3"].map(open));
      let finish: (() => void) | undefined;
      f.mutate.mockImplementationOnce((r: CommentRequest) => new Promise(resolve => { finish = () => resolve({ ok: true, identity: r, value: { state: "saved" } }); }));
      f.panel().props.onComment("resolve", "c1");
      f.panel().props.onComment("locate", "c3");
      listed(["c2", "c3"].map(open)); finish?.();
      await vi.waitFor(() => expect(f.session.statusLine).not.toBeNull());
      page.cards.shift();
      expect(f.panel().props.statusLine?.before).toBe("c2");
    });
    test("focus moves to the previous card when the last one leaves", async () => {
      const { page, panel, button } = await resolveFocused(["c1", "c2", "c3"], "c3");
      expect(panel().props.statusLine?.before).toBeNull();
      expect(focused(page.heading, button, ...page.cards)).toEqual(["card c2"]);
    });
    test("focus moves to the Comments title when the only card leaves", async () => {
      const { page, panel, button } = await resolveFocused(["c1"], "c1");
      panel();
      expect(focused(page.heading, button)).toEqual(["title"]);
    });
    test("focus moves once, and stays where the person puts it next", async () => {
      const { page, panel } = await resolveFocused(["c1", "c2", "c3"], "c2");
      panel();
      expect(page.cards.map(card => card.focus.mock.calls.length)).toEqual([0, 1]);
      page.doc.activeElement = page.body; panel();
      expect(page.cards.map(card => card.focus.mock.calls.length)).toEqual([0, 1]);
    });
    test("an agent's resolve that removes the focused card follows the same rule", async () => {
      let invalidated: ((change: { root: string }) => void) | undefined;
      const page = dom(["c1", "c2"]);
      const f = setup([open("c1"), open("c2")]);
      (window.doan as unknown as Record<string, unknown>).onCommentsInvalidated = (callback: typeof invalidated) => { invalidated = callback; return () => {}; };
      const { session } = f.render({ selection: null });
      await vi.waitFor(() => expect(session.list).not.toBeNull());
      page.doc.activeElement = page.cards[0]; f.render({ selection: null });
      listed([open("c2")]);
      invalidated?.({ root: "/repo" });
      await vi.waitFor(() => expect(session.list?.comments.map(c => c.comment)).toEqual(["c2"]));
      // The focused article itself leaves the document.
      page.cards[0]!.isConnected = false; const gone = page.cards.shift()!;
      f.render({ selection: null });
      expect(focused(page.heading, gone, ...page.cards)).toEqual(["card c2"]);
      expect(session.statusLine).toBeNull();
    });
    test("focus the person moved elsewhere stays there", async () => {
      const page = dom(["c1", "c2"]);
      const f = await ready([open("c1"), open("c2")]);
      page.doc.activeElement = page.cards[0]; f.panel();
      const row = focusable("row"); page.doc.activeElement = row;
      listed([open("c2")]); await f.session.read(); page.cards.shift();
      f.panel();
      expect(focused(page.heading, row, ...page.cards)).toEqual([]);
    });
    test("a list the person changed by filter is not a card leaving", async () => {
      const page = dom(["c1", "c2"]);
      const f = await ready([open("c1"), open("c2")]);
      page.doc.activeElement = page.cards[0]; f.panel();
      f.panel().props.onFilter({ scope: "canvas", status: "resolved" }); settle(FILTER);
      page.doc.activeElement = page.body; page.cards.splice(0);
      f.panel();
      expect(focused(page.heading)).toEqual([]);
    });
    test("a card whose focus fell to <body> with no change of its own in flight is forgotten (R-C ⚪1)", async () => {
      const page = dom(["c1", "c2"]);
      const f = await ready([open("c1"), open("c2")]);
      page.doc.activeElement = page.cards[0]; f.panel();
      // The person clicks blank space; nothing of that card is saving.
      page.doc.activeElement = page.body; f.panel(); f.panel();
      listed([open("c2")]); await f.session.read(); page.cards.shift();
      f.panel();
      expect(focused(page.heading, ...page.cards)).toEqual([]);
    });
    test("a press outside the card forgets it though no render follows before an agent's resolve (R-E E-3)", async () => {
      const page = dom(["c1", "c2"]);
      const f = await ready([open("c1"), open("c2")]);
      page.doc.activeElement = page.cards[0]; f.panel();
      // The person clicks blank space, which changes no state, so nothing renders.
      press(page.body); page.doc.activeElement = page.body;
      listed([open("c2")]); await f.session.read(); page.cards.shift();
      f.panel();
      expect(focused(page.heading, ...page.cards)).toEqual([]);
    });
    test("a second card action within the 4 seconds leaves the first line in its own place (R-C ⚪2)", async () => {
      const page = dom(["c1", "c2", "c3"]);
      const f = await ready(["c1", "c2", "c3"].map(open));
      f.mutate.mockImplementationOnce(async (r: CommentRequest) => ({ ok: true, identity: r, value: { state: "saved" } }));
      listed(["c2", "c3"].map(open));
      f.panel().props.onComment("resolve", "c1");
      await vi.waitFor(() => expect(f.session.statusLine).not.toBeNull());
      page.cards.shift();
      f.mutate.mockImplementationOnce((async (r: CommentRequest) => ({ ok: false, identity: r, error: "Comment changed; read the latest state before saving." })) as unknown as typeof f.mutate);
      f.panel().props.onComment("resolve", "c3");
      await vi.waitFor(() => expect(f.session.mutations.get("c3")?.status).toBe("conflict"));
      expect(f.panel().props.statusLine).toEqual({ comment: "c1", text: "Resolved — moved to Resolved.", before: "c2" });
    });
  });

  describe("editing a resolved comment and replacing a missing target (revision-recheck task 9)", () => {
    const open = (comment: string): Comment => ({ ...note, comment, target: {} });
    const resolved = (comment: string): Comment => ({ ...note, comment, target: {}, status: "resolved", resolvedAt: "2026-10-23T00:00:00.000Z", resolvedBy: { kind: "agent", name: "codex" } });
    const listed = (comments: Comment[]) => { (window.doan as unknown as Record<string, unknown>).commentsList = async (r: CommentRequest) => ({ ok: true, identity: r, value: { project: 1, comments, warnings: [], canvasHash: "hash" } }); };
    const saved = (comment?: string) => async (r: CommentRequest) => ({ ok: true, identity: r, value: { state: "saved", ...(comment ? { comment } : {}) } });
    test("the entry point opens a resolved comment's editor; Save and reopen leaves a line whose Show lists Open and focuses the card", async () => {
      const page = dom(["c1", "c2"]);
      const f = await ready([resolved("c1"), resolved("c2")]);
      f.panel().props.onFilter({ scope: "canvas", status: "resolved" }); settle(FILTER);
      f.render({ selection: null }).editComment("c1");
      const editor = f.panel().props.editor!;
      expect(editor.mode).toBe("edit"); expect(editor.saveOnly).toBeTypeOf("function");
      editor.onBody("After");
      f.mutate.mockImplementationOnce(saved());
      listed([{ ...open("c1"), body: "After" }, resolved("c2")]);
      f.panel().props.editor!.onSave();
      await vi.waitFor(() => expect(f.session.statusLine?.show).toBe(true));
      expect(f.mutate.mock.calls[0]?.[0]).toMatchObject({ intent: { type: "edit-reopen", comment: "c1", body: "After" } });
      page.cards.shift();
      expect(f.panel().props.statusLine).toEqual({ comment: "c1", text: "Reopened — moved to Open.", show: true, before: "c2" });
      f.panel().props.onShowStatus!("c1"); settle(FILTER);
      expect(harness.states[FILTER]).toEqual({ scope: "canvas", status: "open" });
      const card = focusable("card c1", { dataset: { comment: "c1" } });
      page.cards.splice(0, page.cards.length, card);
      f.panel();
      expect(card.focus).toHaveBeenCalledOnce();
      // The request ends with the render that answered it.
      card.focus.mockClear(); f.panel();
      expect(card.focus).not.toHaveBeenCalled();
    });
    test("Save only on a resolved comment sends the edit intent", async () => {
      dom(["c1"]);
      const f = await ready([resolved("c1")]);
      f.render({ selection: null }).editComment("c1");
      f.mutate.mockImplementationOnce(saved());
      f.panel().props.editor!.onBody("After");
      f.panel().props.editor!.saveOnly!();
      await vi.waitFor(() => expect(f.mutate).toHaveBeenCalledOnce());
      expect(f.mutate.mock.calls[0]?.[0]).toMatchObject({ intent: { type: "edit", comment: "c1", body: "After" } });
    });
    test("Comment on selection instead drafts the same body on the selection, then asks about the original with the new target", async () => {
      dom(["c1"]);
      const f = await ready([open("c1")], pay);
      f.panel().props.onComment("comment-instead", "c1");
      await vi.waitFor(() => expect(f.session.draft.draft?.body).toBe(note.body));
      expect(f.begin.mock.calls[0]?.[0]).toMatchObject({ scope: "selection" });
      f.mutate.mockImplementationOnce(saved("c2"));
      f.panel().props.editor!.onSave();
      await vi.waitFor(() => expect(f.session.deleteConfirmation).not.toBeNull());
      const dialog = renderToStaticMarkup(<>{f.render({ selection: pay }).dialog}</>);
      expect(dialog).toContain("Delete the original comment?");
      expect(dialog).toMatch(/Your text was saved as a new comment on Element · button pay[^<]*\./);
    });
  });

  describe("pins", () => {
    const snapshot = (nodes: [string, string][], selected: string | null): AnchorSnapshot =>
      ({ lookup: { root: "/repo", canvas: "a", generation: 1, nodes: new Map(nodes) }, rects: new Map(), selected, status: "answered" });
    const destination = { node: "n1", comments: ["c1"], originalTarget: note.target };
    async function pinned(cards: string[]) {
      const page = dom(cards);
      const f = await ready([note], label);
      const hooks = () => f.controller.setComments.mock.lastCall![1] as CommentHooks;
      const show = (next: AnchorSnapshot) => { hooks().changed(next); settle(ANCHORS); f.panel(); };
      show(snapshot([["c1", "n1"]], null));
      return { ...f, page, hooks, show };
    }

    test("after a pin opens its comments, focus waits for the filtered list and lands on the first card", async () => {
      const { page, hooks, show, panel } = await pinned(["c1"]);
      hooks().open(destination); settle(FILTER); panel();
      expect(harness.states[FILTER]).toMatchObject({ scope: "selection" });
      // The open list still belongs to the previous answer.
      expect(focused(page.heading, ...page.cards)).toEqual([]);
      show(snapshot([["c1", "n1"]], "n1"));
      expect(focused(page.heading, ...page.cards)).toEqual(["card c1"]);
      // Settled once: later answers do not move focus again.
      show(snapshot([["c1", "n1"]], "n1"));
      expect(page.cards[0]!.focus).toHaveBeenCalledOnce();
    });

    test("without a card to show, focus lands on the Comments title", async () => {
      const { page, hooks, show, panel } = await pinned([]);
      hooks().open(destination); settle(FILTER); panel();
      show(snapshot([], "n1"));
      expect(focused(page.heading)).toEqual(["title"]);
    });

    test("with a draft open, the draft dialog keeps focus until it is answered", async () => {
      const { page, hooks, show, panel, session, render } = await pinned(["c1"]);
      session.edit("c1"); panel();
      page.field.focus.mockClear();
      const allowed = hooks().guard(destination);
      expect(allowed).toBeInstanceOf(Promise);
      const { dialog } = render({ selection: label });
      expect(renderToStaticMarkup(<>{dialog}</>)).toContain("Keep writing");
      expect(focused(page.field, page.heading, ...page.cards)).toEqual([]);
      session.answer("discard");
      expect(await allowed).toBe(true);
      hooks().open(destination); settle(FILTER); panel();
      show(snapshot([["c1", "n1"]], "n1"));
      expect(focused(page.field, ...page.cards)).toEqual(["card c1"]);
    });

    test("a late answer leaves a newer composer's focus alone", async () => {
      const { page, hooks, show, panel, session, render } = await pinned([]);
      hooks().open(destination); settle(FILTER); panel();
      await session.create("selection"); render({ selection: label });
      page.doc.activeElement = page.field; session.body("Writing");
      page.heading.focus.mockClear(); page.field.focus.mockClear();
      page.cards.push(focusable("card c1", { dataset: { comment: "c1" } }));
      show(snapshot([["c1", "n1"]], "n1"));
      expect(focused(page.heading, ...page.cards)).toEqual([]);
    });

    // Focus has not moved yet: the comment being begun or the dialog owns it.
    test.each(["a new comment being begun", "a card editor", "the delete dialog"])("%s ends the wait", async owner => {
      const { page, hooks, show, panel, session } = await pinned(["c1"]);
      hooks().open(destination); settle(FILTER); panel();
      if (owner === "the delete dialog") panel().props.onComment("delete", "c1");
      else if (owner === "a card editor") panel().props.onComment("edit", "c1");
      else { panel().props.onCreate("selection"); expect(session.beginning).toBe(true); }
      show(snapshot([["c1", "n1"]], "n1"));
      expect(focused(page.heading, ...page.cards)).toEqual([]);
    });

    test("focus moved elsewhere ends the wait", async () => {
      const { page, hooks, show, panel } = await pinned(["c1"]);
      hooks().open(destination); settle(FILTER); panel();
      page.doc.activeElement = focusable("row");
      show(snapshot([["c1", "n1"]], "n1"));
      expect(focused(page.heading, ...page.cards)).toEqual([]);
    });
  });
});

// feature revision-recheck task 5: locate selects through the selection path,
// so the picked scope and status stay; only the selection that answers it
// (`located`, set by the controller) is exempt from the scope fit (L-13).
describe("locate from a card's target line", () => {
  const open: Comment = { comment: "c1", body: "On the label", status: "open", target: { frame: "shipping", element: label.element }, canvasHash: "hash", createdBy: { kind: "human", name: "A" }, createdAt: "t", updatedAt: "t" };
  const done: Comment = { ...open, comment: "c2", body: "On pay", status: "resolved", target: { frame: "payment", element: pay.element } };
  const frameOnly: Comment = { ...open, comment: "c3", body: "On the frame", status: "resolved", target: { frame: "payment" } };
  const paymentFrame = { tag: "section", frame: { id: "payment" }, frameIndex: 1, path: [] };
  async function located(selection: CanvasState["selection"] = null) {
    const f = setup([open, done, frameOnly]);
    const locate = vi.fn();
    const activatePin = vi.fn(), selectPath = vi.fn();
    Object.assign(f.controller, { locate, activatePin, selectPath });
    const { session } = f.render({ selection });
    settle(FILTER);
    await vi.waitFor(() => expect(session.list).not.toBeNull());
    f.render({ selection });
    (f.controller.setComments.mock.lastCall![1] as CommentHooks).changed({ lookup: { root: "/repo", canvas: "a", generation: 4, nodes: new Map([["c1", "n1"], ["c2", "n2"], ["c3", "n3"]]) }, rects: new Map(), selected: null, status: "answered" });
    settle(ANCHORS);
    const panel = (at: CanvasState["selection"]) => f.render({ selection: at }).panel as unknown as { props: CommentsPanelProps };
    return { ...f, locate, activatePin, selectPath, panel };
  }

  test("a resolved card keeps the Resolved status and the Canvas scope after its target is selected", async () => {
    const f = await located();
    f.panel(null).props.onFilter({ scope: "canvas", status: "resolved" }); settle(FILTER);
    f.panel(null).props.onComment("locate", "c2");
    expect(f.locate).toHaveBeenCalledExactlyOnceWith("n2", 4, done);
    const selected = { ...pay, frame: { id: "payment" } };
    f.render({ selection: selected, located: true }); settle(FILTER);
    expect(harness.states[FILTER]).toEqual({ scope: "canvas", status: "resolved" });
    expect(f.panel(selected).props.read).toMatchObject({ status: "ready", comments: [done, frameOnly] });
    // Only that selection was asked for: the next one fits the scope again,
    // also when the person picks the located target again by hand.
    f.render({ selection: label }); settle(FILTER);
    expect(harness.states[FILTER]).toMatchObject({ scope: "selection", status: "resolved" });
    f.panel(label).props.onFilter({ scope: "canvas", status: "resolved" }); settle(FILTER);
    f.render({ selection: selected }); settle(FILTER);
    expect(harness.states[FILTER]).toMatchObject({ scope: "selection", status: "resolved" });
  });

  test("an open card goes through locate, never the pin path that switches to Open", async () => {
    const f = await located();
    f.panel(null).props.onFilter({ scope: "canvas", status: "open" }); settle(FILTER);
    f.panel(null).props.onComment("locate", "c1");
    expect(f.activatePin).not.toHaveBeenCalled();
    expect(f.selectPath).not.toHaveBeenCalled();
    expect(f.locate).toHaveBeenCalledExactlyOnceWith("n1", 4, open);
    f.render({ selection: label, located: true }); settle(FILTER);
    expect(harness.states[FILTER]).toEqual({ scope: "canvas", status: "open" });
  });

  test("a frame target is exempt by its frame identity", async () => {
    const f = await located();
    f.panel(null).props.onFilter({ scope: "canvas", status: "resolved" }); settle(FILTER);
    f.panel(null).props.onComment("locate", "c3");
    f.render({ selection: paymentFrame, located: true }); settle(FILTER);
    expect(harness.states[FILTER]).toEqual({ scope: "canvas", status: "resolved" });
  });

  // R-L L-1: the canvas may name the target differently from the stored one
  // (its doanId gone, or a parent's new doanId shortening the selector).
  test.each([
    ["loses its doanId", { selector: "button", html: "<button/>" }],
    ["gets a shorter selector", { selector: '[data-doan-id="wrapper"] > button', html: "<button/>" }],
  ])("the answer keeps the scope when the target %s", async (_case, element) => {
    const f = await located();
    f.panel(null).props.onFilter({ scope: "canvas", status: "resolved" }); settle(FILTER);
    f.panel(null).props.onComment("locate", "c2");
    f.render({ selection: { ...pay, element }, located: true }); settle(FILTER);
    expect(harness.states[FILTER]).toEqual({ scope: "canvas", status: "resolved" });
  });

  // R-L L-2: select-anchor answers null once the target is gone.
  test("a failed locate leaves a later selection of that target to the scope fit", async () => {
    const f = await located();
    f.panel(null).props.onFilter({ scope: "canvas", status: "resolved" }); settle(FILTER);
    f.panel(null).props.onComment("locate", "c2");
    f.render({ selection: null }); settle(FILTER);
    f.render({ selection: pay }); settle(FILTER);
    expect(harness.states[FILTER]).toMatchObject({ scope: "selection", status: "resolved" });
  });

  test("a selection that does not answer the locate fits the scope", async () => {
    const f = await located();
    f.panel(null).props.onFilter({ scope: "canvas", status: "resolved" }); settle(FILTER);
    f.panel(null).props.onComment("locate", "c2");
    f.render({ selection: label }); settle(FILTER);
    expect(harness.states[FILTER]).toMatchObject({ scope: "selection", status: "resolved" });
  });

  test("the exempt selection still drops a retained answer measured for the previous one (R-B8)", async () => {
    const f = await located();
    f.panel(null).props.onFilter({ scope: "canvas", status: "resolved" }); settle(FILTER);
    f.panel(null).props.onComment("locate", "c2");
    (f.controller.setComments.mock.lastCall![1] as CommentHooks).changed({ lookup: { root: "/repo", canvas: "a", generation: 4, nodes: new Map() }, rects: new Map(), selected: null, status: "pending" });
    settle(ANCHORS);
    expect(harness.states[ANCHORS]).toMatchObject({ status: "answered" });
    f.render({ selection: pay, located: true }); settle(FILTER); settle(ANCHORS);
    expect(harness.states[FILTER]).toEqual({ scope: "canvas", status: "resolved" });
    expect(harness.states[ANCHORS]).toMatchObject({ status: "pending" });
  });

  test("no node in the current answer means no locate", async () => {
    const f = await located();
    (f.controller.setComments.mock.lastCall![1] as CommentHooks).changed({ lookup: { root: "/repo", canvas: "a", generation: 5, nodes: new Map() }, rects: new Map(), selected: null, status: "answered" });
    settle(ANCHORS);
    f.panel(null).props.onComment("locate", "c2");
    expect(f.locate).not.toHaveBeenCalled();
  });
});

describe("the Resolved list order (revision-recheck task 6)", () => {
  test("lists the newest resolve first, ties by comment id, whatever the created order", async () => {
    const base: Comment = { comment: "c1", body: "Note", status: "resolved", target: {}, canvasHash: "hash", createdBy: { kind: "human", name: "A" }, createdAt: "2026-10-25T09:00:00.000Z", updatedAt: "t", resolvedBy: { kind: "agent", name: "codex" } };
    const f = setup([
      { ...base, comment: "c1", resolvedAt: "2026-10-25T10:00:00.000Z" },
      { ...base, comment: "c3", resolvedAt: "2026-10-25T12:00:00.000Z" },
      { ...base, comment: "c2", resolvedAt: "2026-10-25T10:00:00.000Z" },
      { ...base, comment: "c4", status: "open" },
    ]);
    const { session } = f.render({ selection: null });
    await vi.waitFor(() => expect(session.list).not.toBeNull());
    const props = () => (f.render({ selection: null }).panel as unknown as { props: CommentsPanelProps }).props;
    props().onFilter({ scope: "canvas", status: "resolved" }); settle(FILTER);
    const read = props().read;
    expect(read.status === "ready" && read.comments.map(c => c.comment)).toEqual(["c3", "c1", "c2"]);
  });
});

// feature revision-recheck task 8 (design review-notice, review-bar, review-done).
describe("Review on the open canvas", () => {
  const codex = { kind: "agent" as const, name: "codex" };
  const resolved = (comment: string, at: string): Comment => ({ comment, body: `Body ${comment}`, status: "resolved", target: { frame: "payment" }, canvasHash: "hash", createdBy: { kind: "human", name: "Kim Doe" }, createdAt: "2026-10-24T00:00:00.000Z", updatedAt: at, resolvedBy: codex, resolvedAt: at });
  const one = resolved("c1", "2026-10-25T01:00:00.000Z"), two = resolved("c2", "2026-10-25T02:00:00.000Z");
  const since = "2026-10-25T00:00:00.000Z";
  type Element = { name: string; focus: Mock; isConnected: boolean; hasAttribute: () => boolean; contains: (node: unknown) => boolean; tagName?: string };
  const element = (name: string, over: Partial<Element> = {}): Element => { const e: Element = { name, focus: vi.fn(), isConnected: true, hasAttribute: () => false, contains: node => node === e, ...over }; return e; };
  async function reviewing(comments: Comment[] = [one, two], marker: { since: string; lastReviewedAt?: string } = { since }) {
    const body = element("body"), doc = { body, activeElement: body as unknown, querySelector: () => null };
    vi.stubGlobal("document", doc);
    const heading = element("title"), next = element("next"), start = element("review"), close = element("close");
    harness.refs[1] = { current: heading };
    // `.review-start` answers only while enabled, as `:not(:disabled)` would.
    const selectors: Record<string, Element | null> = { ".review-next": next, ".review-start": start, ".review-start:not(:disabled)": start, ".review-done-close": close };
    harness.refs[4] = { current: { querySelectorAll: () => [], querySelector: (selector: string) => selectors[selector] ?? null } };
    const f = setup(comments);
    let visible: ((value: boolean) => void) | undefined;
    const raise = vi.fn(async (_root: string, _canvas: string, at: string) => ({ since, lastReviewedAt: at }));
    const readMarker = vi.fn(async () => marker);
    Object.assign(window.doan, { reviewMarker: readMarker, raiseReviewMarker: raise, onWindowVisible: (callback: typeof visible) => { visible = callback; return () => {}; } });
    const jumpToNode = vi.fn((_node: string, _generation: number) => true), locate = vi.fn(), setEscapeHandler = vi.fn();
    Object.assign(f.controller, { jumpToNode, locate, setEscapeHandler });
    const reviewed = vi.fn();
    const render = (over: Partial<CanvasState> = {}) => {
      harness.index = 0; harness.refIndex = 0; harness.effects = [];
      const result = useComments({ ...initialCanvasState(), open: { folder: "/repo", canvas: row.path, row }, shown: row.path, status: null, hasFrame: true, layout: layout("one"), selection: null, ...over }, { current: f.controller as unknown as CanvasController }, vi.fn(), [], reviewed);
      for (const effect of harness.effects) effect();
      return result;
    };
    const { session } = render();
    settle(FILTER);
    await vi.waitFor(() => { expect(session.author.status).toBe("ready"); expect(session.list).not.toBeNull(); expect(session.marker).not.toBeNull(); });
    render();
    (f.controller.setComments.mock.lastCall![1] as CommentHooks).changed({ lookup: { root: "/repo", canvas: "a", generation: 4, nodes: new Map(comments.map((c, i) => [c.comment, `n${i + 1}`])) }, rects: new Map(), selected: null, status: "answered" });
    settle(ANCHORS);
    const props = (over: Partial<CanvasState> = {}) => (render(over).panel as unknown as { props: CommentsPanelProps }).props;
    const escape = () => (setEscapeHandler.mock.lastCall![0] as () => boolean)();
    return { ...f, session, render, props, doc, heading, next, start, close, selectors, raise, readMarker, jumpToNode, locate, reviewed, escape, visible: (value: boolean) => visible?.(value) };
  }

  test("the notice counts resolves since the last review; a first-seen canvas and a seen one read differently", async () => {
    const first = await reviewing();
    expect(first.props().reviewNotice).toMatchObject({ count: 2, firstSeen: true, blocked: false });
    vi.unstubAllGlobals(); harness.effects = []; harness.deps = []; harness.states = []; harness.updates = []; harness.index = 0; harness.refs = []; harness.refIndex = 0;
    const seen = await reviewing([one, two], { since, lastReviewedAt: one.resolvedAt! });
    expect(seen.props().reviewNotice).toMatchObject({ count: 1, firstSeen: false });
  });

  test("a draft disables Review", async () => {
    const f = await reviewing();
    await f.session.create("canvas");
    expect(f.props().reviewNotice).toMatchObject({ blocked: true });
    f.props().reviewNotice!.onStart();
    expect(f.session.review).toBeNull();
  });

  test("Review collapses the filter rows, moves the canvas to the step without selecting, and puts focus on Next", async () => {
    const f = await reviewing();
    f.props().reviewNotice!.onStart();
    expect(f.jumpToNode).toHaveBeenLastCalledWith("n1", 4);
    expect(f.locate).not.toHaveBeenCalled();
    const props = f.props();
    expect(props.reviewNotice).toBeNull();
    expect(props.reviewBar).toMatchObject({ step: 1, total: 2, target: "Frame · payment", body: "Body c1", mark: "resolved", notFound: false, resolution: { at: one.resolvedAt } });
    expect(props.reviewBar?.resolution?.text).toMatch(/^Resolved by codex · /);
    expect(f.next.focus).toHaveBeenCalledOnce();
    expect(harness.states[FILTER]).toEqual({ scope: "canvas", status: "open" });
    props.reviewBar!.onNext();
    expect(f.jumpToNode).toHaveBeenLastCalledWith("n2", 4);
    expect(f.raise).toHaveBeenLastCalledWith("/repo", "a", one.resolvedAt);
    expect(f.props().reviewBar).toMatchObject({ step: 2 });
    expect(f.next.focus).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(f.reviewed).toHaveBeenCalledWith("/repo"));
  });

  test("a target the canvas cannot find does not move and says so", async () => {
    const f = await reviewing();
    f.jumpToNode.mockReturnValueOnce(false);
    f.props().reviewNotice!.onStart();
    expect(f.props().reviewBar?.notFound).toBe(true);
    f.props().reviewBar!.onNext();
    expect(f.props().reviewBar?.notFound).toBe(false);
  });

  test("Esc closes Review and returns focus to the notice's Review button, else the title; without Review it declines", async () => {
    const f = await reviewing([one, two]);
    expect(f.escape()).toBe(false);
    f.props().reviewNotice!.onStart();
    expect(f.escape()).toBe(true);
    expect(f.session.review).toBeNull();
    f.props();
    expect(f.start.focus).toHaveBeenCalledOnce();
    f.props().reviewNotice!.onStart(); f.props().reviewBar!.onNext(); f.props().reviewBar!.onDone();
    expect(f.props().reviewDone).toMatchObject({ text: "Reviewed 2" });
    expect(f.props().reviewDone?.onHandOff).toBeUndefined();
    expect(f.close.focus).toHaveBeenCalledOnce();
    f.props().reviewDone!.onClose();
    f.props();
    expect(f.heading.focus).toHaveBeenCalledOnce();
  });

  // Code review 🟡3: a disabled Review button cannot take focus; the title does.
  test("closing Review while an editor holds Review disabled sends focus to the title", async () => {
    const f = await reviewing();
    f.props().reviewNotice!.onStart();
    f.props().reviewBar!.onEditReopen();
    expect(f.props().reviewBar?.writesDisabled).toBe(true);
    f.selectors[".review-start:not(:disabled)"] = null;
    f.props().reviewBar!.onClose();
    f.props();
    expect(f.props().reviewNotice).toMatchObject({ blocked: true });
    expect(f.start.focus).not.toHaveBeenCalled();
    expect(f.heading.focus).toHaveBeenCalledOnce();
  });

  test("Reopen moves focus to Next only when the change starts", async () => {
    const f = await reviewing();
    f.props().reviewNotice!.onStart();
    f.props();
    f.next.focus.mockClear();
    f.props().reviewBar!.onEditReopen();
    // An editor is open, so the step's Reopen does nothing.
    f.props().reviewBar!.onReopen();
    f.props(); f.props();
    expect(f.next.focus).not.toHaveBeenCalled();
  });

  // Review R-G G-1: dialog → editor → Review → selection.
  test("Esc in the Edit and reopen… editor closes only the editor; the next Esc closes Review", async () => {
    const f = await reviewing();
    f.props().reviewNotice!.onStart();
    f.props().reviewBar!.onEditReopen();
    const composer = (CommentEditor(f.props().editor!).props.children as { props: { onKeyDown: (event: unknown) => void } }[])[0]!;
    const key = { key: "Escape", nativeEvent: { isComposing: false, keyCode: 27 }, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    composer.props.onKeyDown(key);
    expect(key.stopPropagation).toHaveBeenCalledOnce();
    expect(f.session.draft.draft).toBeNull();
    expect(f.props().editor).toBeNull();
    expect(f.session.review).not.toBeNull();
    expect(f.escape()).toBe(true);
    expect(f.session.review).toBeNull();
  });

  test("Edit and reopen… opens the resolved comment's Save and reopen editor", async () => {
    const f = await reviewing();
    f.props().reviewNotice!.onStart();
    f.props().reviewBar!.onEditReopen();
    const editor = f.props().editor!;
    expect(editor.mode).toBe("edit");
    expect(editor.saveOnly).toBeTypeOf("function");
    expect(f.props().reviewBar?.writesDisabled).toBe(true);
  });

  test("Next and Previous from the menu move only during Review and not from a text field; reviewing tells the menu", async () => {
    const f = await reviewing();
    expect(f.render().reviewing).toBe(false);
    f.render().reviewStep("next");
    expect(f.session.review).toBeNull();
    f.props().reviewNotice!.onStart();
    expect(f.render().reviewing).toBe(true);
    f.doc.activeElement = element("field", { tagName: "TEXTAREA" });
    f.render().reviewStep("next");
    expect(f.session.review?.state.cursor).toBe(0);
    f.doc.activeElement = f.doc.body;
    f.render().reviewStep("next");
    expect(f.session.review?.state.cursor).toBe(1);
    f.render().reviewStep("previous");
    expect(f.session.review?.state.cursor).toBe(0);
    f.render().closeReview();
    expect(f.render().reviewing).toBe(false);
  });

  test("a shown window reads the review marker and the comments again", async () => {
    const f = await reviewing();
    f.readMarker.mockClear();
    f.visible(false);
    expect(f.readMarker).not.toHaveBeenCalled();
    f.visible(true);
    expect(f.readMarker).toHaveBeenCalledOnce();
  });

  test("Show on the Save and reopen line lists Open and locates that comment", async () => {
    const f = await reviewing([one, two]);
    f.props().onShowStatus!("c1");
    settle(FILTER);
    expect(harness.states[FILTER]).toEqual({ scope: "canvas", status: "open" });
    expect(f.locate).toHaveBeenCalledExactlyOnceWith("n1", 4, one);
  });

  // revision-recheck follow-up: a comment on the whole canvas has no anchor
  // node, and the canvas it targets is the one on screen.
  test("a Review step on the whole canvas is found and moves nothing", async () => {
    const whole: Comment = { ...one, comment: "c3", target: {} };
    const f = await reviewing([whole, two]);
    // The canvas answers no node for a target with neither frame nor element.
    (f.controller.setComments.mock.lastCall![1] as CommentHooks).changed({ lookup: { root: "/repo", canvas: "a", generation: 4, nodes: new Map([["c2", "n2"]]) }, rects: new Map(), selected: null, status: "answered" });
    settle(ANCHORS);
    f.props().reviewNotice!.onStart();
    expect(f.props().reviewBar).toMatchObject({ target: "Canvas", notFound: false });
    expect(f.jumpToNode).not.toHaveBeenCalled();
    f.props().reviewBar!.onNext();
    expect(f.jumpToNode).toHaveBeenLastCalledWith("n2", 4);
    f.props().reviewBar!.onPrevious();
    expect(f.props().reviewBar).toMatchObject({ step: 1, notFound: false });
    expect(f.jumpToNode).toHaveBeenCalledOnce();
  });
});

// project-feedback design §5, draft `id-change-notice`.
describe("the id change notice", () => {
  test("shows while the old id's file has comments, and directs the user to doan check", () => {
    const f = setup();
    const entries: FolderEntry[] = [{ path: "/repo", kind: "list", servedRev: 0, canvases: [row], orphans: [{ id: "checkout-v1", file: ".doan/comments/checkout-v1.jsonl", comments: { open: 2, resolved: 1 }, uncertain: false }] }];
    const props = (idChangedFrom: string | null, list = entries) => {
      harness.index = 0; harness.refIndex = 0; harness.effects = [];
      const result = useComments({ ...initialCanvasState(), open: { folder: "/repo", canvas: row.path, row }, shown: row.path, status: null, hasFrame: true, layout: layout("one"), idChangedFrom }, { current: f.controller as unknown as CanvasController }, vi.fn(), list, undefined, null);
      return (result.panel as unknown as { props: CommentsPanelProps }).props;
    };
    const notice = props("checkout-v1").idNotice;
    expect(notice?.text).toBe("3 comments still use the old ID checkout-v1 and no longer show here. Run doan check in a terminal.");
    expect(props(null).idNotice).toBeNull();
    expect(props("other").idNotice).toBeNull();
  });
});


describe("the Hand off dialog (agent-handoff task 4)", () => {
  const open = (comment: string, at: string, target: Comment["target"] = {}): Comment => ({ comment, body: `Body ${comment}`, status: "open", target, canvasHash: "hash", createdBy: { kind: "human", name: "Kim Doe" }, createdAt: at, updatedAt: at });
  const c1 = open("c1", "2026-10-25T01:00:00.000Z"), c2 = open("c2", "2026-10-25T02:00:00.000Z", { frame: "payment", element: pay.element });
  const r1: Comment = { ...open("r1", "2026-10-24T00:00:00.000Z"), status: "resolved", resolvedBy: { kind: "agent", name: "codex" }, resolvedAt: "2026-10-25T03:00:00.000Z" };
  type Element = { name: string; focus: Mock; isConnected: boolean; hasAttribute: (name: string) => boolean; contains: (node: unknown) => boolean };
  const element = (name: string, over: Partial<Element> = {}): Element => { const e: Element = { name, focus: vi.fn(), isConnected: true, hasAttribute: () => false, contains: node => node === e, ...over }; return e; };
  const entry = (worktrees: string[]): FolderEntry => ({ kind: "list", path: "/repo", canvases: [], servedRev: 0, git: { common: "/repo/.git", main: "/code/acme-web", branch: "feat-checkout", worktrees } });
  async function handing(comments: Comment[] = [c1, c2, r1], options: { entries?: FolderEntry[]; home?: string | null; author?: string } = {}) {
    // A fresh hook per call: one test may mount two.
    harness.states = []; harness.deps = []; harness.refs = []; harness.updates = [];
    const body = element("body"), doc = { body, activeElement: body as unknown };
    vi.stubGlobal("document", doc);
    const heading = element("title");
    harness.refs[1] = { current: heading };
    const f = setup(comments);
    const copy = vi.fn(async (r: CommentRequest) => ({ ok: true, identity: r, value: { copied: true } }));
    Object.assign(window.doan, { commentsCopy: copy });
    if (options.author !== undefined) Object.assign(window.doan, { commentsAuthor: async (r: CommentRequest) => ({ ok: true, identity: r, value: { kind: "human", name: options.author } }) });
    const base = { ...initialCanvasState(), open: { folder: "/repo", canvas: row.path, row }, shown: row.path, status: null, hasFrame: true, layout: layout("one"), selection: null };
    const render = (over: Partial<CanvasState> = {}) => {
      harness.index = 0; harness.refIndex = 0; harness.effects = [];
      const result = useComments({ ...base, ...over }, { current: f.controller as unknown as CanvasController }, vi.fn(), options.entries ?? [], undefined, options.home ?? null);
      for (const effect of harness.effects) effect();
      return result;
    };
    const { session } = render();
    await vi.waitFor(() => { expect(session.author.status).not.toBe("loading"); expect(session.list).not.toBeNull(); });
    render();
    const props = (over: Partial<CanvasState> = {}) => (render(over).panel as unknown as { props: CommentsPanelProps }).props;
    const dialog = (over: Partial<CanvasState> = {}) => render(over).dialog as ReactElement<HandOffDialogProps> | false | null | undefined;
    const handoff = (over: Partial<CanvasState> = {}) => {
      const shown = dialog(over);
      if (!shown || shown.type !== HandOffDialog) throw new Error("No Hand off dialog");
      return shown.props;
    };
    return { ...f, session, render, props, dialog, handoff, doc, heading, copy };
  }
  afterEach(() => { vi.useRealTimers(); });

  test("the head's Hand off… checks every open comment; a card's only its own", async () => {
    const f = await handing();
    f.props().onHandOff(null);
    expect(f.handoff().dialog.rows.map(row => row.comment.comment)).toEqual(["c1", "c2"]);
    expect(f.handoff().dialog.checked).toEqual(["c1", "c2"]);
    f.handoff().onClose(); expect(f.session.handoff).toBeNull();
    f.props().onHandOff("c2");
    expect(f.handoff().dialog.checked).toEqual(["c2"]);
  });

  test("names project › ⎇ branch › canvas, and the worktree to work in when the repository has another", async () => {
    const one = await handing(undefined, { entries: [entry(["/repo"])], home: "/Users/me" });
    one.props().onHandOff(null);
    expect(one.handoff().context).toBe("acme-web › ⎇ feat-checkout › a");
    expect(one.handoff().notice).toBeNull();
    const two = await handing(undefined, { entries: [entry(["/repo", "/repo-b"])], home: "/Users/me" });
    two.props().onHandOff(null);
    expect(two.handoff().notice).toBe("Comments are per worktree. Your agent should work in feat-checkout (/repo).");
  });

  test("Selection quick select uses the selection the dialog opened with", async () => {
    const f = await handing();
    f.render({ selection: pay });
    (f.controller.setComments.mock.lastCall![1] as CommentHooks).changed({ lookup: { root: "/repo", canvas: "a", generation: 2, nodes: new Map([["c2", "n-pay"]]) }, rects: new Map(), selected: "n-pay", status: "answered" });
    settle(ANCHORS);
    f.props({ selection: pay }).onHandOff(null);
    f.handoff({ selection: pay }).onQuick("none"); f.handoff({ selection: pay }).onQuick("selection");
    expect(f.session.handoff?.checked).toEqual(["c2"]);
    expect(f.session.handoff?.selection?.label).toBe("Element · button pay · in payment");
  });

  test("closing returns focus to the button that opened it, or the Comments title once that button is gone", async () => {
    const f = await handing();
    const opener = element("Hand off…");
    f.doc.activeElement = opener;
    f.props().onHandOff(null);
    f.doc.activeElement = f.doc.body;
    f.handoff().onClose();
    expect(opener.focus).toHaveBeenCalledOnce(); expect(f.heading.focus).not.toHaveBeenCalled();
    const card = element("card Hand off…");
    f.doc.activeElement = card;
    f.props().onHandOff("c1");
    card.isConnected = false;
    f.handoff().onClose();
    expect(card.focus).not.toHaveBeenCalled(); expect(f.heading.focus).toHaveBeenCalledOnce();
  });

  test("the Review Done summary's Hand off… opens with the reopened comments checked", async () => {
    const f = await handing();
    f.session.reviewDone = { text: "Reviewed 2 · Reopened 1", reopened: ["c2"], seen: new Map() };
    f.props().reviewDone!.onHandOff!();
    expect(f.handoff().dialog.checked).toEqual(["c2"]);
  });

  test("another (root, canvas id) closes it, already in the render before the session follows; a move keeps it", async () => {
    const f = await handing();
    f.props().onHandOff(null);
    const moved = { ...row, path: ".doan/canvases/moved/a.html" };
    expect(f.dialog({ open: { folder: "/repo", canvas: moved.path, row: moved }, shown: moved.path }) && true).toBe(true);
    expect(f.session.handoff).not.toBeNull();
    const other = { ...row, path: ".doan/canvases/b.html", id: "b" };
    expect(f.dialog({ open: { folder: "/repo", canvas: other.path, row: other }, shown: other.path })).toBeFalsy();
    await vi.waitFor(() => expect(f.session.identity?.canvas).toBe("b"));
    expect(f.session.handoff).toBeNull();
  });

  test("Delete and Unsaved replace it (Uncertain > Delete > Unsaved > Hand off)", async () => {
    const f = await handing();
    f.props().onHandOff(null);
    await f.session.mutate("delete", "c1");
    expect((f.dialog() as ReactElement).type).toBe(DeleteCommentDialog); expect(f.session.handoff).toBeNull();
    f.session.cancelDelete();
    await f.session.create("canvas"); f.session.body("Draft");
    f.props().onHandOff(null); expect(f.handoff().dialog.checked).toEqual(["c1", "c2"]);
    void f.session.guard();
    expect((f.dialog() as ReactElement).type).toBe(UnsavedCommentDialog); expect(f.session.handoff).toBeNull();
  });

  test("opens with a draft editor open, an invalid width and no Git name", async () => {
    const f = await handing(undefined, { author: "" });
    expect(f.session.author.status).toBe("missing");
    await f.session.read();
    const { width: _width, ...unreadable } = row;
    const props = f.props({ open: { folder: "/repo", canvas: row.path, row: unreadable } });
    expect(props.widthInvalid).toBe(true);
    props.onHandOff(null);
    expect(f.handoff({ open: { folder: "/repo", canvas: row.path, row: unreadable } }).dialog.checked).toEqual(["c1", "c2"]);
    f.handoff().onClose();
    const g = await handing();
    await g.session.create("canvas"); g.session.body("Draft");
    g.props().onHandOff("c1");
    expect(g.handoff().dialog.checked).toEqual(["c1"]); expect(g.props().editor).not.toBeNull();
  });

  test("Handed off appears beside Hand off… after a copy, with the copy's time, and stays across canvases", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const at = new Date("2026-10-26T05:02:10.000Z"); vi.setSystemTime(at);
    const f = await handing();
    expect(f.props().handedOff).toBeNull();
    f.props().onHandOff(null);
    f.handoff().onCopy();
    await vi.waitFor(() => expect(f.session.handoff?.copy.status).toBe("copied"));
    expect(f.copy).toHaveBeenCalledWith(expect.objectContaining({ scope: { comments: ["c1", "c2"] } }));
    expect(f.props().handedOff).toBe(handoffSummary(2, at));
    f.handoff().onClose();
    const other = { ...row, path: ".doan/canvases/b.html", id: "b" };
    expect(f.props({ open: { folder: "/repo", canvas: other.path, row: other }, shown: other.path }).handedOff).toBeNull();
    await vi.waitFor(() => expect(f.session.identity?.canvas).toBe("b"));
    f.render();
    await vi.waitFor(() => expect(f.session.identity?.canvas).toBe("a"));
    expect(f.props().handedOff).toBe(handoffSummary(2, at));
  });
});
