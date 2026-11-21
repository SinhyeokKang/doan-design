import { describe, expect, it } from "vitest";
import runMode from "./fixtures/claude-run-mode.json";
import { runModeAfterInit, runModeAfterStatus, type RunModeEntry } from "./claudeRunMode";
import { claudeModeReport } from "./transport";
import type { ConversationOwner } from "../agentAuth/types";

// When the mode Claude Code's own settings run an Ask first turn in is kept with the conversation (claudeRunMode).
// Reported values are Claude's own ids, read from the PoC frames (claude-run-mode.json) where the case was observed.
const CLAUDE: ConversationOwner = { kind: "doan", provider: "claude", connectionId: "conn-1", accountId: "acct-1", workspaceId: null, profile: "claude" };
const askFirst = (claudeRunMode?: RunModeEntry["claudeRunMode"]): RunModeEntry => ({ owner: CLAUDE, ...(claudeRunMode ? { claudeRunMode } : {}) });
const reported = (frame: unknown): string => claudeModeReport(frame)!.mode;
const init = (entry: RunModeEntry, mode: string, more: Partial<Parameters<typeof runModeAfterInit>[0]> = {}) =>
  runModeAfterInit({ entry, sent: "default", current: true, counted: false, reported: mode, ...more });

describe("the first top-level system/init of a turn sent with Ask first", () => {
  it("keeps each shown mode the settings run, and clears the key when they run Ask first's own", () => {
    expect(init(askFirst(), reported(runMode.init["profile-auto"]))).toEqual({ permissionMode: "default", claudeRunMode: "auto" });
    expect(init(askFirst(), reported(runMode.init["project-dontAsk"]))).toEqual({ permissionMode: "default", claudeRunMode: "dontAsk" });
    expect(init(askFirst(), reported(runMode.init["profile-acceptEdits"]))).toEqual({ permissionMode: "default", claudeRunMode: "acceptEdits" });
    expect(init(askFirst(), reported(runMode.init["project-plan"]))).toEqual({ permissionMode: "default", claudeRunMode: "plan" });
    expect(init(askFirst("dontAsk"), reported(runMode.init["profile-bypassPermissions"]))).toEqual({ permissionMode: "default", claudeRunMode: "bypassPermissions" });
    // Project-level auto and bypassPermissions start as default (PoC): the earlier value goes.
    expect(init(askFirst("auto"), reported(runMode.init["project-auto"]))).toEqual({ permissionMode: "default", claudeRunMode: undefined });
    expect(init(askFirst("bypassPermissions"), reported(runMode.init["project-bypassPermissions"]))).toEqual({ permissionMode: "default", claudeRunMode: undefined });
  });
  // "None seen" is only the missing key; a value outside the shown list never stands in for it.
  it("clears the key for a mode outside the shown list", () => {
    expect(init(askFirst("auto"), "someNewMode")).toEqual({ permissionMode: "default", claudeRunMode: undefined });
    expect(init(askFirst("auto"), "bypass")).toEqual({ permissionMode: "default", claudeRunMode: undefined });
  });
  it("writes nothing when the value does not change", () => {
    expect(init(askFirst("auto"), "auto")).toBeNull();
    expect(init(askFirst(), "default")).toBeNull();
    expect(init(askFirst(), "someNewMode")).toBeNull();
  });
  // A steer after the reply began runs as the next turn of the same process, whose init reports a setMode the person
  // allowed in that process (fixture `steered`).
  it("ignores a later init of the same turn", () => {
    const [first, ...rest] = runMode.steered.map(frame => claudeModeReport(frame)).filter(read => read?.source === "init");
    expect(init(askFirst(), first!.mode)).toBeNull();
    expect(rest.map(read => init(askFirst(), read!.mode, { counted: true }))).toEqual([null]);
    expect(init(askFirst(), "auto", { counted: true })).toBeNull();
  });
  it("ignores a turn sent with another mode, though the settings would run one", () => {
    for (const sent of ["acceptEdits", "plan", "bypass"] as const) expect(init(askFirst(), "auto", { sent })).toBeNull();
  });
  it("ignores the init once the person picked another mode during the turn", () => {
    for (const permissionMode of ["acceptEdits", "plan", "bypass"] as const) expect(init({ ...askFirst("auto"), permissionMode }, "dontAsk")).toBeNull();
  });
  it("ignores a late init of a turn that is no longer the conversation's current one", () => {
    expect(init(askFirst(), "auto", { current: false })).toBeNull();
  });
  // A legacy-external run also sends no mode, so it looks like Ask first to the runner.
  it("ignores a legacy-external conversation and any other provider", () => {
    expect(init({ owner: { kind: "legacy-external" } }, "auto")).toBeNull();
    expect(init({ owner: { ...CLAUDE, provider: "codex" } }, "auto")).toBeNull();
    expect(init({ owner: { ...CLAUDE, provider: "antigravity" } }, "auto")).toBeNull();
  });
});

