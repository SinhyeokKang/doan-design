import { describe, expect, it } from "vitest";
import type { ConversationEvent, SkillSummary } from "../main/conversation/types";
import { boundaryLabel, classifyFirstWord, commandCard, commandLists, commandRunningLabel, firstTitleMessage, planSend, STALE_MODE_CARD, threadCommands } from "./commandView";

const skill = (name: string): SkillSummary => ({ kind: "skill", name, description: "" });
const command = (name: string): SkillSummary => ({ kind: "command", name, description: "" });
const CLAUDE = commandLists("claude", [skill("deploy"), command("clear"), command("compact"), command("context"), command("review")]);
const preset = { id: "polish", title: "Polish" };

describe("commandLists", () => {
  it("splits the rows into skills, commands and the provider's card commands", () => {
    expect(CLAUDE.skills).toEqual(new Set(["deploy"]));
    expect(CLAUDE.commands).toEqual(new Set(["clear", "compact", "context", "review"]));
    expect(CLAUDE.unsupported).toEqual(new Set(["config", "login", "logout", "model", "permissions", "theme"]));
  });
  // A project skill wins over a command or a card of the same name.
  it("leaves a command or card out when a project skill has its name", () => {
    const lists = commandLists("claude", [skill("context"), skill("model"), command("context"), command("compact")]);
    expect(lists.skills).toEqual(new Set(["context", "model"]));
    expect(lists.commands).toEqual(new Set(["compact"]));
    expect(lists.unsupported.has("model")).toBe(false);
  });
  // No rows: the list is being read, failed, or the provider is not connected.
  it("knows no commands without rows", () => {
    const lists = commandLists("codex", []);
    expect(lists.commands).toEqual(new Set());
    expect(lists.unsupported).toEqual(new Set(["clear", "config", "context", "cost", "init", "login", "logout", "model", "permissions", "theme"]));
  });
});

describe("classifyFirstWord", () => {
  it("reads an allowed command and the text after it", () => {
    expect(classifyFirstWord("/compact", CLAUDE)).toEqual({ kind: "command", name: "compact", args: "" });
    expect(classifyFirstWord("/compact keep the API notes", CLAUDE)).toEqual({ kind: "command", name: "compact", args: "keep the API notes" });
    expect(classifyFirstWord("  /review the auth change\nand tests ", CLAUDE)).toEqual({ kind: "command", name: "review", args: "the auth change\nand tests" });
  });
  // Claude runs /reset and /new as /clear; only /clear is listed.
  it("reads Claude's /clear aliases as /clear", () => {
    expect(classifyFirstWord("/reset", CLAUDE)).toEqual({ kind: "command", name: "clear", args: "" });
    expect(classifyFirstWord("/new start over", CLAUDE)).toEqual({ kind: "command", name: "clear", args: "start over" });
    expect(classifyFirstWord("/reset", commandLists("claude", [command("compact")]))).toEqual({ kind: "text" });
    expect(classifyFirstWord("/reset", commandLists("claude", [skill("reset"), command("clear")]))).toEqual({ kind: "skill", name: "reset" });
    expect(classifyFirstWord("/new", commandLists("copilot", [command("compact")]))).toEqual({ kind: "text" });
  });
  it("cuts a command word at attached Hangul as the skill highlight does", () => {
    expect(classifyFirstWord("/compact해줘", CLAUDE)).toEqual({ kind: "command", name: "compact", args: "해줘" });
  });
  it("reads a built-in Doan does not run as a card", () => {
    expect(classifyFirstWord("/model opus", CLAUDE)).toEqual({ kind: "unsupported", name: "model" });
    const antigravity = commandLists("antigravity", []);
    expect(classifyFirstWord("/logout", antigravity)).toEqual({ kind: "unsupported", name: "logout" });
    expect(classifyFirstWord("/plan the pricing page", antigravity)).toEqual({ kind: "unsupported", name: "plan" });
    expect(classifyFirstWord("/clear", commandLists("codex", [command("compact"), command("review")]))).toEqual({ kind: "unsupported", name: "clear" });
  });
  it("reads a project skill before a command of the same name", () => {
    const lists = commandLists("claude", [skill("context"), command("context")]);
    expect(classifyFirstWord("/context", lists)).toEqual({ kind: "skill", name: "context" });
  });
  it("reads anything else as text", () => {
    for (const text of ["/Users/me/Desktop/shot.png look", "/compacted", "please /compact", "/deploy now", "", "compact"]) {
      expect(classifyFirstWord(text, CLAUDE), text).toEqual(text.startsWith("/deploy") ? { kind: "skill", name: "deploy" } : { kind: "text" });
    }
  });
  // A command the ACP server lists that no live check confirmed goes out as text, with no card.
  it("reads an unconfirmed ACP command as text", () => {
    expect(classifyFirstWord("/plan the page", commandLists("copilot", [command("compact")]))).toEqual({ kind: "text" });
    expect(classifyFirstWord("/rename-chat new", commandLists("cursor", [command("copy-request-id")]))).toEqual({ kind: "text" });
  });
});

