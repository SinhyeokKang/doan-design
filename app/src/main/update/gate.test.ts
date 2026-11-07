import { describe, expect, test } from "vitest";
import { installGate } from "./gate";

// Only conversations hold Restart to Update back: a running turn, or one waiting on a permission request or a
// question. Clones, agent sign-ins and MCP connections are cancelled by the quit as before.
describe("installGate", () => {
  test("nothing running: the restart may start", () => {
    expect(installGate({ liveTurns: 0, pendingAnswers: 0 })).toEqual({ kind: "allowed" });
  });

  test("a running turn blocks it", () => {
    expect(installGate({ liveTurns: 1, pendingAnswers: 0 })).toEqual({ kind: "blocked", reason: "conversation" });
  });

  test("a conversation waiting for an answer blocks it", () => {
    expect(installGate({ liveTurns: 0, pendingAnswers: 2 })).toEqual({ kind: "blocked", reason: "conversation" });
    expect(installGate({ liveTurns: 3, pendingAnswers: 1 })).toEqual({ kind: "blocked", reason: "conversation" });
  });
});
