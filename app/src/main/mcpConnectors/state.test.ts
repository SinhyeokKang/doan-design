import { expect, test } from "vitest";
import type { Readiness } from "../agentAuth/types";
import { connectorState, type ConnectorStateInput } from "./state";

const READY: Readiness = { ready: true };
const base: ConnectorStateInput = {
  name: "doan-notion", readiness: READY, attempt: null, everConnected: false, blocked: false,
  check: { reading: false, last: { ok: true, facts: { registered: false } } },
};
const state = (patch: Partial<ConnectorStateInput>) => connectorState({ ...base, ...patch });
const read = (facts: { registered: false } | { registered: true; authenticated: boolean }) => ({ reading: false, last: { ok: true as const, facts } });

test("before a first read finishes the item is Checking with no action, and a later read shows the last value meanwhile", () => {
  expect(state({ check: { reading: true, last: null } })).toEqual({ status: "checking", action: null, disabled: null, blocked: false });
  expect(state({ check: { reading: false, last: null } })).toEqual({ status: "checking", action: null, disabled: null, blocked: false });
  expect(state({ check: { reading: true, last: { ok: true, facts: { registered: true, authenticated: true } } } })).toMatchObject({ status: "connected", action: "disconnect" });
});

test("the provider's status read decides: not registered or needing sign-in is Not connected, signed in is Connected", () => {
  expect(state({ check: read({ registered: false }) })).toEqual({ status: "not_connected", action: "connect", disabled: null, blocked: false });
  expect(state({ check: read({ registered: true, authenticated: false }) })).toEqual({ status: "not_connected", action: "connect", disabled: null, blocked: false });
  expect(state({ check: read({ registered: true, authenticated: true }) })).toEqual({ status: "connected", action: "disconnect", disabled: null, blocked: false });
});

test("Reconnect needed is not stored: it is a registered server needing sign-in that once connected", () => {
  expect(state({ everConnected: true, check: read({ registered: true, authenticated: false }) })).toEqual({ status: "reconnect_needed", action: "reconnect", disabled: null, blocked: false });
  // A server that was never registered under this profile has nothing to reconnect.
  expect(state({ everConnected: true, check: read({ registered: false }) })).toMatchObject({ status: "not_connected", action: "connect" });
  expect(state({ everConnected: true, check: read({ registered: true, authenticated: true }) })).toMatchObject({ status: "connected" });
});

test.each(["failed", "timeout", "unparsable"] as const)("a status read that %s is Couldn’t check with Retry", reason => {
  expect(state({ check: { reading: false, last: { ok: false, reason } } })).toEqual({ status: "check_failed", action: "retry", disabled: null, blocked: false });
});

test("the provider's attempt on this server shows Connecting with Cancel, or Disconnecting and Removing with no action", () => {
  const connected = read({ registered: true, authenticated: true });
  expect(state({ attempt: { name: "doan-notion", kind: "connect" } })).toEqual({ status: "connecting", action: "cancel", disabled: null, blocked: false });
  expect(state({ check: connected, attempt: { name: "doan-notion", kind: "disconnect" } })).toEqual({ status: "disconnecting", action: null, disabled: null, blocked: false });
  expect(state({ check: connected, attempt: { name: "doan-notion", kind: "remove" } })).toEqual({ status: "removing", action: null, disabled: null, blocked: false });
  // The attempt wins over a read still under way.
  expect(state({ check: { reading: true, last: null }, attempt: { name: "doan-notion", kind: "connect" } })).toMatchObject({ status: "connecting" });
});

test("while the provider runs an attempt on another server, Connect and Reconnect are disabled as busy; other actions are not", () => {
  const attempt = { name: "doan-figma", kind: "connect" as const };
  expect(state({ attempt })).toEqual({ status: "not_connected", action: "connect", disabled: "busy", blocked: false });
  expect(state({ attempt, everConnected: true, check: read({ registered: true, authenticated: false }) })).toMatchObject({ action: "reconnect", disabled: "busy" });
  expect(state({ attempt, check: read({ registered: true, authenticated: true }) })).toMatchObject({ action: "disconnect", disabled: null });
  expect(state({ attempt, check: { reading: false, last: { ok: false, reason: "failed" } } })).toMatchObject({ action: "retry", disabled: null });
});

test("an agent that is signed in but cannot run keeps each item's last state with its actions disabled", () => {
  const expired: Readiness = { ready: false, cause: "reauth_required", action: "reauth" };
  const outdated: Readiness = { ready: false, cause: "version_unsupported", action: "update" };
  expect(state({ readiness: expired, check: read({ registered: true, authenticated: true }) })).toEqual({ status: "connected", action: "disconnect", disabled: "not_ready", blocked: false });
  expect(state({ readiness: outdated })).toMatchObject({ status: "not_connected", action: "connect", disabled: "not_ready" });
  expect(state({ readiness: expired, check: { reading: false, last: { ok: false, reason: "timeout" } } })).toMatchObject({ action: "retry", disabled: "not_ready" });
  // An attempt already running can still be cancelled.
  expect(state({ readiness: expired, attempt: { name: "doan-notion", kind: "connect" } })).toMatchObject({ action: "cancel", disabled: null });
});

test("a sign-in or sign-out in progress does not disable Connect: pressing it fails with the busy reason instead", () => {
  const busy: Readiness = { ready: false, cause: "busy", action: "wait" };
  expect(state({ readiness: busy })).toEqual({ status: "not_connected", action: "connect", disabled: null, blocked: false });
});

// spec 완료 조건 8 / design '상태 판정': while the previous account's logout is pending, the row offers Connect (which
// retries that logout first) whatever the last read said (BA review 🟡2).
test("a pending logout on a server that reads as connected shows Reconnect needed with Reconnect and its line", () => {
  // The token may still be the previous account's, so the row never claims Connected.
  expect(state({ blocked: true, check: read({ registered: true, authenticated: true }) })).toEqual({ status: "reconnect_needed", action: "reconnect", disabled: null, blocked: true });
  expect(state({ blocked: true, everConnected: true, check: read({ registered: true, authenticated: true }) })).toMatchObject({ status: "reconnect_needed", action: "reconnect", blocked: true });
});

test("a pending logout on a server whose status read failed offers Connect with its line instead of Retry", () => {
  expect(state({ blocked: true, check: { reading: false, last: { ok: false, reason: "timeout" } } })).toEqual({ status: "check_failed", action: "connect", disabled: null, blocked: true });
  expect(state({ blocked: true, attempt: { name: "doan-figma", kind: "connect" }, check: { reading: false, last: { ok: false, reason: "failed" } } })).toMatchObject({ action: "connect", disabled: "busy", blocked: true });
  expect(state({ blocked: true, readiness: { ready: false, cause: "reauth_required", action: "reauth" }, check: read({ registered: true, authenticated: true }) })).toMatchObject({ action: "reconnect", disabled: "not_ready", blocked: true });
});

test("a pending logout keeps Connect and shows its line under Connect or Reconnect only", () => {
  expect(state({ blocked: true })).toEqual({ status: "not_connected", action: "connect", disabled: null, blocked: true });
  expect(state({ blocked: true, everConnected: true, check: read({ registered: true, authenticated: false }) })).toMatchObject({ action: "reconnect", blocked: true });
  expect(state({ blocked: true, attempt: { name: "doan-notion", kind: "connect" } })).toMatchObject({ status: "connecting", blocked: false });
  expect(state({ blocked: true, check: { reading: true, last: null } })).toMatchObject({ status: "checking", blocked: false });
});
