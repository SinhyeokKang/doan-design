// Minimal stdio MCP server for the P2 probe: one tool, `ping`.
import { createInterface } from "node:readline";
const send = m => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
createInterface({ input: process.stdin }).on("line", line => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id === undefined) return;
  if (m.method === "initialize") send({ id: m.id, result: { protocolVersion: m.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "doan-echo-poc", version: "0.0.1" } } });
  else if (m.method === "tools/list") send({ id: m.id, result: { tools: [{ name: "ping", description: "Returns pong.", inputSchema: { type: "object", properties: {} } }] } });
  else if (m.method === "tools/call") send({ id: m.id, result: { content: [{ type: "text", text: "pong-from-doan-echo-poc" }] } });
  else send({ id: m.id, result: {} });
});
