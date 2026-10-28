import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { fakeAuthStatus, validOnboardingRequest, validOnboardingResponse, type FakeAuth } from "./socket.ts";

// The fake app mirrors app code it cannot import at runtime; these tests load
// that app code (as H6 does) so a change there fails here. app/src imports omit
// extensions, ajv's subpath has none, and JSON is imported without attributes.
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/app/src/")) {
      if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$|\.json$/.test(specifier)) return next(`${specifier}.ts`, context);
      if (specifier === "ajv/dist/2020") return next(`${specifier}.js`, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".json") && url.includes("/schema/")) return { format: "module", source: `export default ${readFileSync(new URL(url), "utf8")};`, shortCircuit: true };
    return next(url, context);
  },
});

const state = await import("../../app/src/main/agentAuth/state.ts");
const validate = await import("../../app/src/formats/validate.ts");

const tools = { cli: "found", version: "supported", tools: "ready" } as const;
const connection = (provider: string) => ({ provider, connectionId: "conn-1", profile: `${provider}-1`, account: { id: "acct-1", workspace: "org-1" } });
function step(s: any, event: any) {
  const result = state.transition(s, event);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}
// The real AuthState for a FakeAuth, reached through agent-auth's own transitions.
function real(a: FakeAuth) {
  let s: any = state.initialAuthState(a.provider as any, a.connected ? connection(a.provider) as any : null);
  if (a.verified) s = step(step(s, { type: "check", attemptId: "c0" }), { type: "checked", attemptId: "c0", result: { status: "connected", account: connection(a.provider).account } });
  if (a.error === "check_failed") s = step(step(s, { type: "check", attemptId: "c1" }), { type: "checked", attemptId: "c1", result: { status: "failed", code: "check_failed" } });
  if (a.attempt?.kind === "check") s = step(s, { type: "check", attemptId: "c2" });
  if (a.attempt?.kind === "signIn") s = step(s, { type: "signIn", attemptId: "s1", owner: 1 });
  if (a.attempt?.cancelled) s = step(s, { type: "cancel", attemptId: "s1", owner: 1 });
  return s;
}

test("the fake's provider status follows agent-auth's authStatus for every state it can reach", () => {
  let compared = 0;
  for (const provider of ["claude", "copilot"])
    for (const cli of [undefined, "missing"] as const)
      for (const [connected, verified] of [[false, false], [true, false], [true, true]])
        for (const error of [null, "check_failed"] as const)
          for (const attempt of [null, { kind: "check", cancelled: false }, { kind: "signIn", cancelled: false }, { kind: "signIn", cancelled: true }] as const) {
            if (!connected && (error || attempt?.kind === "check")) continue; // the fake checks only connections
            if (error && verified) continue; // a failed check of a verified login keeps it verified, and the fake verifies it instead
            const a: FakeAuth = { provider, connected, verified, error, attempt, ...(cli ? { cli } : {}) };
            const { account: _a, attempt: _t, revision: _r, ...expected } = state.authStatus(real(a), cli ? { ...tools, cli } : tools, 1);
            assert.deepEqual(fakeAuthStatus(a), expected, JSON.stringify(a));
            compared++;
          }
  assert.ok(compared > 30, `${compared} states`);
});

test("the eval validators decide every app-socket v2 fixture as the app's validators do", () => {
  const fixtures = join(import.meta.dirname, "../../schema/fixtures/app-socket-v2");
  const pairs = [["request", validOnboardingRequest, validate.validateOnboardingRequest], ["response", validOnboardingResponse, validate.validateOnboardingResponse]] as const;
  for (const [dir, mine, app] of pairs)
    for (const kind of ["valid", "invalid"])
      for (const name of readdirSync(join(fixtures, dir, kind))) {
        const value = JSON.parse(readFileSync(join(fixtures, dir, kind, name), "utf8"));
        assert.equal(mine(value), app(value), `${dir}/${kind}/${name}`);
      }
});
