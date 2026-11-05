import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { CanvasRow } from "../main/view";
import { CanvasConversationList, ListLoading, observedRows, RowDelete, RowFocusMemory, type CanvasList } from "./CanvasConversationList";
import { canvasConversationRows } from "./canvasConversationRows";
import { CanvasConversations } from "./RightPanel";
import { TooltipContent, TooltipProvider } from "./components/ui/tooltip";
import type { ThumbnailState } from "./thumbnails";

// buzz-project design §0 'right rows', §2.3 and §2.5.
const NOW = Date.parse("2026-11-01T12:00:00.000Z");
const MIN = 60_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", state: "current", owner: "doan", provider: "claude", fromHome: true,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: ago(MIN), preview: "Done", ...patch,
});
const row = (patch: Partial<CanvasRow> & { path: string }): CanvasRow => ({ url: `doan://${patch.path}`, width: 1280, ...patch });

const billing = row({ path: ".doan/canvases/billing.html", id: "billing" });
const receipt = row({ path: ".doan/canvases/receipt.html" });
const refunds = row({ path: ".doan/canvases/refunds.html" });
const legacy = row({ path: ".doan/canvases/legacy.html", error: { code: "unreadable", message: "bad" } });
const taxA = row({ path: ".doan/canvases/tax.html", id: "tax" });
const taxB = row({ path: ".doan/canvases/tax-copy.html", id: "tax" });

const rows = canvasConversationRows([
  summary({ conversationId: "b", title: "Ask about the header", provider: "codex", phase: "waiting", canvas: { path: billing.path, id: "billing" }, lastActivityAt: ago(0), preview: "Needs your answer: Run doan check" }),
  summary({ conversationId: "r", canvas: { path: receipt.path }, lastActivityAt: ago(3 * MIN), preview: "Receipts now show the tax line separately." }),
  summary({ conversationId: "f", canvas: { path: refunds.path }, lastActivityAt: ago(4 * MIN) }),
  summary({ conversationId: "l", canvas: { path: legacy.path }, lastActivityAt: ago(5 * MIN) }),
  summary({ conversationId: "g", phase: "running", canvas: { path: ".doan/canvases/invoice.html" }, lastActivityAt: ago(6 * MIN) }),
  summary({ conversationId: "t", canvas: { path: taxA.path, id: "tax" }, lastActivityAt: ago(7 * MIN) }),
], [billing, receipt, refunds, legacy, taxA, taxB], NOW);

const thumbnails = new Map<string, ThumbnailState>([[billing.path, { kind: "ready", url: "blob:billing" }], [refunds.path, { kind: "failed" }]]);
const noop = () => {};
// React's static render hoists a preload link for each image; the markup under test follows it.
const markup = (node: ReactNode) => renderToStaticMarkup(node).replace(/<link [^>]*\/>/g, "");
const render = (list: CanvasList, thumbs: ReadonlyMap<string, ThumbnailState> = thumbnails) => markup(
  <TooltipProvider><CanvasConversationList list={list} project="acme-web" thumbnails={thumbs} open={noop} retry={noop} onVisible={noop} onDelete={noop} scroller={{ current: null }} title={{ current: null }} /></TooltipProvider>);
const item = (html: string, key: string) => {
  const at = html.indexOf(`data-key="${key}"`);
  return html.slice(html.lastIndexOf("<li", at), html.indexOf("</li>", at));
};

