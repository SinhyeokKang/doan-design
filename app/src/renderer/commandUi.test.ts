import { describe, expect, test } from "vitest";
import type { BoundaryKind } from "../main/conversation/commandRecords";
import type { ConversationEvent, SkillSummary } from "../main/conversation/types";
import { textSegments } from "./anchorField";
import { commandTurnLabel, firstTitleMessage, PRESET_NOTICE, queuedCommand, threadCommands } from "./commandView";
import { contextRing } from "./contextWindow";
import { drawerSearchLabel, presetListView, searchDrawer, slashKey, slashQuery, type PresetListReply, type PresetSummary } from "./homeComposer";
import { fieldHighlightRuns } from "./skillWords";
import { threadItems } from "./threadItems";

const preset: PresetSummary = { id: "polish", title: "Polish the details", description: "Refine spacing", scope: "screen", group: "refine" };
const reply: PresetListReply = { v: 1, ok: true, result: { version: "1", presets: [preset] } };
const skill = (name: string, description = ""): SkillSummary => ({ kind: "skill", name, description });
const command = (name: string, description = ""): SkillSummary => ({ kind: "command", name, description });
// What conversation:skills answers for Claude Code: the project's skills, then the allowlist's commands.
const ROWS: SkillSummary[] = [skill("deploy", "Deploy the branch"), skill("context", "Collect the files"),
  command("clear", "Clear conversation history and free up context."), command("compact", "Clear conversation history but keep a summary in context."),
  command("context", "Show context usage"), command("init", "Initialize CLAUDE.md"), command("review", "Review a pull request"), command("usage", "Show plan usage limits")];
const opts = { project: "acme-web", suggested: [preset], query: "", tab: null, skills: ROWS };

describe("the / list and the Presets popover", () => {
  test("the empty / list shows presets, then skills, then commands, each in name order; a skill wins a command's name", () => {
    const view = presetListView(reply, { ...opts, slash: true });
    if (view.kind !== "list") throw new Error("list");
    expect(view.sections.flatMap(s => s.rows).map(r => r.key)).toEqual([
      "preset:polish", "skill:context", "skill:deploy", "command:clear", "command:compact", "command:init", "command:review", "command:usage",
    ]);
  });

  test("a command row is a gray tile with the terminal icon and the provider's description", () => {
    const row = searchDrawer([], ROWS, "comp")[0];
    expect(row).toMatchObject({ kind: "command", key: "command:compact", icon: "terminal", id: "compact", title: "/compact", description: "Clear conversation history but keep a summary in context." });
  });

  test("a query searches commands with the skills and counts what it shows", () => {
    const view = presetListView(reply, { ...opts, query: "comp" });
    if (view.kind !== "list") throw new Error("list");
    expect(view.sections.flatMap(s => s.rows).map(r => r.key)).toEqual(["command:compact"]);
    expect(view.summary).toBe("1 command matches comp");
    // The project skill named context is listed first; the command of that name is not (the other commands match "con"
    // in their descriptions).
    const clash = presetListView(reply, { ...opts, query: "con" });
    if (clash.kind !== "list") throw new Error("list");
    const keys = clash.sections.flatMap(s => s.rows).map(r => r.key);
    expect(keys[0]).toBe("skill:context");
    expect(keys).not.toContain("command:context");
  });

  test("the Commands tab follows Project with the terminal icon, rows in name order", () => {
    const view = presetListView(reply, { ...opts, tab: "commands" });
    if (view.kind !== "list") throw new Error("list");
    expect(view.tabs.map(t => t.key)).toEqual(["suggested", "refine", "project", "commands"]);
    expect(view.tabs.at(-1)).toEqual({ key: "commands", label: "Commands", icon: "terminal", selected: true });
    expect(view.sections).toEqual([{ title: "Commands", rows: searchDrawer([], ROWS.filter(r => r.kind === "command" && r.name !== "context"), "") }]);
    expect(view.sections[0]!.rows.map(r => r.id)).toEqual(["clear", "compact", "init", "review", "usage"]);
  });

  test("without commands (being read, failed, or none) there is no Commands tab and no command row", () => {
    const view = presetListView(reply, { ...opts, skills: ROWS.filter(r => r.kind === "skill"), tab: "commands" });
    if (view.kind !== "list") throw new Error("list");
    expect(view.tabs.map(t => t.key)).toEqual(["suggested", "refine", "project"]);
    expect(view.tabs.find(t => t.selected)?.key).toBe("suggested");
  });

  test("commands alone, without skills, still get their tab, and the search box keeps the shipped label", () => {
    const view = presetListView(reply, { ...opts, skills: ROWS.filter(r => r.kind === "command") });
    if (view.kind !== "list") throw new Error("list");
    expect(view.tabs.map(t => t.key)).toEqual(["suggested", "refine", "commands"]);
    expect(drawerSearchLabel(ROWS)).toBe("Search presets and skills");
    expect(drawerSearchLabel(ROWS.filter(r => r.kind === "command"))).toBe("Search presets");
  });

  test("Enter sends when the query equals the highlighted command's name, and picks it otherwise", () => {
    const rows = searchDrawer([], ROWS, "compact");
    expect(slashKey("Enter", 0, rows.length, false, { query: "compact", row: rows[0] })).toBeNull();
    const partial = searchDrawer([], ROWS, "comp");
    expect(slashKey("Enter", 0, partial.length, false, { query: "comp", row: partial[0] })).toEqual({ kind: "pick" });
  });

  test("the / list closes once a command word is followed by a space", () => {
    expect(slashQuery("/compact ", false, new Set(["compact"]))).toBeNull();
    expect(slashQuery("/compact", false, new Set(["compact"]))).toBe("compact");
  });
});

