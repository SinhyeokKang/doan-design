import { PROVIDER_NAMES } from "../../renderer/agentAuthView";
import { PROVIDERS, type Provider } from "../agentAuth/types";

// Agent setup's result and the About notice built from it. The renderer imports this module, so it must not import
// Node built-ins or main readers (rendererImports.test.ts).

export const PATH_LINE = 'export PATH="$HOME/.local/bin:$PATH"';

export type SetupTarget = "current" | "skill" | "cli" | "system-cli" | "agents-skill" | "claude-skill" | "gemini-skill" | "codex-rule" | "claude-allow";
export type Ineligible = "dev" | "outside-applications" | "translocated";
// One skipped item. Later features may add reasons; consumers switch on `reason`.
export type SetupItem =
  | ({ target: SetupTarget; path: string; providers: Provider[] } & (
    | { reason: "foreign"; found: "file" | "folder" | "link" }
    // `at` is the folder to fix: the target's parent, or the ancestor that is not a folder.
    // displaced: something Doan didn't create was moved aside mid-replacement and could not go back; `at` is where it is.
    | { reason: "write-failed"; cause: "permission" | "blocked-parent" | "displaced" | "other"; at: string; code: string }
    | { reason: "admin-cancelled"; rcFile: string | null }
    // ~/.claude/settings.json is the person's: a link Doan never writes through, or content it cannot merge into.
    | { reason: "claude-settings"; problem: "link" | "json" | "object" | "permissions" | "allow" }))
  | { target: "copy"; path: string; providers: Provider[]; reason: "not-eligible"; eligibility: Ineligible }
  // The run itself threw (main's catch), so nothing says which targets were set up; it must not read as success.
  | { target: "setup"; providers: Provider[]; reason: "crashed" };

// The renderer shows `agents`, an em dash, then the parts; `command` is a line of its own after them.
export type NoticePart = { text: string } | { code: string };
export interface NoticeLine { agents: string | null; parts: NoticePart[]; command?: string }
export interface AboutNotice { tone: "warning" | "neutral"; title: string; lines: NoticeLine[] }

// About's fixed order (design 'About 알림'): this copy, a run that crashed, CLI links, skill links, the Codex rule,
// the Claude Code allow rule.
const ORDER: (SetupItem["target"])[] = ["copy", "setup", "current", "cli", "system-cli", "skill", "agents-skill", "claude-skill", "gemini-skill", "codex-rule", "claude-allow"];
const REOPEN = ", then reopen Doan.";
const NOT_ELIGIBLE: Record<Ineligible, string> = {
  "outside-applications": "It isn’t directly in the Applications folder. Open the Doan in Applications so your agents can use it.",
  dev: "Development builds never set up agents. Open the Doan in Applications so your agents can use it.",
  translocated: "macOS is running it from a temporary location. Move Doan to the Applications folder, then open it again.",
};

export function rcFileFor(shell: string): string | null {
  switch (shell.slice(shell.lastIndexOf("/") + 1)) {
    case "zsh": return "~/.zshrc";
    case "bash": return "~/.bash_profile";
    default: return null;
  }
}

// What is wrong with the settings, as the parts before ", so Doan …".
function settingsProblem(problem: Exclude<Extract<SetupItem, { reason: "claude-settings" }>["problem"], "link">, path: NoticePart): NoticePart[] {
  switch (problem) {
    case "json": return [path, { text: " isn’t valid JSON" }];
    case "object": return [path, { text: " isn’t a JSON object" }];
    case "permissions": return [{ code: "permissions" }, { text: " in " }, path, { text: " isn’t an object" }];
    case "allow": return [{ code: "permissions.allow" }, { text: " in " }, path, { text: " isn’t a list" }];
  }
}

