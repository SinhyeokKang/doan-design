// Claude's result is the final answer, not its tool results. Codex stdout
// precedes its stderr banner in CheckContext.transcript (readAgentTranscript).
export function finalAnswer(transcript: string): string {
  for (const line of transcript.split(/\r?\n/).reverse()) {
    try {
      const event = JSON.parse(line);
      if (event.type === "result" && typeof event.result === "string") return event.result;
    } catch { /* Plain Codex stdout and fixture answers are not JSON. */ }
  }
  const stdout = transcript.split(/^OpenAI Codex v[^\n]*$/m)[0].trim();
  // Never turn a JSON tool result (including a quoted guide) into answer evidence.
  if (stdout.split(/\r?\n/).some(line => /^\s*\{/.test(line))) return "";
  return stdout;
}
