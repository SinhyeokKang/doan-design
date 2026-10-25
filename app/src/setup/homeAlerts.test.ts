import { expect, test } from "vitest";
import { homeAlerts } from "./homeAlerts";
import type { ConnectionSummary, ConnectionStatus } from "./connectionSummary";
const connected: ConnectionSummary = { cli: "connected", claude: "connected", codex: "connected" };
const entries = [{ path: "/repo", kind: "notFound" as const }];
test("has no alerts when setup is complete, even with an unavailable saved project", () => {
  expect(homeAlerts(connected, entries, true)).toEqual({});
});
test("only shows remaining setup after onboarding closes", () => {
  const summary: ConnectionSummary = { cli: "not-connected", claude: "not-installed", codex: "not-connected" };
  expect(homeAlerts(summary, [], false)).toEqual({});
  expect(homeAlerts(summary, [], true)).toEqual({ finishCard: ["cli", "agents", "project"] });
});
test("attention rows do not appear among remaining items, but a missing project still does", () => {
  const summary: ConnectionSummary = { cli: "needs-attention", claude: "needs-attention", codex: "not-installed" };
  expect(homeAlerts(summary, [], true)).toEqual({ banner: ["cli", "claude"], finishCard: ["project"] });
  expect(homeAlerts(summary, entries, false)).toEqual({ banner: ["cli", "claude"] });
});
test("checks every agent status pair without treating unknown states as incomplete", () => {
  const states: ConnectionStatus[] = ["connected", "needs-attention", "not-connected", "not-installed", "couldnt-check"];
  for (const claude of states) for (const codex of states) {
    const result = homeAlerts({ cli: "connected", claude, codex }, entries, true);
    const incomplete = [claude, codex].every(state => state === "not-connected" || state === "not-installed");
    expect(result.finishCard).toEqual(incomplete ? ["agents"] : undefined);
    expect(result.banner).toEqual(claude === "needs-attention" ? (codex === "needs-attention" ? ["claude", "codex"] : ["claude"]) : codex === "needs-attention" ? ["codex"] : undefined);
  }
});
test("unknown alone produces neither a banner nor a Finish item", () => {
  expect(homeAlerts({ cli: "couldnt-check", claude: "couldnt-check", codex: "couldnt-check" }, entries, true)).toEqual({});
});
