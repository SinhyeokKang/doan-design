import { writeFileSync } from "node:fs";
import { LOG_BYTES, readArtifact } from "./artifact.ts";
import { parseCommand, type ToolCalls } from "./transcript.ts";

export interface RecordedCall { argv: string[]; code: number }

// Append the arguments before launching the CLI. A missing completion stays visible even
// if the process group is killed. Each append is one write so parallel calls can interleave.
export function installRecorder(path: string, cli: string, log: string): void {
  writeFileSync(log, "", { mode: 0o600, flag: "wx" });
  writeFileSync(path, `#!${process.execPath}
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { signals } = require("node:os").constants;
const fd = fs.openSync(${JSON.stringify(log)}, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW);
const id = randomUUID();
function append(event) {
  const row = Buffer.from(JSON.stringify({ id, ...event }) + "\\n");
  if (fs.writeSync(fd, row) !== row.length) process.exit(125);
}
const argv = process.argv.slice(2);
append({ argv });
const result = spawnSync(${JSON.stringify(cli)}, argv, { stdio: "inherit" });
if (result.error) throw result.error;
append({ code: result.signal ? -signals[result.signal] : result.status });
fs.closeSync(fd);
if (result.signal) process.kill(process.pid, result.signal);
else process.exit(result.status);
`, { mode: 0o700, flag: "wx" });
}

export function readCallLog(path: string): RecordedCall[] {
  const rows = readArtifact(path, LOG_BYTES).toString("utf8").split("\n");
  if (rows.pop() !== "") throw new Error("Truncated doan call log");
  const calls = new Map<string, { argv: string[]; code?: number }>();
  for (const row of rows) {
    const event: { id?: unknown; argv?: unknown; code?: unknown } = JSON.parse(row);
    if (typeof event.id !== "string") throw new Error("Invalid doan call id");
    const call = calls.get(event.id);
    if (!call && Array.isArray(event.argv) && event.argv.every((arg): arg is string => typeof arg === "string"))
      calls.set(event.id, { argv: event.argv });
    else if (call && call.code === undefined && typeof event.code === "number" && Number.isInteger(event.code))
      call.code = event.code;
    else throw new Error("Invalid doan call log event");
  }
  return Array.from(calls.values(), ({ argv, code }) => {
    if (code === undefined) throw new Error("Incomplete doan call log");
    return { argv, code };
  });
}

// A scenario with no CLI on PATH still checks the transcript for attempts to use another binary.
export function doanInvocations(calls: ToolCalls, successfulOnly = false) {
  if (calls.doan !== undefined) return {
    words: calls.doan.filter(call => !successfulOnly || call.code === 0).map(call => ["doan", ...call.argv]),
    incomplete: false,
  };
  const parsed = calls.commands.map(parseCommand);
  return { words: parsed.flatMap(read => read.words), incomplete: parsed.some(read => read.incomplete) };
}
