import { describe, expect, test, vi } from "vitest";
import type { InspectRow } from "../main/inspect";
import type { InspectRefused, InspectReply, InspectRequest } from "../main/inspector";
import type { SelectionView } from "./selection";
import { InspectorReads, inspectTarget, type InspectorSelection } from "./inspectorReads";

// PRODUCT §5 item 4 'Inspector'; reply rules are inspectorRows.ts. Check a reply only after the store's own
// callback ran to its end (POSTMORTEM 2026-10-25 'Runtime checks could finish before the evidence').

const CANVAS = { root: "/repo", path: ".doan/canvases/pay.html" };
const element = (selector: string, extra: Partial<SelectionView> = {}): SelectionView => ({ tag: "button", frame: { id: "pay", title: "Payment" }, element: { selector, html: "<button>" }, path: [{ label: "pay", selector: "section" }, { label: "button", selector }], ...extra });
const frame = (id: string): SelectionView => ({ tag: "section", frame: { id, title: "Payment" }, path: [{ label: id, selector: `[data-doan-frame="${id}"]` }] });
const at = (view: SelectionView, canvas = CANVAS): InspectorSelection => ({ canvas, view });
const rows = (value: string): InspectRow[] => [{ group: "box", label: "Height", value, state: "hardcoded" }];

interface Call { request: InspectRequest; resolve(reply: InspectReply | InspectRefused): void; reject(): void; settled: boolean }
function fakeInspect() {
  const calls: Call[] = [];
  const inspect = vi.fn((request: InspectRequest) => {
    let resolve!: (reply: InspectReply | InspectRefused) => void, reject!: () => void;
    const real = new Promise<InspectReply | InspectRefused>((ok, fail) => { resolve = ok; reject = () => fail(new Error("ipc")); });
    const call: Call = { request, resolve, reject, settled: false };
    calls.push(call);
    // A thenable around the real promise marks the call settled after the store's own callback.
    return { then: (ok: (reply: InspectReply | InspectRefused) => unknown, fail: (error: unknown) => unknown) => real.then(reply => { ok(reply); call.settled = true; }, error => { fail(error); call.settled = true; }) } as unknown as Promise<InspectReply | InspectRefused>;
  });
  return { calls, inspect };
}
const answer = (call: Call, result: { rows: InspectRow[] } | { reason: "not-shown" | "not-found" | "unavailable" }): void =>
  call.resolve({ ...call.request, ...("rows" in result ? { ok: true as const, rows: result.rows } : { ok: false as const, reason: result.reason }) });
const settled = (call: Call) => vi.waitFor(() => { expect(call.settled).toBe(true); });

describe("which selection is asked and when", () => {
  test("nothing is read while hidden, without a selection or yielding to a narrow window", () => {
    const { calls, inspect } = fakeInspect();
    const reads = new InspectorReads(inspect);
    reads.update(false, at(element("#pay")), "doc-1");
    reads.update(true, null, "doc-1");
    reads.update(false, at(element("#pay")), "doc-1");
    expect(calls).toHaveLength(0);
    expect(reads.get().panel).toEqual({ kind: "empty" });
  });

  test("an element is read by its selector, a frame by its own path step", () => {
    expect(inspectTarget(at(element("#pay > button")))).toEqual({ canvas: CANVAS, selector: "#pay > button" });
    expect(inspectTarget(at(frame("pay")))).toEqual({ canvas: CANVAS, selector: '[data-doan-frame="pay"]' });
    expect(inspectTarget(at({ tag: "section", path: [] }))).toBeNull();
  });

  test("an applied selection is asked once; the same commit again asks nothing", async () => {
    const { calls, inspect } = fakeInspect();
    const reads = new InspectorReads(inspect);
    const pay = at(element("#pay"));
    reads.update(true, pay, "doc-1");
    reads.update(true, pay, "doc-1");
    expect(calls.map(call => call.request)).toEqual([{ selector: "#pay", canvas: CANVAS, seq: 1 }]);
    expect(reads.get().panel).toEqual({ kind: "reading", rows: null });
    answer(calls[0]!, { rows: rows("52px") });
    await settled(calls[0]!);
    expect(reads.get().panel).toEqual({ kind: "rows", rows: rows("52px") });
  });

  test("showing the inspector asks for the selection already applied", () => {
    const { calls, inspect } = fakeInspect();
    const reads = new InspectorReads(inspect);
    const pay = at(element("#pay"));
    reads.update(false, pay, "doc-1");
    reads.update(true, pay, "doc-1");
    expect(calls).toHaveLength(1);
  });
});

