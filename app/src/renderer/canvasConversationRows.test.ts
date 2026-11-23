import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { CanvasRow } from "../main/view";
import { canvasConversationRows, canvasRowProblemText, conversationCanvasMatch } from "./canvasConversationRows";

const NOW = Date.parse("2026-11-01T12:00:00.000Z");
const MIN = 60_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", owner: "doan", provider: "claude", fromHome: true,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: ago(MIN), preview: "Done", ...patch,
});
const row = (patch: Partial<CanvasRow> & { path: string }): CanvasRow => ({ url: `doan://${patch.path}`, ...patch });

const billing = row({ path: ".doan/canvases/billing.html", id: "billing" });
const plain = row({ path: ".doan/canvases/plain.html" });
const quiet = row({ path: ".doan/canvases/quiet.html", id: "quiet" });

describe("canvasConversationRows", () => {
  test("one row per conversation, project and canvas in one list, several on one canvas included, the latest activity first", () => {
    const rows = canvasConversationRows([
      summary({ conversationId: "p", lastActivityAt: ago(0) }),
      summary({ conversationId: "b", canvas: { path: billing.path, id: "billing" }, lastActivityAt: ago(5 * MIN) }),
      summary({ conversationId: "b2", canvas: { path: billing.path, id: "billing" }, lastActivityAt: ago(0) }),
      summary({ conversationId: "n", canvas: { path: plain.path }, lastActivityAt: ago(MIN) }),
    ], [billing, plain, quiet], NOW);
    expect(rows.map(r => [r.conversationId, r.kind, r.kind === "canvas" ? r.name : null])).toEqual([["p", "project", null], ["b2", "canvas", "billing"], ["n", "canvas", "plain"], ["b", "canvas", "billing"]]);
  });

  test("no conversations: no rows", () => {
    expect(canvasConversationRows([], [billing], NOW)).toEqual([]);
  });

  // The Conversation menu's scope (projectConversationMenu): every conversation bound to no canvas.
  test("a project conversation is a row of its own kind with no canvas, thumbnail or problem", () => {
    const [only] = canvasConversationRows([summary({ conversationId: "p", title: "Pricing page copy", provider: "codex", lastActivityAt: ago(2 * MIN), preview: "Here are three options" })], [billing], NOW);
    expect(only).toEqual({
      kind: "project", key: "p", conversationId: "p", provider: "codex", status: null, time: { text: "2m", label: "2 minutes ago" },
      preview: "Here are three options", title: "Pricing page copy", heading: "Pricing page copy", deletable: { available: true },
    });
  });

  test("project conversations only: every row is a project row, ordered as the Conversation menu orders them", () => {
    const rows = canvasConversationRows([
      summary({ conversationId: "p2", lastActivityAt: ago(MIN) }),
      summary({ conversationId: "p3", lastActivityAt: ago(0) }),
      summary({ conversationId: "p1", lastActivityAt: ago(MIN) }),
    ], [], NOW);
    expect(rows.map(r => [r.key, r.kind])).toEqual([["p3", "project"], ["p1", "project"], ["p2", "project"]]);
  });

  test("an unreadable project conversation is listed with its title, else Conversation, the unreadable preview and no time", () => {
    const rows = canvasConversationRows([
      summary({ conversationId: "u", title: "", readError: true, lastActivityAt: "", preview: "" }),
      summary({ conversationId: "t", title: "Old notes", readError: true, lastActivityAt: "", preview: "" }),
    ], [], NOW);
    expect(rows.map(r => [r.key, r.kind, r.heading, r.preview, r.time, r.status])).toEqual([
      ["t", "project", "Old notes", "Can’t read this conversation", null, null],
      ["u", "project", "Conversation", "Can’t read this conversation", null, null],
    ]);
  });

  // POSTMORTEM 2026-11-17: the row's status and its Delete read the same working signal.
  test("a project row's status and Delete follow the title menu: waiting, working, promotion judgment or queue, usage limit, unseen ending", () => {
    const rows = canvasConversationRows([
      summary({ conversationId: "w", phase: "waiting", lastActivityAt: ago(0) }),
      summary({ conversationId: "r", phase: "running", working: true, lastActivityAt: ago(MIN) }),
      summary({ conversationId: "j", phase: "ended", working: true, lastActivityAt: ago(2 * MIN) }),
      summary({ conversationId: "s", queued: 1, scheduledAt: new Date(NOW + 30 * MIN).toISOString(), lastActivityAt: ago(3 * MIN) }),
      summary({ conversationId: "u", unseen: true, lastActivityAt: ago(4 * MIN) }),
      summary({ conversationId: "e", lastActivityAt: ago(5 * MIN) }),
    ], [], NOW);
    expect(rows.map(r => [r.key, r.status?.kind ?? null, r.deletable.available])).toEqual([
      ["w", "permission", false], ["r", "working", false], ["j", "working", false], ["s", "scheduled", true], ["u", "unseen", true], ["e", null, true],
    ]);
    expect(rows.find(r => r.key === "j")!.deletable).toEqual({ available: false, reason: "The agent is working on this conversation." });
  });

  test("equal times: project conversations by id, before canvas conversations, which go by canvas path; rows without a time come last", () => {
    const at = ago(MIN);
    const rows = canvasConversationRows([
      summary({ conversationId: "q", canvas: { path: quiet.path, id: "quiet" }, lastActivityAt: at }),
      summary({ conversationId: "pb", lastActivityAt: at }),
      summary({ conversationId: "b", canvas: { path: billing.path, id: "billing" }, lastActivityAt: at }),
      summary({ conversationId: "pa", lastActivityAt: at }),
      summary({ conversationId: "x", readError: true, lastActivityAt: "" }),
      summary({ conversationId: "y", readError: true, lastActivityAt: "", canvas: { path: plain.path } }),
      summary({ conversationId: "late", lastActivityAt: ago(2 * MIN) }),
    ], [quiet, billing, plain], NOW);
    expect(rows.map(r => r.key)).toEqual(["pa", "pb", "b", "q", "late", "x", "y"]);
  });

  test("the row's heading is the conversation's title; an empty one reads Conversation", () => {
    const rows = canvasConversationRows([
      summary({ conversationId: "t", title: "Tighten the spacing", canvas: { path: billing.path, id: "billing" }, lastActivityAt: ago(0) }),
      summary({ conversationId: "e", title: "", canvas: { path: billing.path, id: "billing" } }),
      summary({ conversationId: "s", title: "  \n ", canvas: { path: plain.path } }),
    ], [billing, plain], NOW);
    expect(rows.map(r => [r.key, r.heading, r.title])).toEqual([["t", "Tighten the spacing", "Tighten the spacing"], ["e", "Conversation", ""], ["s", "Conversation", "  \n "]]);
  });

  test("a row carries the canvas row, provider, status, short time and preview", () => {
    const [only] = canvasConversationRows([summary({ conversationId: "b", title: "Edit the header", provider: "codex", phase: "running", canvas: { path: billing.path, id: "billing" }, lastActivityAt: ago(3 * MIN), preview: "Editing the header" })], [billing], NOW);
    expect(only).toEqual({
      kind: "canvas", key: "b", conversationId: "b", name: "billing", canvas: { path: billing.path, id: "billing" }, row: billing,
      provider: "codex", status: { kind: "working", label: "Working" }, time: { text: "3m", label: "3 minutes ago" },
      preview: "Editing the header", problem: null, openable: true, heading: "Edit the header",
      // The row's Delete names the conversation and follows the title menu's rule.
      title: "Edit the header", deletable: { available: false, reason: "The agent is working on this conversation." },
    });
  });

  test("every row, special ones included, says whether its conversation can be deleted, as the title menu does", () => {
    const rows = canvasConversationRows([
      summary({ conversationId: "w", phase: "waiting", canvas: { path: billing.path, id: "billing" } }),
      summary({ conversationId: "g", phase: "running", working: true, canvas: { path: ".doan/canvases/gone.html" } }),
      summary({ conversationId: "e", canvas: { path: plain.path } }),
    ], [billing, plain], NOW);
    expect(Object.fromEntries(rows.map(r => [r.key, r.deletable]))).toEqual({
      w: { available: false, reason: "The agent is waiting for your answer." },
      g: { available: false, reason: "The agent is working on this conversation." },
      e: { available: true },
    });
    expect(rows.find(r => r.key === "g")).toMatchObject({ kind: "canvas", problem: { kind: "gone" } });
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
    const moved = row({ path: ".doan/canvases/pay/billing-v2.html", id: "billing" });
    const [only] = canvasConversationRows([summary({ canvas: { path: billing.path, id: "billing" } })], [moved], NOW);
    expect(only).toMatchObject({ name: "billing-v2", row: moved, openable: true, problem: null });
  });

  test("an id on either side matches by id only; without ids the path matches", () => {
    const rows = canvasConversationRows([
      summary({ conversationId: "noid", canvas: { path: billing.path } }),
      summary({ conversationId: "path", canvas: { path: plain.path } }),
    ], [billing, plain], NOW);
    expect(rows.find(r => r.conversationId === "path")).toMatchObject({ row: plain, openable: true });
    expect(rows.find(r => r.conversationId === "noid")).toBeUndefined();
    expect(rows.map(r => r.kind)).toEqual(["canvas"]);
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
    const twin = row({ path: ".doan/canvases/copy.html", id: "billing" });
    const [only] = canvasConversationRows([summary({ canvas: { path: billing.path, id: "billing" } })], [billing, twin], NOW);
    expect(only).toMatchObject({ name: "billing", row: null, openable: false, problem: { kind: "duplicate", count: 2 } });
  });

  test("an unreadable canvas can still be opened, so its page shows its own error", () => {
    const broken = row({ path: ".doan/canvases/broken.html", id: "broken", error: { code: "parse", message: "bad html" } });
    const [only] = canvasConversationRows([summary({ canvas: { path: broken.path, id: "broken" } })], [broken], NOW);
    expect(only).toMatchObject({ row: broken, openable: true, problem: { kind: "unreadable" } });
  });

  // ls lists an unreadable file without its id, so a conversation bound to {path, id} matches it by path.
  test("an unreadable canvas listed without its id still matches its conversation by path, and opens", () => {
    const broken = row({ path: ".doan/canvases/legacy-cart.html", error: { code: "unreadable_canvas", message: "permission denied" } });
    const [only, ...rest] = canvasConversationRows([summary({ canvas: { path: broken.path, id: "legacy-cart" } })], [broken, billing], NOW);
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ name: "legacy-cart", row: broken, openable: true, problem: { kind: "unreadable", sentence: "Can’t read this canvas. Run doan check in a terminal." } });
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
    expect(rows.map(r => r.status)).toEqual([{ kind: "permission", label: "Needs your answer" }, { kind: "unseen", label: "Conversation finished — unread" }, null]);
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
      { kind: "permission", label: "Needs your answer" }, { kind: "working", label: "Working" }, { kind: "unseen", label: "Conversation finished — unread" }, null,
    ]);
  });

  test("a deleted canvas of a conversation not started from Home shows while work is left and hides after", () => {
    const gone = { path: ".doan/canvases/gone.html", id: "gone" };
    expect(canvasConversationRows([summary({ conversationId: "g", fromHome: false, phase: "running", canvas: gone })], [], NOW).map(r => r.kind === "canvas" ? r.problem : null)).toEqual([{ kind: "gone" }]);
    expect(canvasConversationRows([summary({ conversationId: "g", fromHome: false, canvas: gone })], [], NOW)).toEqual([]);
  });
});

