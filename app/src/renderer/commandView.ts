import type { Provider } from "../main/agentAuth/types";
import type { BoundaryKind } from "../main/conversation/commandRecords";
import { COMMAND_ALIASES, commandName, messageCommand, passthroughCommands, passthroughName, UNSUPPORTED_COMMANDS } from "../main/conversation/providerCommands";
import type { ConversationEvent, SkillSummary } from "../main/conversation/types";
import { PROVIDER_NAMES } from "./agentAuthView";
import { composeRequest, type PresetRef } from "./homeComposer";
import { skillWords } from "./skillWords";

// Pure parts of provider built-in commands in the composers and the thread. Copy follows the confirmed draft
// `.doan/canvases/provider-commands.html`.

// The names a first word is read against. A project skill wins over a command, an alias or a card of its name.
// aliases: an unlisted name and the listed command it runs as, only while that command is listed. passthrough: the ACP
// conversation's server-reported commands no live check confirmed (conversation:skills `passthrough`), sent as written.
export interface CommandLists { skills: ReadonlySet<string>; commands: ReadonlySet<string>; aliases: ReadonlyMap<string, string>; unsupported: ReadonlySet<string>; passthrough: ReadonlySet<string> }
export function commandLists(provider: Provider, rows: readonly SkillSummary[], reported: readonly string[] = []): CommandLists {
  const skills = new Set(rows.filter(r => r.kind === "skill").map(r => r.name));
  const commands = new Set(rows.filter(r => r.kind === "command" && !skills.has(r.name)).map(r => r.name));
  const aliases = new Map(Object.entries(COMMAND_ALIASES[provider]).filter(([alias, name]) => commands.has(name) && !skills.has(alias)));
  const passthrough = new Set(passthroughCommands(provider, reported).filter(name => !skills.has(name) && !commands.has(name) && !aliases.has(name)));
  return { skills, commands, aliases, unsupported: new Set(UNSUPPORTED_COMMANDS[provider].filter(name => !skills.has(name) && !commands.has(name))), passthrough };
}

// Only the first word can be a command: a provider runs a command only at the start of the message. It is cut as the
// skill highlight cuts a word (attached Hangul, trailing punctuation), so the highlight and the send agree.
export type FirstWord =
  | { kind: "command"; name: string; args: string }
  | { kind: "passthrough"; name: string; args: string }
  | { kind: "unsupported"; name: string }
  | { kind: "skill"; name: string }
  | { kind: "text" };
export function classifyFirstWord(text: string, lists: CommandLists): FirstWord {
  const trimmed = text.trimStart();
  const names = new Set([...lists.skills, ...lists.commands, ...lists.aliases.keys(), ...lists.unsupported, ...lists.passthrough]);
  const run = skillWords(trimmed, names).find(r => r.start === 0);
  if (!run) return { kind: "text" };
  if (lists.skills.has(run.name)) return { kind: "skill", name: run.name };
  const name = lists.aliases.get(run.name) ?? run.name;
  if (lists.commands.has(name)) return { kind: "command", name, args: trimmed.slice(run.end).trim() };
  if (lists.passthrough.has(name)) return { kind: "passthrough", name, args: trimmed.slice(run.end).trim() };
  return { kind: "unsupported", name: run.name };
}

// A command goes out alone: no preset or skill line, which would put it after the first line where the provider no
// longer reads it as a command, and none of the composer's attachments, which stay there for the next message (a Codex
// command request has no place for them). It is sent under its listed name, an alias as the command, and its argument
// follows after one space, also when the person wrote it attached.
// unsupported: nothing is sent; the composer shows the card and keeps the text and attachments.
// passthrough: an unconfirmed ACP command, sent the same way with no running label or boundary.
export type SendPlan =
  | { kind: "message"; text: string; sendsAttachments: true }
  | { kind: "command" | "passthrough"; name: string; text: string; sendsAttachments: false }
  | { kind: "unsupported"; name: string };
export function planSend(text: string, preset: PresetRef | null, skills: readonly string[], attachments: number, lists: CommandLists): SendPlan {
  const first = classifyFirstWord(text, lists);
  if (first.kind === "command" || first.kind === "passthrough") return { kind: first.kind, name: first.name, text: first.args ? `/${first.name} ${first.args}` : `/${first.name}`, sendsAttachments: false };
  if (first.kind === "unsupported") return first;
  return { kind: "message", text: composeRequest(text, preset, skills, attachments), sendsAttachments: true };
}

// A running command turn's label; the others keep the shipped turn progress.
export function commandRunningLabel(provider: Provider, name: string): string | null {
  if (name === "compact") return "Compacting…";
  if (provider === "claude" && name === "clear") return "Clearing context…";
  if (provider === "codex" && name === "review") return "Reviewing…";
  return null;
}