describe("late replies", () => {
  test("a reply for an older selection does not replace the newer selection's rows", async () => {
    const { calls, inspect } = fakeInspect();
    const reads = new InspectorReads(inspect);
    reads.update(true, at(element("#a")), "doc-1");
    reads.update(true, at(element("#b")), "doc-1");
    const [first, second] = calls;
    answer(second!, { rows: rows("B") });
    await settled(second!);
    answer(first!, { rows: rows("A") });
    await settled(first!);
    expect(reads.get().panel).toEqual({ kind: "rows", rows: rows("B") });
  });

  test("a reply that arrives while the newer read is still out leaves that read in place", async () => {
    const { calls, inspect } = fakeInspect();
    const reads = new InspectorReads(inspect);
    reads.update(true, at(element("#a")), "doc-1");
    reads.update(true, at(element("#b")), "doc-1");
    answer(calls[0]!, { reason: "unavailable" });
    await settled(calls[0]!);
    expect(reads.get().panel).toEqual({ kind: "reading", rows: null });
  });

  test("a reply for the same selector in another canvas is dropped after a switch", async () => {
    const { calls, inspect } = fakeInspect();
    const reads = new InspectorReads(inspect);
    reads.update(true, at(element("#pay")), "doc-1");
    reads.update(true, at(element("#pay"), { root: "/repo", path: ".doan/canvases/other.html" }), "doc-2");
    answer(calls[0]!, { rows: rows("old") });
    await settled(calls[0]!);
    expect(reads.get().panel.kind).toBe("reading");
    answer(calls[1]!, { rows: rows("new") });
    await settled(calls[1]!);
    expect(reads.get().panel).toEqual({ kind: "rows", rows: rows("new") });
  });

  test("hiding while a read is out drops its reply; showing again asks anew", async () => {
    const { calls, inspect } = fakeInspect();
    const reads = new InspectorReads(inspect);
    const pay = at(element("#pay"));
    reads.update(true, pay, "doc-1");
    reads.update(false, pay, "doc-1");
    answer(calls[0]!, { rows: rows("52px") });
    await settled(calls[0]!);
    expect(reads.get().panel).toEqual({ kind: "empty" });
    reads.update(true, pay, "doc-1");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.request.seq).toBeGreaterThan(calls[0]!.request.seq);
    expect(reads.get().panel).toEqual({ kind: "reading", rows: null });
  });

  test("a selection cleared while its read is out empties the panel and drops the reply", async () => {
    const { calls, inspect } = fakeInspect();
    const reads = new InspectorReads(inspect);
    reads.update(true, at(element("#pay")), "doc-1");
    reads.update(true, null, "doc-1");
    answer(calls[0]!, { rows: rows("52px") });
    await settled(calls[0]!);
    expect(reads.get().panel).toEqual({ kind: "empty" });
  });
});

