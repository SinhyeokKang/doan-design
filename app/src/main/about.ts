import { interpretList } from "./designSkills";
import type { CliRun } from "./folderState";
import type { Provider, ToolFacts } from "./agentAuth/types";
import { aboutView, type AboutCli, type AboutRead, type AboutTool } from "./aboutView";
import { aboutNotice } from "./agentSetup/notice";
import type { UpdateSnapshot, UpdateState } from "./update/types";

export * from "./aboutView";

// Settings > About (PRODUCT §5 item 0 'About'): what main reads and the text Copy details puts on the clipboard; the
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

// For a report: the update state with its fixed error code, and the last answered check in UTC.
function updateLine(update: UpdateSnapshot): string {
  const state = update.eligibility.kind === "disabled" ? `off (${update.eligibility.reason})` : updateStateText(update.state, update.gate.kind === "blocked");
  return `Updates: ${state}, last checked ${update.lastCheckedAt === null ? "never" : new Date(update.lastCheckedAt).toISOString()}`;
}

function updateStateText(state: UpdateState, blocked: boolean): string {
  switch (state.kind) {
    case "idle": return "not checked";
    case "checking": return "checking";
    case "upToDate": return "up to date";
    case "downloading": return `downloading ${state.version} (${state.percent}%)`;
    case "ready": return blocked ? `${state.version} ready, restart blocked by a conversation` : `${state.version} ready`;
    case "restarting": return `restarting to ${state.version}`;
    case "restartAborted": return `${state.version} ready, restart stopped`;
    case "failed": return state.stage === "check" ? `check failed (${state.code})` : `${state.stage} of ${state.version} failed (${state.code})`;
  }
}

export function aboutText(read: AboutRead, update: UpdateSnapshot): string {
  const lines = [`Doan ${read.version}`, updateLine(update)];
  lines.push(read.cli.version === null ? `doan command: ${UNREAD} (${read.cli.path})` : `doan command ${read.cli.version} (${read.cli.path})`);
  // The notice sits in the doan command row, so it follows that line; Copy details is how a keyboard copies its paths.
  const notice = aboutNotice(read.setup.items, read.setup.home);
  if (notice) {
    lines.push(notice.title);
    for (const line of notice.lines) {
      const text = line.parts.map(part => "code" in part ? part.code : part.text).join("");
      lines.push(line.agents === null ? text : `${line.agents} — ${text}`, ...(line.command ? [line.command] : []));
    }
  }
  for (const row of aboutView(read).tools) {
    const minimum = row.id === "antigravity" ? "" : ` (${row.description?.replace(/\.$/, "")})`;
    lines.push(`${row.label}${row.value === null ? "" : ` ${row.value}`}: ${row.status ?? UNREAD}${minimum}`);
  }
  return `${lines.join("\n")}\n`;
}
