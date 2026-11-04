import { expect, test } from "vitest";
import request from "../conversation/fixtures/codex-mcp-elicitation.json";
import { codexMcpApproval } from "./codexApproval";

// The mcpServer/elicitation/request Codex 0.166.0 sent before a tool without a read-only hint (P2 probe, a local echo
// server named doan-echo-poc). The JSON-RPC id is not in the probe log and is set here.
const LABELS = { "doan-echo-poc": "Echo", "doan-notion": "Notion" };
const withParams = (patch: Record<string, unknown>) => ({ ...request, params: { ...request.params, ...patch } });
const withMeta = (patch: Record<string, unknown>) => withParams({ _meta: { ...request.params._meta, ...patch } });

test("a tool approval becomes a permission request: Run <tool> on <connector>, with Allow, Deny and Allow for this session", () => {
  const read = codexMcpApproval(request, LABELS);
  expect(read).toEqual({
    kind: "permission",
    permission: {
      event: {
        type: "permission.request", requestId: "number:7", tool: "mcpToolCall", summary: "Run ping on Echo",
        options: [{ id: "accept", label: "Allow", kind: "allow" }, { id: "decline", label: "Deny", kind: "deny" }, { id: "acceptForSession", label: "Allow for this session", kind: "allowAlways" }],
      },
      choices: [
        { option: { id: "accept", label: "Allow", kind: "allow" }, response: { id: 7, result: { action: "accept", content: {} } } },
        { option: { id: "decline", label: "Deny", kind: "deny" }, response: { id: 7, result: { action: "decline" } } },
        { option: { id: "acceptForSession", label: "Allow for this session", kind: "allowAlways" }, response: { id: 7, result: { action: "accept", content: {}, _meta: { persist: "session" } } } },
      ],
    },
  });
});

test("Allow for this session appears only when Codex offers a session approval; always is never offered", () => {
  const ids = (raw: unknown) => { const read = codexMcpApproval(raw, LABELS); return read?.kind === "permission" ? read.permission.event.options.map(o => o.id) : null; };
  expect(ids(withMeta({ persist: ["always"] }))).toEqual(["accept", "decline"]);
  expect(ids(withMeta({ persist: [] }))).toEqual(["accept", "decline"]);
  expect(ids(withMeta({ persist: undefined }))).toEqual(["accept", "decline"]);
  expect(ids(withMeta({ persist: "session" }))).toEqual(["accept", "decline"]);
  expect(ids(withMeta({ persist: ["session"] }))).toEqual(["accept", "decline", "acceptForSession"]);
});

test("the summary names the connector, never its doan- name; a server that is not a Doan connector keeps its own name", () => {
  const summary = (raw: unknown, labels: Record<string, string> = LABELS) => { const read = codexMcpApproval(raw, labels); return read?.kind === "permission" ? read.permission.event.summary : null; };
  expect(summary(withParams({ serverName: "doan-notion", message: 'Allow the doan-notion MCP server to run tool "notion-update-page"?' }))).toBe("Run notion-update-page on Notion");
  expect(summary(withParams({ serverName: "codex_apps", message: 'Allow the codex_apps MCP server to run tool "send"?' }))).toBe("Run send on codex_apps");
  // A doan- server missing from the list (removed meanwhile) shows its slug, not the internal name.
  expect(summary(request, {})).toBe("Run ping on echo-poc");
});

test("a message the tool name cannot be read from falls back to Run a tool on <connector>", () => {
  for (const message of ["Approve?", "", 42, undefined])
    expect(codexMcpApproval(withParams({ serverName: "doan-notion", message }), LABELS)).toMatchObject({ kind: "permission", permission: { event: { summary: "Run a tool on Notion" } } });
});

test("the summary stays within 512 characters", () => {
  const read = codexMcpApproval(withParams({ message: `Allow the doan-echo-poc MCP server to run tool "${"t".repeat(2000)}"?` }), LABELS);
  expect(read?.kind === "permission" && read.permission.event.summary.length).toBe(512);
});

test("a string id keeps its type in the request id and the response", () => {
  const read = codexMcpApproval({ ...request, id: "req-1" }, LABELS);
  expect(read).toMatchObject({ kind: "permission", permission: { event: { requestId: "string:req-1" }, choices: [{ response: { id: "req-1" } }] } });
});

test("any other elicitation, such as a form, is declined without asking", () => {
  expect(codexMcpApproval(withMeta({ codex_approval_kind: "form" }), LABELS)).toEqual({ kind: "decline", response: { id: 7, result: { action: "decline" } } });
  expect(codexMcpApproval(withParams({ _meta: null }), LABELS)).toEqual({ kind: "decline", response: { id: 7, result: { action: "decline" } } });
  expect(codexMcpApproval(withParams({ _meta: undefined, requestedSchema: { type: "object", properties: { name: { type: "string" } } } }), LABELS)).toEqual({ kind: "decline", response: { id: 7, result: { action: "decline" } } });
});

test("anything that is not an elicitation request with an id is not this function's", () => {
  expect(codexMcpApproval({ ...request, method: "item/commandExecution/requestApproval" }, LABELS)).toBeNull();
  expect(codexMcpApproval({ method: request.method, params: request.params }, LABELS)).toBeNull();
  expect(codexMcpApproval({ ...request, params: null }, LABELS)).toBeNull();
  expect(codexMcpApproval(null, LABELS)).toBeNull();
});