describe("the same selection read again", () => {
  test("a reload keeps the rows while the canvas looks for the selection, and reads again in place once found", async () => {
    const { calls, inspect } = fakeInspect();
    const reads = new InspectorReads(inspect);
    const before = element("#pay");
    reads.update(true, at(before), "doc-1");
    answer(calls[0]!, { rows: rows("52px") });
    await settled(calls[0]!);
    // The new document is laid out; the controller still holds the old selection while it looks for it.
    reads.update(true, at(before), "doc-2");
    expect(calls).toHaveLength(1);
    expect(reads.get().panel).toEqual({ kind: "rows", rows: rows("52px") });
    reads.update(true, at(element("#pay")), "doc-2");
    expect(calls).toHaveLength(2);
    expect(reads.get().panel).toEqual({ kind: "reading", rows: rows("52px") });
    answer(calls[1]!, { rows: rows("56px") });
    await settled(calls[1]!);
    expect(reads.get().panel).toEqual({ kind: "rows", rows: rows("56px") });
  });

  // A same-id move changes the open path at once while the old selection stays until the canvas finds it again.
  test("a canvas moved to a new path keeps the rows until the selection is found there, then reads in place", async () => {
    const { calls, inspect } = fakeInspect();
    const reads = new InspectorReads(inspect);
    const before = element("#pay");
    const moved = { root: "/repo", path: ".doan/canvases/renamed.html" };
    reads.update(true, at(before), "doc-1");
    answer(calls[0]!, { rows: rows("52px") });
    await settled(calls[0]!);
    reads.update(true, at(before, moved), "doc-1");
    reads.update(true, at(before, moved), "doc-2");
    expect(calls).toHaveLength(1);
    expect(reads.get().panel).toEqual({ kind: "rows", rows: rows("52px") });
    reads.update(true, at(element("#pay"), moved), "doc-2");
    expect(calls.map(call => call.request)).toEqual([{ selector: "#pay", canvas: CANVAS, seq: 1 }, { selector: "#pay", canvas: moved, seq: 2 }]);
    expect(reads.get().panel).toEqual({ kind: "reading", rows: rows("52px") });
    answer(calls[1]!, { rows: rows("56px") });
    await settled(calls[1]!);
    expect(reads.get().panel).toEqual({ kind: "rows", rows: rows("56px") });
  });

  test("a new selection drops the previous rows while it reads", async () => {
    const { calls, inspect } = fakeInspect();
    const reads = new InspectorReads(inspect);
    reads.update(true, at(element("#a")), "doc-1");
    answer(calls[0]!, { rows: rows("A") });
    await settled(calls[0]!);
    reads.update(true, at(element("#b")), "doc-1");
    expect(reads.get().panel).toEqual({ kind: "reading", rows: null });
  });
});

describe("failures", () => {
  test("a node the collector cannot find reads as a selection that left: the empty state, no Retry", async () => {
    const { calls, inspect } = fakeInspect();
    const reads = new InspectorReads(inspect);
    reads.update(true, at(element("#gone")), "doc-1");
    answer(calls[0]!, { reason: "not-found" });
    await settled(calls[0]!);
    expect(reads.get().panel).toEqual({ kind: "empty" });
  });

  test("an unavailable debugger fails with Retry; Retry keeps the line, busy, until its reply", async () => {
    const { calls, inspect } = fakeInspect();
    const reads = new InspectorReads(inspect);
    reads.update(true, at(element("#pay")), "doc-1");
    answer(calls[0]!, { reason: "unavailable" });
    await settled(calls[0]!);
    expect(reads.get()).toMatchObject({ panel: { kind: "failed" }, retrying: false });
    reads.retry();
    reads.retry();
    expect(calls).toHaveLength(2);
    expect(reads.get()).toMatchObject({ panel: { kind: "failed" }, retrying: true });
    answer(calls[1]!, { rows: rows("52px") });
    await settled(calls[1]!);
    expect(reads.get()).toMatchObject({ panel: { kind: "rows", rows: rows("52px") }, retrying: false });
  });

  test("a failed call or a bare refusal from main fails with Retry", async () => {
    const { calls, inspect } = fakeInspect();
    const reads = new InspectorReads(inspect);
    reads.update(true, at(element("#a")), "doc-1");
    calls[0]!.reject();
    await settled(calls[0]!);
    expect(reads.get().panel).toEqual({ kind: "failed" });
    reads.update(true, at(element("#b")), "doc-1");
    calls[1]!.resolve({ ok: false, reason: "unavailable" });
    await settled(calls[1]!);
    expect(reads.get().panel).toEqual({ kind: "failed" });
  });

  // Main answers not-shown until that canvas shows again, so the reply never asks back by itself.
  test("not-shown asks once more on the next shown-document change, and a second one fails", async () => {
    const { calls, inspect } = fakeInspect();
    const reads = new InspectorReads(inspect);
    const pay = at(element("#pay"));
    reads.update(true, pay, "doc-1");
    answer(calls[0]!, { reason: "not-shown" });
    await settled(calls[0]!);
    expect(calls).toHaveLength(1);
    expect(reads.get().panel).toEqual({ kind: "reading", rows: null });
    reads.update(true, pay, "doc-1");
    expect(calls).toHaveLength(1);
    reads.update(true, pay, "doc-2");
    expect(calls).toHaveLength(2);
    answer(calls[1]!, { reason: "not-shown" });
    await settled(calls[1]!);
    expect(reads.get().panel).toEqual({ kind: "failed" });
    reads.update(true, pay, "doc-3");
    expect(calls).toHaveLength(2);
  });
});
