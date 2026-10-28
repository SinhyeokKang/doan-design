// Replays a recorded ACP turn (acp-<provider>.json) the way the real server sent it: updates in order, each permission
// request held until the client answers, a rejected tool call reported as failed, and session/cancel ending the turn.
// Test-only knobs come from FAKE_ACP: "auth-link" asks for a browser sign-in at session/new, "hang" never answers a prompt,
// "stop:<reason>" answers a prompt at once with that stopReason ("stop:" with none), "protocol:<n>" answers initialize
// with that protocol version, "no-session" answers session/new without a session ID, "exit-init" exits at initialize.
const readline = require("node:readline");
const fixture = require(process.argv[2]);
const mode = process.env.FAKE_ACP ?? "";
const sessionId = fixture.turn[0].params.sessionId;
const send = value => process.stdout.write(JSON.stringify(value) + "\n");
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
      if (mode === "exit-init") process.exit(7);
      send({ jsonrpc: "2.0", id: request.id, result: mode.startsWith("protocol:") ? { ...fixture.initialize, protocolVersion: Number(mode.slice(9)) } : fixture.initialize }); break;
    case "authenticate": send({ jsonrpc: "2.0", id: request.id, result: {} }); break;
    case "session/new":
      if (mode === "auth-link") { process.stderr.write("__DOAN_AUTH_URL__https://accounts.google.com/o/oauth2/v2/auth?response_type=code&state=s1&redirect_uri=http%3A%2F%2F127.0.0.1%3A4321%2F\n"); break; }
      send({ jsonrpc: "2.0", id: request.id, result: mode === "no-session" ? {} : { sessionId } }); break;
    case "session/load":
      if (request.params.sessionId !== sessionId) { send({ jsonrpc: "2.0", id: request.id, error: { code: -32002, message: "Session not found" } }); break; }
      for (const message of fixture.load) send(message);
      send({ jsonrpc: "2.0", id: request.id, result: {} }); break;
    case "session/prompt":
      promptId = request.id;
      if (mode.startsWith("stop:")) { send({ jsonrpc: "2.0", id: promptId, result: mode === "stop:" ? {} : { stopReason: mode.slice(5) } }); promptId = null; break; }
      if (mode !== "hang") play();
      break;
    case "session/cancel":
      if (promptId !== null) { send({ jsonrpc: "2.0", id: promptId, result: { stopReason: "cancelled" } }); promptId = null; }
      break;
    default: if (request.id !== undefined) send({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } });
  }
});