describe("planSend", () => {
  it("sends a command alone, without preset or skill lines", () => {
    expect(planSend("/compact", preset, ["deploy"], 0, CLAUDE)).toEqual({ kind: "command", name: "compact", text: "/compact", sendsAttachments: false });
    expect(planSend("/compact keep /deploy notes", preset, ["deploy"], 0, CLAUDE)).toEqual({ kind: "command", name: "compact", text: "/compact keep /deploy notes", sendsAttachments: false });
  });
  it("sends Claude's /clear aliases as /clear", () => {
    expect(planSend("/reset", null, [], 0, CLAUDE)).toEqual({ kind: "command", name: "clear", text: "/clear", sendsAttachments: false });
    expect(planSend("/new", preset, [], 0, CLAUDE)).toEqual({ kind: "command", name: "clear", text: "/clear", sendsAttachments: false });
  });
  it("sends the text after a command as its argument", () => {
    expect(planSend("/compact해줘", null, [], 0, CLAUDE)).toEqual({ kind: "command", name: "compact", text: "/compact 해줘", sendsAttachments: false });
    expect(planSend("/review  the auth change ", null, [], 0, CLAUDE)).toEqual({ kind: "command", name: "review", text: "/review the auth change", sendsAttachments: false });
  });
  // The command alone goes out; attached files stay in the composer for the next message.
  it("never sends attachments with a command", () => {
    expect(planSend("/compact", null, [], 2, CLAUDE)).toEqual({ kind: "command", name: "compact", text: "/compact", sendsAttachments: false });
    expect(planSend("Look at these", null, [], 2, CLAUDE)).toEqual({ kind: "message", text: "Look at these", sendsAttachments: true });
    expect(planSend("", null, [], 2, CLAUDE)).toEqual({ kind: "message", text: "Look at the attached files.", sendsAttachments: true });
  });
  it("sends nothing for a built-in Doan does not run", () => {
    expect(planSend("/model opus", preset, [], 0, CLAUDE)).toEqual({ kind: "unsupported", name: "model" });
  });
  it("composes anything else as before", () => {
    expect(planSend("/Users/me/a.png", preset, [], 0, CLAUDE)).toEqual({ kind: "message", text: "Use the Doan design preset `polish` (Polish).\n\n/Users/me/a.png", sendsAttachments: true });
    expect(planSend("/deploy", null, ["deploy"], 0, CLAUDE)).toEqual({ kind: "message", text: "Use the project skill `deploy`.\n\n/deploy", sendsAttachments: true });
  });
  // Only the first word can be a command (HomeComposerView.interaction.test.tsx expects it too).
  it("keeps a later command word as text and a same-name skill as a skill", () => {
    const lists = commandLists("claude", [skill("review"), command("review")]);
    expect(planSend("/deploy /review", null, ["review"], 0, lists)).toEqual({ kind: "message", text: "Use the project skill `review`.\n\n/deploy /review", sendsAttachments: true });
    expect(planSend("/review", null, ["review"], 0, lists)).toEqual({ kind: "message", text: "Use the project skill `review`.\n\n/review", sendsAttachments: true });
    expect(planSend("/deploy /review", null, [], 0, CLAUDE)).toEqual({ kind: "message", text: "/deploy /review", sendsAttachments: true });
  });
});

describe("commandRunningLabel", () => {
  it("names the commands that have their own running label", () => {
    expect(commandRunningLabel("claude", "compact")).toBe("Compacting…");
    expect(commandRunningLabel("codex", "compact")).toBe("Compacting…");
    expect(commandRunningLabel("copilot", "compact")).toBe("Compacting…");
    expect(commandRunningLabel("claude", "clear")).toBe("Clearing context…");
    expect(commandRunningLabel("codex", "review")).toBe("Reviewing…");
  });
  it("leaves every other command to the shipped turn progress", () => {
    for (const [p, name] of [["claude", "review"], ["claude", "context"], ["claude", "init"], ["copilot", "review"], ["cursor", "copy-request-id"]] as const) {
      expect(commandRunningLabel(p, name), `${p} ${name}`).toBeNull();
    }
  });
});

