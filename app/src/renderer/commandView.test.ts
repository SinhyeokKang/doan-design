import { describe, expect, it } from "vitest";
import type { SkillSummary } from "../main/conversation/types";
import { boundaryLabel, classifyFirstWord, commandCard, commandLists, commandRunningLabel, planSend } from "./commandView";

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
  // No rows yet (the list is being read, failed, or the provider is not connected): only cards are known.
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
    expect(planSend("/compact", preset, ["deploy"], 0, CLAUDE)).toEqual({ kind: "command", name: "compact", text: "/compact" });
    expect(planSend("/compact keep /deploy notes", preset, ["deploy"], 0, CLAUDE)).toEqual({ kind: "command", name: "compact", text: "/compact keep /deploy notes" });
  });
  it("sends the text after a command as its argument", () => {
    expect(planSend("/compact해줘", null, [], 0, CLAUDE)).toEqual({ kind: "command", name: "compact", text: "/compact 해줘" });
    expect(planSend("/review  the auth change ", null, [], 0, CLAUDE)).toEqual({ kind: "command", name: "review", text: "/review the auth change" });
  });
  it("sends nothing for a built-in Doan does not run", () => {
    expect(planSend("/model opus", preset, [], 0, CLAUDE)).toEqual({ kind: "unsupported", name: "model" });
  });
  it("composes anything else as before", () => {
    expect(planSend("/Users/me/a.png", preset, [], 0, CLAUDE)).toEqual({ kind: "message", text: "Use the Doan design preset `polish` (Polish).\n\n/Users/me/a.png" });
    expect(planSend("/deploy", null, ["deploy"], 0, CLAUDE)).toEqual({ kind: "message", text: "Use the project skill `deploy`.\n\n/deploy" });
  });
  // The shipped "/deploy /review" expectation (HomeComposerView.interaction.test.tsx): only the first word can be a
  // command, and a skill of the command's name still wins.
  it("keeps a later command word as text and a same-name skill as a skill", () => {
    const lists = commandLists("claude", [skill("review"), command("review")]);
    expect(planSend("/deploy /review", null, ["review"], 0, lists)).toEqual({ kind: "message", text: "Use the project skill `review`.\n\n/deploy /review" });
    expect(planSend("/review", null, ["review"], 0, lists)).toEqual({ kind: "message", text: "Use the project skill `review`.\n\n/review" });
    expect(planSend("/deploy /review", null, [], 0, CLAUDE)).toEqual({ kind: "message", text: "/deploy /review" });
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
  it("points Antigravity /logout to Settings > Agents and /plan to the permission picker", () => {
    expect(commandCard("antigravity", "logout")).toEqual({
      title: "/logout doesn’t run in Doan", body: "Sign out from Settings > Agents.", action: { label: "Open Agents settings", target: "agentsSettings" },
    });
    expect(commandCard("antigravity", "plan")).toEqual({
      title: "/plan doesn’t run in Doan", body: "Use Plan mode in the permission picker.", action: { label: "Open permission picker", target: "permissionPicker" },
    });
  });
  it("sends a command with no Doan equivalent to the provider's terminal", () => {
    expect(commandCard("codex", "clear")).toEqual({ title: "/clear doesn’t run in Doan", body: "Run it in Codex in a terminal.", action: null });
    expect(commandCard("copilot", "theme")).toEqual({ title: "/theme doesn’t run in Doan", body: "Run it in GitHub Copilot in a terminal.", action: null });
  });
});

describe("boundaryLabel", () => {
  it("labels the compaction and clear boundaries", () => {
    expect(boundaryLabel("compacted")).toBe("Context compacted — the agent keeps a summary of messages above");
    expect(boundaryLabel("cleared")).toBe("Context cleared — the agent won’t see messages above");
  });
});