describe("canvas conversation list", () => {
  const html = render(rows);

  test("is one list without its own name; only the panel region is named", () => {
    expect(html.match(/role="list"/g)).toHaveLength(1);
    expect(html).toMatch(/^<ul class="rp-list" role="list">/);
    const panel = markup(<TooltipProvider><CanvasConversations list={rows} project="acme-web" thumbnails={thumbnails} open={noop} retry={noop} onVisible={noop} onDelete={noop} /></TooltipProvider>);
    expect(panel.match(/aria-label="Canvas conversations"/g)).toHaveLength(1);
    expect(panel).toContain('<aside class="right native-scroll ov-right" role="region" aria-label="Canvas conversations"><h2 class="phead rp-head" tabindex="-1">Canvas conversations</h2><ul class="rp-list" role="list">');
  });

  test("a row draws the provider logo, canvas name, status mark, short time and preview", () => {
    const b = item(html, "b");
    expect(b).toContain('alt="Codex"');
    expect(b).toContain("<b>billing</b>");
    expect(b).toContain('aria-label="Needs your answer"');
    expect(b).toContain('<span aria-hidden="true">now</span><span class="sr-only">Just now</span>');
    expect(b).toContain('<span class="cv-preview">Needs your answer: Run doan check</span>');
    expect(item(html, "r")).toContain('<span aria-hidden="true">3m</span><span class="sr-only">3 minutes ago</span>');
  });

  test("one Tab stop: the first row (with its Delete), the others reached with the arrow keys", () => {
    expect(html.match(/tabindex="0"/g)).toHaveLength(2);
    expect(item(html, "b").match(/tabindex="0"/g)).toHaveLength(2);
    for (const key of ["r", "f", "l", "g", "t"]) expect(item(html, key)).toContain('tabindex="-1"');
  });

  test("a ready preview is an image; without one the empty style is named Preview loading or Preview unavailable", () => {
    expect(item(html, "b")).toContain('<span class="cv-thumb" aria-hidden="true"><img src="blob:billing" alt=""/></span>');
    expect(item(html, "r")).toContain('<span class="cv-thumb empty"><span class="sr-only">Preview loading</span></span>');
    expect(item(html, "f")).toContain('<span class="cv-thumb empty"><span class="sr-only">Preview unavailable</span></span>');
    for (const key of ["l", "g", "t"]) expect(item(html, key)).toContain('<span class="cv-thumb empty"><span class="sr-only">Preview unavailable</span></span>');
    const noWidth = canvasConversationRows([summary({ conversationId: "w", canvas: { path: ".doan/canvases/w.html" } })], [{ path: ".doan/canvases/w.html", url: "doan://w" }], NOW);
    expect(render(noWidth)).toContain('<span class="sr-only">Preview unavailable</span>');
    // A pending reply after a ready image keeps the image (ThumbnailRequests); a pending state alone is loading.
    expect(render(rows, new Map([[receipt.path, { kind: "pending" }]]))).toContain('<span class="sr-only">Preview loading</span>');
  });

  test("the thumbnail observer finds only rows with a listed canvas", () => {
    expect(html.match(/data-path="/g)).toHaveLength(4);
    expect(item(html, "g")).not.toContain("data-path");
    expect(item(html, "t")).not.toContain("data-path");
  });

  test("a deleted canvas and a shared id are disabled, their reason the description", () => {
    for (const [key, name, reason] of [["g", "invoice", "No longer in acme-web"], ["t", "tax", "2 canvases use this ID — run doan check"]] as const) {
      const li = item(html, key);
      expect(li).toContain('aria-disabled="true"');
      const why = /aria-describedby="([^"]+)"/.exec(li)![1]!;
      expect(li).toContain(`<small id="${why}" class="err">${reason}</small>`);
      const label = /aria-labelledby="([^"]+)"/.exec(li)![1]!;
      expect(li).toContain(`<b id="${label}">${name}</b>`);
    }
  });

  test("an unreadable canvas opens, with the sidebar's sentence", () => {
    const li = item(html, "l");
    expect(li).not.toContain("aria-disabled");
    expect(li).toContain("Can&#x27;t read this canvas — run doan check</small>");
    expect(li).toContain('class="note"');
  });

  // canvas-composer-polish spec 6 (draft frames cv-delete, cv-special): the title menu's Delete on every row.
  test("every row, special rows included, has a Delete beside its row button, named by the conversation", () => {
    for (const key of ["b", "r", "f", "l", "g", "t"]) {
      const li = item(html, key);
      expect(li, key).toMatch(/<\/button><button type="button" class="doan-icon-button cv-delete"[^>]*aria-label="Delete “[^"]*”"/);
    }
    expect(item(html, "b")).toContain('aria-label="Delete “Ask about the header”"');
    expect(item(html, "r")).toContain('aria-label="Delete “Draw it”"');
  });

  test("Delete follows its row's Tab stop, so Tab moves between the row and its Delete", () => {
    expect(item(html, "b").match(/tabindex="0"/g)).toHaveLength(2);
    for (const key of ["r", "f", "l", "g", "t"]) expect(item(html, key)).not.toContain('tabindex="0"');
  });

  test("a working or waiting conversation's Delete is unavailable and reads its reason", () => {
    for (const [key, reason] of [["b", "The agent is waiting for your answer."], ["g", "The agent is working on this conversation."]] as const) {
      const li = item(html, key);
      const button = /<button type="button" class="doan-icon-button cv-delete"[^>]*>/.exec(li)![0];
      expect(button).toContain('aria-disabled="true"');
      const why = /aria-describedby="([^"]+)"/.exec(button)![1]!;
      expect(li).toContain(`<span class="sr-only" id="${why}">${reason}</span>`);
    }
    expect(/<button type="button" class="doan-icon-button cv-delete"[^>]*>/.exec(item(html, "r"))![0]).not.toContain("aria-disabled");
  });

  test("the row button itself is unchanged: Delete is a sibling, never inside it", () => {
    for (const key of ["b", "g"]) {
      const li = item(html, key);
      const rowButton = li.slice(li.indexOf('<button type="button" class="cv-row"'), li.indexOf("</button>") + "</button>".length);
      expect(rowButton).not.toContain("cv-delete");
    }
  });

  test("no canvas conversations: the empty state", () => {
    expect(render([])).toBe('<div class="rp-empty"><p>No canvas conversations yet.</p><p>When a conversation draws or edits a canvas, the canvas shows here.</p></div>');
  });

  test("the empty state is a dashed box, as the sidebar's empty groups are", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.rp-empty \{[^}]*border: 1px dashed var\(--border-standard\);[^}]*border-radius: var\(--radius-chip\);/);
  });

  test("loading shows nothing first, then the status line", () => {
    expect(render("loading")).toBe("");
    expect(renderToStaticMarkup(<ListLoading />)).toBe('<p class="rp-loading" role="status">Loading canvas conversations</p>');
  });

  test("a failed read offers Retry", () => {
    expect(render("error")).toBe('<div class="rp-error" role="status"><span>Couldn’t read conversations</span><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="panel">Retry</button></div>');
  });
});