function agents(providers: Provider[]): string {
  if (PROVIDERS.every(p => providers.includes(p))) return "All agents";
  const names = PROVIDERS.filter(p => providers.includes(p)).map(p => PROVIDER_NAMES[p]);
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

type Skipped = Exclude<SetupItem, { reason: "not-eligible" }>;

function parts(item: Skipped, tilde: (path: string) => string): Pick<NoticeLine, "parts" | "command"> {
  if (item.reason === "crashed") return { parts: [{ text: "Doan stopped partway through setting up agents, so some may not be set up. Reopen Doan to try again. If this notice comes back, use Copy details to report the problem." }] };
  const path = { code: tilde(item.path) };
  switch (item.reason) {
    case "foreign": return { parts: [path, { text: item.found === "folder" ? ` is a folder Doan didn’t create. Remove or rename it${REOPEN}` : ` is a ${item.found} Doan didn’t create, so Doan left it alone. Remove or rename it${REOPEN}` }] };
    case "write-failed": switch (item.cause) {
      case "permission": return { parts: [{ text: "Doan couldn’t write " }, path, { text: " (permission denied). Make " }, { code: tilde(item.at) }, { text: ` writable${REOPEN}` }] };
      case "blocked-parent": return { parts: [{ text: "Doan couldn’t write " }, path, { text: " because " }, { code: tilde(item.at) }, { text: ` isn’t a folder. Remove or rename it${REOPEN}` }] };
      case "displaced": return { parts: [{ text: "Doan moved " }, path, { text: ", which it didn’t create, to " }, { code: tilde(item.at) }, { text: ` and couldn’t put it back. Move it back${REOPEN}` }] };
      case "other": return { parts: [{ text: "Doan couldn’t write " }, path, { text: ` (${item.code}). Check ` }, { code: tilde(item.at) }, { text: REOPEN }] };
    }
    // A link stays the person's: they add the rules where it points, and the notice goes once both are there.
    case "claude-settings": return item.problem === "link"
      ? { parts: [path, { text: " is a link, so Doan left it alone. To let Claude Code run " }, { code: "doan work" }, { text: " and " }, { code: "doan open" }, { text: " without asking, add " }, { code: "Bash(doan work start *)" }, { text: ", " }, { code: "Bash(doan work done *)" }, { text: " and " }, { code: "Bash(doan open *)" }, { text: " to " }, { code: "permissions.allow" }, { text: " in the file it links to." }] }
      : { parts: [...settingsProblem(item.problem, path), { text: ", so Doan couldn’t add the rules that let Claude Code run " }, { code: "doan work" }, { text: " and " }, { code: "doan open" }, { text: ` without asking. Fix the file${REOPEN}` }] };
    // The PATH line takes effect in a new terminal; Doan need not reopen. The lone `doan` part is the command, which
    // the draft shows as plain lowercase text (brand/appText.test.ts reads a bare `doan` literal as a code token).
    case "admin-cancelled": return {
      parts: [{ code: "~/.local/bin" }, { text: " isn’t on your shell’s PATH, and adding " }, { text: "doan" }, { text: " to " }, { code: "/usr/local/bin" }, { text: " was cancelled. Add this line to " },
        ...(item.rcFile ? [{ code: item.rcFile }, { text: ", then open a new terminal:" }] : [{ text: "your shell’s startup file, then open a new terminal:" }])],
      command: PATH_LINE,
    };
  }
}

// null: nothing to show, every item was set up.
export function aboutNotice(items: SetupItem[], home: string): AboutNotice | null {
  if (items.length === 0) return null;
  const tilde = (path: string) => path === home ? "~" : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
  const copy = items.find(item => item.reason === "not-eligible");
  if (copy) return { tone: "neutral", title: "This copy doesn’t set up agents", lines: [{ agents: null, parts: [{ text: NOT_ELIGIBLE[copy.eligibility] }] }] };
  const sorted = items.filter((item): item is Skipped => item.reason !== "not-eligible").sort((a, b) => ORDER.indexOf(a.target) - ORDER.indexOf(b.target));
  return { tone: "warning", title: "Doan couldn’t set up every agent", lines: sorted.map(item => ({ agents: agents(item.providers), ...parts(item, tilde) })) };
}
