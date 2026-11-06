import { randomBytes } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Provider, ToolFacts } from "./agentAuth/types";
import { storedVersionAtLeast } from "./conversation/sessions";
import { INSTALL_URLS, type ExternalTarget } from "./settings";

export type TerminalChoice = { kind: "terminal"; action: "install" | "update"; command: string; title: string; url: string };
export type InstallChoice = TerminalChoice | { kind: "page" };

// Main's names for the four providers it writes commands for; the renderer has its own table.
export const INSTALL_NAMES: Record<ExternalTarget, string> = { claude: "Claude Code", codex: "Codex", cursor: "Cursor", copilot: "GitHub Copilot" };
// The install commands are the ones on each provider's INSTALL_URLS page; Copilot's is the script that needs neither
// Node nor Homebrew. Cursor runs as cursor-agent, the name Doan itself runs (providers.ts). Copilot has no update:
// copilot update also replaces a cached package that Doan's Copilot (run with HOME=<profileDir>) never selects.
const COMMANDS: Record<ExternalTarget, { install: string; update: { command: string; floor: string } | null }> = {
  claude: { install: "curl -fsSL https://claude.ai/install.sh | bash", update: { command: "claude update", floor: "2.0.67" } },
  codex: { install: "curl -fsSL https://chatgpt.com/codex/install.sh | sh", update: { command: "codex update", floor: "0.126.0" } },
  cursor: { install: "curl https://cursor.com/install -fsS | bash", update: { command: "cursor-agent update", floor: "2026.10.22" } },
  copilot: { install: "curl -fsSL https://gh.io/copilot-install | bash", update: null },
};

// The floor is the first version with an update subcommand: an older CLI takes "update" as a prompt and may start a
// conversation. A version the floor cannot place (a +build suffix, none read) goes to the install page.
export function installChoice(provider: Provider, facts: ToolFacts | null): InstallChoice {
  if (provider === "antigravity" || facts === null) return { kind: "page" };
  const fixed = COMMANDS[provider], name = INSTALL_NAMES[provider], url = INSTALL_URLS[provider];
  if (facts.cli === "missing") return { kind: "terminal", action: "install", command: fixed.install, title: `Install ${name}`, url };
  if (fixed.update && facts.version === "unsupported" && storedVersionAtLeast(facts.installed, fixed.update.floor)) {
    return { kind: "terminal", action: "update", command: fixed.update.command, title: `Update ${name}`, url };
  }
  return { kind: "page" };
}

function quoted(text: string): string { return `'${text.replaceAll("'", "'\\''")}'`; }

// A .command Terminal runs in the person's login shell. It waits for Return so nothing runs before the person has
// read the command. Closing a waiting window asks to terminate sh, so the prompt names Control-C instead.
export function terminalScript(choice: TerminalChoice, name: string): string {
  const verb = choice.action === "install" ? "install" : "update";
  const say = (line: string) => `printf '%s\\n' ${quoted(line)}`;
  return [
    "#!/bin/sh",
    // openPath resolves before Terminal's shell reads the file, so Doan cannot know when removing it is safe. The
    // running sh already has it open; removing it here leaves no script once a window started it.
    'rm -f -- "$0"',
    say(choice.title),
    say(`This command ${verb}s ${name}:`),
    say(""),
    say(`  ${choice.command}`),
    say(""),
    say("Press Return to run it, or press Control-C to cancel."),
    "read -r _ || exit 0",
    // curl | bash exits with bash's status, 0 on an empty download. A shell without pipefail keeps that status.
    "set -o pipefail 2>/dev/null",
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

// pageFailed: no command applied and the install page did not open either.
export type InstallResult = "terminal" | "page" | "failed" | "pageFailed";
export interface InstallOpenerDeps {
  dir: string;
  // Electron's shell.openPath: it answers an error string rather than rejecting.
  openPath(path: string): Promise<string>;
  openExternal(url: string): Promise<void>;
}

// Scripts remove themselves once a window starts them, so an open never removes another script. Only the first open
// of an app session clears what earlier sessions left: scripts no window started.
export function createInstallOpener(deps: InstallOpenerDeps): (provider: ExternalTarget, facts: ToolFacts | null) => Promise<InstallResult> {
  let cleared: Promise<void> | undefined;
  // A leftover that cannot be removed is harmless: no window opens it again.
  const clear = async () => { for (const entry of await readdir(deps.dir)) await rm(join(deps.dir, entry), { recursive: true, force: true }); };
  return async (provider, facts) => {
    const choice = installChoice(provider, facts);
    if (choice.kind === "page") {
      try { await deps.openExternal(INSTALL_URLS[provider]); return "page"; } catch { return "pageFailed"; }
    }
    try {
      await mkdir(deps.dir, { recursive: true, mode: 0o700 });
      // Concurrent first opens wait for the same clear, which ends before any of them writes.
      await (cleared ??= clear().catch(() => {}));
      // A new random name per open: nothing reads the file before openPath, so it is written in place.
      const path = join(deps.dir, `${provider}-${randomBytes(8).toString("hex")}.command`);
      await writeFile(path, terminalScript(choice, INSTALL_NAMES[provider]), { mode: 0o700, flag: "wx" });
      return await deps.openPath(path) === "" ? "terminal" : "failed";
    } catch { return "failed"; }
  };
}