export type CommandCardTarget = "modelPicker" | "permissionPicker" | "agentsSettings";
export interface CommandCard { title: string; body: string; action: { label: string; target: CommandCardTarget } | null }
// A built-in Doan does not run: where Doan has the same feature, the card points to it; otherwise to the provider's
// terminal. The name is plain text, not code style.
export function commandCard(provider: Provider, name: string): CommandCard {
  const title = `/${name} doesn’t run in Doan`;
  if (name === "model") return { title, body: "Choose the model from the model picker.", action: { label: "Open model picker", target: "modelPicker" } };
  if (name === "permissions") return { title, body: "Choose permissions from the permission picker.", action: { label: "Open permission picker", target: "permissionPicker" } };
  // Sent, Antigravity's /logout erases Doan's own sign-in; every provider's sign-in and sign-out live in Settings > Agents.
  if (name === "logout") return { title, body: "Sign out from Settings > Agents.", action: { label: "Open Agents settings", target: "agentsSettings" } };
  if (name === "login") return { title, body: "Sign in from Settings > Agents.", action: { label: "Open Agents settings", target: "agentsSettings" } };
  if (provider === "antigravity" && name === "plan") return { title, body: "Use Plan mode in the permission picker.", action: { label: "Open permission picker", target: "permissionPicker" } };
  return { title, body: `Run it in ${PROVIDER_NAMES[provider]} in a terminal.`, action: null };
}

// Main's refusal of a Codex /review (command_mode_stale): review/start takes no permission mode, so the review would run
// in the mode the thread was last told on a turn, not the picker's. The text goes back to the composer.
export const STALE_MODE_CARD: CommandCard = { title: "/review can’t use the new permission mode yet", body: "Send a message first so Codex picks up the permission mode, then run /review again.", action: null };

export function boundaryLabel(kind: BoundaryKind): string {
  return kind === "compacted" ? "Context compacted — the agent keeps a summary of messages above" : "Context cleared — the agent won’t see messages above";
}

// The chips row's line while the field starts with a command: the preset chip stays in the draft but leaves the row,
// and comes back once the command word is gone.
export const PRESET_NOTICE = "Presets don’t apply to commands";

// The thread's command turns: each command turn's name, from its own first message as main reads a stored turn
// (providerCommands messageCommand), and the boundaries the read and this run's conversation:boundary signals gave.
// usageStale: the last boundary is a clear and no later turn reported a context value, so the record's last value is the
// previous session's; the ring shows none until a turn measures the new session (nothing is made up meanwhile).
export interface ThreadCommands { turns: ReadonlyMap<string, string>; boundaries: ReadonlyMap<string, BoundaryKind>; usageStale: boolean }
export function threadCommands(provider: Provider, events: readonly ConversationEvent[], boundaries: ReadonlyMap<string, BoundaryKind>): ThreadCommands {
  const turns = new Map<string, string>(), order: string[] = [], opened = new Set<string>(), measured = new Set<string>();
  for (const event of events) {
    // A message steered into a turn later is not the turn's command.
    if (event.type === "user.message" && !opened.has(event.turnId)) {
      opened.add(event.turnId); order.push(event.turnId);
      const name = messageCommand(provider, event);
      if (name) turns.set(event.turnId, name);
    }
    if (event.type === "context.usage") measured.add(event.turnId);
  }
  const cleared = order.filter(turnId => boundaries.get(turnId) === "cleared").at(-1);
  const after = cleared === undefined ? -1 : order.indexOf(cleared);
  return { turns, boundaries, usageStale: after !== -1 && !order.slice(after + 1).some(turnId => measured.has(turnId)) };
}

// A running command turn's indicator label; null keeps the shipped words.
export function commandTurnLabel(provider: Provider, commands: ThreadCommands, turnId: string): string | null {
  const name = commands.turns.get(turnId);
  return name ? commandRunningLabel(provider, name) : null;
}

// The message a conversation's title falls back to before main's list names it: the first one that is no command (main
// leaves a conversation started by a command untitled until such a message).
export function firstTitleMessage(provider: Provider, events: readonly ConversationEvent[]): Extract<ConversationEvent, { type: "user.message" }> | undefined {
  return events.find((event): event is Extract<ConversationEvent, { type: "user.message" }> => event.type === "user.message" && messageCommand(provider, event) === null);
}

// A queued row's text is a command main sends alone: one the provider runs, or an unconfirmed ACP command.
export function queuedCommand(provider: Provider, text: string, passthrough: readonly string[]): boolean {
  return commandName(provider, text) !== null || passthroughName(text, passthrough) !== null;
}