// Only the row that still holds focus hands it on when it leaves; a row the person moved away from takes none.
describe("RowFocusMemory", () => {
  test("a focused row that leaves hands focus to the next row, else the previous, else the title", () => {
    const memory = new RowFocusMemory();
    memory.focus("a");
    expect(memory.left(["a", "b"], ["b"], false)).toEqual({ kind: "row", key: "b" });
    memory.focus("b");
    expect(memory.left(["a", "b"], ["a"], false)).toEqual({ kind: "row", key: "a" });
    memory.focus("a");
    expect(memory.left(["a"], [], false)).toEqual({ kind: "title" });
  });

  test("a row still listed keeps focus, and the memory stays", () => {
    const memory = new RowFocusMemory();
    memory.focus("a");
    expect(memory.left(["a", "b"], ["b", "a"], false)).toBeNull();
    expect(memory.left(["b", "a"], ["b"], false)).toEqual({ kind: "row", key: "b" });
  });

  test("a click in empty space ends the memory: the row's later removal moves no focus", () => {
    const memory = new RowFocusMemory();
    memory.focus("a");
    memory.blur("a", null);
    memory.pointer(false);
    expect(memory.left(["a", "b"], ["b"], false)).toBeNull();
  });

  test("a pointer press on a row, or a window blur, keeps it", () => {
    const memory = new RowFocusMemory();
    memory.focus("a");
    memory.pointer(true);
    memory.blur("a", null);
    expect(memory.left(["a", "b"], ["b"], false)).toEqual({ kind: "row", key: "b" });
  });

  test("focus moved to another element ends it, and so does focus found elsewhere at removal", () => {
    const memory = new RowFocusMemory();
    memory.focus("a");
    memory.blur("a", {});
    expect(memory.left(["a", "b"], ["b"], false)).toBeNull();
    memory.focus("b");
    expect(memory.left(["a", "b"], ["a"], true)).toBeNull();
    expect(memory.left(["a"], [], false)).toBeNull();
  });
});

