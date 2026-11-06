import { commandWords, doanCommand } from "./transcript.ts";
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
