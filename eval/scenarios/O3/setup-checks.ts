import { doanInvocations } from "../../lib/call-log.ts";
import { doanCommand } from "../../lib/transcript.ts";
import type { Check, CheckContext } from "../../lib/types.ts";
import { describeAll, requests, type Exchange } from "../O1/log.ts";

// `doan init` writes files but never registers the project. Judged from parsed tool calls, not prose or echo; a
// command in a Codex template literal is not extracted, but `repo_untouched` still sees its files.
export function noDoanInit(ctx: CheckContext): Check {
  const ran = doanInvocations(ctx.calls).words.filter(words => doanCommand(words) === "init");
  const unread = doanInvocations(ctx.calls).incomplete;
  return { id: "no_doan_init", pass: ran.length === 0 && !unread, detail: ran.length ? `ran ${ran.map(words => words.join(" ")).join("; ")}, which does not add the project to the Doan app` : unread ? "a command could not be read completely, so a `doan init` in it cannot be ruled out" : "no `doan init`" };
}

// After first run is finished, `complete` would rewrite the Home default project.
export function noComplete(log: Exchange[]): Check {
  const sent = requests(log, "complete");
  return { id: "no_complete", pass: sent.length === 0, detail: sent.length ? `first run was already finished: ${describeAll(sent)}` : "complete was not requested" };
}