// review RL r1 🟡2: a canvas whose current conversation changes keeps its path but gets a new button to observe.
describe("observedRows", () => {
  test("changes when a row's conversation changes on the same canvas", () => {
    const [first] = canvasConversationRows([summary({ conversationId: "c1", canvas: { path: billing.path, id: "billing" } })], [billing], NOW);
    const [second] = canvasConversationRows([summary({ conversationId: "c2", canvas: { path: billing.path, id: "billing" } })], [billing], NOW);
    expect(observedRows([first!])).not.toBe(observedRows([second!]));
    expect(observedRows([first!])).toBe(observedRows([{ ...first! }]));
  });

  test("leaves out rows without a listed canvas, and is empty without any", () => {
    expect(observedRows(rows.filter(r => r.row === null))).toBe("");
    expect(observedRows(rows)).toContain(billing.path);
  });
});

// canvas-composer-polish spec 6, A5: the Delete's press. Where focus goes after the delete is computed before the
// confirmation opens, since the alert takes focus from the list.
function tree(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(tree);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...tree(node.props.children as ReactNode)];
}
const text = (node: ReactNode): string => Array.isArray(node) ? node.map(text).join("") : typeof node === "string" ? node : isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : "";
describe("RowDelete", () => {
  const listed = canvasConversationRows([
    summary({ conversationId: "a", canvas: { path: billing.path, id: "billing" }, lastActivityAt: ago(0) }),
    summary({ conversationId: "b", canvas: { path: receipt.path }, lastActivityAt: ago(MIN) }),
    summary({ conversationId: "c", canvas: { path: refunds.path }, lastActivityAt: ago(2 * MIN) }),
    summary({ conversationId: "w", phase: "running", working: true, canvas: { path: legacy.path }, lastActivityAt: ago(3 * MIN) }),
  ], [billing, receipt, refunds, legacy], NOW);
  const of = (key: string) => listed.find(row => row.key === key)!;
  const press = (key: string, keys: readonly string[]) => {
    const onDelete = vi.fn();
    const nodes = tree(RowDelete({ item: of(key), keys, tabbable: false, onDelete, onFocus: noop }));
    const button = nodes.find(element => element.type === "button")!;
    const element = { name: `Delete ${key}` };
    (button.props.onClick as (event: { currentTarget: unknown }) => void)({ currentTarget: element });
    return { onDelete, element, nodes };
  };

  test("asks to delete with its button and the next row as focus target, else the previous row, else the panel title", () => {
    const next = press("a", ["a", "b", "c"]);
    expect(next.onDelete).toHaveBeenCalledWith(of("a"), next.element, { kind: "row", key: "b" });
    const last = press("c", ["a", "b", "c"]);
    expect(last.onDelete).toHaveBeenCalledWith(of("c"), last.element, { kind: "row", key: "b" });
    const only = press("a", ["a"]);
    expect(only.onDelete).toHaveBeenCalledWith(of("a"), only.element, { kind: "title" });
  });

  test("an unavailable Delete does nothing; its tooltip gives the reason, an available one says Delete conversation", () => {
    const working = press("w", ["a", "w"]);
    expect(working.onDelete).not.toHaveBeenCalled();
    expect(text(working.nodes.find(element => element.type === TooltipContent)!.props.children as ReactNode)).toBe("The agent is working on this conversation.");
    expect(text(press("a", ["a"]).nodes.find(element => element.type === TooltipContent)!.props.children as ReactNode)).toBe("Delete conversation");
  });
});
