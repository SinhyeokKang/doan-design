import { expect, it } from "vitest";
import { acpModeFor, claudeModeAfterPlan, claudePermission, codexDefaults, codexPermission, codexWorkspace, permissionModeId, permissionOptions, PERMISSION_MODES, readPermissionMode, type AcpModes } from "./permissionMode";

const COPILOT = "https://agentclientprotocol.com/protocol/session-modes#";
// session/new modes as P3 recorded them (design.md 'PoC 결과').
const CURSOR: AcpModes = { available: ["agent", "plan", "ask"], allowAll: false };
const ANTIGRAVITY: AcpModes = { available: ["default", "auto_edit", "yolo"], allowAll: false };
const COPILOT_MODES: AcpModes = { available: [`${COPILOT}agent`, `${COPILOT}plan`, `${COPILOT}autopilot`], allowAll: true };

it("names the four common modes and reads any other stored value as Default", () => {
  expect(PERMISSION_MODES).toEqual(["default", "acceptEdits", "plan", "bypass"]);
  for (const id of PERMISSION_MODES) { expect(permissionModeId(id)).toBe(true); expect(readPermissionMode(id)).toBe(id); }
  for (const value of ["bypassPermissions", "auto", "", "Plan", 1, null, undefined, {}]) {
    expect(permissionModeId(value)).toBe(false);
    expect(readPermissionMode(value)).toBe("default");
  }
});

it("offers all four modes for Claude and Codex, whatever an ACP list says", () => {
  expect(permissionOptions("claude")).toEqual(PERMISSION_MODES);
  expect(permissionOptions("codex", CURSOR)).toEqual(PERMISSION_MODES);
});

it("offers an ACP provider only the modes its server listed and the mapping table covers", () => {
  expect(permissionOptions("cursor", CURSOR)).toEqual(["default", "plan"]);
  expect(permissionOptions("antigravity", ANTIGRAVITY)).toEqual(["default", "acceptEdits", "bypass"]);
  expect(permissionOptions("copilot", COPILOT_MODES)).toEqual(["default", "plan", "bypass"]);
  // Full access is allow_all on; without the option the server cannot grant it.
  expect(permissionOptions("copilot", { ...COPILOT_MODES, allowAll: false })).toEqual(["default", "plan"]);
  expect(permissionOptions("cursor", { available: ["agent"], allowAll: false })).toEqual(["default"]);
});

it("offers no ACP picker without a mode list, or when Default itself cannot be set", () => {
  expect(permissionOptions("cursor")).toEqual([]);
  expect(permissionOptions("antigravity", { available: [], allowAll: false })).toEqual([]);
  expect(permissionOptions("cursor", { available: ["plan", "ask"], allowAll: false })).toEqual([]);
  expect(permissionOptions("copilot", { available: ["agent", "plan"], allowAll: true })).toEqual([]);
});

it("maps each mode to Claude's permissionMode, with Full access also allowing the dangerous skip", () => {
  expect(claudePermission("default")).toEqual({});
  expect(claudePermission("acceptEdits")).toEqual({ permissionMode: "acceptEdits" });
  expect(claudePermission("plan")).toEqual({ permissionMode: "plan" });
  expect(claudePermission("bypass")).toEqual({ permissionMode: "bypassPermissions", allowDangerouslySkipPermissions: true });
});

it("reads the mode Claude reports after a plan approval as a common id", () => {
  expect(claudeModeAfterPlan("default")).toBe("default");
  expect(claudeModeAfterPlan("acceptEdits")).toBe("acceptEdits");
  expect(claudeModeAfterPlan("plan")).toBe("plan");
  // Full access is only ever the person's pick, so a reported bypass is not followed (RV-A 🟡 2).
  for (const other of ["bypassPermissions", "auto", "dontAsk", "bypass", undefined, 3]) expect(claudeModeAfterPlan(other)).toBe("default");
});

it("maps each mode to Codex turn/start values, Default being the server's own as thread/start reported them", () => {
  const defaults = { approvalPolicy: "on-request", sandbox: { type: "readOnly", networkAccess: false } };
  const workspace = { networkAccess: true, writableRoots: ["/extra"] };
  expect(codexPermission("default", defaults, workspace)).toEqual({ approvalPolicy: "on-request", sandboxPolicy: { type: "readOnly", networkAccess: false } });
  expect(codexPermission("acceptEdits", defaults, workspace)).toEqual({ approvalPolicy: "on-request", sandboxPolicy: { type: "workspaceWrite", networkAccess: true, writableRoots: ["/extra"] } });
  expect(codexPermission("plan", defaults, workspace)).toEqual({ approvalPolicy: "never", sandboxPolicy: { type: "readOnly" } });
  expect(codexPermission("bypass", defaults, workspace)).toEqual({ approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } });
  // A granular approval policy object passes through unchanged.
  const granular = { approvalPolicy: { granular: { mcp_elicitations: true, rules: true, sandbox_approval: false } }, sandbox: { type: "workspaceWrite" } };
  expect(codexPermission("default", granular, {})).toEqual({ approvalPolicy: granular.approvalPolicy, sandboxPolicy: { type: "workspaceWrite" } });
});

