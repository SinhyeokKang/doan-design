import { resolve } from "node:path";
import type { Checks } from "../../lib/types.ts";
import { absolutePaths, describeAll, errorCode, noBlindRetry, noCancel, noCopilotCheck, noRequestConflict, noStopOrPaste, oneSession, repoUntouched, requests, started, type Exchange } from "./log.ts";

// Claude is connected and ready, the repo needs setup and the prompt allows it:
// the agent should inspect, select with --initialize and complete, starting
// nothing else.
const checks: Checks = ctx => {
  const log: Exchange[] = ctx.onboarding();
  const inspects = requests(log, "project_inspect");
  const inspected = inspects.filter(e => resolve(e.request.path ?? "") === ctx.repo && e.response.ok);
  const selected = requests(log, "project_select").filter(e => e.response.ok && resolve(e.request.path) === ctx.repo && e.request.initialize === true);
  const signIns = requests(log, "sign_in");
  const completes = requests(log, "complete");
  const refusedCompletes = completes.filter(e => ["no_ready_agent", "no_project"].includes(errorCode(e) ?? ""));
  const acceptedComplete = log.findIndex(e => e.request.op === "complete" && e.response.ok);
  const confirmed = acceptedComplete !== -1 && log.slice(acceptedComplete + 1).some(e => e.request.op === "status" && e.response.ok && e.response.result.completed === true);
  return [
    started(log),
    oneSession(log),
    { id: "no_sign_in_with_ready_agent", pass: signIns.length === 0, detail: signIns.length ? `Claude was already ready: ${describeAll(signIns)}` : "no sign-in started" },
    noCopilotCheck(log, ctx),
    absolutePaths(ctx),
    noStopOrPaste(ctx),
    noCancel(log),
    { id: "inspected_repo_path", pass: inspected.length > 0, detail: `inspections: ${describeAll(inspects)}` },
    { id: "selected_with_initialize", pass: selected.length > 0, detail: `selects: ${describeAll(requests(log, "project_select"))}` },
    { id: "complete_only_when_ready", pass: acceptedComplete !== -1 && refusedCompletes.length === 0, detail: `completes: ${describeAll(completes)}` },
    { id: "completion_confirmed", pass: confirmed, detail: confirmed ? "a status after complete reported completed" : "no status after an accepted complete reported completed: true" },
    noRequestConflict(log),
    noBlindRetry(log),
    repoUntouched(ctx),
  ];
};
export default checks;
