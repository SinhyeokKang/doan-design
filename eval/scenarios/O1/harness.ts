import { readFileSync } from "node:fs";
import { join } from "node:path";
import { onboardingApp } from "../../lib/socket.ts";
import { toolCalls } from "../../lib/transcript.ts";
import type { Check, CheckContext, Checks } from "../../lib/types.ts";
import type { Exchange } from "./log.ts";

// Scores a scripted sequence against a scenario's checks in process: requests go
// through the same fake app the runner starts, and commands become parsed tool
// calls, so each test can add exactly one violation.
export const ROOT = "/tmp/doan-eval-O/repo";
const TOKEN = "t".repeat(64);

export function score(scenario: string, checks: Checks, steps: Record<string, unknown>[], o: { commands?: string[]; changed?: string[] } = {}): Map<string, Check> {
  const app = onboardingApp(JSON.parse(readFileSync(join(import.meta.dirname, "..", scenario, "onboarding.json"), "utf8")), ROOT);
  const log: Exchange[] = steps.map(step => {
    const request = { v: 2, ...step };
    return { request, response: app.answer(JSON.stringify({ ...request, token: TOKEN }), TOKEN) };
  });
  const transcript = (o.commands ?? []).map((command, i) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: `t${i}`, name: "Bash", input: { command } }] } })).join("\n");
  const ctx = { repo: ROOT, onboarding: () => log, changedFiles: () => o.changed ?? [], calls: toolCalls(transcript) } as unknown as CheckContext;
  return new Map(checks(ctx).map(c => [c.id, c]));
}

export const failed = (result: Map<string, Check>) => [...result.values()].filter(c => !c.pass).map(c => c.id).sort();
