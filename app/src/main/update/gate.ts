import type { InstallGate } from "./types";

// Only a conversation holds the restart back: quitting would stop a turn or drop the answer it waits for. Main asks again
// at each press, since a turn can start between the snapshot and the click.
export function installGate(input: { liveTurns: number; pendingAnswers: number }): InstallGate {
  return input.liveTurns > 0 || input.pendingAnswers > 0 ? { kind: "blocked", reason: "conversation" } : { kind: "allowed" };
}
