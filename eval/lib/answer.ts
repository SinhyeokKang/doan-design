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
// shown as text, not drawn as a link (R9 scores only links the app would draw). A fence that is never closed runs to
// the end of the text, and an inline code span never crosses a blank line (CommonMark), so a stray backtick in one
// paragraph cannot swallow a link in the next.
export function withoutCode(markdown: string): string {
  const kept: string[] = [];
  let fence: { char: string; size: number } | null = null;
  for (const line of markdown.split("\n")) {
    const run = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence === null) {
      if (run) { fence = { char: run[1]![0]!, size: run[1]!.length }; kept.push(""); } else kept.push(line);
    } else if (run && run[1]![0] === fence.char && run[1]!.length >= fence.size && run[2]!.trim() === "") {
      fence = null;
    }
  }
  return kept.join("\n").split(/(\n[ \t]*\n)/).map((part, i) => i % 2 === 1 ? part : part.replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, "")).join("");
}
