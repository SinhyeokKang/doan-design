import type { PendingPermission, PermissionChoice } from "../conversation/types";
import { serverLabel } from "./presets";

// Codex asks before a tool without a read-only hint with mcpServer/elicitation/request, _meta.codex_approval_kind
// "mcp_tool_call" (mcp-connectors design 'Codex MCP 도구 승인'). It becomes the conversation's permission request.
// Any other elicitation (a form) has no screen yet and is declined, so the tool call fails and the turn goes on.
export type CodexMcpApproval = { kind: "permission"; permission: PendingPermission } | { kind: "decline"; response: unknown };

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
// The request carries no tool parameter; its message is "Allow the <server> MCP server to run tool "<tool>"?".
const TOOL = /^Allow the .+ MCP server to run tool "(.+)"\?$/s;

// labels: connectorLabels() of the current list, so a Doan connector shows its name and never `doan-<slug>`.
export function codexMcpApproval(raw: unknown, labels: Readonly<Record<string, string>>): CodexMcpApproval | null {
  if (!object(raw) || raw.method !== "mcpServer/elicitation/request" || (typeof raw.id !== "number" && typeof raw.id !== "string") || !object(raw.params)) return null;
  const { id } = raw, params = raw.params;
  const meta = object(params._meta) ? params._meta : {};
  if (meta.codex_approval_kind !== "mcp_tool_call") return { kind: "decline", response: { id, result: { action: "decline" } } };
  const server = serverLabel(typeof params.serverName === "string" ? params.serverName : "", labels);
  const tool = typeof params.message === "string" ? params.message.match(TOOL)?.[1] : undefined;
  const choice = (optionId: string, label: string, kind: "allow" | "allowAlways" | "deny", result: unknown): PermissionChoice => ({ option: { id: optionId, label, kind }, response: { id, result } });
  const choices = [
    choice("accept", "Allow", "allow", { action: "accept", content: {} }),
    choice("decline", "Deny", "deny", { action: "decline" }),
  ];
  // "always" would write a lasting approval into the provider's config, so only the session approval is offered.
  if (Array.isArray(meta.persist) && meta.persist.includes("session")) choices.push(choice("acceptForSession", "Allow for this session", "allowAlways", { action: "accept", content: {}, _meta: { persist: "session" } }));
  const summary = (tool ? `Run ${tool} on ${server}` : `Run a tool on ${server}`).slice(0, 512);
  return { kind: "permission", permission: { event: { type: "permission.request", requestId: `${typeof id}:${id}`, tool: "mcpToolCall", summary, options: choices.map(c => c.option) }, choices } };
}
