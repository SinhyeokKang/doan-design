// Read literal arguments without evaluating agent-authored JavaScript. Strings
// and comments are tokens, so quoted examples cannot become tool invocations.
export function scriptTokens(source: string): string[] {
  return [...source.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[\w$]+|[^\s]/g)]
    .map(m => m[0]).filter(t => !t.startsWith("//") && !t.startsWith("/*"));
}

// Mirror the CLI's known flag arities; a flag value is never command evidence.
export function doanPositionals(words: string[]): string[] | undefined {
  if (!/^(?:.*\/)?doan$/.test(words[0] ?? "")) return undefined;
  const values = ["repo", "token-css", "add-serve", "remove-serve", "canvas", "agent", "frame", "message", "o"];
  const booleans = ["json", "clear-token-css", "force"];
  const positionals: string[] = [];
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (word === "--") { positionals.push(...words.slice(i + 1)); break; }
    if (!word.startsWith("-") || word === "-") { positionals.push(word); continue; }
    const match = word.match(/^--?([^=]+)(?:=(.*))?$/);
    if (!match) return undefined;
    const [, name, value] = match;
    if (values.includes(name)) { if (value === undefined && ++i >= words.length) return undefined; }
    else if (!booleans.includes(name) || (value !== undefined && !/^(?:1|0|t|T|true|TRUE|True|f|F|false|FALSE|False)$/.test(value))) return undefined;
  }
  return positionals;
}

export function doanCommand(words: string[]): string | undefined {
  return doanPositionals(words)?.[0];
}

interface ExtractedCall { name: string; command?: string; patch?: string; patchCandidate?: string }

