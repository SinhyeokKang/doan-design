// Tool results and prose can quote commands without executing them.
export function shellCommands(transcript: string): string[] {
  const commands: string[] = [];
  const lines = transcript.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    try {
      const event = JSON.parse(lines[i]);
      if (event.type === "assistant") {
        for (const block of event.message?.content ?? []) {
          if (block.type === "tool_use" && block.name === "Bash" && typeof block.input?.command === "string") commands.push(block.input.command);
        }
      }
    } catch { /* Codex's stderr is text, not stream-json. */ }
    if (lines[i] === "exec" && /^\/\S+\s+-[a-z]*c\s/.test(lines[i + 1] ?? "")) {
      const header = lines[++i];
      const cwdStart = header.lastIndexOf(" in /");
      commands.push(cwdStart === -1 ? header : header.slice(0, cwdStart));
    }
  }
  return commands;
}

// Preserve quoted arguments so echoing a command cannot count as invoking it.
export function commandWords(command: string): string[][] {
  const groups: string[][] = [[]];
  for (const token of command.matchAll(/"(?:\\.|[^"\\])*"|'[^']*'|[;&|\n]+|[^\s;&|"']+/g)) {
    const value = token[0];
    if (/^[;&|\n]+$/.test(value)) groups.push([]);
    else groups.at(-1)!.push(/^["']/.test(value) ? value.slice(1, -1) : value);
  }
  return groups.filter(g => g.length).flatMap(words => {
    if (/^(?:.*\/)?(?:ba|z|da)?sh$/.test(words[0]) && /^-[a-z]*c$/.test(words[1] ?? "") && words[2]) return commandWords(words[2]);
    while (/^[A-Za-z_][A-Za-z_0-9]*=/.test(words[0] ?? "")) words.shift();
    return [words];
  });
}
