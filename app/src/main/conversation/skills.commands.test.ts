import { describe, expect, it } from "vitest";
import { acpCommandsAfter, allowedCommands, parseAcpCommands, parseClaudeCommands } from "./skills";
import claude318 from "./fixtures/skills-claude-2.1.318.json";

const command = (name: string, description: string) => ({ kind: "command" as const, name, description });
const acpUpdate = (...names: string[]) => ({
  sessionUpdate: "available_commands_update",
  availableCommands: names.map(name => ({ name, description: `Server ${name}.`, input: { hint: "text" } })),
});
const CLAUDE_ROWS = [
  command("clear", "Clear conversation history and free up context."),
  command("compact", "Clear conversation history but keep a summary in context."),
  command("context", ""),
  command("init", "Initialize a new CLAUDE.md file with codebase documentation"),
  command("review", "Review a pull request"),
  command("usage", "Show plan usage limits"),
];

describe("allowedCommands", () => {
  it("lists Claude's and Codex's fixed table at the confirmed version and later", () => {
    expect(allowedCommands("claude", "2.1.326")).toEqual(CLAUDE_ROWS);
    expect(allowedCommands("claude", "2.2.0")).toEqual(CLAUDE_ROWS);
    expect(allowedCommands("codex", "0.167.1")).toEqual([
      command("compact", "Summarize the conversation to free up context."),
      command("review", "Review the current changes."),
    ]);
  });
  it("lists no commands below the confirmed version", () => {
    expect(allowedCommands("claude", "2.1.325")).toEqual([]);
    expect(allowedCommands("codex", "0.167.0")).toEqual([]);
    expect(allowedCommands("copilot", "1.0.104", new Map([["compact", ""]]))).toEqual([]);
    expect(allowedCommands("cursor", "2026.10.21", new Map([["copy-request-id", ""]]))).toEqual([]);
  });
  it("compares the version core, so a build suffix does not hide the commands", () => {
    expect(allowedCommands("claude", "2.1.326+build.7")).toEqual(CLAUDE_ROWS);
    expect(allowedCommands("codex", "0.170.0-alpha.1+build.7")).toHaveLength(2);
    expect(allowedCommands("claude", "2.1.325+build.7")).toEqual([]);
  });
  // A provider that is not connected has no run that read its version: there is nothing to list.
  it("lists no commands for a provider whose version was not read", () => {
    for (const p of ["claude", "codex", "cursor", "copilot"] as const) expect(allowedCommands(p, undefined, new Map([["compact", ""]])), p).toEqual([]);
    expect(allowedCommands("claude", "not a version")).toEqual([]);
  });
  it("lists an ACP command only when the server reported it, with the server's description", () => {
    const reported = new Map([["compact", "Shrink the history."], ["plan", "Plan first."], ["usage", ""]]);
    expect(allowedCommands("copilot", "1.0.105", reported)).toEqual([command("compact", "Shrink the history."), command("usage", "")]);
    expect(allowedCommands("copilot", "1.0.105")).toEqual([]);
    expect(allowedCommands("cursor", "2026.10.22-27dcf5f", new Map([["copy-request-id", "Copy the last request ID."]]))).toEqual([command("copy-request-id", "Copy the last request ID.")]);
    expect(allowedCommands("antigravity", "1.3.0", new Map([["plan", ""], ["logout", ""]]))).toEqual([]);
  });
  // Claude's SDK list lacks /review (an alias of code-review), which runs, so the list only lends descriptions.
  it("keeps Claude's fixed rows whatever the SDK listed, and takes a real SDK description", () => {
    expect(allowedCommands("claude", "2.1.326", new Map([["compact", "Compact with a summary."]]))).toEqual(
      CLAUDE_ROWS.map(row => row.name === "compact" ? command("compact", "Compact with a summary.") : row));
  });
});

