import { PROVIDER_NAMES } from "../../renderer/agentAuthView";
import { PROVIDERS, type Provider } from "../agentAuth/types";

// Agent setup's result and the About notice built from it. The renderer imports this module, so it must not import
// Node built-ins or main readers (rendererImports.test.ts).

export const PATH_LINE = 'export PATH="$HOME/.local/bin:$PATH"';

export type SetupTarget = "current" | "skill" | "cli" | "system-cli" | "agents-skill" | "claude-skill" | "gemini-skill" | "codex-rule";
export type Ineligible = "dev" | "outside-applications" | "translocated";
// One skipped item. Later features may add reasons; consumers switch on `reason`.
export type SetupItem =
  | ({ target: SetupTarget; path: string; providers: Provider[] } & (
    | { reason: "foreign"; found: "file" | "folder" | "link" }
    // `at` is the folder to fix: the target's parent, or the ancestor that is not a folder.
    | { reason: "write-failed"; cause: "permission" | "blocked-parent" | "other"; at: string; code: string }
    | { reason: "admin-cancelled"; rcFile: string | null }))
  | { target: "copy"; path: string; providers: Provider[]; reason: "not-eligible"; eligibility: Ineligible };

// The renderer shows `agents`, an em dash, then the parts; `command` is a line of its own after them.
export type NoticePart = { text: string } | { code: string };
export interface NoticeLine { agents: string | null; parts: NoticePart[]; command?: string }
export interface AboutNotice { tone: "warning" | "neutral"; title: string; lines: NoticeLine[] }

// About's fixed order (design 'About 알림'): this copy, CLI links, skill links, the Codex rule.
const ORDER: (SetupItem["target"])[] = ["copy", "current", "cli", "system-cli", "skill", "agents-skill", "claude-skill", "gemini-skill", "codex-rule"];
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

function agents(providers: Provider[]): string {
  if (PROVIDERS.every(p => providers.includes(p))) return "All agents";
  const names = PROVIDERS.filter(p => providers.includes(p)).map(p => PROVIDER_NAMES[p]);
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

type Skipped = Exclude<SetupItem, { reason: "not-eligible" }>;

function parts(item: Skipped, tilde: (path: string) => string): Pick<NoticeLine, "parts" | "command"> {
  const path = { code: tilde(item.path) };
  switch (item.reason) {
    case "foreign": return { parts: [path, { text: item.found === "folder" ? ` is a folder Doan didn’t create. Remove or rename it${REOPEN}` : ` is a ${item.found} Doan didn’t create, so Doan left it alone. Remove or rename it${REOPEN}` }] };
    case "write-failed": switch (item.cause) {
      case "permission": return { parts: [{ text: "Doan couldn’t write " }, path, { text: " (permission denied). Make " }, { code: tilde(item.at) }, { text: ` writable${REOPEN}` }] };
      case "blocked-parent": return { parts: [{ text: "Doan couldn’t write " }, path, { text: " because " }, { code: tilde(item.at) }, { text: ` isn’t a folder. Remove or rename it${REOPEN}` }] };
      case "other": return { parts: [{ text: "Doan couldn’t write " }, path, { text: ` (${item.code}). Check ` }, { code: tilde(item.at) }, { text: REOPEN }] };
    }
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
