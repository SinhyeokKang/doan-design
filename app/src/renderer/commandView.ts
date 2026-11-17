import type { Provider } from "../main/agentAuth/types";
import type { BoundaryKind } from "../main/conversation/commandRecords";
import { COMMAND_ALIASES, UNSUPPORTED_COMMANDS } from "../main/conversation/providerCommands";
import type { SkillSummary } from "../main/conversation/types";
import { PROVIDER_NAMES } from "./agentAuthView";
import { composeRequest, type PresetRef } from "./homeComposer";
import { skillWords } from "./skillWords";

// Pure parts of provider built-in commands in the composers and the thread. Copy follows the confirmed draft
// `.doan/canvases/provider-commands.html`.

// The names a first word is read against. A project skill wins over a command, an alias or a card of its name.
// aliases: an unlisted name and the listed command it runs as, only while that command is listed.
export interface CommandLists { skills: ReadonlySet<string>; commands: ReadonlySet<string>; aliases: ReadonlyMap<string, string>; unsupported: ReadonlySet<string> }
export function commandLists(provider: Provider, rows: readonly SkillSummary[]): CommandLists {
  const skills = new Set(rows.filter(r => r.kind === "skill").map(r => r.name));
  const commands = new Set(rows.filter(r => r.kind === "command" && !skills.has(r.name)).map(r => r.name));
  const aliases = new Map(Object.entries(COMMAND_ALIASES[provider]).filter(([alias, name]) => commands.has(name) && !skills.has(alias)));
  return { skills, commands, aliases, unsupported: new Set(UNSUPPORTED_COMMANDS[provider].filter(name => !skills.has(name) && !commands.has(name))) };
}

// Only the first word can be a command: a provider runs a command only at the start of the message. It is cut as the
// skill highlight cuts a word (attached Hangul, trailing punctuation), so the highlight and the send agree.
export type FirstWord =
  | { kind: "command"; name: string; args: string }
  | { kind: "unsupported"; name: string }
  | { kind: "skill"; name: string }
  | { kind: "text" };
export function classifyFirstWord(text: string, lists: CommandLists): FirstWord {
  const trimmed = text.trimStart();
  const names = new Set([...lists.skills, ...lists.commands, ...lists.aliases.keys(), ...lists.unsupported]);
  const run = skillWords(trimmed, names).find(r => r.start === 0);
  if (!run) return { kind: "text" };
  if (lists.skills.has(run.name)) return { kind: "skill", name: run.name };
  const name = lists.aliases.get(run.name) ?? run.name;
  if (lists.commands.has(name)) return { kind: "command", name, args: trimmed.slice(run.end).trim() };
  return { kind: "unsupported", name: run.name };
}

// A command goes out alone: no preset or skill line, which would put it after the first line where the provider no
// longer reads it as a command, and none of the composer's attachments, which stay there for the next message (a Codex
// command request has no place for them). It is sent under its listed name, an alias as the command, and its argument
// follows after one space, also when the person wrote it attached.
// unsupported: nothing is sent; the composer shows the card and keeps the text and attachments.
export type SendPlan =
  | { kind: "message"; text: string; sendsAttachments: true }
  | { kind: "command"; name: string; text: string; sendsAttachments: false }
  | { kind: "unsupported"; name: string };
export function planSend(text: string, preset: PresetRef | null, skills: readonly string[], attachments: number, lists: CommandLists): SendPlan {
  const first = classifyFirstWord(text, lists);
  if (first.kind === "command") return { kind: "command", name: first.name, text: first.args ? `/${first.name} ${first.args}` : `/${first.name}`, sendsAttachments: false };
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

export function boundaryLabel(kind: BoundaryKind): string {
  return kind === "compacted" ? "Context compacted — the agent keeps a summary of messages above" : "Context cleared — the agent won’t see messages above";
}
