import { describe, expect, it } from "vitest";
import { PROVIDERS } from "../agentAuth/types";
import { canSteer, sendNowShown, STEER_PROVIDERS } from "./steerSupport";

const PHASES = ["preparing", "starting", "running", "waiting", "holding", "ended"] as const;

describe("steerSupport", () => {
  it("lists exactly the providers the PoC confirmed", () => {
    expect([...STEER_PROVIDERS]).toEqual(["claude", "codex"]);
    expect(PROVIDERS.filter(canSteer)).toEqual(["claude", "codex"]);
  });
  it.each(PROVIDERS.flatMap(provider => PHASES.flatMap(phase => [false, true].map(sending => ({ provider, phase, sending })))))(
    "$provider $phase sending=$sending",
    ({ provider, phase, sending }) => {
      const shown = (provider === "claude" || provider === "codex") && (phase === "running" || phase === "waiting") && !sending;
      expect(sendNowShown({ provider, phase, sending })).toBe(shown);
    });
  it("hides the button for a provider that is not in the table, whatever the phase", () => {
    expect(sendNowShown({ provider: "future" as never, phase: "running", sending: false })).toBe(false);
  });
});
