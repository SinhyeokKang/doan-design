import type { Agent } from "./args.ts";

export const KNOWN_CONDITIONS: { scenario: string; agent: Agent; note: string }[] = [
  { scenario: "R2", agent: "codex", note: "expected fail: MCP disabled by design (see R2b)" },
];
