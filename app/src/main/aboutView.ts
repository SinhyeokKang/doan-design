import { PROVIDER_NAMES } from "../renderer/agentAuthView";
import { PROVIDERS, type Provider, type ToolFacts } from "./agentAuth/types";
import type { SetupItem } from "./agentSetup/notice";
import { MINIMUM_VERSIONS } from "./conversation/minimumVersions";

// Settings > About's shapes and rows (buzz-settings design 'About'). The renderer imports this module, so it must not
// import main readers: they reach the ajv validators, whose eval the renderer's CSP forbids (rendererImports.test.ts).

// `version` null: the CLI's version could not be read. A development build may report `dev` and a bare `doan`.
export interface AboutCli { path: string; version: string | null }
// The installed version is About's alone; agent-auth DTOs never carry it.
export interface AboutTool { provider: Provider; cli: ToolFacts["cli"]; installed: string | null; support: ToolFacts["version"] }
// `tools` null: agent sign-in storage is unreadable, so no tool facts were ever read. `setup` is this launch's agent
// setup result (aboutNotice's input); main answers only once setup has finished.
export interface AboutRead { version: string; cli: AboutCli; tools: AboutTool[] | null; setup: { home: string; items: SetupItem[] } }
export type AboutTone = "neutral" | "ok" | "warning" | "error";
// `value` and `status` are the right-hand column; `error` (a failed read, on the doan command or a tool row) replaces
// them with a sentence and a Retry.
export interface AboutRow { id: string; label: string; description: string | null; value: string | null; status: string | null; tone: AboutTone; error: string | null }
export interface AboutView { app: AboutRow[]; tools: AboutRow[] }

const CHECKING = "Checking…";
// A failed read, unlike an answer such as Not installed, is an `error` the page pairs with Retry, as for the doan
// command. Retry reads About again from the facts cache; it does not run the provider's CLI.
const UNREAD_ERROR = "Couldn’t read the version.";
const UNREAD_ROW = { status: null, tone: "error" as const, error: UNREAD_ERROR };

function needs(provider: Provider): string {
  return provider === "antigravity" ? "Doan downloads its sign-in server when you first sign in." : `Doan needs ${MINIMUM_VERSIONS[provider]} or later.`;
}

function toolStatus(tool: AboutTool): { status: string | null; tone: AboutTone; error: string | null } {
  // Doan's own download: no CLI and no installed version of its own.
  if (tool.provider === "antigravity") return { status: "Downloaded by Doan", tone: "neutral", error: null };
  if (tool.cli === "missing") return { status: "Not installed", tone: "neutral", error: null };
  switch (tool.support) {
    case "supported": return { status: "Supported", tone: "ok", error: null };
    case "unsupported": return { status: "Update needed", tone: "warning", error: null };
    case "incompatible": return { status: "Doan can’t run this version", tone: "error", error: null };
    case "unknown": return UNREAD_ROW;
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
    const shown = tool ? toolStatus(tool) : UNREAD_ROW;
    const value = tool && tool.provider !== "antigravity" && tool.cli === "found" ? tool.installed : null;
    return { ...row(provider, PROVIDER_NAMES[provider], needs(provider), value), ...shown };
  });
  return { app: [row("version", "Version", null, read.version), cli], tools };
}