describe("canvasRowProblemText", () => {
  test("the shipped sentences", () => {
    expect(canvasRowProblemText({ kind: "gone" }, "doan")).toBe("No longer in doan");
    expect(canvasRowProblemText({ kind: "duplicate", count: 2 }, "doan")).toBe("2 canvases use this ID. Run doan check in a terminal.");
    expect(canvasRowProblemText({ kind: "duplicate", count: 3 }, "doan")).toBe("3 canvases use this ID. Run doan check in a terminal.");
    const broken = row({ path: ".doan/canvases/broken.html", id: "broken", error: { code: "parse", message: "bad html" } });
    const [unreadable] = canvasConversationRows([summary({ canvas: { path: broken.path, id: "broken" } })], [broken], NOW);
    if (unreadable?.kind !== "canvas") throw new Error("a canvas row");
    expect(canvasRowProblemText(unreadable.problem!, "doan")).toBe("Can’t read this canvas. Run doan check in a terminal.");
  });
});

// The rule canvasConversationRows judges a canvas conversation's row by, shared with Quick Open.
describe("conversationCanvasMatch", () => {
  test("one listed row, several when the id is shared, none when the canvas is gone", () => {
    const twin = row({ path: ".doan/canvases/copy.html", id: "billing" });
    expect(conversationCanvasMatch({ path: billing.path, id: "billing" }, [plain, billing, quiet])).toEqual({ kind: "one", row: billing });
    expect(conversationCanvasMatch({ path: billing.path, id: "billing" }, [billing, plain, twin])).toEqual({ kind: "many", rows: [billing, twin] });
    expect(conversationCanvasMatch({ path: ".doan/canvases/gone.html", id: "gone" }, [billing, plain])).toEqual({ kind: "none" });
    expect(conversationCanvasMatch({ path: billing.path, id: "billing" }, [])).toEqual({ kind: "none" });
  });

  test("an id on either side matches by id only; without ids the path matches", () => {
    const moved = row({ path: ".doan/canvases/pay/billing-v2.html", id: "billing" });
    expect(conversationCanvasMatch({ path: billing.path, id: "billing" }, [moved])).toEqual({ kind: "one", row: moved });
    expect(conversationCanvasMatch({ path: plain.path }, [plain])).toEqual({ kind: "one", row: plain });
    // The conversation has no id, the row has one: not the same canvas.
    expect(conversationCanvasMatch({ path: billing.path }, [billing])).toEqual({ kind: "none" });
    // A readable row without an id is another canvas, even at the same path.
    expect(conversationCanvasMatch({ path: plain.path, id: "plain" }, [plain])).toEqual({ kind: "none" });
  });

  test("an unreadable row listed without its id matches by path, unless an id match exists elsewhere", () => {
    const broken = row({ path: ".doan/canvases/legacy-cart.html", error: { code: "unreadable_canvas", message: "permission denied" } });
    const moved = row({ path: ".doan/canvases/cart/legacy-cart.html", id: "legacy-cart" });
    expect(conversationCanvasMatch({ path: broken.path, id: "legacy-cart" }, [broken, billing])).toEqual({ kind: "one", row: broken });
    expect(conversationCanvasMatch({ path: broken.path, id: "legacy-cart" }, [broken, moved])).toEqual({ kind: "one", row: moved });
    const brokenTwin = row({ path: broken.path, error: { code: "parse", message: "bad html" } });
    expect(conversationCanvasMatch({ path: broken.path, id: "legacy-cart" }, [broken, brokenTwin])).toEqual({ kind: "many", rows: [broken, brokenTwin] });
  });
});
