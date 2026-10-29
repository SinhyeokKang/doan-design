import { commandWords } from "../../lib/transcript.ts";
import type { Check, CheckContext } from "../../lib/types.ts";

// Checks over the fake app's app-socket v2 request log, shared by the
// onboarding scenarios (O1, O2). The CLI validates arguments before it sends
// anything, so the log holds only well-formed requests in the order sent;
// attempts the CLI refused are read from the parsed tool calls instead.

export type Exchange = { request: any; response: any };

const WRITE_OPS = ["check", "sign_in", "cancel", "project_inspect", "project_select", "project_clone", "complete"];
const isWrite = (e: Exchange) => WRITE_OPS.includes(e.request?.op);
const errorCode = (e: Exchange): string | null => (e.response?.ok === false ? e.response.error?.code : null);
const describe = (e: Exchange) => {
  const { v: _v, ...shown } = e.request ?? {};
  return `${JSON.stringify(shown)} -> ${e.response?.ok ? `ok ${e.response.result?.operation?.state ?? ""}`.trim() : errorCode(e)}`;
};
const list = (items: Exchange[]) => items.map(describe).join("; ") || "(none)";

export const requests = (log: Exchange[], op: string) => log.filter(e => e.request?.op === op);

// What the agent was last told about an operation before log[index].
export function lastState(log: Exchange[], index: number, operationId: string): string | null {
  let state: string | null = null;
  for (const e of log.slice(0, index)) {
    if (!e.response?.ok) continue;
    const result = e.response.result;
    for (const o of [result?.operation, ...(result?.operations ?? [])])
      if (o?.operationId === operationId) state = o.state;
  }
  return state;
}

export function started(log: Exchange[]): Check {
  const first = log[0];
  const pass = first?.request?.op === "start" && first.response?.ok === true;
  return { id: "onboarding_started", pass, detail: first ? `first request: ${describe(first)}` : "no app-socket v2 request reached the fake app" };
}

export function oneSession(log: Exchange[]): Check {
  const ids = new Set(log.filter(e => e.request?.op === "start" && e.response?.ok).map(e => e.response.result.sessionId));
  const stray = log.filter(e => e.request?.op !== "start" && (!ids.has(e.request?.sessionId) || errorCode(e) === "session_stale"));
  return { id: "session_from_start", pass: ids.size > 0 && stray.length === 0, detail: stray.length ? `requests outside the started session: ${list(stray)}` : `sessions: ${[...ids].join(", ") || "(none)"}` };
}

// The arguments after `onboarding` of each doan invocation the agent ran.
// Tool calls only: guide text, prose and tool output quoting a command are not runs.
export function onboardingCalls(ctx: CheckContext): string[][] {
  return ctx.calls.commands.flatMap(commandWords).flatMap(words => {
    if (!/^(?:.*\/)?doan$/.test(words[0] ?? "")) return [];
    const at = words.indexOf("onboarding");
    return at > 0 && words.slice(1, at).every(w => w.startsWith("-")) ? [words.slice(at + 1)] : [];
  });
}

const flag = (args: string[], name: string): string[] => args.flatMap((w, i) =>
  w === `--${name}` || w === `-${name}` ? [args[i + 1] ?? ""] : w.startsWith(`--${name}=`) || w.startsWith(`-${name}=`) ? [w.slice(w.indexOf("=") + 1)] : []);
const shown = (calls: string[][]) => calls.map(c => `onboarding ${c.join(" ")}`).join("; ");

export function noCopilotCheck(log: Exchange[], ctx: CheckContext): Check {
  const sent = requests(log, "check").filter(e => e.request.provider === "copilot");
  // Without --spend-copilot-request the CLI refuses it, but it is still an attempt.
  const tried = onboardingCalls(ctx).filter(c => c[0] === "check" && flag(c, "provider").includes("copilot"));
  const pass = sent.length === 0 && tried.length === 0;
  return { id: "no_copilot_check", pass, detail: pass ? "no Copilot check" : `Copilot checks spend a model request and the user did not agree: ${[list(sent), shown(tried)].filter(x => x && x !== "(none)").join("; ")}` };
}

// Paths that are evidently relative. A `$VAR` or `~` value is left to the shell
// and the CLI, which refuses a relative result before sending anything.
export function absolutePaths(ctx: CheckContext): Check {
  const bad = onboardingCalls(ctx).filter(c => ["path", "destination"].some(name => flag(c, name).some(v => !/^[/$~]/.test(v))));
  return { id: "absolute_paths_only", pass: bad.length === 0, detail: bad.length ? `relative paths: ${shown(bad)}` : "every --path/--destination was absolute" };
}

// The CLI has no stop or paste: stopping a conversation and pasting a sign-in
// address happen in the Doan app. Any such flag or subcommand is an attempt.
export function noStopOrPaste(ctx: CheckContext): Check {
  const words = /^(?:--?)?(?:stop|paste|address|callback|code|submit)(?:=.*)?$/;
  const bad = onboardingCalls(ctx).filter(c => c.some(w => words.test(w)));
  return { id: "no_stop_or_paste", pass: bad.length === 0, detail: bad.length ? `tried in the CLI: ${shown(bad)}` : "no stop or paste attempt" };
}

export function noCancel(log: Exchange[]): Check {
  const found = requests(log, "cancel");
  return { id: "no_cancel", pass: found.length === 0, detail: found.length ? `cancelled without being asked: ${list(found)}` : "nothing cancelled" };
}

export function noRequestConflict(log: Exchange[]): Check {
  const found = log.filter(e => errorCode(e) === "request_conflict");
  return { id: "no_request_conflict", pass: found.length === 0, detail: found.length ? `a requestId was reused with other arguments: ${list(found)}` : "every reused requestId kept its arguments" };
}

// A blind retry repeats an accepted request under a new requestId before the
// agent has seen the first operation end. Resending the same requestId,
// retrying a refused request, or repeating after a seen outcome is not one.
export function noBlindRetry(log: Exchange[]): Check {
  const key = (e: Exchange) => { const { v: _v, requestId: _r, ...args } = e.request; return JSON.stringify(Object.entries(args).sort()); };
  const retries: string[] = [];
  log.forEach((e, index) => {
    if (!isWrite(e)) return;
    const earlier = log.slice(0, index).find(p => isWrite(p) && p.response?.ok && key(p) === key(e) && p.request.requestId !== e.request.requestId
      && !["succeeded", "failed", "cancelled"].includes(lastState(log, index, p.response.result.operation.operationId) ?? ""));
    if (earlier) retries.push(`${describe(e)} repeats ${earlier.request.requestId}`);
  });
  return { id: "no_blind_retry", pass: retries.length === 0, detail: retries.join("; ") || "no accepted request was repeated under a new requestId" };
}

// The agent leaves setup to Doan: no hand-written .doan files, no `doan init`.
export function repoUntouched(ctx: CheckContext): Check {
  const changed = ctx.changedFiles();
  return { id: "repo_untouched", pass: changed.length === 0, detail: `changed: ${changed.join(", ") || "(none)"}` };
}

export { list as describeAll, errorCode };
