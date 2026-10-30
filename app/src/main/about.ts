import { PROVIDER_NAMES } from "../renderer/agentAuthView";
import { PROVIDERS, type Provider, type ToolFacts } from "./agentAuth/types";
import { MINIMUM_VERSIONS } from "./conversation/sessions";
import { interpretList } from "./designSkills";
import type { CliRun } from "./folderState";

// Settings > About (buzz-settings design 'About'): what main reads, the rows the page shows, and the text Copy
// details puts on the clipboard. Main builds that text so the renderer never names a clipboard string.

// `version` null: the CLI's version could not be read. A development build may report `dev` and a bare `doan`.
export interface AboutCli { path: string; version: string | null }
// The installed version is About's alone; agent-auth DTOs never carry it.
export interface AboutTool { provider: Provider; cli: ToolFacts["cli"]; installed: string | null; support: ToolFacts["version"] }
// `tools` null: agent sign-in storage is unreadable, so no tool facts were ever read.
export interface AboutRead { version: string; cli: AboutCli; tools: AboutTool[] | null }
export type AboutTone = "neutral" | "ok" | "warning" | "error";
// `value` and `status` are the right-hand column; `error` replaces them with a sentence and a Retry.
export interface AboutRow { id: string; label: string; description: string | null; value: string | null; status: string | null; tone: AboutTone; error: string | null }
export interface AboutView { app: AboutRow[]; tools: AboutRow[] }

const CHECKING = "Checking…";
const UNREAD = "Couldn’t read the version";

// The version every `doan` reports in its design-skill list; a CLI too old to list presets has none to show.
export function aboutCli(path: string, run: CliRun): AboutCli {
  const reply = interpretList(run);
  return { path, version: reply.ok ? reply.result.version : null };
}

export function aboutTool(provider: Provider, facts: ToolFacts): AboutTool {
  return { provider, cli: facts.cli, installed: facts.installed ?? null, support: facts.version };
}

function needs(provider: Provider): string {
  return provider === "antigravity" ? "Doan downloads its sign-in server when you first sign in." : `Doan needs ${MINIMUM_VERSIONS[provider]} or later.`;
}

function toolStatus(tool: AboutTool): { status: string; tone: AboutTone } {
  // Doan's own download: no CLI and no installed version of its own.
  if (tool.provider === "antigravity") return { status: "Downloaded by Doan", tone: "neutral" };
  if (tool.cli === "missing") return { status: "Not installed", tone: "neutral" };
  switch (tool.support) {
    case "supported": return { status: "Supported", tone: "ok" };
    case "unsupported": return { status: "Update needed", tone: "warning" };
    case "incompatible": return { status: "Doan can’t run this version", tone: "error" };
    case "unknown": return { status: UNREAD, tone: "warning" };
  }
}

// null: a read is running, and every row says Checking… until it ends.
export function aboutView(read: AboutRead | null): AboutView {
  const row = (id: string, label: string, description: string | null, value: string | null): AboutRow => ({ id, label, description, value, status: null, tone: "neutral", error: null });
  if (read === null) {
    return {
      app: [row("version", "Version", null, CHECKING), row("cli", "doan command", null, CHECKING)],
      tools: PROVIDERS.map(provider => row(provider, PROVIDER_NAMES[provider], needs(provider), CHECKING)),
    };
  }
  const cli = read.cli.version === null
    ? { ...row("cli", "doan command", read.cli.path, null), tone: "error" as const, error: "Couldn’t read the doan command’s version." }
    : row("cli", "doan command", read.cli.path, read.cli.version);
  const tools = PROVIDERS.map(provider => {
    const tool = read.tools?.find(candidate => candidate.provider === provider);
    const shown = tool ? toolStatus(tool) : { status: UNREAD, tone: "warning" as const };
    const value = tool && tool.provider !== "antigravity" && tool.cli === "found" ? tool.installed : null;
    return { ...row(provider, PROVIDER_NAMES[provider], needs(provider), value), ...shown };
  });
  return { app: [row("version", "Version", null, read.version), cli], tools };
}

export function aboutText(read: AboutRead): string {
  const lines = [`Doan ${read.version}`];
  lines.push(read.cli.version === null ? `doan command: ${UNREAD} (${read.cli.path})` : `doan command ${read.cli.version} (${read.cli.path})`);
  for (const row of aboutView(read).tools) {
    const minimum = row.id === "antigravity" ? "" : ` (${row.description?.replace(/\.$/, "")})`;
    lines.push(`${row.label}${row.value === null ? "" : ` ${row.value}`}: ${row.status}${minimum}`);
  }
  return `${lines.join("\n")}\n`;
}
