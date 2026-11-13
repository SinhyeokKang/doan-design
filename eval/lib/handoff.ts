import { commandWords, doanCommand } from "./transcript.ts";
import { contentHash } from "./work.ts";
import type { Check, CheckContext } from "./types.ts";

// The `doan handoff` commands the agent ran, as their words. A command is evidence of the ask only; the fake app's v5
// log (ctx.handoff()) is evidence of what arrived.
export function handoffCommands(ctx: Pick<CheckContext, "calls">): string[][] {
  return ctx.calls.commands.flatMap(commandWords).filter(words => doanCommand(words) === "handoff");
}

// For scenarios where nothing asks to continue on another canvas: the turn prompt still carries the handoff line, so
// neither a `doan handoff` command nor a v5 request may show up.
export function noHandoff(ctx: Pick<CheckContext, "calls" | "handoff">): Check {
  const commands = handoffCommands(ctx), received = ctx.handoff();
  const none = commands.length === 0 && received.length === 0;
  return {
    id: "no_handoff",
    pass: none,
    detail: none ? "no doan handoff command and no v5 request reached the app" : `doan handoff commands: ${JSON.stringify(commands.map(words => words.slice(0, 3)))}; v5 requests the app received: ${received.length}`,
  };
}

// Only accepted exchanges prove a handoff. Compare each snapshot with the final file so a request before a later
// edit cannot pass merely because the canvas already existed when the app received it.
export function handoffsForCanvases(ctx: Pick<CheckContext, "handoff" | "read">, paths: readonly string[]): Check[] {
  const received = ctx.handoff();
  const accepted = received.filter(e => e.response.ok);
  const eachOnce = paths.length > 0 && accepted.length === paths.length
    && paths.every(path => accepted.filter(e => e.request.path === path).length === 1);
  return [
    { id: "handoff_each_canvas_once", pass: eachOnce, detail: `expected ${JSON.stringify(paths)}; received ${JSON.stringify(received.map(e => ({ path: e.request.path, ok: e.response.ok, error: e.response.ok ? undefined : e.response.error.code })))}` },
    { id: "canvases_written_before_requests", pass: eachOnce && accepted.every(e => {
      const text = ctx.read(e.request.path);
      return text !== null && e.hashes[e.request.path] === contentHash(text);
    }), detail: `hashes at requests: ${JSON.stringify(accepted.map(e => ({ path: e.request.path, hashes: e.hashes })))}` },
    { id: "handoff_messages_not_empty", pass: eachOnce && accepted.every(e => e.request.text.trim().length > 0), detail: JSON.stringify(accepted.map(e => ({ path: e.request.path, message: [...e.request.text].slice(0, 300).join("") }))) },
  ];
}
