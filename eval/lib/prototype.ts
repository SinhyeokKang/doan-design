import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { commandWords, doanArgs, lastFlag } from "./transcript.ts";

export interface PrototypeCall { path: string | undefined; frame: string | undefined; prototype: boolean; output: string | undefined }

export function prototypeCalls(commands: string[], command: "open" | "export"): PrototypeCall[] {
  return commands.flatMap(commandWords).flatMap(words => {
    const args = doanArgs(words);
    if (!args || args.refused || args.positionals[0] !== command) return [];
    const prototype = lastFlag(args, "prototype");
    return [{
      path: args.positionals[1],
      frame: lastFlag(args, "frame")?.value,
      prototype: prototype !== undefined && (prototype.value === undefined || /^(1|t|T|true|TRUE|True)$/.test(prototype.value)),
      output: lastFlag(args, "o")?.value,
    }];
  });
}

export function prototypeCanvasPath(repo: string, path: string): string {
  const absolute = resolve(repo, path);
  try { return realpathSync(absolute); } catch {
    // Missing paths still need deterministic comparison for command evidence.
    return absolute;
  }
}