describe("commandCard", () => {
  it("points /model to the model picker", () => {
    for (const p of ["claude", "copilot", "codex"] as const) expect(commandCard(p, "model"), p).toEqual({
      title: "/model doesn’t run in Doan", body: "Choose the model from the model picker.", action: { label: "Open model picker", target: "modelPicker" },
    });
  });
  it("points Antigravity /logout to Settings > Agents", () => {
    expect(commandCard("antigravity", "logout")).toEqual({
      title: "/logout doesn’t run in Doan", body: "Sign out from Settings > Agents.", action: { label: "Open Agents settings", target: "agentsSettings" },
    });
  });
  // Antigravity's permission picker has no Plan mode, so this card points nowhere; it says why and what to do instead.
  it("tells why Antigravity /plan does not run, without pointing to the permission picker", () => {
    expect(commandCard("antigravity", "plan")).toEqual({
      title: "/plan doesn’t run in Doan", body: "Doan can’t show Antigravity’s plan approval yet. Ask for a plan in a message instead.", action: null,
    });
  });
  it("points /logout and /login to Settings > Agents and /permissions to the permission picker for every provider", () => {
    for (const p of ["claude", "codex", "cursor", "copilot", "antigravity"] as const) {
      expect(commandCard(p, "logout"), p).toEqual({ title: "/logout doesn’t run in Doan", body: "Sign out from Settings > Agents.", action: { label: "Open Agents settings", target: "agentsSettings" } });
      expect(commandCard(p, "login"), p).toEqual({ title: "/login doesn’t run in Doan", body: "Sign in from Settings > Agents.", action: { label: "Open Agents settings", target: "agentsSettings" } });
      expect(commandCard(p, "permissions"), p).toEqual({ title: "/permissions doesn’t run in Doan", body: "Choose permissions from the permission picker.", action: { label: "Open permission picker", target: "permissionPicker" } });
    }
  });
  it("sends a command with no Doan equivalent to the provider's terminal", () => {
    expect(commandCard("codex", "clear")).toEqual({ title: "/clear doesn’t run in Doan", body: "Run it in Codex in a terminal.", action: null });
    expect(commandCard("copilot", "theme")).toEqual({ title: "/theme doesn’t run in Doan", body: "Run it in GitHub Copilot in a terminal.", action: null });
    expect(commandCard("claude", "config")).toEqual({ title: "/config doesn’t run in Doan", body: "Run it in Claude Code in a terminal.", action: null });
  });
});

describe("boundaryLabel", () => {
  it("labels the compaction and clear boundaries", () => {
    expect(boundaryLabel("compacted")).toBe("Context compacted — the agent keeps a summary of messages above");
    expect(boundaryLabel("cleared")).toBe("Context cleared — the agent won’t see messages above");
  });
});

// An unconfirmed ACP command goes out as its own text (no preset, skill line or wrapping), with no card or row;
// the server handles it. Only the conversation's current list counts.
describe("unconfirmed ACP commands", () => {
  const COPILOT = commandLists("copilot", [command("compact")], ["compact", "model", "fleet", "plan", "deploy"]);
  it("passes on the server's names that are neither listed, a card, nor a skill", () => {
    expect(COPILOT.passthrough).toEqual(new Set(["fleet", "plan", "deploy"]));
    expect(commandLists("copilot", [skill("deploy"), command("compact")], ["deploy", "fleet"]).passthrough).toEqual(new Set(["fleet"]));
    expect(commandLists("copilot", [command("compact")]).passthrough).toEqual(new Set());
  });
  it("reads such a first word as a command that is sent as is", () => {
    expect(classifyFirstWord("/fleet run the tests", COPILOT)).toEqual({ kind: "passthrough", name: "fleet", args: "run the tests" });
    expect(classifyFirstWord("/plan해줘", COPILOT)).toEqual({ kind: "passthrough", name: "plan", args: "해줘" });
    expect(classifyFirstWord("/model", COPILOT)).toEqual({ kind: "unsupported", name: "model" });
    expect(classifyFirstWord("/compact", COPILOT)).toEqual({ kind: "command", name: "compact", args: "" });
    expect(classifyFirstWord("please /fleet", COPILOT)).toEqual({ kind: "text" });
  });
  it("sends it alone, without preset or skill lines and without attachments", () => {
    expect(planSend("/fleet  run the tests ", preset, ["deploy"], 2, COPILOT)).toEqual({ kind: "passthrough", name: "fleet", text: "/fleet run the tests", sendsAttachments: false });
    expect(planSend("/fleet", null, [], 0, COPILOT)).toEqual({ kind: "passthrough", name: "fleet", text: "/fleet", sendsAttachments: false });
    expect(planSend("/Users/me/a.png", null, [], 0, COPILOT)).toEqual({ kind: "message", text: "/Users/me/a.png", sendsAttachments: true });
  });
});

describe("STALE_MODE_CARD", () => {
  it("asks for a message first, with no action", () => {
    expect(STALE_MODE_CARD).toEqual({ title: "/review can’t use the new permission mode yet", body: "Send a message first so Codex picks up the permission mode, then run /review again.", action: null });
  });
});

// A received handoff's message is the earlier agent's text (origin), drawn as the handoff bubble, never as a command turn.
describe("a received handoff's first message", () => {
  const origin = { kind: "handoff" as const, conversationId: "c0", canvas: { path: ".doan/canvases/drafts.html", id: "drafts" } };
  const message = { v: 1, conversationId: "c2", seq: 1, turnId: "t1", at: "2026-11-25T05:00:00.000Z", type: "user.message", text: "/compact the layout into one column", anchors: [], origin } as unknown as ConversationEvent;
  it("is no command turn, whatever word it starts with, and titles the conversation", () => {
    expect(threadCommands("claude", [message], new Map()).turns.size).toBe(0);
    expect(firstTitleMessage("claude", [message])).toBe(message);
  });
});
