import { doanInvocations } from "./call-log.ts";
import { doanCommand } from "./transcript.ts";
import { contentHash } from "./work.ts";
import type { Check, CheckContext } from "./types.ts";

// The `doan handoff` commands the agent ran, as their words. A command is evidence of the ask only; the fake app's v5
// log (ctx.handoff()) is evidence of what arrived.
export function handoffCommands(ctx: Pick<CheckContext, "calls">): string[][] {
  return doanInvocations(ctx.calls).words.filter(words => doanCommand(words) === "handoff");
}

// The `doan send` commands the agent ran, as their words (evidence of the ask only, like handoffCommands).
export function sendCommands(ctx: Pick<CheckContext, "calls">): string[][] {
  return doanInvocations(ctx.calls).words.filter(words => doanCommand(words) === "send");
}

// For scenarios that ask for no other canvas (the turn prompt still names handoff and send): no command and no v5 or
// v8 request, so one stray request is one failed check whichever command made it. An unfollowable command may have
// run one the CLI refused, so absence is unproven beside it.
export function noHandoff(ctx: Pick<CheckContext, "calls" | "handoff" | "send">): Check {
  const handoffs = handoffCommands(ctx), sends = sendCommands(ctx), received = ctx.handoff(), delivered = ctx.send();
  const incomplete = doanInvocations(ctx.calls).incomplete;
  const none = handoffs.length === 0 && sends.length === 0 && received.length === 0 && delivered.length === 0 && !incomplete;
  return {
    id: "no_handoff",
    pass: none,
    detail: none ? "no doan handoff or doan send command and no v5 or v8 request reached the app" : `doan handoff commands: ${JSON.stringify(handoffs.map(words => words.slice(0, 3)))}; doan send commands: ${JSON.stringify(sends.map(words => words.slice(0, 3)))}; v5 requests the app received: ${received.length}; v8 requests: ${delivered.length}${incomplete ? "; a command could not be read completely" : ""}`,
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
    { id: "canvases_written_before_requests", pass: accepted.length > 0 && accepted.every(e => {
      const text = ctx.read(e.request.path);
      return text !== null && e.hashes[e.request.path] === contentHash(text);
    }), detail: `hashes at requests: ${JSON.stringify(accepted.map(e => ({ path: e.request.path, hashes: e.hashes })))}` },
    { id: "handoff_messages_not_empty", pass: accepted.length > 0 && accepted.every(e => e.request.text.trim().length > 0), detail: JSON.stringify(accepted.map(e => ({ path: e.request.path, message: [...e.request.text].slice(0, 300).join("") }))) },
  ];
}
