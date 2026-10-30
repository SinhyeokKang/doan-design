import { interpretList } from "./designSkills";
import type { CliRun } from "./folderState";
import type { Provider, ToolFacts } from "./agentAuth/types";
import { aboutView, type AboutCli, type AboutRead, type AboutTool } from "./aboutView";

export * from "./aboutView";

// Settings > About (buzz-settings design 'About'): what main reads and the text Copy details puts on the clipboard; the
// rows the page shows are in aboutView.ts. Main builds that text so the renderer never names a clipboard string.

const UNREAD = "Couldn’t read the version";

// The version every `doan` reports in its design-skill list; a CLI too old to list presets has none to show.
export function aboutCli(path: string, run: CliRun): AboutCli {
  const reply = interpretList(run);
  return { path, version: reply.ok ? reply.result.version : null };
}

export function aboutTool(provider: Provider, facts: ToolFacts): AboutTool {
  return { provider, cli: facts.cli, installed: facts.installed ?? null, support: facts.version };
}

export function aboutText(read: AboutRead): string {
  const lines = [`Doan ${read.version}`];
  lines.push(read.cli.version === null ? `doan command: ${UNREAD} (${read.cli.path})` : `doan command ${read.cli.version} (${read.cli.path})`);
  for (const row of aboutView(read).tools) {
    const minimum = row.id === "antigravity" ? "" : ` (${row.description?.replace(/\.$/, "")})`;
    lines.push(`${row.label}${row.value === null ? "" : ` ${row.value}`}: ${row.status ?? UNREAD}${minimum}`);
  }
  return `${lines.join("\n")}\n`;
}