it("sends Accept edits without network or roots the user's config does not set", () => {
  expect(codexPermission("acceptEdits", { approvalPolicy: "never", sandbox: { type: "readOnly" } }, {})).toEqual({ approvalPolicy: "on-request", sandboxPolicy: { type: "workspaceWrite" } });
  expect(codexPermission("acceptEdits", { approvalPolicy: "never", sandbox: { type: "readOnly" } }, { networkAccess: false })).toEqual({ approvalPolicy: "on-request", sandboxPolicy: { type: "workspaceWrite", networkAccess: false } });
});

it("reads Codex's Default values from a thread/start reply and refuses one without them", () => {
  const reply = { thread: { id: "t" }, approvalPolicy: "on-request", sandbox: { type: "workspaceWrite", writableRoots: ["/r"], networkAccess: true }, model: "m" };
  expect(codexDefaults(reply)).toEqual({ approvalPolicy: "on-request", sandbox: reply.sandbox });
  expect(codexDefaults({ ...reply, approvalPolicy: { granular: { rules: true } } })).toEqual({ approvalPolicy: { granular: { rules: true } }, sandbox: reply.sandbox });
  for (const bad of [null, {}, { thread: { id: "t" } }, { ...reply, approvalPolicy: "" }, { ...reply, approvalPolicy: 1 }, { ...reply, sandbox: "read-only" }, { ...reply, sandbox: { networkAccess: true } }, { ...reply, approvalPolicy: ["never"] }])
    expect(codexDefaults(bad)).toBeNull();
});

it("reads network access and writable roots from config/read's sandbox_workspace_write, dropping what is not set or malformed", () => {
  expect(codexWorkspace({ config: { sandbox_workspace_write: { network_access: true, writable_roots: ["/a", "/b"], exclude_slash_tmp: false } } })).toEqual({ networkAccess: true, writableRoots: ["/a", "/b"] });
  expect(codexWorkspace({ config: { sandbox_workspace_write: null, approval_policy: null } })).toEqual({});
  expect(codexWorkspace({ config: { sandbox_workspace_write: { network_access: "yes", writable_roots: ["/a", 3] } } })).toEqual({});
  expect(codexWorkspace(null)).toEqual({});
});

it("sets the ACP options of the mapping table, Default included, and nothing the server did not list", () => {
  expect(acpModeFor("cursor", "default", CURSOR)).toEqual([{ configId: "mode", value: "agent" }]);
  expect(acpModeFor("cursor", "plan", CURSOR)).toEqual([{ configId: "mode", value: "plan" }]);
  expect(acpModeFor("cursor", "acceptEdits", CURSOR)).toEqual([]);
  expect(acpModeFor("cursor", "bypass", CURSOR)).toEqual([]);
  expect(acpModeFor("antigravity", "default", ANTIGRAVITY)).toEqual([{ configId: "mode", value: "default" }]);
  expect(acpModeFor("antigravity", "acceptEdits", ANTIGRAVITY)).toEqual([{ configId: "mode", value: "auto_edit" }]);
  expect(acpModeFor("antigravity", "plan", ANTIGRAVITY)).toEqual([]);
  expect(acpModeFor("antigravity", "bypass", ANTIGRAVITY)).toEqual([{ configId: "mode", value: "yolo" }]);
  expect(acpModeFor("copilot", "default", COPILOT_MODES)).toEqual([{ configId: "mode", value: `${COPILOT}agent` }, { configId: "allow_all", value: "off" }]);
  expect(acpModeFor("copilot", "plan", COPILOT_MODES)).toEqual([{ configId: "mode", value: `${COPILOT}plan` }, { configId: "allow_all", value: "off" }]);
  expect(acpModeFor("copilot", "bypass", COPILOT_MODES)).toEqual([{ configId: "mode", value: `${COPILOT}agent` }, { configId: "allow_all", value: "on" }]);
  expect(acpModeFor("copilot", "acceptEdits", COPILOT_MODES)).toEqual([]);
  // allow_all is only turned off when the server offers it, and never on without it.
  expect(acpModeFor("copilot", "default", { ...COPILOT_MODES, allowAll: false })).toEqual([{ configId: "mode", value: `${COPILOT}agent` }]);
  expect(acpModeFor("copilot", "bypass", { ...COPILOT_MODES, allowAll: false })).toEqual([]);
  expect(acpModeFor("cursor", "plan", { available: ["agent"], allowAll: false })).toEqual([]);
  expect(acpModeFor("cursor", "default", undefined)).toEqual([]);
  expect(acpModeFor("claude", "plan", CURSOR)).toEqual([]);
});
