import { describe, expect, it } from "vitest";
import { PROVIDERS } from "../agentAuth/types";
import { COMMAND_ALLOWLIST, UNSUPPORTED_COMMANDS, commandRequest } from "./providerCommands";

describe("COMMAND_ALLOWLIST", () => {
  it("holds the commands and versions the PoC confirmed per provider", () => {
    const names = Object.fromEntries(PROVIDERS.map(p => [p, COMMAND_ALLOWLIST[p].commands.map(c => c.name)]));
    expect(names).toEqual({
      claude: ["clear", "compact", "context", "init", "review", "usage"],
      codex: ["compact", "review"],
      cursor: ["copy-request-id"],
      copilot: ["compact", "context", "init", "rename", "review", "session", "usage"],
      antigravity: ["plan"],
    });
    expect(Object.fromEntries(PROVIDERS.map(p => [p, COMMAND_ALLOWLIST[p].version]))).toEqual({
      claude: "2.1.326", codex: "0.167.1", cursor: "2026.10.22", copilot: "1.0.105", antigravity: "1.3.0",
    });
  });
  it("gives Codex's commands Doan copy, since app-server reports none", () => {
    expect(COMMAND_ALLOWLIST.codex.commands).toEqual([
      { name: "compact", description: "Summarize the conversation to free up context." },
      { name: "review", description: "Review the current changes." },
    ]);
  });
  it("leaves out Claude's /cost, which the provider lists as /usage", () => {
    expect(COMMAND_ALLOWLIST.claude.commands.map(c => c.name)).not.toContain("cost");
  });
});

describe("UNSUPPORTED_COMMANDS", () => {
  const terminalOnly = ["config", "login", "logout", "model", "permissions", "theme"];
  it("names every provider's terminal-only commands", () => {
    for (const p of PROVIDERS) expect(UNSUPPORTED_COMMANDS[p], p).toEqual(expect.arrayContaining(terminalOnly));
  });
  it("names the PoC candidates that did not run where they are not allowed", () => {
    expect(UNSUPPORTED_COMMANDS.codex).toEqual(expect.arrayContaining(["clear", "init", "context", "cost"]));
    for (const p of ["cursor", "antigravity"] as const) expect(UNSUPPORTED_COMMANDS[p], p).toEqual(expect.arrayContaining(["compact", "clear", "init", "review", "context", "cost"]));
    expect(UNSUPPORTED_COMMANDS.antigravity).toEqual(expect.arrayContaining(["logout"]));
    expect(UNSUPPORTED_COMMANDS.antigravity).not.toContain("plan");
  });
  it("never names an allowed command", () => {
    for (const p of PROVIDERS) for (const c of COMMAND_ALLOWLIST[p].commands) expect(UNSUPPORTED_COMMANDS[p], `${p} ${c.name}`).not.toContain(c.name);
  });
  // An ACP command the server lists but no live check confirmed goes out as text for the server to handle, so it is not a card.
  it("leaves unconfirmed ACP commands out", () => {
    expect(UNSUPPORTED_COMMANDS.copilot).not.toContain("plan");
    expect(UNSUPPORTED_COMMANDS.cursor).not.toContain("rename-chat");
  });
});

describe("commandRequest", () => {
  it("sends Claude and ACP commands as their text", () => {
    for (const p of ["claude", "cursor", "copilot", "antigravity"] as const) {
      expect(commandRequest(p, "/compact keep the API notes")).toEqual({ kind: "text", text: "/compact keep the API notes" });
    }
  });
  it("maps Codex /compact to thread/compact/start", () => {
    expect(commandRequest("codex", "/compact")).toEqual({ kind: "request", method: "thread/compact/start", params: {} });
  });
  // thread/compact/start takes no instructions.
  it("maps Codex /compact with text to the same request", () => {
    expect(commandRequest("codex", "/compact keep the API notes")).toEqual({ kind: "request", method: "thread/compact/start", params: {} });
  });
  it("reviews Codex's uncommitted changes when /review has no text", () => {
    expect(commandRequest("codex", "/review")).toEqual({ kind: "request", method: "review/start", params: { target: { type: "uncommittedChanges" } } });
    expect(commandRequest("codex", "/review   ")).toEqual({ kind: "request", method: "review/start", params: { target: { type: "uncommittedChanges" } } });
  });
  it("sends the text after Codex /review as custom instructions", () => {
    expect(commandRequest("codex", "/review the base branch main\nfocus on auth")).toEqual({
      kind: "request", method: "review/start", params: { target: { type: "custom", instructions: "the base branch main\nfocus on auth" } },
    });
  });
  it("sends any other Codex text as an ordinary turn", () => {
    for (const text of ["Review the changes", "/reviewer", "/clear", "/Users/me/a.png"]) expect(commandRequest("codex", text), text).toEqual({ kind: "text", text });
  });
});
