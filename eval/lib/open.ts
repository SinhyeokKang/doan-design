import { doanInvocations } from "./call-log.ts";
import { doanArgs, lastFlag } from "./transcript.ts";
import { prototypeCanvasPath } from "./prototype.ts";
import { contentHash } from "./work.ts";
import type { Check, CheckContext } from "./types.ts";

// What the agent asked `doan open` to do, read from the commands it ran. A call is
// evidence of the ask only; the fake app's v4 log (ctx.open()) is evidence of the result.
export interface OpenCall { path: string | undefined; frame: string | undefined }

export function openCalls(ctx: Pick<CheckContext, "calls">): OpenCall[] {
  return doanInvocations(ctx.calls).words.flatMap(words => {
    const args = doanArgs(words);
    if (!args || args.refused || args.positionals[0] !== "open") return [];
    return [{ path: args.positionals[1], frame: lastFlag(args, "frame")?.value }];
  });
}

// Nobody asked to open: no `doan open` command and no v4/v6 request. An unfollowable command may have run one the
// CLI refused, so absence is unproven beside it.
export function noOpen(ctx: Pick<CheckContext, "calls" | "open" | "prototype">): Check {
  const calls = openCalls(ctx), received = ctx.open(), prototypes = ctx.prototype();
  const incomplete = doanInvocations(ctx.calls).incomplete;
  const none = calls.length === 0 && received.length === 0 && prototypes.length === 0 && !incomplete;
  return {
    id: "no_doan_open",
    pass: none,
    detail: none ? "no doan open command and no v4 or v6 request reached the app" : `doan open commands: ${JSON.stringify(calls)}; v4 requests the app received: ${received.length}; v6 requests: ${prototypes.length}${incomplete ? "; a command could not be read completely" : ""}`,
  };
}

// For a person who asked to open `path` at `frame`: the command with those arguments, and the app's own record of an
// accepted request for the same canvas and frame that arrived after the canvas reached its final content.
export function openChecks(ctx: Pick<CheckContext, "calls" | "open" | "read" | "repo">, path: string, frame: string): Check[] {
  const calls = openCalls(ctx), received = ctx.open();
  // The CLI resolves the path against the repository, so an absolute or ./ spelling names the same canvas.
  const canvas = prototypeCanvasPath(ctx.repo, path);
  const asked = calls.some(call => call.path !== undefined && prototypeCanvasPath(ctx.repo, call.path) === canvas && call.frame === frame);
  const final = contentHash(ctx.read(path));
  const accepted = received.filter(e => e.response.ok && e.request.path === path && e.request.frame === frame && e.response.frame === "found");
  const after = accepted.some(e => e.hashes[path] === final);
  return [
    { id: "open_command", pass: asked, detail: asked ? "doan open invoked with the canvas path and frame id; success is not established by invocation evidence" : `doan open commands: ${JSON.stringify(calls)}` },
    { id: "app_opened_canvas", pass: after, detail: `v4 requests the app received: ${JSON.stringify(received.map(e => ({ path: e.request.path, frame: e.request.frame, ok: e.response.ok, frameResult: e.response.ok ? e.response.frame : e.response.error.code, afterFinalEdit: e.hashes[path] === final })))}` },
  ];
}
