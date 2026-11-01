import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { CanvasRow } from "../main/view";
import { canvasConversationRows, canvasRowProblemText } from "./canvasConversationRows";

const NOW = Date.parse("2026-11-01T12:00:00.000Z");
const MIN = 60_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", state: "current", owner: "doan", provider: "claude", fromHome: true,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: ago(MIN), preview: "Done", ...patch,
});
const row = (patch: Partial<CanvasRow> & { path: string }): CanvasRow => ({ url: `doan://${patch.path}`, ...patch });

const billing = row({ path: ".doan/canvases/billing.html", id: "billing", title: "Billing" });
const plain = row({ path: ".doan/canvases/plain.html" });
const quiet = row({ path: ".doan/canvases/quiet.html", id: "quiet" });

describe("canvasConversationRows", () => {
  test("only canvases with a current conversation, the current conversation's latest activity first", () => {
    const rows = canvasConversationRows([
      summary({ conversationId: "p", lastActivityAt: ago(0) }),
      summary({ conversationId: "b", canvas: { path: billing.path, id: "billing" }, lastActivityAt: ago(5 * MIN) }),
      summary({ conversationId: "old", canvas: { path: billing.path, id: "billing" }, state: "archived", lastActivityAt: ago(0) }),
      summary({ conversationId: "n", canvas: { path: plain.path }, lastActivityAt: ago(MIN) }),
    ], [billing, plain, quiet], NOW);
    expect(rows.map(r => [r.conversationId, r.name])).toEqual([["n", "plain"], ["b", "Billing"]]);
  });

  test("a row carries the canvas row, provider, status, short time and preview", () => {
    const [only] = canvasConversationRows([summary({ conversationId: "b", provider: "codex", phase: "running", canvas: { path: billing.path, id: "billing" }, lastActivityAt: ago(3 * MIN), preview: "Editing the header" })], [billing], NOW);
    expect(only).toEqual({
      key: "b", conversationId: "b", name: "Billing", canvas: { path: billing.path, id: "billing" }, row: billing,
      provider: "codex", status: { kind: "working", label: "Working" }, time: { text: "3m", label: "3 minutes ago" },
      preview: "Editing the header", problem: null, openable: true,
    });
  });

  test("equal activity times order by canvas path", () => {
    const at = ago(MIN);
    const rows = canvasConversationRows([
      summary({ conversationId: "q", canvas: { path: quiet.path, id: "quiet" }, lastActivityAt: at }),
      summary({ conversationId: "b", canvas: { path: billing.path, id: "billing" }, lastActivityAt: at }),
    ], [quiet, billing], NOW);
    expect(rows.map(r => r.conversationId)).toEqual(["b", "q"]);
  });

  test("a canvas renamed or moved under the same id keeps its row at the new path", () => {
    const moved = row({ path: ".doan/canvases/pay/billing-v2.html", id: "billing", title: "Billing v2" });
    const [only] = canvasConversationRows([summary({ canvas: { path: billing.path, id: "billing" } })], [moved], NOW);
    expect(only).toMatchObject({ name: "Billing v2", row: moved, openable: true, problem: null });
  });

  test("an id on either side matches by id only; without ids the path matches", () => {
    const rows = canvasConversationRows([
      summary({ conversationId: "noid", canvas: { path: billing.path } }),
      summary({ conversationId: "path", canvas: { path: plain.path } }),
    ], [billing, plain], NOW);
    expect(rows.find(r => r.conversationId === "path")).toMatchObject({ row: plain, openable: true });
    expect(rows.find(r => r.conversationId === "noid")).toBeUndefined();
  });

  test("a deleted canvas shows only while its conversation has work left, and cannot be opened", () => {
    const gone = { path: ".doan/canvases/gone.html", id: "gone" };
    const states: Partial<ConversationSummary>[] = [{ phase: "running" }, { phase: "waiting" }, { unseen: true }, {}];
    const rows = canvasConversationRows(states.map((s, i) => summary({ conversationId: `g${i}`, canvas: gone, lastActivityAt: ago(i * MIN), ...s })), [], NOW);
    expect(rows.map(r => r.conversationId)).toEqual(["g0", "g1", "g2"]);
    expect(rows[0]).toMatchObject({ name: "gone", row: null, openable: false, problem: { kind: "gone" } });
  });

  test("a deleted canvas whose ending the person already saw is gone", () => {
    const rows = canvasConversationRows([summary({ conversationId: "g", canvas: { path: ".doan/canvases/gone.html" }, unseen: true })], [], NOW, new Set(["g"]));
    expect(rows).toEqual([]);
  });

  test("a duplicated id cannot be opened and says how many canvases share it", () => {
    const twin = row({ path: ".doan/canvases/copy.html", id: "billing", title: "Billing copy" });
    const [only] = canvasConversationRows([summary({ canvas: { path: billing.path, id: "billing" } })], [billing, twin], NOW);
    expect(only).toMatchObject({ name: "Billing", row: null, openable: false, problem: { kind: "duplicate", count: 2 } });
  });

  test("an unreadable canvas can still be opened, so its page shows its own error", () => {
    const broken = row({ path: ".doan/canvases/broken.html", id: "broken", error: { code: "parse", message: "bad html" } });
    const [only] = canvasConversationRows([summary({ canvas: { path: broken.path, id: "broken" } })], [broken], NOW);
    expect(only).toMatchObject({ row: broken, openable: true, problem: { kind: "unreadable" } });
  });

  // review DS r1: ls lists an unreadable file without its id, so a conversation bound to {path, id} matches it by path.
  test("an unreadable canvas listed without its id still matches its conversation by path, and opens", () => {
    const broken = row({ path: ".doan/canvases/legacy-cart.html", error: { code: "unreadable_canvas", message: "permission denied" } });
    const [only, ...rest] = canvasConversationRows([summary({ canvas: { path: broken.path, id: "legacy-cart" } })], [broken, billing], NOW);
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ name: "legacy-cart", row: broken, openable: true, problem: { kind: "unreadable", sentence: "Can't read this canvas — run doan check" } });
  });

  test("an id match wins over an unreadable file left at the old path, and a readable row (another id or none) does not match by path", () => {
    const moved = row({ path: ".doan/canvases/cart/legacy-cart.html", id: "legacy-cart" });
    const leftover = row({ path: ".doan/canvases/legacy-cart.html", error: { code: "unreadable_canvas", message: "permission denied" } });
    const [kept] = canvasConversationRows([summary({ canvas: { path: leftover.path, id: "legacy-cart" } })], [leftover, moved], NOW);
    expect(kept).toMatchObject({ row: moved, problem: null, openable: true });
    const otherId = row({ path: ".doan/canvases/legacy-cart.html", id: "other" });
    expect(canvasConversationRows([summary({ canvas: { path: otherId.path, id: "legacy-cart" } })], [otherId], NOW)).toEqual([]);
    // Only an unreadable row falls back to the path: a readable row without an id is another canvas.
    const idless = row({ path: ".doan/canvases/legacy-cart.html" });
    expect(canvasConversationRows([summary({ canvas: { path: idless.path, id: "legacy-cart" } })], [idless], NOW)).toEqual([]);
  });

  test("status follows the sidebar slot rule; a seen ending has none", () => {
    const rows = canvasConversationRows([
      summary({ conversationId: "w", phase: "waiting", canvas: { path: billing.path, id: "billing" }, lastActivityAt: ago(0) }),
      summary({ conversationId: "u", unseen: true, canvas: { path: plain.path }, lastActivityAt: ago(MIN) }),
      summary({ conversationId: "s", unseen: true, canvas: { path: quiet.path, id: "quiet" }, lastActivityAt: ago(2 * MIN) }),
    ], [billing, plain, quiet], NOW, new Set(["s"]));
    expect(rows.map(r => r.status)).toEqual([{ kind: "permission", label: "Needs your answer" }, { kind: "unseen", label: "Finished, not seen" }, null]);
  });

  test("an unreadable conversation keeps its canvas row and says so in the preview", () => {
    const [only] = canvasConversationRows([summary({ readError: true, lastActivityAt: "", preview: "", canvas: { path: billing.path, id: "billing" } })], [billing], NOW);
    expect(only).toMatchObject({ preview: "Can’t read this conversation", time: null, openable: true });
  });
});

