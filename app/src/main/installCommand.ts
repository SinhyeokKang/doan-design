import type { Provider, ToolFacts } from "./agentAuth/types";
import { storedVersionAtLeast } from "./conversation/sessions";
import { INSTALL_URLS, type ExternalTarget } from "./settings";

export type TerminalChoice = { kind: "terminal"; action: "install" | "update"; command: string; title: string; url: string };
export type InstallChoice = TerminalChoice | { kind: "page" };

// Main's names for the four providers it writes commands for; the renderer has its own table.
export const INSTALL_NAMES: Record<ExternalTarget, string> = { claude: "Claude Code", codex: "Codex", cursor: "Cursor", copilot: "GitHub Copilot" };
// The install commands are the ones on each provider's INSTALL_URLS page; Copilot's is the script that needs neither
// Node nor Homebrew. Cursor runs as cursor-agent, the name Doan itself runs (providers.ts).
const COMMANDS: Record<ExternalTarget, { install: string; update: string; floor: string }> = {
  claude: { install: "curl -fsSL https://claude.ai/install.sh | bash", update: "claude update", floor: "2.0.67" },
  codex: { install: "curl -fsSL https://chatgpt.com/codex/install.sh | sh", update: "codex update", floor: "0.126.0" },
  cursor: { install: "curl https://cursor.com/install -fsS | bash", update: "cursor-agent update", floor: "2026.10.22" },
  copilot: { install: "curl -fsSL https://gh.io/copilot-install | bash", update: "copilot update", floor: "0.0.396" },
};

// The floor is the first version with an update subcommand: an older CLI takes "update" as a prompt and may start a
// conversation. A version the floor cannot place (a +build suffix, none read) goes to the install page.
export function installChoice(provider: Provider, facts: ToolFacts | null): InstallChoice {
  if (provider === "antigravity" || facts === null) return { kind: "page" };
  const fixed = COMMANDS[provider], name = INSTALL_NAMES[provider], url = INSTALL_URLS[provider];
  if (facts.cli === "missing") return { kind: "terminal", action: "install", command: fixed.install, title: `Install ${name}`, url };
  if (facts.version === "unsupported" && storedVersionAtLeast(facts.installed, fixed.floor)) {
    return { kind: "terminal", action: "update", command: fixed.update, title: `Update ${name}`, url };
  }
  return { kind: "page" };
}

function quoted(text: string): string { return `'${text.replaceAll("'", "'\\''")}'`; }

// A .command Terminal runs in the person's login shell. It waits for Return so nothing runs before the person has
// read the command; closing the window cancels it.
export function terminalScript(choice: TerminalChoice, name: string): string {
  const verb = choice.action === "install" ? "install" : "update";
  const say = (line: string) => `printf '%s\\n' ${quoted(line)}`;
  return [
    "#!/bin/sh",
    say(choice.title),
    say(`This command ${verb}s ${name}:`),
    say(""),
    say(`  ${choice.command}`),
    say(""),
    say("Press Return to run it, or close this window to cancel."),
    "read -r _ || exit 0",
    choice.command,
    "if [ $? -eq 0 ]; then",
    `  ${say("Finished. Go back to Doan to continue.")}`,
    "else",
    `  ${say("The command failed. See the output above.")}`,
    `  ${say(`To ${verb} ${name} another way, open ${choice.url}`)}`,
    "fi",
    "",
  ].join("\n");
}
