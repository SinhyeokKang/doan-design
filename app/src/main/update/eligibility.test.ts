import { describe, expect, test } from "vitest";
import { updateEligibility } from "./eligibility";

// Updates run only in a signed release build that carries its feed file and sits where agent setup would run
// (installEligibility). The automatic-check switch is not an input: a manual check still works with it off.
describe("updateEligibility", () => {
  test("a release build in Applications updates", () => {
    expect(updateEligibility({ isPackaged: true, hasFeedConfig: true, install: "eligible" })).toEqual({ kind: "enabled" });
  });

  test("a development run never updates, feed file or not", () => {
    expect(updateEligibility({ isPackaged: false, hasFeedConfig: true, install: "dev" })).toEqual({ kind: "disabled", reason: "dev" });
    expect(updateEligibility({ isPackaged: false, hasFeedConfig: false, install: "eligible" })).toEqual({ kind: "disabled", reason: "dev" });
  });

  test("a copy agent setup refuses gives agent setup's reason, even with a feed file", () => {
    expect(updateEligibility({ isPackaged: true, hasFeedConfig: true, install: "outside-applications" })).toEqual({ kind: "disabled", reason: "outside-applications" });
    expect(updateEligibility({ isPackaged: true, hasFeedConfig: false, install: "translocated" })).toEqual({ kind: "disabled", reason: "translocated" });
    expect(updateEligibility({ isPackaged: true, hasFeedConfig: true, install: "dev" })).toEqual({ kind: "disabled", reason: "dev" });
  });

  // A tester or local package build in Applications: agent setup runs there, so About has no notice to give the
  // reason, and the Version row says it itself.
  test("a build without the feed file in Applications is noFeed", () => {
    expect(updateEligibility({ isPackaged: true, hasFeedConfig: false, install: "eligible" })).toEqual({ kind: "disabled", reason: "noFeed" });
  });
});
