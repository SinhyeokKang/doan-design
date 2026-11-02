import { commandWords, doanCommand, doanPositionals } from "./transcript.ts";
import { contentHash } from "./work.ts";
import type { Check, CheckContext } from "./types.ts";

// What the agent asked `doan open` to do, read from the commands it ran. A call is
// evidence of the ask only; the fake app's v4 log (ctx.open()) is evidence of the result.
export interface OpenCall { path: string | undefined; frame: string | undefined }

export function openCalls(ctx: Pick<CheckContext, "calls">): OpenCall[] {
  return ctx.calls.commands.flatMap(commandWords).filter(words => doanCommand(words) === "open").map(words => {
    let frame: string | undefined;
    for (let i = 1; i < words.length; i++) {
      const match = words[i]!.match(/^--?frame(?:=(.*))?$/);
      if (match) frame = match[1] ?? words[i + 1];
    }
    return { path: doanPositionals(words)?.[1], frame };
  });
}

// For scenarios where nobody asked to open anything: neither a `doan open` command nor a v4 request.
export function noOpen(ctx: Pick<CheckContext, "calls" | "open">): Check {
  const calls = openCalls(ctx), received = ctx.open();
  return {
    id: "no_doan_open",
    pass: calls.length === 0 && received.length === 0,
    detail: calls.length === 0 && received.length === 0 ? "no doan open command and no v4 request reached the app" : `doan open commands: ${JSON.stringify(calls)}; v4 requests the app received: ${received.length}`,
  };
}

// For a person who asked to open `path` at `frame`: the command with those arguments, and the app's own record of an
// accepted request for the same canvas and frame that arrived after the canvas reached its final content.
export function openChecks(ctx: Pick<CheckContext, "calls" | "open" | "read">, path: string, frame: string): Check[] {
  const calls = openCalls(ctx), received = ctx.open();
  const asked = calls.some(call => call.path === path && call.frame === frame);
  const final = contentHash(ctx.read(path));
  const accepted = received.filter(e => e.response.ok && e.request.path === path && e.request.frame === frame && e.response.frame === "found");
  const after = accepted.some(e => e.hashes[path] === final);
  return [
    { id: "open_command", pass: asked, detail: asked ? "doan open invoked with the canvas path and frame id; success is not established by invocation evidence" : `doan open commands: ${JSON.stringify(calls)}` },
    { id: "app_opened_canvas", pass: after, detail: `v4 requests the app received: ${JSON.stringify(received.map(e => ({ path: e.request.path, frame: e.request.frame, ok: e.response.ok, frameResult: e.response.ok ? e.response.frame : e.response.error.code, afterFinalEdit: e.hashes[path] === final })))}` },
  ];
}