describe("the field's highlight", () => {
  test("a command word is highlighted only as the field's first word; skills anywhere", () => {
    const skills = new Set(["deploy"]), commands = new Set(["compact", "model"]);
    expect(fieldHighlightRuns(textSegments("/compact now /deploy"), skills, commands)).toEqual([{ start: 0, end: 8, name: "compact" }, { start: 13, end: 20, name: "deploy" }]);
    expect(fieldHighlightRuns(textSegments("please /compact"), skills, commands)).toEqual([]);
    expect(fieldHighlightRuns(textSegments("/model opus"), skills, commands)).toEqual([{ start: 0, end: 6, name: "model" }]);
    // Cut like a skill: attached Hangul and trailing punctuation are not part of the name.
    expect(fieldHighlightRuns(textSegments("/compact해줘"), skills, commands)).toEqual([{ start: 0, end: 8, name: "compact" }]);
  });

  test("a project skill of the same name is highlighted as the skill", () => {
    expect(fieldHighlightRuns(textSegments("/context please"), new Set(["context"]), new Set(["context"]))).toEqual([{ start: 0, end: 8, name: "context" }]);
  });

  test("the preset notice's copy", () => {
    expect(PRESET_NOTICE).toBe("Presets don’t apply to commands");
  });
});

let seq = 0;
const ev = (turnId: string, payload: Record<string, unknown>): ConversationEvent => ({ v: 1, conversationId: "c1", seq: ++seq, turnId, at: "2026-11-17T00:00:00Z", ...payload } as ConversationEvent);
const message = (turnId: string, text: string) => [ev(turnId, { type: "user.message", text, anchors: [] }), ev(turnId, { type: "turn.started" })];
const answer = (turnId: string, text: string) => [ev(turnId, { type: "message.done", messageId: `m${turnId}`, text })];
const done = (turnId: string) => ev(turnId, { type: "turn.done" });
const usage = (turnId: string, used: number) => ev(turnId, { type: "context.usage", used, size: 200000 });

