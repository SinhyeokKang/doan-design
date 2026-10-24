// Read literal arguments without evaluating agent-authored JavaScript. Strings
// and comments are tokens, so quoted examples cannot become tool invocations.
function execCalls(source: string): { name: string; command?: string }[] {
  const tokens = [...source.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[\w$]+|[^\s]/g)]
    .map(m => m[0]).filter(t => !t.startsWith("//") && !t.startsWith("/*"));
  const literal = (token: string | undefined): string | undefined => {
    if (!token || !/^["'`]/.test(token) || (token[0] === "`" && token.includes("${"))) return undefined;
    if (token[0] === '"') {
      try { return JSON.parse(token); } catch { return undefined; }
    }
    const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0", "\n": "", "\r\n": "" };
    return token.slice(1, -1).replace(/\\(u[\da-fA-F]{4}|x[\da-fA-F]{2}|\r?\n|.)/g, (_, escape: string) => {
      if (escape.startsWith("u") || escape.startsWith("x")) return String.fromCharCode(parseInt(escape.slice(1), 16));
      return escapes[escape] ?? escape;
    });
  };
  const calls: { name: string; command?: string }[] = [];
  for (let i = 0; i < tokens.length - 4; i++) {
    if (tokens[i] !== "tools" || tokens[i + 1] !== "." || tokens[i + 3] !== "(") continue;
    const name = tokens[i + 2];
    if (name !== "exec_command") { if (/^mcp__/.test(name)) calls.push({ name }); continue; }
    if (tokens[i + 4] !== "{") continue;
    let depth = 1;
    for (let j = i + 5; j < tokens.length && depth > 0; j++) {
      if (tokens[j] === "{") depth++;
      if (tokens[j] === "}") depth--;
      if (depth === 1 && (tokens[j] === "cmd" || literal(tokens[j]) === "cmd") && tokens[j + 1] === ":") {
        const command = literal(tokens[j + 2]);
        if (command !== undefined && [",", "}"].includes(tokens[j + 3])) calls.push({ name, command });
      }
    }
  }
  return calls;
}

function rolloutCalls(event: { type?: string; payload?: { type?: string; name?: string; input?: string; arguments?: string } }): { name: string; command?: string }[] {
  if (event.type !== "response_item") return [];
  const p = event.payload;
  if (p?.type === "custom_tool_call" && /^(?:functions\.)?exec$/.test(p.name ?? "") && typeof p.input === "string") return execCalls(p.input);
  if (p?.type !== "function_call" || typeof p.name !== "string") return [];
  if (p.name === "exec_command" || p.name === "functions.exec_command") {
    try {
      const args = JSON.parse(p.arguments ?? "");
      return typeof args.cmd === "string" ? [{ name: "exec_command", command: args.cmd }] : [];
    } catch { return []; }
  }
  return [{ name: p.name }];
}

export function mcpTools(transcript: string): string[] {
  const tools: string[] = [];
  for (const line of transcript.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      if (event.type === "assistant") {
        for (const block of event.message?.content ?? [])
          if (block.type === "tool_use" && /^mcp__/.test(block.name)) tools.push(block.name);
      }
      tools.push(...rolloutCalls(event).map(c => c.name).filter(n => /^mcp__/.test(n)));
    } catch { /* Codex stderr also records direct MCP calls as text. */ }
    const call = line.match(/^tool ([\w-]+)\.([\w-]+)\(/);
    if (call) tools.push(`mcp__${call[1]}__${call[2]}`);
  }
  return tools;
}

// Tool results and prose can quote commands without executing them.
export function shellCommands(transcript: string): string[] {
  const commands: string[] = [];
  const lines = transcript.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    try {
      const event = JSON.parse(lines[i]);
      commands.push(...rolloutCalls(event).flatMap(c => c.command === undefined ? [] : [c.command]));
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

export interface InvocationOutput {
  name: string;
  command?: string;
  callId: string;
  scope: "call" | "batch";
  excerpt: string;
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function outputParts(value: unknown, depth = 0): { text: string; error: boolean }[] {
  if (depth > 10) return [];
  if (typeof value === "string") {
    try { return outputParts(JSON.parse(value), depth + 1); }
    catch { return [{ text: value, error: false }]; }
  }
  if (Array.isArray(value)) return value.flatMap(part => outputParts(part, depth + 1));
  if (!record(value)) return [];
  if (record(value.error) && typeof value.error.code === "string" && typeof value.error.message === "string")
    return [{ text: `${value.error.code}: ${value.error.message}`, error: true }];
  for (const key of ["output", "content", "text"]) {
    if (value[key] !== undefined) return outputParts(value[key], depth + 1);
  }
  return [{ text: JSON.stringify(value), error: false }];
}

function invocationOutputs(transcript: string): InvocationOutput[] {
  const calls: Omit<InvocationOutput, "excerpt">[] = [];
  const results = new Map<string, unknown[]>();
  const addResult = (id: unknown, output: unknown) => {
    if (typeof id === "string") results.set(id, [...(results.get(id) ?? []), output]);
  };
  const addCall = (call: { name: string; command?: string }, id: unknown, scope: "call" | "batch") => {
    if (typeof id !== "string") return;
    if (/^mcp__doan__/.test(call.name) || (call.command !== undefined && commandWords(call.command).some(words => /^(?:.*\/)?doan$/.test(words[0] ?? ""))))
      calls.push({ ...call, callId: id, scope });
  };
  for (const line of transcript.split(/\r?\n/)) {
    let event;
    try { event = JSON.parse(line); } catch { continue; /* Plain stderr has no result ids. */ }
    if (!record(event)) continue;
    const p = event.payload;
    if (event.type === "response_item" && record(p)) {
      if (p.type === "function_call_output" || p.type === "custom_tool_call_output") addResult(p.call_id, p.output);
      // A custom exec result belongs to the whole script, not an identifiable
      // inner call: output order can differ from invocation order or be omitted.
      for (const call of rolloutCalls(event)) addCall(call, p.call_id, p.type === "custom_tool_call" ? "batch" : "call");
    }
    if (record(event.message) && Array.isArray(event.message.content)) {
      for (const block of event.message.content) {
        if (!record(block)) continue;
        if (event.type === "assistant" && block.type === "tool_use" && typeof block.name === "string") {
          const command = block.name === "Bash" && record(block.input) && typeof block.input.command === "string" ? block.input.command : undefined;
          addCall({ name: block.name, ...(command === undefined ? {} : { command }) }, block.id, "call");
        }
        if (event.type === "user" && block.type === "tool_result") addResult(block.tool_use_id, block.content);
      }
    }
  }
  return calls.flatMap(call => {
    const parts = outputParts(results.get(call.callId));
    // Prefer structured errors so batch metadata or large successful outputs
    // cannot hide the reason a doan invocation stalled.
    const errors = parts.filter(part => part.error);
    const excerpt = (errors.length ? errors : parts).map(part => part.text).join("\n").slice(0, 300);
    return excerpt ? [{ ...call, excerpt }] : [];
  });
}

export interface ToolCalls { commands: string[]; mcpTools: string[]; outputs?: InvocationOutput[] }

export function toolCalls(transcript: string): ToolCalls {
  const outputs = invocationOutputs(transcript);
  return { commands: [...new Set(shellCommands(transcript))], mcpTools: [...new Set(mcpTools(transcript))], ...(outputs.length ? { outputs } : {}) };
}
