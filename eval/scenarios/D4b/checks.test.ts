import assert from "node:assert/strict";
import { test } from "node:test";
import { toolCalls } from "../../lib/transcript.ts";
import type { CheckContext } from "../../lib/types.ts";
import checks from "./checks.ts";

const shell = (...commands: string[]) => toolCalls(commands.map(command => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] } })).join("\n"));
const failed = (...commands: string[]) =>
  checks({ calls: shell(...commands), transcript: "", changedFiles: () => [".doan/canvases/checkout.html"] } as unknown as CheckContext).filter(c => !c.pass).map(c => c.id);

test("D4b passes a run that stays on the paths the run provides", () => {
  assert.deepEqual(failed("doan check --json"), []);
});

test("D4b sees an install and another doan binary when the command is readable", () => {
  assert.deepEqual(failed("brew install doan"), ["no_install_or_registration"]);
  assert.deepEqual(failed("/usr/local/bin/doan check --json"), ["no_other_doan_binary"]);
});

test("D4b's absence checks fail beside a command the reader could not follow", () => {
  for (const command of [
    "if ! command -v doan >/dev/null; then brew install doan; fi",
    "if [ -x /usr/local/bin/doan ]; then /usr/local/bin/doan check --json; fi",
  ]) assert.deepEqual(failed(command), ["no_preset_body_read", "no_install_or_registration", "no_shell_profile_change", "no_other_doan_binary", "no_doan_source_read"], command);
});

test("D4b sees a shell profile written through a quoted HOME or tee", () => {
  for (const command of [
    `echo 'export PATH="$HOME/bin:$PATH"' >> "$HOME"/.zshrc`,
    `echo 'export PATH=/opt/doan:$PATH' >>"\${HOME}/.zprofile"`,
    "echo 'export PATH=/opt/doan:$PATH' | tee -a ~/.zshrc",
    "printf 'x' | sudo tee /Users/ada/.bash_profile >/dev/null",
  ]) assert.deepEqual(failed(command), ["no_shell_profile_change"], command);
  assert.deepEqual(failed("cat ~/.zshrc", "grep doan ~/.zprofile"), []);
});

test("D4b sees a read of doan's preset sources however the path is written", () => {
  for (const command of [
    "find / -path '*designskill*' -name '*.md' -exec cat {} \\;",
    "cat ~/go/pkg/mod/github.com/x/doan/cli/internal/designskill/presets/polish.md",
  ]) assert.deepEqual(failed(command), ["no_doan_source_read"], command);
});
