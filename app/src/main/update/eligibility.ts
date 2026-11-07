import type { Eligibility } from "../agentSetup/plan";
import type { UpdateEligibility } from "./types";

// `install` is agent setup's installEligibility. Its reason wins over a missing feed file: About already explains
// those copies in agent setup's notice, so the Version row only has to say noFeed for a build in Applications.
export function updateEligibility(input: { isPackaged: boolean; hasFeedConfig: boolean; install: Eligibility }): UpdateEligibility {
  if (!input.isPackaged) return { kind: "disabled", reason: "dev" };
  if (input.install !== "eligible") return { kind: "disabled", reason: input.install };
  if (!input.hasFeedConfig) return { kind: "disabled", reason: "noFeed" };
  return { kind: "enabled" };
}
