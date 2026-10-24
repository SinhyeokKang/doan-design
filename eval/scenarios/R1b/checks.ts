import type { Checks } from "../../lib/types.ts";
import r1 from "../R1/checks.ts";

const checks: Checks = ctx => [
  ...r1(ctx),
  {
    id: "mcp_resolve_invoked",
    pass: ctx.calls.mcpTools.includes("mcp__doan__resolve_comments"),
    detail: "requires doan MCP resolve invocation; R1 event checks independently require valid agent resolves",
  },
];
export default checks;