describe("a status message that reports a mode", () => {
  const status = (entry: RunModeEntry, mode: string, more: Partial<Parameters<typeof runModeAfterStatus>[0]> = {}) =>
    runModeAfterStatus({ entry, sent: "plan", current: true, reported: mode, ...more });
  const inPlan = (claudeRunMode?: RunModeEntry["claudeRunMode"]): RunModeEntry => ({ ...askFirst(claudeRunMode), permissionMode: "plan" });

  // Both values come back together so the caller saves the index once (one change notice, no flicker).
  it("returns the stored mode and the run mode together after a Plan turn's approval", () => {
    for (const frame of Object.values(runMode.approval)) expect(status(inPlan("auto"), reported(frame))).toEqual({ permissionMode: "default", claudeRunMode: undefined });
    expect(status(inPlan(), reported(runMode.approval["plan-profile-auto"]))).toEqual({ permissionMode: "default", claudeRunMode: undefined });
  });
  // Not observed in the PoC (approval always reported default); the rule stays general: Ask first that the settings run in
  // another shown mode shows it.
  it("keeps a shown mode the approval switched Ask first into", () => {
    expect(status(inPlan(), "auto")).toEqual({ permissionMode: "default", claudeRunMode: "auto" });
    expect(status(inPlan("auto"), "dontAsk")).toEqual({ permissionMode: "default", claudeRunMode: "dontAsk" });
    expect(status(inPlan(), "bypassPermissions")).toEqual({ permissionMode: "default", claudeRunMode: "bypassPermissions" });
    expect(status(inPlan("auto"), "someNewMode")).toEqual({ permissionMode: "default", claudeRunMode: undefined });
  });
  // The run mode describes Ask first only; an approval into Accept edits leaves the last one seen for a later re-pick.
  it("leaves the run mode alone when the approval moves to a mode with a common id other than Ask first", () => {
    expect(status(inPlan("dontAsk"), "acceptEdits")).toEqual({ permissionMode: "acceptEdits", claudeRunMode: "dontAsk" });
    expect(status(inPlan(), "acceptEdits")).toEqual({ permissionMode: "acceptEdits", claudeRunMode: undefined });
  });
  it("ignores a Plan turn's status that still reports plan, or comes after the person left Plan, or from an older turn", () => {
    expect(status(inPlan(), "plan")).toBeNull();
    expect(status({ ...askFirst("auto"), permissionMode: "acceptEdits" }, "default")).toBeNull();
    expect(status(askFirst("auto"), "default")).toBeNull();
    expect(status(inPlan(), "default", { current: false })).toBeNull();
  });
  // A legacy-external conversation keeps today's approval (the stored mode follows) but never gains a run mode.
  it("moves a legacy-external conversation's stored mode without a run mode", () => {
    expect(status({ owner: { kind: "legacy-external" }, permissionMode: "plan" }, "auto")).toEqual({ permissionMode: "default", claudeRunMode: undefined });
    expect(status({ owner: { kind: "legacy-external" }, permissionMode: "plan" }, "acceptEdits")).toEqual({ permissionMode: "acceptEdits", claudeRunMode: undefined });
  });
  // Ask first with settings that run plan: the approval changes the run mode only (PoC: it reports default).
  it("follows the approval of an Ask first turn whose settings ran plan, changing only the run mode", () => {
    expect(status(askFirst("plan"), reported(runMode.approval["askFirst-project-plan"]), { sent: "default" })).toEqual({ permissionMode: "default", claudeRunMode: undefined });
    expect(status(askFirst("plan"), reported(runMode.approval["askFirst-profile-plan"]), { sent: "default" })).toEqual({ permissionMode: "default", claudeRunMode: undefined });
    expect(status(askFirst("plan"), "auto", { sent: "default" })).toEqual({ permissionMode: "default", claudeRunMode: "auto" });
    expect(status(askFirst("plan"), "plan", { sent: "default" })).toBeNull();
    expect(status(askFirst("plan"), "default", { sent: "default", current: false })).toBeNull();
    expect(status({ ...askFirst("plan"), permissionMode: "acceptEdits" }, "default", { sent: "default" })).toBeNull();
    expect(status({ owner: { kind: "legacy-external" }, claudeRunMode: "plan" }, "default", { sent: "default" })).toBeNull();
  });
  // A suggestion's setMode holds in that process only (fixture `setMode`), so it changes nothing kept.
  it("ignores any other status of an Ask first turn", () => {
    expect(status(askFirst(), reported(runMode.setMode), { sent: "default" })).toBeNull();
    expect(status(askFirst("auto"), reported(runMode.setMode), { sent: "default" })).toBeNull();
    expect(status(askFirst("dontAsk"), "default", { sent: "default" })).toBeNull();
  });
  it("ignores a turn sent with Accept edits or Full access", () => {
    for (const sent of ["acceptEdits", "bypass"] as const) expect(status({ ...askFirst(), permissionMode: sent }, "default", { sent })).toBeNull();
  });
});
