// Replays a recorded ACP turn (acp-<provider>.json) the way the real server sent it: updates in order, each permission
// request held until the client answers, a rejected tool call reported as failed, and session/cancel ending the turn.
// Test-only knobs come from FAKE_ACP: "auth-link" asks for a browser sign-in at session/new, "hang" never answers a prompt,
// "stop:<reason>" answers a prompt at once with that stopReason ("stop:" with none), "protocol:<n>" answers initialize
// with that protocol version, "no-session" answers session/new without a session ID, "exit-init" exits at initialize, after writing FAKE_ACP_STDERR
// (if set) to stderr.
// FAKE_ACP_MODELS (JSON) is the `models` member of the session/new and session/load results, in the shape
// a PoC recorded; FAKE_ACP_LOG names a file that receives every client line; FAKE_ACP_NO_IMAGE answers
// initialize with promptCapabilities.image false. FAKE_ACP_SESSION (JSON) adds members such as `modes` and
// `configOptions` to the session/new and session/load results. FAKE_ACP_COMMANDS (JSON) is an availableCommands list the
// server pushes as Copilot 1.0.105 did: once before the session/new answer and once right after it, and before the
// session/load answer; FAKE_ACP_COMMANDS_OTHER adds a first push for another session id; FAKE_ACP_COMMANDS_EARLY=<n>
// pushes n lists (the last one named "last") before the session/new answer instead of one. FAKE_ACP_TOOL_PID names a
// file: at session/prompt the server starts `sleep 120` in a process group of its own, as Antigravity runs a tool
// command, writes its pid there and leaves the prompt unanswered until session/cancel.
const readline = require("node:readline");
const fixture = require(process.argv[2]);
const mode = process.env.FAKE_ACP ?? "";
const models = { ...(process.env.FAKE_ACP_MODELS ? { models: JSON.parse(process.env.FAKE_ACP_MODELS) } : {}), ...(process.env.FAKE_ACP_SESSION ? JSON.parse(process.env.FAKE_ACP_SESSION) : {}) };
const sessionId = fixture.turn[0].params.sessionId;
const send = value => process.stdout.write(JSON.stringify(value) + "\n");
const commands = process.env.FAKE_ACP_COMMANDS ? JSON.parse(process.env.FAKE_ACP_COMMANDS) : null;
const pushCommands = (id, list = commands) => { if (list) send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: id, update: { sessionUpdate: "available_commands_update", availableCommands: list } } }); };
let waiting = null, rejected = new Set(), promptId = null, step = 0;
function play() {
  while (step < fixture.turn.length) {
    const message = fixture.turn[step++];
    if (message.method === "session/request_permission") { waiting = message; send(message); return; }
    if (message.result && "stopReason" in message.result) { send({ jsonrpc: "2.0", id: promptId, result: message.result }); promptId = null; return; }
    const update = message.params.update;
    if (rejected.has(update.toolCallId) && update.status === "completed") send({ ...message, params: { ...message.params, update: { ...update, status: "failed" } } });
    else send(message);
  }
}
readline.createInterface({ input: process.stdin }).on("line", line => {
  const request = JSON.parse(line);
  if (process.env.FAKE_ACP_LOG) require("node:fs").appendFileSync(process.env.FAKE_ACP_LOG, line + "\n");
  if (!request.method) {
    if (waiting && request.id === waiting.id) {
      const outcome = request.result.outcome;
      process.stderr.write(`answered ${JSON.stringify(outcome)}\n`);
      if (outcome.outcome !== "selected" || outcome.optionId.startsWith("reject")) rejected.add(waiting.params.toolCall.toolCallId);
      waiting = null; if (promptId !== null) play();
    }
    return;
  }
  switch (request.method) {
    case "initialize":
      if (mode === "exit-init") { process.stderr.write(process.env.FAKE_ACP_STDERR ?? "", () => process.exit(7)); break; }
      // "hang-init" never answers initialize, a server still starting.
      if (mode === "hang-init") break;
      send({ jsonrpc: "2.0", id: request.id, result: mode.startsWith("protocol:") ? { ...fixture.initialize, protocolVersion: Number(mode.slice(9)) } : process.env.FAKE_ACP_NO_IMAGE ? { ...fixture.initialize, agentCapabilities: { ...fixture.initialize.agentCapabilities, promptCapabilities: { image: false } } } : fixture.initialize }); break;
    case "authenticate": send({ jsonrpc: "2.0", id: request.id, result: {} }); break;
    case "session/new":
      if (mode === "auth-link") { process.stderr.write("__DOAN_AUTH_URL__https://accounts.google.com/o/oauth2/v2/auth?response_type=code&state=s1&redirect_uri=http%3A%2F%2F127.0.0.1%3A4321%2F\n"); break; }
      if (process.env.FAKE_ACP_COMMANDS_OTHER) pushCommands("other-session", [{ name: "other", description: "" }]);
      for (let i = 1; i < Number(process.env.FAKE_ACP_COMMANDS_EARLY ?? 1); i++) pushCommands(sessionId, [{ name: `early-${i}`, description: "" }]);
      pushCommands(sessionId, Number(process.env.FAKE_ACP_COMMANDS_EARLY ?? 1) > 1 ? [{ name: "last", description: "" }] : commands);
      send({ jsonrpc: "2.0", id: request.id, result: mode === "no-session" ? {} : { sessionId, ...models } });
      // Right after the answer, in a write of its own as the real server's came.
      setTimeout(() => pushCommands(sessionId), 20); break;
    case "session/load":
      if (request.params.sessionId !== sessionId) { send({ jsonrpc: "2.0", id: request.id, error: { code: -32002, message: "Session not found" } }); break; }
      for (const message of fixture.load) send(message);
      pushCommands(sessionId);
      send({ jsonrpc: "2.0", id: request.id, result: models }); break;
    case "session/set_config_option": send({ jsonrpc: "2.0", id: request.id, result: { configOptions: [] } }); break;
    case "session/prompt":
      promptId = request.id;
      if (process.env.FAKE_ACP_TOOL_PID) {
        const tool = require("node:child_process").spawn("/bin/sleep", ["120"], { detached: true, stdio: "ignore" });
        require("node:fs").writeFileSync(process.env.FAKE_ACP_TOOL_PID, String(tool.pid)); break;
      }
      if (mode.startsWith("stop:")) { send({ jsonrpc: "2.0", id: promptId, result: mode === "stop:" ? {} : { stopReason: mode.slice(5) } }); promptId = null; break; }
      if (mode !== "hang") play();
      break;
    case "session/cancel":
      if (promptId !== null) { send({ jsonrpc: "2.0", id: promptId, result: { stopReason: "cancelled" } }); promptId = null; }
      break;
    default: if (request.id !== undefined) send({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } });
  }
});
