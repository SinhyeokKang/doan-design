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
  ]) assert.deepEqual(failed(command), ["no_preset_body_read", "no_install_or_registration", "no_other_doan_binary"], command);
});