function execCalls(source: string): ExtractedCall[] {
  const tokens = scriptTokens(source);
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
  const calls: ExtractedCall[] = [];
  for (let i = 0; i < tokens.length - 4; i++) {
    if (tokens[i] !== "tools" || tokens[i + 1] !== "." || tokens[i + 3] !== "(") continue;
    const name = tokens[i + 2];
    if (name === "apply_patch") {
      const patch = literal(tokens[i + 4]);
      if (patch !== undefined && tokens[i + 5] === ")") {
        // A whole batch consisting of one literal call has no earlier statement
        // that can skip it or throw. Everything else stays lexical evidence only.
        const argument = tokens[i + 4]!;
        const simpleLiteral = argument[0] === '"' || (!/\\(?![\\'"`nrtbfv0]|u[\da-fA-F]{4}|x[\da-fA-F]{2}|\r?\n)/.test(argument) &&
          !/\\0[0-9]/.test(argument) && (argument[0] === "`" || !/[\r\n]/.test(argument)));
        const start = tokens[0] === "await" ? 1 : 0;
        const end = tokens.at(-1) === ";" ? tokens.length - 1 : tokens.length;
        const standalone = simpleLiteral && i === start && end === i + 6;
        calls.push(standalone ? { name, patch } : { name, patchCandidate: patch });
      }
      continue;
    }
    if (/^mcp__/.test(name)) calls.push({ name });
    if (name !== "exec_command") continue;
    if (tokens[i + 4] !== "{") continue;
    let depth = 1;
    for (let j = i + 5; j < tokens.length && depth > 0; j++) {
      if (tokens[j] === "{") depth++;
      if (tokens[j] === "}") depth--;
      if (depth === 1 && (tokens[j] === "cmd" || literal(tokens[j]) === "cmd") && tokens[j + 1] === ":") {
        const value = literal(tokens[j + 2]);
        if (value !== undefined && [",", "}"].includes(tokens[j + 3])) calls.push({ name, command: value });
      }
    }
  }
  return calls;
}

function rolloutCalls(event: { type?: string; payload?: { type?: string; name?: string; input?: string; arguments?: string } }): ExtractedCall[] {
  if (event.type !== "response_item") return [];
  const p = event.payload;
  if (p?.type === "custom_tool_call" && /^(?:functions\.)?apply_patch$/.test(p.name ?? "") && typeof p.input === "string") return [{ name: "apply_patch", patch: p.input }];
  if (p?.type === "custom_tool_call" && /^(?:functions\.)?exec$/.test(p.name ?? "") && typeof p.input === "string") return execCalls(p.input);
  if (p?.type !== "function_call" || typeof p.name !== "string") return [];
  if (/^(?:functions\.)?apply_patch$/.test(p.name)) {
    try {
      const args = JSON.parse(p.arguments ?? "");
      const patch = typeof args === "string" ? args : args.patch ?? args.input;
      return typeof patch === "string" ? [{ name: "apply_patch", patch }] : [];
    } catch { return []; }
  }
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

// A heredoc body (the lines after `<<TAG`, `<<'TAG'`, `<<"TAG"` or `<<-TAG` up to the line that is the tag) is data for
// the command, such as a handoff message that may well contain a line starting with `doan open`. Quoted text is kept
// whole, so a `<<` inside a string starts nothing and `bash -c "…<<EOF…"` is read when its script is.
function withoutHeredocBodies(command: string): string {
  let out = "", quote: string | null = null;
  const pending: { tag: string; indented: boolean }[] = [];
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    if (quote) {
      out += c;
      if (c === "\\" && quote === '"') out += command[++i] ?? "";
      else if (c === quote) quote = null;
    } else if (c === "\\") {
      out += c + (command[++i] ?? "");
    } else if (c === "'" || c === '"') {
      quote = c;
      out += c;
    } else if (c === "<" && command.startsWith("<<<", i)) {
      out += "<<<";
      i += 2;
    } else if (c === "<" && command[i + 1] === "<" && /^<<(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|([^\s;&|<>()'"]+))/.test(command.slice(i))) {
      const m = /^<<(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|([^\s;&|<>()'"]+))/.exec(command.slice(i))!;
      pending.push({ tag: m[2] ?? m[3] ?? m[4]!, indented: m[1] === "-" });
      out += m[0];
      i += m[0].length - 1;
    } else if (c === "\n" && pending.length) {
      out += c;
      for (const { tag, indented } of pending.splice(0)) {
        // An unterminated body runs to the end, as the shell reads it.
        while (i + 1 < command.length) {
          const end = command.indexOf("\n", i + 1);
          const line = command.slice(i + 1, end === -1 ? command.length : end);
          i = end === -1 ? command.length : end;
          if ((indented ? line.replace(/^\t+/, "") : line) === tag) break;
        }
      }
    } else out += c;
  }
  return out;
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z_0-9]*=/;
const VARIABLE = /\$(?:(\w+)|\{(\w+)\})/g;
// Loop iterations one command may expand in total, nested loops included, so a transcript cannot make the reader
// work without bound. A loop that would pass it is not followed: its body is read once with the variable unresolved.
const LOOP_BUDGET = 256;

// One raw token (quotes still on) to the words the shell makes of it. Single quotes keep `$name`, an escaped `\$` in
// double quotes stays literal, and a variable that is not known here stays as written. A bare `$name` holding
// several words splits into them, as an unquoted expansion does.
function expandToken(raw: string, env: ReadonlyMap<string, string>): string[] {
  const whole = /^\$(?:(\w+)|\{(\w+)\})$/.exec(raw);
  const held = whole ? env.get(whole[1] ?? whole[2]!) : undefined;
  if (held !== undefined) return held.split(/\s+/).filter(Boolean);
  const known = (written: string, plain?: string, braced?: string) => env.get(plain ?? braced!) ?? written;
  return [raw.replace(/"((?:\\.|[^"\\])*)"|'([^']*)'|([^"']+)/g, (_, double, single, bare) => {
    if (single !== undefined) return single;
    if (double !== undefined) return double.replace(/\\([\$`"\\\n])|\$(?:(\w+)|\{(\w+)\})/g, (m: string, escaped: string | undefined, plain?: string, braced?: string) => escaped ?? known(m, plain, braced));
    return bare.replace(VARIABLE, known);
  })];
}

// Executes the words of raw token groups the way the shell would, for what a transcript can show: `NAME=value`
// assignments on their own, and a closed `for NAME in words; do …; done` with its body run once per word. The
// variables are one shell state: a loop variable and an assignment in a body stay set after the loop, as in POSIX
// sh. A loop with no `done`, or too long to follow, is never taken as run; a word that cannot be resolved stays as
// written. Anything else (`while`, `if`, command substitution) is read as written.
function runGroups(groups: string[][], vars: Map<string, string>, budget: { left: number }): string[][] {
  const out: string[][] = [];
  const append = (words: string[][]) => { for (const entry of words) out.push(entry); };
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]!;
    const head = groups[i + 1];
    if (group[0] === "for" && /^[A-Za-z_]\w*$/.test(group[1] ?? "") && group[2] === "in" && head?.[0] === "do") {
      const rest = head.length > 1 ? [head.slice(1)] : [];
      const body = [...rest, ...groups.slice(i + 2)];
      let depth = 1, done = -1;
      for (let j = 0; j < body.length && done < 0; j++) {
        // A nested loop can open right after its parent's `do`.
        if (["for", "while", "until", "select"].includes((body[j]![0] === "do" ? body[j]![1] : body[j]![0]) ?? "")) depth++;
        if (body[j]![0] === "done" && --depth === 0) done = j;
      }
      if (done >= 0) {
        const values = group.slice(3).flatMap(token => expandToken(token, vars));
        if (values.length <= budget.left) {
          budget.left -= values.length;
          for (const value of values) { vars.set(group[1]!, value); append(runGroups(body.slice(0, done), vars, budget)); }
        } else {
          vars.delete(group[1]!);
          append(runGroups(body.slice(0, done), vars, budget));
        }
        // Continue after the loop's `done`.
        i += 2 + done - rest.length;
        continue;
      }
    }
    let skipped = 0;
    while (ASSIGNMENT.test(group[skipped] ?? "")) skipped++;
    // Assignments before a command belong to that command alone; a group of only assignments sets them for the rest.
    if (skipped > 0 && skipped === group.length) for (const token of group) vars.set(token.slice(0, token.indexOf("=")), expandToken(token.slice(token.indexOf("=") + 1), vars).join(" "));
    let words = group.slice(skipped).flatMap(token => expandToken(token, vars));
    // The `command` builtin runs its operand, except -v/-V, which only look the name up.
    if (words[0] === "command") {
      let k = 1;
      while (/^-[pvV]+$/.test(words[k] ?? "")) k++;
      if (!/[vV]/.test(words.slice(1, k).join(""))) words = words.slice(words[k] === "--" ? k + 1 : k);
    }
    if (/^(?:.*\/)?(?:ba|z|da)?sh$/.test(words[0] ?? "") && /^-[a-z]*c$/.test(words[1] ?? "") && words[2]) append(wordsOf(words[2], budget));
    else if (words.length) out.push(words);
  }
  return out;
}

function wordsOf(command: string, budget: { left: number }): string[][] {
  const groups: string[][] = [[]];
  for (const token of withoutHeredocBodies(command).matchAll(/[;&|\n]+|(?:"(?:\\.|[^"\\])*"|'[^']*'|[^\s;&|"'])+/g)) {
    const value = token[0];
    if (/^[;&|\n]+$/.test(value)) groups.push([]);
    else groups.at(-1)!.push(value);
  }
  return runGroups(groups.filter(g => g.length), new Map(), budget);
}

// Preserve quoted arguments so echoing a command cannot count as invoking it.
export function commandWords(command: string): string[][] {
  return wordsOf(command, { left: LOOP_BUDGET });
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
    if (call.command !== undefined && commandWords(call.command).some(words => /^(?:.*\/)?doan$/.test(words[0] ?? "")))
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

export interface ToolSearch { callId: string; input: string; excerpt?: string }

function toolSearches(transcript: string): ToolSearch[] {
  const searches: ToolSearch[] = [];
  const results = new Map<string, unknown>();
  for (const line of transcript.split(/\r?\n/)) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (!record(event) || event.type !== "response_item" || !record(event.payload)) continue;
    const p = event.payload;
    if (typeof p.call_id !== "string") continue;
    if (p.type === "custom_tool_call_output") results.set(p.call_id, p.output);
    if (p.type === "custom_tool_call" && /^(?:functions\.)?exec$/.test(String(p.name)) && typeof p.input === "string" && scriptTokens(p.input).includes("ALL_TOOLS"))
      searches.push({ callId: p.call_id, input: p.input.slice(0, 200) });
  }
  return searches.map(search => {
    if (!results.has(search.callId)) return search;
    const output = results.get(search.callId);
    // Keep empty lookup arrays: generic invocation output flattening drops them.
    const texts = Array.isArray(output) ? output.flatMap(part => record(part) && typeof part.text === "string" ? [part.text] : []) : [];
    const excerpt = (texts.length ? texts.join("\n") : typeof output === "string" ? output : JSON.stringify(output) ?? "").slice(0, 300);
    return { ...search, excerpt };
  });
}

export interface ToolCalls { commands: string[]; mcpTools: string[]; patches?: string[]; patchCandidates?: string[]; outputs?: InvocationOutput[]; toolSearches?: ToolSearch[] }

export function toolCalls(transcript: string): ToolCalls {
  const outputs = invocationOutputs(transcript);
  const searches = toolSearches(transcript);
  const patchCalls = transcript.split(/\r?\n/).flatMap(line => {
    try { return rolloutCalls(JSON.parse(line)); }
    catch { return []; }
  });
  const patches = patchCalls.flatMap(call => call.patch === undefined ? [] : [call.patch]);
  const patchCandidates = patchCalls.flatMap(call => call.patchCandidate === undefined ? [] : [call.patchCandidate]);
  return { commands: [...new Set(shellCommands(transcript))], mcpTools: [...new Set(mcpTools(transcript))], ...(patches.length ? { patches } : {}), ...(patchCandidates.length ? { patchCandidates } : {}), ...(outputs.length ? { outputs } : {}), ...(searches.length ? { toolSearches: searches } : {}) };
}
