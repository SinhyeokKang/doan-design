import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import type { ReplyAnchor } from "../main/conversation/replyAnchor";
import type { CanvasRow } from "../main/view";
import type { ThreadItem } from "./threadItems";

// agent-reply-chips T3 (design 'Rendering'): pressing a reply chip, and the "No longer in the canvas" note under the
// reply. No DOM here: `context` stands in for every context the chip reads (useContext), and `note` sets what the
// reply's note state holds (useLocateNote's count and the chip it is shown for), so one render draws a shown note.
const stub = vi.hoisted(() => ({
  context: null as null | Record<string, unknown>,
  note: null as null | { count: number; chip: string },
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useContext: (context: Parameters<typeof actual.useContext>[0]) => stub.context ?? actual.useContext(context),
    useId: () => "k",
    useState: (initial: unknown) => {
      if (stub.note && initial === 0) return [stub.note.count, () => {}];
      if (stub.note && initial === null) return [stub.note.chip, () => {}];
      return actual.useState(initial);
    },
  };
});
const { ConversationThread, ReplyChip } = await import("./ConversationThread");

const rows: CanvasRow[] = [
  { path: ".doan/canvases/drafts.html", url: "http://localhost/drafts.html", id: "drafts", title: "Drafts", frames: [{ id: "editor", title: "Editor" }] },
  { path: ".doan/canvases/checkout.html", url: "http://localhost/checkout.html", id: "checkout", title: "Checkout", frames: [{ id: "payment", title: "Payment" }] },
];
beforeEach(() => { stub.context = null; stub.note = null; });

function chip(link: ReplyAnchor, patch: Record<string, unknown>) {
  const asked: ReplyAnchor[] = [], shown: string[] = [];
  stub.context = { openCanvasId: "drafts", frames: [{ id: "editor", title: "Editor" }], rows, disabled: false, pressable: true, shownFor: null,
    show: (key: string) => shown.push(key), replyChip: (at: ReplyAnchor) => { asked.push(at); return Promise.resolve(patch.outcome ?? null); }, ...patch };
  const element = ReplyChip({ link }) as ReactElement<{ onClick(): void; "aria-describedby"?: string }>;
  return { element, asked, shown };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test("a chip hands its link to the host; a same-canvas chip does nothing while disabled, another canvas's chip still asks", () => {
  const same = chip({ canvas: "drafts", kind: "frame", id: "editor" }, {});
  same.element.props.onClick();
  expect(same.asked).toEqual([{ canvas: "drafts", kind: "frame", id: "editor" }]);
  const off = chip({ canvas: "drafts", kind: "frame", id: "editor" }, { disabled: true });
  off.element.props.onClick();
  expect(off.asked).toEqual([]);
  const other = chip({ canvas: "checkout", kind: "element", id: "pay" }, { disabled: true });
  other.element.props.onClick();
  expect(other.asked).toEqual([{ canvas: "checkout", kind: "element", id: "pay" }]);
});

test.each([["missing", 1], ["timeout", 0], ["unavailable", 0], ["shown", 0], [null, 0]] as const)("a same-canvas locate that ends %s shows the note %i times", async (outcome, times) => {
  const { element, shown } = chip({ canvas: "drafts", kind: "element", id: "save" }, { outcome });
  element.props.onClick();
  await settle();
  expect(shown).toEqual(times ? ["k"] : []);
});

test("another canvas's chip never shows the note, whatever the host answers", async () => {
  const { element, shown } = chip({ canvas: "checkout", kind: "frame", id: "payment" }, { outcome: "missing" });
  element.props.onClick();
  await settle();
  expect(shown).toEqual([]);
});

test("the note's chip is described by it", () => {
  expect(chip({ canvas: "drafts", kind: "frame", id: "editor" }, { shownFor: "k" }).element.props["aria-describedby"]).toBe("k-missing");
  expect(chip({ canvas: "drafts", kind: "frame", id: "editor" }, { shownFor: "other" }).element.props["aria-describedby"]).toBeUndefined();
});

test("the note sits under the reply block, not inside it, as a status that describes its chip", () => {
  stub.note = { count: 1, chip: "k" };
  const items: ThreadItem[] = [{ kind: "agent", key: "m1", messageId: "m1", text: "I removed [b](doan:drafts/element/beta-badge).", streaming: false }];
  const out = renderToStaticMarkup(<ConversationThread conversationId="c1" items={items} provider="claude" project="acme" liveAfter={0} canvasListed={() => true}
    onAnswer={() => {}} onStop={() => {}} onEditAndResend={() => {}} onSignIn={() => {}} onRetry={() => {}} onOpenCanvas={() => {}} onOpenLink={() => {}}
    onCopy={async () => true} onReplyChip={async () => "missing"} openCanvasId="drafts" frames={[]} canvasRows={rows} />);
  expect(out).toMatch(/<div class="thread-item" data-item="m1"><div class="msg-agent md"><p>I removed <button [^>]*aria-describedby="k-missing">.*?<\/button>\.<\/p><\/div><span class="chip-missing" id="k-missing" role="status">No longer in the canvas<\/span><\/div>/);
});
