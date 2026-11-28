import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DraftStore } from "./drafts";
import { chipLabel, messageLine } from "./messageText";
import { anchorTokens, LIMITS, turnPrompt } from "./prompt";
import { ConversationStore } from "./store";
import type { Anchor } from "./types";

const canvas = (path: string, id = "checkout-flow"): Anchor => ({ canvas: { path, id } });
const accepts = (anchor: unknown) => anchorTokens("{{1}}", [anchor]) !== null;

describe("validAnchor: canvas anchors", () => {
  it.each([
    ".doan/canvases/checkout-flow.html",
    ".doan/ds/buttons.html",
    ".doan/canvases/settings/notifications/quiet-hours.html",
    ".doan/canvases/결제-흐름.html",
  ])("accepts %s", path => {
    expect(accepts(canvas(path))).toBe(true);
  });

  it.each([
    ["a `..` segment", ".doan/canvases/../secret.html"],
    ["an absolute path", "/Users/me/repo/.doan/canvases/a.html"],
    ["an upper-case extension", ".doan/canvases/a.HTML"],
    ["a dot segment", ".doan/canvases/.hidden/a.html"],
    ["a dot file", ".doan/canvases/.a.html"],
    ["a file outside the canvas directories", "src/a.html"],
    ["a non-html file", ".doan/canvases/a.css"],
    ["the canvas directory itself", ".doan/canvases"],
    ["an empty segment", ".doan/canvases//a.html"],
    ["a path past the length limit", `.doan/canvases/${"a".repeat(LIMITS.path)}.html`],
  ])("rejects %s", (_name, path) => {
    expect(accepts(canvas(path))).toBe(false);
  });

  it("requires a canvas id in the canvas id form", () => {
    expect(accepts({ canvas: { path: ".doan/canvases/a.html" } })).toBe(false);
    expect(accepts({ canvas: { path: ".doan/canvases/a.html", id: "" } })).toBe(false);
    expect(accepts({ canvas: { path: ".doan/canvases/a.html", id: "Not An Id" } })).toBe(false);
    expect(accepts({ canvas: { path: ".doan/canvases/a.html", id: 7 } })).toBe(false);
  });

  it("rejects a canvas mixed with a frame, element or point, and unknown keys", () => {
    const base = canvas(".doan/canvases/a.html");
    expect(accepts({ ...base, frame: { id: "hero" } })).toBe(false);
    expect(accepts({ ...base, element: { selector: "#a" } })).toBe(false);
    expect(accepts({ ...base, point: { dx: 1, dy: 2 } })).toBe(false);
    expect(accepts({ canvas: { path: ".doan/canvases/a.html", id: "a", name: "a" } })).toBe(false);
    expect(accepts({ canvas: ".doan/canvases/a.html" })).toBe(false);
    expect(accepts({ canvas: null })).toBe(false);
  });

  it("goes into the prompt as untrusted anchor data, unchanged", () => {
    const anchor = canvas(".doan/canvases/checkout-flow.html");
    const prompt = turnPrompt([anchor], "Use {{1}} as the layout", { root: "/repo" })!;
    expect(prompt).not.toBeNull();
    const data = JSON.parse(prompt.split("\n\n")[1]!) as { parts: unknown[] };
    expect(data.parts).toEqual([{ userText: "Use " }, { anchorData: anchor }, { userText: " as the layout" }]);
  });
});

describe("chipLabel and messageLine: canvas anchors", () => {
  it("names a canvas by its file stem, whole, with the repository-relative path as its title", () => {
    expect(chipLabel(canvas(".doan/canvases/checkout-flow.html"))).toEqual({ kind: "canvas", label: "checkout-flow", title: ".doan/canvases/checkout-flow.html" });
    expect(chipLabel(canvas(".doan/ds/buttons.html", "buttons"))).toEqual({ kind: "canvas", label: "buttons", title: ".doan/ds/buttons.html" });
    const long = ".doan/canvases/settings/settings-notifications-quiet-hours-redesign.html";
    expect(chipLabel(canvas(long))).toEqual({ kind: "canvas", label: "settings-notifications-quiet-hours-redesign", title: long });
  });

  it("reads a canvas chip as its name in titles, queue rows and notifications", () => {
    const anchors = [canvas(".doan/canvases/checkout-flow.html"), { frame: { id: "hero", title: "Hero" } }];
    expect(messageLine("Use {{1}} as the layout\n- keep {{2}}", anchors)).toBe("Use checkout-flow as the layout keep Hero");
  });
});

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function temp(prefix: string): string { const root = realpathSync(mkdtempSync(join(tmpdir(), prefix))); roots.push(root); return root; }

describe("stored messages with canvas anchors", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const anchors = [canvas(".doan/canvases/checkout-flow.html"), canvas(".doan/ds/buttons.html", "buttons")];

  it("drafts.ts keeps a queued item with canvas anchors across a restart as a returned draft", () => {
    const dir = join(temp("doan-canvas-drafts-"), "conversations"); mkdirSync(dir);
    new DraftStore(dir).add(A, { itemId: "q1", text: "Use {{1}} with {{2}}", anchors, attachments: [] });
    expect(new DraftStore(dir).returned(A)).toEqual({ text: "Use {{1}} with {{2}}", anchors, attachments: [], reason: "restarted" });
  });

  it("store.ts reads and appends a user.message with canvas anchors", () => {
    const store = new ConversationStore(temp("doan-canvas-store-"));
    const message = { type: "user.message", text: "Use {{1}} with {{2}}", anchors } as const;
    expect(store.append("c", "t", message)).toMatchObject(message);
    expect(store.read("c")).toEqual([expect.objectContaining(message)]);
  });

  it("store.ts reads a user.message line with canvas anchors written to disk", () => {
    const root = temp("doan-canvas-store-");
    const store = new ConversationStore(root);
    const message = { type: "user.message", text: "Use {{1}}", anchors: [anchors[0]] };
    writeFileSync(join(root, "conversations", "c.jsonl"), JSON.stringify({ v: 1, conversationId: "c", seq: 1, turnId: "t", at: "2026-11-28T00:00:00.000Z", ...message }) + "\n");
    expect(store.read("c")).toEqual([expect.objectContaining(message)]);
  });
});
