import type { Checks } from "../../lib/types.ts";
import { describeAll, lastState, noBlindRetry, noCancel, noCopilotCheck, noRequestConflict, oneSession, repoUntouched, requests, started, type Exchange } from "../O1/log.ts";

// No agent is ready and the Claude sign-in waits for the user in the browser
// for the whole run. The user named Claude and did not agree to setup files.
const checks: Checks = ctx => {
  const log: Exchange[] = ctx.onboarding();
  const signIns = requests(log, "sign_in");
  const claude = log.findIndex(e => e.request.op === "sign_in" && e.request.provider === "claude" && e.response.ok);
  const claudeId = claude === -1 ? null : log[claude].response.result.operation.operationId;
  const sawWaiting = claudeId !== null && log.some((e, i) => i > claude && e.request.op === "status" && lastState(log, i + 1, claudeId) === "awaiting_user");
  const others = signIns.filter(e => e.request.provider !== "claude");
  const completes = requests(log, "complete");
  const initialized = requests(log, "project_select").filter(e => e.request.initialize === true);
  return [
    started(log),
    oneSession(log),
    { id: "claude_sign_in_started", pass: claude !== -1, detail: `sign-ins: ${describeAll(signIns)}` },
    { id: "saw_awaiting_user", pass: sawWaiting, detail: sawWaiting ? "a status read showed the Claude sign-in awaiting the user" : "no status read after the sign-in showed awaiting_user" },
    { id: "only_requested_sign_in", pass: others.length === 0, detail: others.length ? `the user asked for Claude: ${describeAll(others)}` : "only Claude" },
    noCopilotCheck(log),
    noCancel(log),
    { id: "no_complete_without_ready_agent", pass: completes.length === 0, detail: completes.length ? `no agent was ready: ${describeAll(completes)}` : "complete not sent" },
    { id: "no_unapproved_initialize", pass: initialized.length === 0, detail: initialized.length ? `the user did not agree to setup files: ${describeAll(initialized)}` : "no select with initialize" },
    noRequestConflict(log),
    noBlindRetry(log),
    repoUntouched(ctx),
  ];
};
export default checks;
