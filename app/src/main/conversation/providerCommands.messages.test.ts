import { describe, expect, it } from "vitest";
import { commandBoundary, commandName, passthroughCommands, passthroughName, unsupportedCommand } from "./providerCommands";

// A command message is the whole text send assembly writes for a command: "/<name>", or "/<name> <argument>". Main reads
// it the same way for a send and for a stored turn, so a turn reads as the same command in this run and after a restart.
describe("commandName", () => {
  it("names a listed command sent alone or with its argument", () => {
    expect(commandName("claude", "/compact")).toBe("compact");
    expect(commandName("claude", "/compact keep the API notes")).toBe("compact");
    expect(commandName("codex", "/review look at\nthe parser")).toBe("review");
    expect(commandName("copilot", "/rename poc-renamed")).toBe("rename");
    expect(commandName("cursor", "/copy-request-id")).toBe("copy-request-id");
  });
  it("reads Claude's /reset and /new as /clear, which they run as", () => {
    expect(commandName("claude", "/reset")).toBe("clear");
    expect(commandName("claude", "/new")).toBe("clear");
    expect(commandName("codex", "/new")).toBeNull();
  });
  it("names Antigravity's /plan, which a live check confirmed runs", () => {
    expect(commandName("antigravity", "/plan ship it")).toBe("plan");
    expect(commandName("antigravity", "/plan")).toBe("plan");
  });
  it("names nothing for a provider whose table lacks the command", () => {
    expect(commandName("codex", "/clear")).toBeNull();
    expect(commandName("copilot", "/clear")).toBeNull();
    expect(commandName("cursor", "/compact")).toBeNull();
  });
  it("names nothing for text that is not a whole command message", () => {
    for (const text of ["/Users/me/project/a.html", "hello /compact", " /compact", "/compact해줘", "/compacting", "Use the project skill `compact`.\n\n/compact", "/", ""])
      expect(commandName("claude", text)).toBeNull();
  });
});

// The guard behind the composer's card: a built-in Doan never runs is refused by main too. The first word is cut as the
// composer's highlight cuts it (attached Hangul, trailing punctuation), so main never refuses what the composer sent.
describe("unsupportedCommand", () => {
  it("names a terminal-only built-in at the start of the text, with or without more text", () => {
    expect(unsupportedCommand("claude", "/model")).toBe("model");
    expect(unsupportedCommand("claude", "/model opus please")).toBe("model");
    expect(unsupportedCommand("copilot", "  /logout")).toBe("logout");
    expect(unsupportedCommand("claude", "/model해줘")).toBe("model");
    expect(unsupportedCommand("claude", "/config,")).toBe("config");
  });
  it("names the candidates a provider does not run", () => {
    expect(unsupportedCommand("codex", "/clear")).toBe("clear");
    expect(unsupportedCommand("cursor", "/compact now")).toBe("compact");
  });
  it("names nothing for commands that run, paths, later words and unknown names", () => {
    expect(unsupportedCommand("claude", "/compact")).toBeNull();
    expect(unsupportedCommand("copilot", "/clear")).toBeNull();
    expect(unsupportedCommand("antigravity", "/plan ship it")).toBeNull();
    expect(unsupportedCommand("claude", "/Users/me/model")).toBeNull();
    expect(unsupportedCommand("claude", "/model/x")).toBeNull();
    expect(unsupportedCommand("claude", "/models")).toBeNull();
    expect(unsupportedCommand("claude", "switch /model")).toBeNull();
    expect(unsupportedCommand("claude", "Use the project skill `model`.\n\n/model")).toBeNull();
  });
});

describe("commandBoundary", () => {
  it("draws a compaction for every provider's /compact and a clear for Claude's /clear only", () => {
    expect(commandBoundary("claude", "compact")).toBe("compacted");
    expect(commandBoundary("codex", "compact")).toBe("compacted");
    expect(commandBoundary("copilot", "compact")).toBe("compacted");
    expect(commandBoundary("claude", "clear")).toBe("cleared");
    for (const [provider, name] of [["claude", "context"], ["codex", "review"], ["copilot", "rename"], ["cursor", "copy-request-id"]] as const)
      expect(commandBoundary(provider, name)).toBeNull();
  });
});

// An ACP server's reported command that no live check confirmed is sent as is (no wrapping), with no card.
describe("passthroughCommands", () => {
  it("keeps the reported names that are neither in the table nor a card", () => {
    expect(passthroughCommands("copilot", ["compact", "model", "permissions", "fleet", "plan"])).toEqual(["fleet", "plan"]);
    expect(passthroughCommands("antigravity", ["plan", "logout"])).toEqual([]);
    expect(passthroughCommands("cursor", ["copy-request-id", "rename-chat", "rename-chat"])).toEqual(["rename-chat"]);
  });
  it("lists none for Claude and Codex, whose tables are all Doan sends as commands", () => {
    expect(passthroughCommands("claude", ["fleet"])).toEqual([]);
    expect(passthroughCommands("codex", ["fleet"])).toEqual([]);
  });
});
describe("passthroughName", () => {
  it("names a whole message whose first word is a passed-through command", () => {
    expect(passthroughName("/fleet run the tests", ["fleet"])).toBe("fleet");
    expect(passthroughName("/fleet", ["fleet"])).toBe("fleet");
    for (const text of ["/fleets", " /fleet", "run /fleet", "/Users/fleet", "Use the project skill `fleet`.\n\n/fleet"]) expect(passthroughName(text, ["fleet"]), text).toBeNull();
  });
});
