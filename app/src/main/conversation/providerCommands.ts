import type { Provider } from "../agentAuth/types";
import type { BoundaryKind } from "./commandRecords";

// Provider built-in commands Doan runs: the oldest CLI version that ran each provider's commands, then the commands;
// moving either is a decision backed by a live check. Own module: the renderer reads it and must not load sessions.ts.

// description: Doan's copy, shown when the provider reports none. An ACP row takes the server's own description.
export interface CommandEntry { name: string; description: string }
export const COMMAND_ALLOWLIST: Record<Provider, { version: string; commands: readonly CommandEntry[] }> = {
  claude: { version: "2.1.326", commands: [
    { name: "clear", description: "Clear conversation history and free up context." },
    { name: "compact", description: "Clear conversation history but keep a summary in context." },
    { name: "context", description: "" },
    { name: "init", description: "Initialize a new CLAUDE.md file with codebase documentation" },
    // Not in the SDK's command list (an alias of the bundled code-review), yet it runs.
    { name: "review", description: "Review a pull request" },
    { name: "usage", description: "Show plan usage limits" },
  ] },
  codex: { version: "0.167.1", commands: [
    { name: "compact", description: "Summarize the conversation to free up context." },
    { name: "review", description: "Review the current changes." },
  ] },
  cursor: { version: "2026.10.22", commands: [{ name: "copy-request-id", description: "" }] },
  copilot: { version: "1.0.105", commands: ["compact", "context", "init", "rename", "review", "session", "usage"].map(name => ({ name, description: "" })) },
  antigravity: { version: "1.3.0", commands: [] },
};

// Other names a provider runs one of its allowed commands under. They are not listed (only the command is), but typed
// they run as the command does: Claude's /reset and /new clear the context and change the session id as /clear does.
export const COMMAND_ALIASES: Record<Provider, Readonly<Record<string, string>>> = {
  claude: { new: "clear", reset: "clear" }, codex: {}, cursor: {}, copilot: {}, antigravity: {},
};

// Built-ins never sent: Doan shows a card and gives the text back. Terminal-only commands Doan has UI for, ones the model
// only claims to run where not allowed, Antigravity's /logout (erases Doan's sign-in) and /plan (awaits an approval).
const TERMINAL_ONLY = ["config", "login", "logout", "model", "permissions", "theme"];
const CANDIDATES = ["clear", "compact", "context", "cost", "init", "review"];
const notAllowed = (provider: Provider) => CANDIDATES.filter(name => !COMMAND_ALLOWLIST[provider].commands.some(c => c.name === name));
export const UNSUPPORTED_COMMANDS: Record<Provider, readonly string[]> = {
  claude: TERMINAL_ONLY,
  codex: [...TERMINAL_ONLY, ...notAllowed("codex")],
  cursor: [...TERMINAL_ONLY, ...notAllowed("cursor")],
  copilot: TERMINAL_ONLY,
  antigravity: [...TERMINAL_ONLY, ...notAllowed("antigravity"), "plan"],
};

// Codex runs its commands only as app-server requests: text "/compact" reaches the model, which claims it compacted.
// The params leave out threadId, which the runner adds.
export type ReviewTarget = { type: "uncommittedChanges" } | { type: "custom"; instructions: string };
export type CommandRequest =
  | { kind: "text"; text: string }
  | { kind: "request"; method: "thread/compact/start"; params: Record<string, never> }
  | { kind: "request"; method: "review/start"; params: { target: ReviewTarget } };
// text: a command message as send assembly wrote it, "/<name>" and then its argument after one space.
export function commandRequest(provider: Provider, text: string): CommandRequest {
  const match = provider === "codex" ? /^\/(compact|review)(?:\s+([\s\S]*))?$/.exec(text) : null;
  if (!match) return { kind: "text", text };
  // thread/compact/start takes no instructions, so text after /compact has nowhere to go.
  if (match[1] === "compact") return { kind: "request", method: "thread/compact/start", params: {} };
  // Branch and commit targets are written as text too, so any text is custom instructions.
  const instructions = match[2]?.trim() ?? "";
  return { kind: "request", method: "review/start", params: { target: instructions ? { type: "custom", instructions } : { type: "uncommittedChanges" } } };
}

// A command message, "/<name>" or "/<name> <argument>", named by the provider's table (an alias as its command). A send
// and a stored turn read the same, from the whole table, since the record keeps no version or ACP list.
export function commandName(provider: Provider, text: string): string | null {
  const match = /^\/(\S+)(?:\s[\s\S]*)?$/.exec(text);
  if (!match) return null;
  const name = COMMAND_ALIASES[provider][match[1]!] ?? match[1]!;
  return COMMAND_ALLOWLIST[provider].commands.some(c => c.name === name) ? name : null;
}
// A stored message's command, as main sent it: a handoff's first message (origin) is the agent's text, which a handoff
// start sends as written and never as a command, whatever word it starts with.
export function messageCommand(provider: Provider, message: { text: string; origin?: unknown }): string | null {
  return message.origin === undefined ? commandName(provider, message.text) : null;
}

// The first word's command name as the composer's highlight cuts it (renderer skillWords.ts): without trailing
// punctuation, or up to attached Hangul, so main never refuses text the composer sent as a message.
const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/u;
const TRAILING = /[.,;:!?)\]}"'’”…。、，．！？：；）」』]+$/u;
function firstWordNames(text: string): string[] {
  const word = /^[^\p{White_Space}]+/u.exec(text.trimStart())?.[0];
  if (!word?.startsWith("/")) return [];
  const name = word.slice(1), names = new Set([name, name.replace(TRAILING, "")]);
  for (let i = 1; i < name.length; i++) if (!HANGUL.test(name[i - 1]!) && HANGUL.test(name[i]!)) names.add(name.slice(0, i));
  return [...names].filter(candidate => candidate.length > 0);
}
// A built-in Doan never sends, as the text's first word: the composer shows its card instead, and main refuses one that
// reaches it anyway.
export function unsupportedCommand(provider: Provider, text: string): string | null {
  return firstWordNames(text).find(name => UNSUPPORTED_COMMANDS[provider].includes(name)) ?? null;
}

// The boundary a command draws once it ran: /compact wherever it runs, and Claude's /clear (the only provider whose
// /clear empties the context).
export function commandBoundary(provider: Provider, name: string): BoundaryKind | null {
  if (name === "compact") return "compacted";
  return provider === "claude" && name === "clear" ? "cleared" : null;
}

// An ACP server's reported commands that no live check confirmed: sent as the person wrote them, with no row and no card.
// Claude's and Codex's built-ins are only the table's.
export function passthroughCommands(provider: Provider, reported: readonly string[]): string[] {
  if (provider === "claude" || provider === "codex") return [];
  const known = new Set([...COMMAND_ALLOWLIST[provider].commands.map(c => c.name), ...UNSUPPORTED_COMMANDS[provider]]);
  return [...new Set(reported)].filter(name => !known.has(name));
}
// A whole message "/<name>" or "/<name> <argument>" whose name is one of those, as send assembly writes it.
export function passthroughName(text: string, passthrough: readonly string[]): string | null {
  const name = /^\/(\S+)(?:\s[\s\S]*)?$/.exec(text)?.[1];
  return name !== undefined && passthrough.includes(name) ? name : null;
}
