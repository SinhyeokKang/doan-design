// Claude's result is the final answer, not its tool results. Codex stdout
// precedes its stderr banner in CheckContext.transcript (readAgentTranscript).
export function finalAnswer(transcript: string): string {
  const stdout = transcript.split(/^OpenAI Codex v[^\n]*$/m)[0].trim();
  const prose = stdout.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, "").trim();
  let toolOutput = false;
  for (const line of prose.split(/\r?\n/).reverse()) {
    try {
      const event = JSON.parse(line);
      if (!event || typeof event !== "object") continue;
      if (event.type === "result" && typeof event.result === "string") return event.result;
      // Domain JSON quoted in a plain answer is not an agent event or tool envelope.
      if (["system", "user", "assistant", "result", "tool_use", "tool_result",
        "session_meta", "turn_context", "response_item", "event_msg", "error"].includes(event.type) ||
        /^(thread|turn|item)\.(started|updated|completed|failed)$/.test(event.type) ||
        (typeof event.ok === "boolean" && ("result" in event || "error" in event)) ||
        (typeof event.exit_code === "number" && typeof event.output === "string")) toolOutput = true;
    } catch { /* Plain Codex stdout and fixture answers are not JSON. */ }
  }
  // Never turn a JSON tool result (including a quoted guide) into answer evidence.
  return toolOutput ? "" : prose;
}

// Markdown that a reader sees as prose: fenced blocks and inline code spans removed, because a link inside code is
// shown as text, not drawn as a link (R9 scores only links the app would draw).
export function withoutCode(markdown: string): string {
  return markdown
    .replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, "")
    .replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, "");
}