describe("canvasConversationRows beyond Home", () => {
  test("a canvas conversation not started from Home shows its status: waiting, running, unseen ending; a seen ending has none", () => {
    const rows = canvasConversationRows([
      summary({ conversationId: "w", fromHome: false, phase: "waiting", canvas: { path: billing.path, id: "billing" }, lastActivityAt: ago(0) }),
      summary({ conversationId: "r", fromHome: false, phase: "running", canvas: { path: plain.path }, lastActivityAt: ago(MIN) }),
      summary({ conversationId: "u", fromHome: false, unseen: true, canvas: { path: quiet.path, id: "quiet" }, lastActivityAt: ago(2 * MIN) }),
      summary({ conversationId: "s", fromHome: false, unseen: true, canvas: { path: ".doan/canvases/seen.html", id: "seen" }, lastActivityAt: ago(3 * MIN) }),
    ], [billing, plain, quiet, row({ path: ".doan/canvases/seen.html", id: "seen" })], NOW, new Set(["s"]));
    expect(rows.map(r => r.status)).toEqual([
      { kind: "permission", label: "Needs your answer" }, { kind: "working", label: "Working" }, { kind: "unseen", label: "Finished, not seen" }, null,
    ]);
  });

  test("a deleted canvas of a conversation not started from Home shows while work is left and hides after", () => {
    const gone = { path: ".doan/canvases/gone.html", id: "gone" };
    expect(canvasConversationRows([summary({ conversationId: "g", fromHome: false, phase: "running", canvas: gone })], [], NOW).map(r => r.problem)).toEqual([{ kind: "gone" }]);
    expect(canvasConversationRows([summary({ conversationId: "g", fromHome: false, canvas: gone })], [], NOW)).toEqual([]);
  });
});

describe("canvasRowProblemText", () => {
  test("the shipped sentences", () => {
    expect(canvasRowProblemText({ kind: "gone" }, "doan")).toBe("No longer in doan");
    expect(canvasRowProblemText({ kind: "duplicate", count: 2 }, "doan")).toBe("2 canvases use this ID — run doan check");
    expect(canvasRowProblemText({ kind: "duplicate", count: 3 }, "doan")).toBe("3 canvases use this ID — run doan check");
    const broken = row({ path: ".doan/canvases/broken.html", id: "broken", error: { code: "parse", message: "bad html" } });
    const [unreadable] = canvasConversationRows([summary({ canvas: { path: broken.path, id: "broken" } })], [broken], NOW);
    expect(canvasRowProblemText(unreadable!.problem!, "doan")).toBe("Can't read this canvas — run doan check");
  });
});