describe("parseClaudeCommands", () => {
  it("lists the fixed table from a recorded answer, keeping table copy over the SDK's placeholder description", () => {
    expect(parseClaudeCommands(claude318.commands, "2.1.326")).toEqual(CLAUDE_ROWS);
  });
  it("lists nothing below the confirmed version", () => {
    expect(parseClaudeCommands(claude318.commands, "2.1.318")).toEqual([]);
    expect(parseClaudeCommands(claude318.commands, undefined)).toEqual([]);
  });
  it("takes descriptions only from built-in rows", () => {
    expect(parseClaudeCommands([
      { name: "compact", description: "Project compact. (project)" },
      { name: "init", description: "Set up CLAUDE.md.\nMore.", builtin: true },
    ], "2.1.326")).toEqual(CLAUDE_ROWS.map(row => row.name === "init" ? command("init", "Set up CLAUDE.md.") : row));
  });
  // A broken answer fails the read, so the host keeps the last list it received (SkillCatalog).
  it("refuses an answer that is not a list", () => {
    for (const answer of [undefined, null, {}, "commands"]) expect(() => parseClaudeCommands(answer, "2.1.326")).toThrow("session_unavailable");
  });
});

describe("parseAcpCommands", () => {
  it("keeps the allowed commands the server reported, in table order", () => {
    expect(parseAcpCommands("copilot", acpUpdate("usage", "model", "compact", "plan", "review"), "1.0.105")).toEqual([
      command("compact", "Server compact."), command("review", "Server review."), command("usage", "Server usage."),
    ]);
    expect(parseAcpCommands("cursor", acpUpdate("rename-chat", "copy-request-id", "statusline"), "2026.10.22")).toEqual([command("copy-request-id", "Server copy-request-id.")]);
    expect(parseAcpCommands("antigravity", acpUpdate("plan", "logout"), undefined)).toEqual([]);
  });
  it("skips rows it cannot read and keeps a description's first line", () => {
    expect(parseAcpCommands("copilot", { sessionUpdate: "available_commands_update", availableCommands: [
      { name: "compact", description: "First.\nSecond." }, { name: "usage" }, "row", null, { description: "No name." }, { name: "two words" },
    ] }, "1.0.105")).toEqual([command("compact", "First."), command("usage", "")]);
  });
  it("refuses an update that is not a command list", () => {
    for (const update of [undefined, null, {}, { sessionUpdate: "agent_message_chunk", availableCommands: [] }, { sessionUpdate: "available_commands_update" }, { sessionUpdate: "available_commands_update", availableCommands: {} }]) {
      expect(() => parseAcpCommands("copilot", update, "1.0.105"), JSON.stringify(update)).toThrow("session_unavailable");
    }
  });
});

describe("acpCommandsAfter", () => {
  it("replaces the list with each update the connection sends", () => {
    const first = acpCommandsAfter(null, "conn-a", "copilot", acpUpdate("compact"), "1.0.105");
    expect(first).toEqual({ connectionId: "conn-a", commands: [command("compact", "Server compact.")] });
    expect(acpCommandsAfter(first, "conn-a", "copilot", acpUpdate("usage"), "1.0.105")).toEqual({ connectionId: "conn-a", commands: [command("usage", "Server usage.")] });
  });
  it("keeps the last list when an update cannot be read", () => {
    const first = acpCommandsAfter(null, "conn-a", "copilot", acpUpdate("compact"), "1.0.105");
    expect(acpCommandsAfter(first, "conn-a", "copilot", { sessionUpdate: "available_commands_update" }, "1.0.105")).toBe(first);
  });
  // POSTMORTEM 2026-11-06 (the Codex model list stayed the previous account's): a list belongs to the connection
  // that sent it.
  it("drops another connection's list, even when the new connection's update cannot be read", () => {
    const old = acpCommandsAfter(null, "conn-a", "copilot", acpUpdate("compact"), "1.0.105");
    expect(acpCommandsAfter(old, "conn-b", "copilot", { broken: true }, "1.0.105")).toBeNull();
    expect(acpCommandsAfter(old, "conn-b", "copilot", acpUpdate("usage"), "1.0.105")).toEqual({ connectionId: "conn-b", commands: [command("usage", "Server usage.")] });
  });
});
