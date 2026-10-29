import type { Checks } from "../../lib/types.ts";
import d10 from "../D10/checks.ts";
import { bypassChecks } from "../D1/presets.ts";

// D10 over MCP only, so MCP init's nextSteps (spec §4.9) are what the agent sees.
const checks: Checks = ctx => [
  ...d10(ctx),
  { id: "mcp_init_invoked", pass: ctx.calls.mcpTools.includes("mcp__doan__init"), detail: `doan MCP tools: ${[...new Set(ctx.calls.mcpTools.filter(t => t.startsWith("mcp__doan__")))].join(", ") || "(none)"}` },
  ...bypassChecks(ctx),
];
export default checks;
