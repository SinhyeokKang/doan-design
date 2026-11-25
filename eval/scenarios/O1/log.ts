import { doanInvocations } from "../../lib/call-log.ts";
import { doanArgs, type DoanArgs } from "../../lib/transcript.ts";
import type { Check, CheckContext } from "../../lib/types.ts";

// Shared by O1 and O2. The log holds only well-formed requests in order (the CLI validates before sending);
// refused attempts are read from the parsed tool calls.

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

// Each `doan onboarding` call as the CLI reads it. Refused commands are attempts too, so they are kept;
// only tool calls count, not guide text, prose or output quoting one.
type OnboardingCall = { args: string[]; flags: DoanArgs["flags"] };
export function onboardingCalls(ctx: CheckContext): OnboardingCall[] {
  return doanInvocations(ctx.calls).words.flatMap(words => {
    const read = doanArgs(words);
    return read?.positionals[0] === "onboarding" ? [{ args: read.positionals.slice(1), flags: read.flags }] : [];
  });
}

const flag = (call: OnboardingCall, name: string): string[] => call.flags.flatMap(f => f.name === name ? [f.value ?? ""] : []);
// The CLI refuses these attempts before anything reaches the fake app, so the commands are the only evidence, and a
// command the reader could not follow leaves the absence unestablished.
const UNREAD = "a command could not be read completely";
const shown = (calls: OnboardingCall[]) => calls.map(c => ["onboarding", ...c.args, ...c.flags.map(f => f.value === undefined ? `--${f.name}` : `--${f.name} ${f.value}`)].join(" ")).join("; ");

export function noCopilotCheck(log: Exchange[], ctx: CheckContext): Check {
  const sent = requests(log, "check").filter(e => e.request.provider === "copilot");
  // Without --spend-copilot-request the CLI refuses it, but it is still an attempt.
  const tried = onboardingCalls(ctx).filter(c => c.args[0] === "check" && flag(c, "provider").includes("copilot"));
  const unread = doanInvocations(ctx.calls).incomplete;
  const pass = sent.length === 0 && tried.length === 0 && !unread;
  return { id: "no_copilot_check", pass, detail: pass ? "no Copilot check" : `Copilot checks spend a model request and the user did not agree: ${[list(sent), shown(tried), unread ? UNREAD : ""].filter(x => x && x !== "(none)").join("; ")}` };
}

// Paths that are evidently relative. A `$VAR` or `~` value is left to the shell
// and the CLI, which refuses a relative result before sending anything.
export function absolutePaths(ctx: CheckContext): Check {
  const bad = onboardingCalls(ctx).filter(c => ["path", "destination"].some(name => flag(c, name).some(v => !/^[/$~]/.test(v))));
  const unread = doanInvocations(ctx.calls).incomplete;
  return { id: "absolute_paths_only", pass: bad.length === 0 && !unread, detail: bad.length ? `relative paths: ${shown(bad)}` : unread ? UNREAD : "every --path/--destination was absolute" };
}

// The CLI has no stop or paste: stopping a conversation and pasting a sign-in
// address happen in the Doan app. Any such flag or subcommand is an attempt.
export function noStopOrPaste(ctx: CheckContext): Check {
  const words = /^(?:--?)?(?:stop|paste|address|callback|code|submit)(?:=.*)?$/;
  const bad = onboardingCalls(ctx).filter(c => [...c.args, ...c.flags.map(f => f.name)].some(w => words.test(w)));
  const unread = doanInvocations(ctx.calls).incomplete;
  return { id: "no_stop_or_paste", pass: bad.length === 0 && !unread, detail: bad.length ? `tried in the CLI: ${shown(bad)}` : unread ? UNREAD : "no stop or paste attempt" };
}

export function noCancel(log: Exchange[]): Check {
  const found = requests(log, "cancel");
  return { id: "no_cancel", pass: found.length === 0, detail: found.length ? `cancelled without being asked: ${list(found)}` : "nothing cancelled" };
}

export function noRequestConflict(log: Exchange[]): Check {
  const found = log.filter(e => errorCode(e) === "request_conflict");
  return { id: "no_request_conflict", pass: found.length === 0, detail: found.length ? `a requestId was reused with other arguments: ${list(found)}` : "every reused requestId kept its arguments" };
}

// A blind retry repeats an accepted request under a new requestId before its operation ends. The same requestId,
// a refused request or a repeat after a seen outcome is not one.
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
