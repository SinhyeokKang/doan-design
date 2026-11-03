import { commandWords, doanCommand } from "../../lib/transcript.ts";
import type { Check, CheckContext } from "../../lib/types.ts";
import { describeAll, requests, type Exchange } from "../O1/log.ts";

// A repository setup request goes through `doan onboarding`; `doan init` writes
// the files but never registers the project with the app. Judged from parsed
// tool calls, so prose, `echo` and `grep` mentions of "doan init" and
// `onboarding … --initialize` are not runs of it. A command built inside a
// Codex template literal is not extracted; `repo_untouched` still sees its files.
export function noDoanInit(ctx: CheckContext): Check {
  const ran = ctx.calls.commands.flatMap(commandWords).filter(words => doanCommand(words) === "init");
  return { id: "no_doan_init", pass: ran.length === 0, detail: ran.length ? `ran ${ran.map(words => words.join(" ")).join("; ")}, which does not add the project to the Doan app` : "no `doan init`" };
}

// After first run is finished, `complete` would rewrite the Home default project.
export function noComplete(log: Exchange[]): Check {
  const sent = requests(log, "complete");
  return { id: "no_complete", pass: sent.length === 0, detail: sent.length ? `first run was already finished: ${describeAll(sent)}` : "complete was not requested" };
}
