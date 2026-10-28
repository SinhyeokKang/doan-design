import type { Check, CheckContext } from "../../lib/types.ts";

// Checks over the fake app's app-socket v2 request log, shared by the
// onboarding scenarios (O1, O2). The CLI validates arguments before it sends
// anything, so the log holds only well-formed requests in the order sent.

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

export function noCopilotCheck(log: Exchange[]): Check {
  const found = requests(log, "check").filter(e => e.request.provider === "copilot");
  return { id: "no_copilot_check", pass: found.length === 0, detail: found.length ? `Copilot checks spend a model request and the user did not agree: ${list(found)}` : "no Copilot check" };
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
