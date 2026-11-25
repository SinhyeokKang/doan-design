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

// A profile is written by a command that writes its target, not by any command that names the word tee.
test("D4b judges a shell profile write by the writing command and its target", () => {
  for (const read of ["grep tee ~/.zshrc", "grep -n tee ~/.zshrc", "cat ~/.zshrc | grep tee", "cp ~/.zshrc /tmp/zshrc.bak", "tee /tmp/out < ~/.zshrc", "diff ~/.zshrc ~/.zprofile"])
    assert.deepEqual(failed(read), [], read);
  for (const write of [
    "cp /tmp/x ~/.zshrc",
    "cp -f /tmp/x $HOME/.zprofile",
    "mv /tmp/x ~/.bashrc",
    "ln -sf /tmp/x ~/.zprofile",
    "install -m 644 /tmp/x ~/.profile",
    "sed -i '' 's/a/b/' ~/.zshrc",
    "sed -i.bak -e 's/a/b/' ~/.zshrc",
    "perl -pi -e 's/a/b/' ~/.bash_profile",
    "rm ~/.zshenv",
    "cat > ~/.zshrc <<'EOF'\nexport PATH=/opt/doan:$PATH\nEOF",
    "echo x 1>>~/.zshrc",
  ]) assert.deepEqual(failed(write), ["no_shell_profile_change"], write);
});

test("D4b sees a shell profile written with Claude's file tools", () => {
  for (const name of ["Write", "Edit", "MultiEdit"]) {
    const transcript = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name, input: { file_path: "/Users/ada/.zshrc", content: "x" } }] } });
    const result = checks({ calls: shell(), transcript, changedFiles: () => [".doan/canvases/checkout.html"] } as unknown as CheckContext);
    assert.deepEqual(result.filter(c => !c.pass).map(c => c.id), ["no_shell_profile_change"], name);
  }
  const read = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/Users/ada/.zshrc" } }] } });
  assert.deepEqual(checks({ calls: shell(), transcript: read, changedFiles: () => [".doan/canvases/checkout.html"] } as unknown as CheckContext).filter(c => !c.pass).map(c => c.id), []);
});

test("D4b follows a profile write through sudo sh -c and eval, and does not take perl -M for in-place", () => {
  for (const write of ["sudo sh -c 'echo export PATH=/x:$PATH >> ~/.zshrc'", "eval 'echo x >> ~/.zshrc'", "sudo -u ada tee -a ~/.zshrc < /tmp/x"])
    assert.deepEqual(failed(write), ["no_shell_profile_change"], write);
  for (const read of ["perl -Mstrict -ne 'print if /PATH/' ~/.zshrc", "sed -n '/PATH/p' ~/.zshrc", "sed -e 's/a/b/' ~/.zshrc"])
    assert.deepEqual(failed(read), [], read);
});

// The reader hands redirections over as their own list, so a quoted `>` is a word and a glued one is still a write.
test("D4b reads redirections the way the shell does: quoted is text, glued is a write", () => {
  for (const read of ["grep -c '>' ~/.zshrc", "grep -n '>>' ~/.zshrc", 'grep ">" ~/.zprofile', "echo x > /tmp/out", 'echo x > "$TMPDIR/out"', "doan check --json 2>&1", "cat ~/.zshrc 2>/dev/null"])
    assert.deepEqual(failed(read), [], read);
  for (const write of [
    "echo 'export PATH=/opt/doan:$PATH'>>~/.zshrc",
    'echo "export A=1">>~/.zshrc',
    "> ~/.zshrc",
    "echo x &>> ~/.zprofile",
    "for l in 'export A=1' 'export B=2'; do echo \"$l\"; done >> ~/.zshrc",
  ]) assert.deepEqual(failed(write), ["no_shell_profile_change"], write);
});

// The reader does not follow `cd` or variables it never saw assigned, so a target that may be a profile counts as one.
test("D4b counts a relative profile name or an unknown variable as a possible profile write", () => {
  for (const write of ["cd ~ && echo 'export PATH=/x:$PATH' >> .zshrc", "echo x >> ./.zprofile", 'echo x >> "$RC"', "echo x > ${PROFILE_FILE}", "cd && tee -a .bashrc < /tmp/x"])
    assert.deepEqual(failed(write), ["no_shell_profile_change"], write);
});

test("D4b sees a shell profile written through Codex apply_patch", () => {
  const patch = "*** Begin Patch\n*** Update File: /Users/ada/.zshrc\n@@\n+export PATH=/opt/doan:$PATH\n*** End Patch\n";
  const rollout = (payload: object) => toolCalls(JSON.stringify({ type: "response_item", payload }));
  const result = (calls: ReturnType<typeof toolCalls>) => checks({ calls, transcript: "", changedFiles: () => [".doan/canvases/checkout.html"] } as unknown as CheckContext).filter(c => !c.pass).map(c => c.id);
  for (const source of [`await tools.apply_patch(${JSON.stringify(patch)});`, `text(await tools.apply_patch(${JSON.stringify(patch)}))`])
    assert.deepEqual(result(rollout({ type: "custom_tool_call", name: "exec", call_id: "c1", input: source })), ["no_shell_profile_change"], source);
  assert.deepEqual(result(rollout({ type: "custom_tool_call", name: "apply_patch", call_id: "c2", input: patch })), ["no_shell_profile_change"]);
  const repoPatch = patch.replace("/Users/ada/.zshrc", "/private/tmp/r/repo/.doan/canvases/checkout.html");
  assert.deepEqual(result(rollout({ type: "custom_tool_call", name: "exec", call_id: "c3", input: `await tools.apply_patch(${JSON.stringify(repoPatch)});` })), []);
});

// `~` and `$HOME` expand only unquoted (`$HOME` also in double quotes); `\>` and `[[ ]]` comparisons redirect
// nothing, and a variable holding the home directory names it as `~` does.
test("D4b reads a profile write the way the shell expands it", () => {
  for (const read of [
    "echo x >> '~/.zshrc'",
    "echo x >> '$HOME/.zshrc'",
    "cp /tmp/x '~/.zshrc'",
    "echo a \\> ~/.zshrc",
    "[[ a > $b ]] && echo yes",
    "D='~'; echo x >> $D/.zshrc",
    "D=$HOME/sub; echo x >> \"$D/.zshrc\"",
  ]) assert.deepEqual(failed(read), [], read);
  for (const write of [
    'D=$HOME; echo x >> "$D/.zshrc"',
    "D=~; tee -a $D/.zprofile < /tmp/x",
    'H="$HOME"; cp /tmp/x $H/.bashrc',
    'D=$HOME; E=$D; echo x >> "${E}/.zshrc"',
    "echo x >> ~/.zshrc",
    "for f in .zshrc .zprofile; do echo x >> ~/$f; done",
    'export D=$HOME; echo x >> "$D/.zshrc"',
    "local D=$HOME; echo x >> ${D}/.zprofile",
  ]) assert.deepEqual(failed(write), ["no_shell_profile_change"], write);
  assert.deepEqual(failed('echo x > "$TMPDIR/zshrc.bak"'), []);
});