describe("command turns in the thread", () => {
  const events = () => {
    seq = 0;
    return [...message("t1", "Make the hero image larger"), ...answer("t1", "Done."), usage("t1", 42000), done("t1"),
      ...message("t2", "/compact"), usage("t2", 3600), done("t2"),
      ...message("t3", "Now tighten the footer"), ...answer("t3", "Tightened."), done("t3")];
  };

  test("command turns are named from their first message; aliases run as their command", () => {
    seq = 0;
    const list = [...message("t1", "/compact"), ...message("t2", "/reset"), ...message("t3", "/deploy now"), ...message("t4", "/Users/ada/a.png")];
    const commands = threadCommands("claude", list, new Map());
    expect([...commands.turns]).toEqual([["t1", "compact"], ["t2", "clear"]]);
  });

  test("a boundary row follows its command turn, which shows no No reply; the bubble highlights the command", () => {
    const list = events();
    const commands = threadCommands("claude", list, new Map<string, BoundaryKind>([["t2", "compacted"]]));
    const items = threadItems(list, "/w", false, commands);
    expect(items.map(item => item.kind)).toEqual(["user", "agent", "user", "boundary", "user", "agent"]);
    expect(items[3]).toEqual({ kind: "boundary", key: "bt2", label: "Context compacted — the agent keeps a summary of messages above" });
    expect(items[2]).toMatchObject({ kind: "user", skills: ["compact"] });
  });

  test("an alias bubble highlights the word as written; a clear boundary has its own label", () => {
    seq = 0;
    const list = [...message("t1", "/reset"), done("t1")];
    const items = threadItems(list, "/w", false, threadCommands("claude", list, new Map([["t1", "cleared" as const]])));
    expect(items).toEqual([expect.objectContaining({ kind: "user", skills: ["reset"] }), { kind: "boundary", key: "bt1", label: "Context cleared — the agent won’t see messages above" }]);
  });

  test("a command turn without a boundary keeps the shipped display: its reply, or No reply", () => {
    seq = 0;
    const list = [...message("t1", "/context"), ...answer("t1", "| Category | Tokens |"), done("t1"), ...message("t2", "/compact"), done("t2")];
    const items = threadItems(list, "/w", false, threadCommands("claude", list, new Map()));
    expect(items.map(item => item.kind)).toEqual(["user", "agent", "user", "noReply"]);
  });

  test("without commands the thread is the shipped one", () => {
    const list = events();
    expect(threadItems(list, "/w", false).map(item => item.kind)).toEqual(["user", "agent", "user", "noReply", "user", "agent"]);
  });

  test("a running command turn names its label; other turns and commands keep the shipped words", () => {
    seq = 0;
    const list = [...message("t1", "/compact"), ...message("t2", "/clear"), ...message("t3", "/review"), ...message("t4", "/init")];
    const claude = threadCommands("claude", list, new Map()), codex = threadCommands("codex", list, new Map());
    expect(commandTurnLabel("claude", claude, "t1")).toBe("Compacting…");
    expect(commandTurnLabel("claude", claude, "t2")).toBe("Clearing context…");
    expect(commandTurnLabel("codex", codex, "t3")).toBe("Reviewing…");
    expect(commandTurnLabel("claude", claude, "t4")).toBeNull();
    expect(commandTurnLabel("claude", claude, "t9")).toBeNull();
  });

  test("after a clear the ring is blank until a later turn measures the new session", () => {
    seq = 0;
    const list = [...message("t1", "Draw it"), usage("t1", 90000), done("t1"), ...message("t2", "/clear"), done("t2")];
    const cleared = threadCommands("claude", list, new Map([["t2", "cleared" as const]]));
    expect(cleared.usageStale).toBe(true);
    expect(contextRing(list, cleared.usageStale)).toBeNull();
    list.push(...message("t3", "Start over"), usage("t3", 5000), done("t3"));
    const measured = threadCommands("claude", list, new Map([["t2", "cleared" as const]]));
    expect(measured.usageStale).toBe(false);
    expect(contextRing(list, measured.usageStale)).toMatchObject({ used: 5000 });
  });

  // A handoff's first message is the agent's text, sent as written and never as a command (ARCHITECTURE §7 'Handoff').
  test("a handoff's first message is no command turn, and names the title", () => {
    seq = 0;
    const origin = { kind: "handoff", conversationId: "source", canvas: { path: ".doan/canvases/a.html", id: "a" } };
    const list = [ev("t1", { type: "user.message", text: "/compact the layout into one column", anchors: [], origin }), ev("t1", { type: "turn.started" }), done("t1")];
    const commands = threadCommands("claude", list, new Map());
    expect([...commands.turns]).toEqual([]);
    expect(commandTurnLabel("claude", commands, "t1")).toBeNull();
    expect(firstTitleMessage("claude", list)).toMatchObject({ text: "/compact the layout into one column" });
  });

  test("a compact refreshes the ring from its own value", () => {
    const list = events();
    const commands = threadCommands("claude", list, new Map([["t2", "compacted" as const]]));
    expect(commands.usageStale).toBe(false);
    expect(contextRing(list.slice(0, 11), commands.usageStale)).toMatchObject({ used: 3600 });
  });
});

describe("titles and queue rows", () => {
  test("the title falls back to the first message that is not a command", () => {
    seq = 0;
    const list = [...message("t1", "/compact"), done("t1"), ...message("t2", "Make it darker"), done("t2")];
    expect(firstTitleMessage("claude", list)).toMatchObject({ type: "user.message", text: "Make it darker" });
    expect(firstTitleMessage("claude", list.slice(0, 3))).toBeUndefined();
    expect(firstTitleMessage("cursor", [...message("t1", "/compact")])).toMatchObject({ text: "/compact" });
  });

  test("a queued row is a command when its text is one the provider runs, or an unconfirmed ACP command", () => {
    expect(queuedCommand("claude", "/compact", [])).toBe(true);
    expect(queuedCommand("claude", "/clear", [])).toBe(true);
    expect(queuedCommand("claude", "Use the project skill `deploy`.\n\n/deploy", [])).toBe(false);
    expect(queuedCommand("copilot", "/share now", ["share"])).toBe(true);
    expect(queuedCommand("copilot", "/share now", [])).toBe(false);
    expect(queuedCommand("codex", "Tighten the footer", [])).toBe(false);
  });
});
