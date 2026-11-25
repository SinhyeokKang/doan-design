import type { RecordedCall } from "./call-log.ts";
// Read literal arguments without evaluating agent-authored JavaScript. Strings
// and comments are tokens, so quoted examples cannot become tool invocations.
export function scriptTokens(source: string): string[] {
  return [...source.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[\w$]+|[^\s]/g)]
    .map(m => m[0]).filter(t => !t.startsWith("//") && !t.startsWith("/*"));
}

// Mirror the CLI's flag set (cli/internal/cli/run.go, compared both ways by transcript.test.ts) with its arities.
export const DOAN_VALUE_FLAGS: readonly string[] = ["repo", "storage", "token-css", "add-serve", "remove-serve", "frame", "note", "message", "session", "operation", "provider", "request", "path", "url", "destination", "inspection", "o"];
export const DOAN_BOOLEAN_FLAGS: readonly string[] = ["json", "clear-token-css", "spend-copilot-request", "initialize", "git-init", "force", "prototype"];

// The commands run.go dispatches (compared both ways by transcript.test.ts). A check that looks for a command names one
// of these, so a renamed command fails that test instead of leaving an absence check that can never fail.
export const DOAN_COMMANDS: readonly string[] = ["init", "config", "ls", "skill", "design-skill", "check", "work", "active", "onboarding", "open", "handoff", "remove", "export"];

// The flags each command takes besides json and repo (run.go's table, compared by transcript.test.ts); work takes its
// flags only as `work update`, and onboarding takes json and its own flags, not repo.
export const DOAN_COMMAND_FLAGS: Readonly<Record<string, readonly string[]>> = {
  config: ["storage", "git-init", "token-css", "clear-token-css", "add-serve", "remove-serve"],
  init: ["storage", "git-init", "token-css"],
  open: ["frame", "prototype"],
  handoff: ["message"],
  "work update": ["frame", "note"],
  export: ["o", "force", "frame", "prototype"],
  onboarding: ["session", "operation", "provider", "request", "path", "url", "destination", "inspection", "storage", "spend-copilot-request", "initialize"],
};

export interface DoanArgs { positionals: string[]; flags: { name: string; value: string | undefined }[]; refused: boolean }

const TRUE = /^(?:1|t|T|true|TRUE|True)$/;

// A frame id checkFrame accepts: not empty, at most 200 characters, no control character.
const frameAccepted = (frame: string | undefined) => frame === undefined || (frame !== "" && [...frame].length <= 200 && !/[\u0000-\u001f\u007f]/.test(frame));

// Argument shapes these commands refuse with a usage error (a second --frame included), tied to the CLI by
// transcript.test.ts. Unknown preset ids of the right shape are the preset checks' job.
function shapeAccepted(positionals: string[], flags: DoanArgs["flags"]): boolean {
  const all = (name: string) => flags.filter(flag => flag.name === name);
  const frames = all("frame").length;
  const last = (name: string) => all(name).at(-1);
  const prototype = last("prototype") !== undefined && (last("prototype")!.value === undefined || TRUE.test(last("prototype")!.value!));
  const operands = positionals.length - 1;
  switch (positionals[0]) {
    case "open": return operands === 1 && frames <= 1 && frameAccepted(last("frame")?.value) && (frames === 1 || !prototype);
    case "export": return operands === 1 && !!last("o")?.value && frames <= 1 && frameAccepted(last("frame")?.value) && prototype === (frames === 1);
    case "design-skill": return operands === 0 || (operands === 1 && /^[a-z]+(?:-[a-z]+)*$/.test(positionals[1]!));
    default: return true;
  }
}

// Argv as SplitArgs and Run read it: flags anywhere, a value flag taking the next word. `ambiguous`: an unknown flag
// before the command with a word after it, so which word is the command is unknown.
function readDoanArgs(words: string[]): { args: DoanArgs; ambiguous: boolean } | undefined {
  if (!/^(?:.*\/)?doan$/.test(words[0] ?? "")) return undefined;
  const positionals: string[] = [];
  const flags: DoanArgs["flags"] = [];
  let refused = false, ambiguous = false;
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    if (word === "--") { positionals.push(...words.slice(i + 1)); break; }
    if (!word.startsWith("-") || word === "-") { positionals.push(word); continue; }
    const match = word.match(/^--?([^=]+)(?:=(.*))?$/);
    if (!match) { refused = true; continue; }
    const name = match[1]!, inline = match[2];
    if (DOAN_VALUE_FLAGS.includes(name)) {
      const value = inline ?? words[++i];
      if (value === undefined) refused = true;
      flags.push({ name, value });
      continue;
    }
    const known = DOAN_BOOLEAN_FLAGS.includes(name);
    if (!known && inline === undefined && positionals.length === 0 && i + 1 < words.length && !words[i + 1]!.startsWith("-")) ambiguous = true;
    if (!known || (inline !== undefined && !/^(?:1|0|t|T|true|TRUE|True|f|F|false|FALSE|False)$/.test(inline))) refused = true;
    flags.push({ name, value: inline });
  }
  // Run refuses any flag or `--` before the command (ARCHITECTURE §12 'Parsing, output and structure').
  if (words.length > 2 && words[1]!.startsWith("-")) refused = true;
  const command = positionals[0];
  if (command !== undefined) {
    const own = DOAN_COMMAND_FLAGS[command === "work" && positionals[1] === "update" ? "work update" : command] ?? [];
    const allowed = command === "onboarding" ? ["json", ...own] : ["json", "repo", ...own];
    if (flags.some(flag => !allowed.includes(flag.name)) || !shapeAccepted(positionals, flags)) refused = true;
  }
  return { args: { positionals, flags, refused }, ambiguous };
}

// `refused` marks what the CLI rejects before running anything (a bad or misplaced flag, a refused argument shape).
// An attempt check may still want the words, so an unknown flag is kept as a flag taking no value.
export function doanArgs(words: string[]): DoanArgs | undefined {
  return readDoanArgs(words)?.args;
}

// The flag as the CLI ends up with it: Go's flag set keeps the last of a repeated string or boolean flag (--frame
// accumulates instead, and the commands that read it refuse a second one, see shapeAccepted).
export function lastFlag(args: DoanArgs, name: string): DoanArgs["flags"][number] | undefined {
  return args.flags.filter(flag => flag.name === name).at(-1);
}

// The positionals of a doan command the CLI would run; an unknown flag makes the command unreadable.
export function doanPositionals(words: string[]): string[] | undefined {
  const args = doanArgs(words);
  return args && !args.refused ? args.positionals : undefined;
}

export function doanCommand(words: string[]): string | undefined {
  return doanPositionals(words)?.[0];
}

// `patch` is the text of every apply_patch call given a literal, run or only a candidate. `commandCandidate` is an
// exec_command literal its script's recorded processes do not account for (pairedWithRecords).
interface ExtractedCall { name: string; command?: string; patch?: string; patchCandidate?: string; commandCandidate?: string }

// Stands in for a non-literal exec_command (template, variable): unless recorded (recordedExecs) it ran something
// unseen, so parseCommand reads it as incomplete, with no words.
const UNREADABLE_EXEC = "$exec_command_with_a_cmd_that_is_not_a_string_literal";
// An exec literal no recorded process matches: it may never have run, but Codex also leaves some commands that ran
// unrecorded, so it is neither run nor ruled out and no absence check holds beside it.
const UNRECORDED_EXEC = "$exec_command_literal_with_no_recorded_run";

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
    const name = tokens[i + 2]!;
    if (name === "apply_patch") {
      const patch = literal(tokens[i + 4]);
      if (patch !== undefined && tokens[i + 5] === ")") {
        // Only a batch that is one literal call has no earlier statement to skip it or throw, so it is a real call;
        // everything else stays lexical evidence, which the judge sees labelled.
        const argument = tokens[i + 4]!;
        const simpleLiteral = argument[0] === '"' || (!/\\(?![\\'"`nrtbfv0]|u[\da-fA-F]{4}|x[\da-fA-F]{2}|\r?\n)/.test(argument) &&
          !/\\0[0-9]/.test(argument) && (argument[0] === "`" || !/[\r\n]/.test(argument)));
        const start = tokens[0] === "await" ? 1 : 0;
        const end = tokens.at(-1) === ";" ? tokens.length - 1 : tokens.length;
        const standalone = simpleLiteral && i === start && end === i + 6;
        calls.push(standalone ? { name, patch } : { name, patch, patchCandidate: patch });
      }
      continue;
    }
    if (/^mcp__/.test(name)) calls.push({ name });
    if (name !== "exec_command") continue;
    let command: string | undefined;
    if (tokens[i + 4] === "{") {
      let depth = 1;
      for (let j = i + 5; j < tokens.length && depth > 0; j++) {
        if (tokens[j] === "{") depth++;
        if (tokens[j] === "}") depth--;
        if (depth === 1 && (tokens[j] === "cmd" || literal(tokens[j]) === "cmd") && tokens[j + 1] === ":") {
          const value = literal(tokens[j + 2]);
          command = value !== undefined && [",", "}"].includes(tokens[j + 3]!) ? value : undefined;
        }
      }
    }
    calls.push({ name, command: command ?? UNREADABLE_EXEC });
  }
  // exec_command reached any other way (`tools?.exec_command`, `tools["exec_command"]`, an alias) runs a command the
  // loop above does not see.
  for (let i = 0; i < tokens.length; i++)
    if ((tokens[i] === "exec_command" || literal(tokens[i]) === "exec_command") && !(tokens[i - 2] === "tools" && tokens[i - 1] === "." && tokens[i + 1] === "("))
      calls.push({ name: "exec_command", command: UNREADABLE_EXEC });
  return calls;
}

// The script a recorded `<shell> -c <script>` argv ran, or undefined for any other shape.
function shellScript(argv: unknown): string | undefined {
  if (!Array.isArray(argv) || argv.length !== 3 || !argv.every(word => typeof word === "string")) return undefined;
  return /^(?:.*\/)?(?:sh|bash|zsh|dash)$/.test(argv[0]!) && /^-[a-z]*c$/.test(argv[1]!) ? argv[2] : undefined;
}

// Process records between a script's call and output (no call id) show what it ran, only if the output arrived, no
// other call overlapped and all (at least one) are shell scripts. Otherwise the literals count as run.
function recordedExecs(transcript: string): Map<string, string[]> {
  const open = new Map<string, { ran: (string | undefined)[]; shared: boolean; script: boolean }>();
  const recorded = new Map<string, string[]>();
  for (const line of transcript.split(/\r?\n/)) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (!record(event) || !record(event.payload)) continue;
    const p = event.payload;
    if (event.type === "response_item" && typeof p.call_id === "string") {
      if (p.type === "custom_tool_call" || p.type === "function_call")
        open.set(p.call_id, { ran: [], shared: false, script: p.type === "custom_tool_call" && /^(?:functions\.)?exec$/.test(String(p.name)) });
      const window = open.get(p.call_id);
      if (window && (p.type === "custom_tool_call_output" || p.type === "function_call_output")) {
        open.delete(p.call_id);
        if (!window.script || window.shared || !window.ran.length || window.ran.includes(undefined)) continue;
        recorded.set(p.call_id, window.ran as string[]);
      }
    }
    if (event.type === "event_msg" && p.type === "item_completed" && record(p.item) && p.item.type === "CommandExecution") {
      for (const window of open.values()) {
        window.ran.push(shellScript(p.item.command));
        if (open.size > 1) window.shared = true;
      }
    }
  }
  return recorded;
}

// Each literal takes one matching record; one left without is only a candidate, and records no literal took stand
// for the script's unreadable commands, if it has any.
function pairedWithRecords(calls: ExtractedCall[], records: readonly string[]): ExtractedCall[] {
  const left = [...records];
  const paired = calls.map(call => {
    if (call.command === undefined || call.command === UNREADABLE_EXEC) return call;
    const at = left.indexOf(call.command);
    if (at >= 0) { left.splice(at, 1); return call; }
    return { name: call.name, command: UNRECORDED_EXEC, commandCandidate: call.command };
  });
  if (!left.length || !paired.some(call => call.command === UNREADABLE_EXEC)) return paired;
  return [...paired.filter(call => call.command !== UNREADABLE_EXEC), ...left.map(command => ({ name: "exec_command", command }))];
}

function rolloutCalls(event: { type?: string; payload?: { type?: string; name?: string; input?: string; arguments?: string; call_id?: string } }, recorded?: Map<string, string[]>): ExtractedCall[] {
  if (event.type !== "response_item") return [];
  const p = event.payload;
  if (p?.type === "custom_tool_call" && /^(?:functions\.)?exec$/.test(p.name ?? "") && typeof p.input === "string") {
    const calls = execCalls(p.input), records = typeof p.call_id === "string" ? recorded?.get(p.call_id) : undefined;
    return records ? pairedWithRecords(calls, records) : calls;
  }
  if (p?.type === "custom_tool_call" && /^(?:functions\.)?apply_patch$/.test(p.name ?? "") && typeof p.input === "string") return [{ name: "apply_patch", patch: p.input }];
  if (p?.type !== "function_call" || typeof p.name !== "string") return [];
  if (p.name === "exec_command" || p.name === "functions.exec_command") {
    try {
      const args = JSON.parse(p.arguments ?? "");
      return [{ name: "exec_command", command: typeof args?.cmd === "string" ? args.cmd : UNREADABLE_EXEC }];
    } catch { return [{ name: "exec_command", command: UNREADABLE_EXEC }]; }
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
  const recorded = recordedExecs(transcript);
  for (let i = 0; i < lines.length; i++) {
    try {
      const event = JSON.parse(lines[i]!);
      commands.push(...rolloutCalls(event, recorded).flatMap(c => c.command === undefined ? [] : [c.command]));
      if (event.type === "assistant") {
        for (const block of event.message?.content ?? []) {
          if (block.type === "tool_use" && block.name === "Bash" && typeof block.input?.command === "string") commands.push(block.input.command);
        }
      }
    } catch { /* Codex's stderr is text, not stream-json. */ }
    if (lines[i] === "exec" && /^\/\S+\s+-[a-z]*c\s/.test(lines[i + 1] ?? "")) {
      const end = execHeaderEnd(lines, i + 1);
      const header = lines.slice(i + 1, end + 1).join("\n");
      i = end;
      const cwdStart = header.lastIndexOf(" in /");
      commands.push(cwdStart === -1 ? header : header.slice(0, cwdStart));
    }
  }
  return commands;
}

// A multi-line exec header ends at ` in <cwd>` plus a status of any shape, searched up to the next `exec`. Without
// that end it is the first line, whose open quote makes the read incomplete.
const EXEC_STATUS = /^ [a-z]+(?: -?\d+)? in \d+(?:\.\d+)?m?s:$/;
const INLINE_EXEC_STATUS = / in \/.* [a-z]+(?: -?\d+)? in \d+(?:\.\d+)?m?s:$/;
function execHeaderEnd(lines: string[], first: number): number {
  for (let j = first; j < lines.length && lines[j] !== "exec"; j++) {
    if (INLINE_EXEC_STATUS.test(lines[j]!)) return j;
    if (j > first && EXEC_STATUS.test(lines[j]!)) return / in \/\S/.test(lines[j - 1]!) ? j - 1 : first;
  }
  return first;
}

// Drops comments and heredoc bodies (data, not commands), so a `doan` line in a message runs nothing.
// A body naming doan leaves a marker after its tag for the interpreter check, since a script there may run doan.
function withoutHeredocsAndComments(command: string, calls: string[][][]): { text: string; unread: boolean } {
  let out = "", quote: string | null = null, unread = false;
  const pending: { tag: string; indented: boolean; quoted: boolean; at: number }[] = [];
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    // The shell drops a backslash-newline outside single quotes before it splits words, so it joins the lines.
    if (c === "\\" && command[i + 1] === "\n" && quote !== "'") {
      i++;
    } else if (quote) {
      out += c;
      if (c === "\\" && quote === '"') out += command[++i] ?? "";
      else if (c === quote) quote = null;
    } else if (c === "\\") {
      out += c + (command[++i] ?? "");
    } else if (c === "'" || c === '"') {
      quote = c;
      out += c;
    } else if (c === "#" && (i === 0 || /[\s;&|()<>]/.test(command[i - 1]!))) {
      const end = command.indexOf("\n", i);
      i = (end === -1 ? command.length : end) - 1;
    } else if (c === "<" && command.startsWith("<<<", i)) {
      out += "<<<";
      i += 2;
    } else if (c === "<" && command[i + 1] === "<" && /^<<(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|([^\s;&|<>()'"]+))/.test(command.slice(i))) {
      const m = /^<<(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|([^\s;&|<>()'"]+))/.exec(command.slice(i))!;
      out += m[0];
      pending.push({ tag: m[2] ?? m[3] ?? m[4]!, indented: m[1] === "-", quoted: m[4] === undefined, at: out.length });
      i += m[0].length - 1;
    } else if (c === "\n" && pending.length) {
      out += c;
      let marked = 0;
      for (const { tag, indented, quoted, at } of pending.splice(0)) {
        let body = "";
        // An unterminated body runs to the end, as the shell reads it.
        while (i + 1 < command.length) {
          const end = command.indexOf("\n", i + 1);
          const line = command.slice(i + 1, end === -1 ? command.length : end);
          i = end === -1 ? command.length : end;
          if ((indented ? line.replace(/^\t+/, "") : line) === tag) break;
          if (!quoted && /\$\(|`/.test(line)) unread = true;
          body += line + "\n";
        }
        if (NAMES_DOAN.test(body) && STARTS_PROCESS.test(body)) {
          const read = pythonDoanCalls(body);
          const mark = read ? `${PYTHON_CALLS}${calls.push(read) - 1}` : NAMES_DOAN_BODY;
          out = out.slice(0, at + marked) + mark + out.slice(at + marked);
          marked += mark.length;
        } else if (NAMES_DOAN.test(body) && body.includes("`")) {
          out = out.slice(0, at + marked) + BACKTICK_BODY + out.slice(at + marked);
          marked += BACKTICK_BODY.length;
        }
      }
    } else out += c;
  }
  // A quote left open is a command cut off in the transcript (a stderr header missing its end, say); the tokenizer
  // would drop the lone quote and read the rest as plain words.
  return { text: out, unread: unread || quote !== null };
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z_0-9]*=/;
// doan as a word, not `.doan/`, `/tmp/doan-x` or canvas markup such as `doan:canvas` and a `doan:<canvas-id>/…`
// link, which run nothing; no program is named `doan:…`.
const NAMES_DOAN = /(?<![\w.-])doan(?![\w.-]|:[^\s'"`])/;
// How a node, python, perl, ruby or AppleScript script starts another program. A bare `system` or `exec` in prose
// ("the design system") is not one, so those need a call after them.
const STARTS_PROCESS = /\b(?:subprocess|child_process|execa|commands\.getoutput|pty\.spawn|Bun\.spawn|Deno\.(?:Command|run)|Open3|do shell script)\b|\b(?:system|exec\w*|spawn\w*|popen|qx)\s*[("'{]|%x[({[]/;
// Where withoutHeredocsAndComments marked a heredoc whose body names doan; U+0004 never occurs in a shell command.
const NAMES_DOAN_BODY = "\u0004";
// Where it marked one whose doan calls pythonDoanCalls read, before their index; U+0005 never occurs in a shell command.
const PYTHON_CALLS = "\u0005";
// Marks a body naming doan, with a backtick but no process start (only Perl and Ruby run it); U+0006 never occurs.
const BACKTICK_BODY = "\u0006";
// A single-line Python string with nothing to decode and nothing the shell expands in an unquoted heredoc.
const PY_STRING = String.raw`(?:'[^'\\\n$` + "`" + String.raw`]*'|"[^"\\\n$` + "`" + String.raw`]*")`;
// A subprocess call whose whole first argument is a list of string literals (not one it extends or slices), with the
// text before it on its line.
const PY_ARGV_CALL = new RegExp(String.raw`^([^\n]*?)\bsubprocess\.(?:run|call|check_call|check_output|Popen)\(\s*\[\s*(${PY_STRING}(?:\s*,\s*${PY_STRING})*)\s*,?\s*\](?=\s*[,)])`, "gm");

// A Python script's doan commands, or undefined unless every doan is the program of a subprocess call with a literal
// argv. Calls after `#` or a quote, triple quotes, shell= and executable= are not read.
function pythonDoanCalls(body: string): string[][] | undefined {
  if (/'''|"""|\b(?:shell|executable)\s*=/.test(body)) return undefined;
  const calls: string[][] = [];
  const rest = body.replace(PY_ARGV_CALL, (call, before: string, list: string) => {
    const words = [...list.matchAll(/'([^']*)'|"([^"]*)"/g)].map(m => m[1] ?? m[2]!);
    if (/[#'"]/.test(before) || !/^(?:.*\/)?doan$/.test(words[0]!)) return call;
    calls.push(words);
    return before;
  });
  return NAMES_DOAN.test(rest) ? undefined : calls;
}
// A key in the reader's variables for one assigned just the home directory, holding what followed it (`/` or
// nothing), or for a function's argument that expands below it, holding the path below it; no shell name holds U+0002.
const HOME_OF = "\u0002";
// The home directory in expandToken's copy of a word, so where it stands can be checked; U+0003 never occurs in a
// shell command.
const HOME_MARK = "\u0003";
// Where substitutions(n) took the nth command substitution out of a command; NUL never occurs in a shell command.
const SUBSTITUTED = /\$\(\0(\d+)\)/g;

// The index of the `)` that closes a `$(` or `(` opened before `from`, or -1. Quotes, escapes, backticks and nested
// substitutions inside are skipped, so a `)` in them does not close it.
function closing(text: string, from: number, nesting = 0): number {
  // Deeper nesting than any real command is not followed, so a transcript cannot exhaust the stack.
  if (nesting > 32) return -1;
  let depth = 1, quote: string | null = null;
  for (let i = from; i < text.length; i++) {
    const c = text[i]!;
    if (quote === "'") { if (c === "'") quote = null; continue; }
    if (c === "\\") { i++; continue; }
    if (c === "$" && text[i + 1] === "(") { i = closing(text, i + 2, nesting + 1); if (i < 0) return -1; continue; }
    if (c === "`") { i = text.indexOf("`", i + 1); if (i < 0) return -1; continue; }
    if (quote === '"') { if (c === '"') quote = null; continue; }
    if (c === "'" || c === '"') quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
  }
  return -1;
}

// Takes out outermost `$(…)` and backtick substitutions, each body running as its own command with unknown output.
// Quoted or escaped ones stay literal, `$((…))` is arithmetic. `null`: unclosed or not followed.
function substitutions(command: string): { text: string; bodies: string[] } | null {
  const bodies: string[] = [];
  let text = "", quote: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    if (quote === "'") { text += c; if (c === "'") quote = null; continue; }
    if (c === "\\") { text += c + (command[i + 1] ?? ""); i++; continue; }
    if (c === "$" && command[i + 1] === "(") {
      const end = closing(command, i + 2);
      if (end < 0) return null;
      const body = command.slice(i + 2, end);
      // `$((…))` is arithmetic when its inner `(` closes right before the outer `)`; `$((a) && (b))` is a substitution
      // whose body starts with a subshell. Arithmetic yields a number, and a substitution inside it is not followed.
      if (body.startsWith("(") && closing(command, i + 3) === end - 1) {
        if (/\$\(|`/.test(body)) return null;
        text += "$(())";
      } else { bodies.push(body); text += `$(\0${bodies.length - 1})`; }
      i = end;
      continue;
    }
    if (c === "`") {
      const end = command.indexOf("`", i + 1);
      if (end < 0) return null;
      // Inside backticks a backslash quotes only $, ` and itself.
      bodies.push(command.slice(i + 1, end).replace(/\\([$`\\])/g, "$1"));
      text += `$(\0${bodies.length - 1})`;
      i = end;
      continue;
    }
    // A process substitution runs its command where this reader does not follow it.
    if (quote === null && (c === "<" || c === ">") && command[i + 1] === "(") return null;
    if (quote === null && (c === "'" || c === '"')) quote = c;
    else if (quote === '"' && c === '"') quote = null;
    text += c;
  }
  return { text, bodies };
}

// Wrappers run their operand: the index where it starts, null if not such a wrapper (or `command -v`), undefined
// on an option the reader does not know.
const WRAPPER = /^(?:.*\/)?(env|timeout|nohup|nice|time|sudo)$/;
function wrappedAt(words: string[]): number | null | undefined {
  const name = ["command", "exec"].includes(words[0] ?? "") ? words[0] : WRAPPER.exec(words[0] ?? "")?.[1];
  let k = 1;
  const options = (plain: string[], valued: string[], joined: RegExp): number | undefined => {
    for (; k < words.length; k++) {
      const word = words[k]!;
      if (word === "--") return k + 1;
      if (plain.includes(word) || joined.test(word)) continue;
      if (valued.includes(word)) { k++; continue; }
      if (word.startsWith("-") && word !== "-") return undefined;
      return k;
    }
    return k;
  };
  switch (name) {
    case "command":
      // The command builtin runs its operand, except -v/-V, which only look the name up.
      while (/^-[pvV]+$/.test(words[k] ?? "")) k++;
      if (/[vV]/.test(words.slice(1, k).join(""))) return null;
      return words[k] === "--" ? k + 1 : k;
    case "env": {
      // NAME=value words set the command's environment, like a prefix assignment.
      let at = options(["-", "-i", "--ignore-environment", "-0", "--null", "-v", "--debug"], ["-u", "--unset", "-C", "--chdir"], /^(?:-u.+|--unset=.*|-C.+|--chdir=.*|[A-Za-z_][A-Za-z_0-9]*=.*)$/);
      while (at !== undefined && ASSIGNMENT.test(words[at] ?? "")) at++;
      return at;
    }
    case "timeout": {
      const at = options(["--preserve-status", "--foreground", "-v", "--verbose", "-f", "-p"], ["-s", "-k", "--signal", "--kill-after"], /^(?:-[sk].+|--(?:signal|kill-after)=.*)$/);
      // The duration comes before the command.
      return at === undefined ? undefined : at + 1;
    }
    case "nohup": return words[1] === "--" ? 2 : words[1]?.startsWith("-") ? undefined : 1;
    case "nice": return options([], ["-n", "--adjustment"], /^(?:-n.+|--adjustment=.*|-\d+)$/);
    // The shell keyword takes -p; /usr/bin/time also -l, -h, -a and -o <file>.
    case "time": return options(["-p", "-l", "-h", "-a"], ["-o"], /^-o.+$/);
    case "exec": return options(["-c", "-l"], ["-a"], /^-a.+$/);
    // Any other sudo option may change what runs (-e edits, -l lists, -s and -i start a shell), so it is not followed.
    case "sudo": return options(["-E", "-H", "-n", "-S", "-A", "-b", "-P", "--preserve-env"], ["-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U", "-T"], /^(?:-[ugCDhprtUT].+|--preserve-env=.*)$/);
    default: return null;
  }
}
// Words opening constructs the reader does not follow (it follows plain commands, assignments, closed `for`,
// `{ …; }` and functions), plus any `do`, `done`, `{` or `}` nothing consumed.
const UNSUPPORTED = /^(?:if|then|elif|else|fi|while|until|do|done|case|esac|select|function|for|\{|\}|!)$|^[()]|^[A-Za-z_]\w*\(\)?$/;
// Loop iterations and function calls one command may expand in total, nested ones included, so a transcript cannot
// make the reader work without bound (a function that calls itself runs out of it).
const LOOP_BUDGET = 256;

// `pythonCalls`: pythonDoanCalls results by PYTHON_CALLS index. `seqUnknown`: an alias or IFS change somewhere,
// which changes what `$(seq …)` gives a loop (see seqList).
interface ReadState { left: number; incomplete: boolean; pythonCalls: string[][][]; seqUnknown: boolean }
// A shell function: the token groups of its body and its closing `}` group, whose redirections apply at each call.
interface ShellFunction { body: string[][]; close: string[] }
// `homePath`: the path below the home directory (`/.zshrc`, or "" for the home itself) when the shell expands the word to
// start there; `onlyHome`: what follows the home directory when the word is just that, for a variable assigned it.
interface Expanded { words: string[]; unresolved: boolean; homePath: string | undefined; onlyHome: string | undefined }
// A redirection taken out of a command's words. `target` keeps `~` and an unknown `$HOME` as written; `homePath`
// (like a command's `homePaths`) says whether the shell expands it into the home directory.
export interface Redirect { op: string; target: string; unresolved: boolean; homePath: string | undefined }
export interface ShellCommand { words: string[]; homePaths: (string | undefined)[]; redirects: Redirect[] }

// Where parse put a redirection into a token group: MARK, the operator, MARK, the raw target. U+0001 never occurs in a
// shell command.
const MARK = "\u0001";
// The shell takes a redirection before it reads the program, wherever it stands in the command.
const REDIRECT_OPERATOR = /^\d*(?:&>>?|<<<|<<-?|<>|<&|>&|>>|>\||<|>)$/;

// Expands a raw token as the shell would. Unknown variables, substitutions and a bare `$name` holding whitespace
// (zsh keeps it whole, bash splits) are unresolved. Home: unquoted `~`, unassigned `$HOME`, or a variable holding one.
function expandToken(raw: string, env: ReadonlyMap<string, string>): Expanded {
  const whole = /^\$(?:(\w+)|\{(\w+)\})$/.exec(raw);
  const name = whole ? whole[1] ?? whole[2]! : undefined;
  const held = name !== undefined ? env.get(name) : undefined;
  if (held !== undefined) {
    if (/\s/.test(held)) return { words: [raw], unresolved: true, homePath: undefined, onlyHome: undefined };
    const words = held === "" ? [] : [held];
    const home = words.length === 1 ? env.get(HOME_OF + name) : undefined;
    return { words, unresolved: false, homePath: home, onlyHome: home };
  }
  let unresolved = false;
  const known = (written: string, plain?: string, braced?: string) => {
    const value = env.get(plain ?? braced!);
    if (value === undefined) unresolved = true;
    return value ?? written;
  };
  const home = (variable: string) => env.get(HOME_OF + variable) ?? (variable === "HOME" && !env.has("HOME") ? "" : undefined);
  // What is left after the variables: a `$(` or a backtick starts a substitution this reader does not run.
  const substitution = (text: string) => { if (/\$\(|`/.test(text)) unresolved = true; return text; };
  // The same word with the home directory as HOME_MARK.
  let marked = "";
  const word = raw.replace(/"((?:\\.|[^"\\])*)"|'([^']*)'|((?:\\[\s\S]|[^"'\\])+)/g, (_, double, single, bare) => {
    if (single !== undefined) { marked += single; return single; }
    const text = (double ?? bare) as string;
    const pattern = double !== undefined ? /\\([\$`"\\\n])|\$(?:(\w+)|\{(\w+)\})/g : /\\([\s\S])|\$(?:(\w+)|\{(\w+)\})/g;
    marked += text.replace(pattern, (m: string, escaped: string | undefined, plain?: string, braced?: string) => {
      const below = escaped === undefined ? home(plain ?? braced!) : undefined;
      return escaped ?? (below !== undefined ? HOME_MARK + below : known(m, plain, braced));
    });
    return substitution(text.replace(pattern, (m: string, escaped: string | undefined, plain?: string, braced?: string) => escaped ?? known(m, plain, braced)).replace(/\\\$/g, "$"));
  });
  if (/^~(?:\/|$)/.test(raw)) marked = HOME_MARK + marked.slice(1);
  const below = /^\u0003(?=\/|$)/.test(marked) ? marked.slice(1) : undefined;
  // A substitution the reader has already read (see substitutions) leaves only that it was there.
  return { words: [word.replace(SUBSTITUTED, "$()")], unresolved, homePath: below, onlyHome: below === "" || below === "/" ? below : undefined };
}

// A program that runs another command it is given: doan itself, a shell, or a wrapper that may run one.
const RUNNER = /^(?:.*\/)?(?:doan|(?:ba|z|da)?sh|env|timeout|nohup|nice|time|command|exec|eval|xargs)$/;
const INTERPRETER = /^(?:node|python[\d.]*|perl|ruby|osascript|deno|bun)$/;
// Each interpreter's inline-script switches. Python's `-m` runs unseen module code, so only json.tool counts
// (agents pipe doan's output through it).
const INLINE: [RegExp, RegExp][] = [
  [/^python/, /^-[A-Za-z]*c$/],
  [/^(?:node|bun|deno)$/, /^(?:-[ep]+|--eval|--print)(?:=|$)/],
  [/^(?:perl|ruby)$/, /^-[\w]*[eE]$/],
  [/^osascript$/, /^-e$/],
];
// The switches that take their value as the next word, which is then not the script.
const VALUED: [RegExp, RegExp][] = [
  [/^python/, /^-[A-Za-z]*[WX]$/],
  [/^(?:node|bun)$/, /^(?:-r|--require|--import|--loader|--experimental-loader)$/],
];

// May an interpreter run doan unseen (argument naming it, script file, input not a shown doan-free heredoc/string)?
// "heredoc": Python runs a heredoc whose calls were read. A version or help query runs nothing.
function interpreterMayRunDoan(program: string, args: string[], redirects: Redirect[], heredocNamesDoan: boolean, pythonCalls: boolean): boolean | "heredoc" {
  if (args.some(word => NAMES_DOAN.test(word))) return true;
  const inline = INLINE.find(([name]) => name.test(program))?.[1];
  // Only a switch before the script is the interpreter's; one after it is the script's own argument.
  const valued = VALUED.find(([name]) => name.test(program))?.[1];
  const at = args.findIndex((word, k) => (word === "-" || !word.startsWith("-")) && !(k > 0 && valued?.test(args[k - 1]!)));
  const switches = at < 0 ? args : args.slice(0, at);
  if (inline && switches.some(word => inline.test(word))) return false;
  if (/^python/.test(program) && /^-[A-Za-z]*m$/.test(switches.at(-1) ?? "") && args[at] === "json.tool") return false;
  const script = args[at];
  if (script !== undefined && script !== "-") return true;
  if (script === undefined && args.some(word => /^(?:-[vVh]|--version|--help)$/.test(word))) return false;
  const input = redirects.filter(redirect => /^0?(?:<<<|<<-?|<)$/.test(redirect.op)).at(-1);
  if (input?.op.endsWith("<<<")) return NAMES_DOAN.test(input.target);
  if (input && /<<-?$/.test(input.op)) return pythonCalls && /^python/.test(program) ? "heredoc" : heredocNamesDoan;
  return true;
}

// The head of a function definition at the start of a token group (`f()`, `f ()`, `function f`, `function f()`,
// `function f ()`): its name and where its body's `{` is due.
function definitionHead(group: string[]): { name: string; at: number } | undefined {
  const k = group[0] === "function" ? 1 : 0;
  const word = group[k];
  if (word === undefined) return undefined;
  if (/^[A-Za-z_]\w*\(\)$/.test(word)) return { name: word.slice(0, -2), at: k + 1 };
  if (/^[A-Za-z_]\w*$/.test(word) && group[k + 1] === "()") return { name: word, at: k + 2 };
  if (k === 1 && /^[A-Za-z_]\w*$/.test(word)) return { name: word, at: 2 };
  return undefined;
}

// How many `{` a token group opens at its start: a group, a function body, or one right after `do`, `then` or `else`,
// each possibly opening another inside it.
function bracesOpened(group: string[]): number {
  let opened = 0;
  for (let rest = group; ;) {
    const head = definitionHead(rest);
    const at = rest[0] === "{" ? 0 : ["do", "then", "else"].includes(rest[0] ?? "") && rest[1] === "{" ? 1 : head && rest[head.at] === "{" ? head.at : -1;
    if (at < 0) return opened;
    opened++;
    rest = rest.slice(at + 1);
  }
}

// The index of the group starting with the `}` that closes `depth` open braces, scanning from `from`, or -1. A `}`
// counts only as the first word of a command, as the shell reads it.
function braceEnd(groups: string[][], from: number, depth: number): number {
  for (let j = from; j < groups.length; j++) {
    if (groups[j]![0] === "}" && --depth === 0) return j;
    depth += bracesOpened(groups[j]!);
  }
  return -1;
}

// A loop word that is only whole-number `$(seq …)` is read like a written list (bash and zsh split it). Counting
// down without a step stays unresolved: GNU prints nothing, macOS's BSD seq counts down.
function seqList(token: string, bodies: string[], state: ReadState, functions: ReadonlyMap<string, ShellFunction>): Expanded | undefined {
  if (state.seqUnknown || functions.has("seq")) return undefined;
  const index = /^\$\(\0(\d+)\)$/.exec(token)?.[1];
  const words = index === undefined ? [] : bodies[Number(index)]!.trim().split(/\s+/);
  if (words[0] !== "seq" || words.length < 2 || words.length > 4 || !words.slice(1).every(word => /^-?\d+$/.test(word))) return undefined;
  const numbers = words.slice(1).map(Number);
  const [first, step, last] = numbers.length === 1 ? [1, 1, numbers[0]!] : numbers.length === 2 ? [numbers[0]!, 1, numbers[1]!] : [numbers[0]!, numbers[1]!, numbers[2]!];
  if (step === 0 || (numbers.length < 3 && first > last)) return undefined;
  const values: string[] = [];
  for (let n = first; step > 0 ? n <= last : n >= last; n += step) {
    if (values.length === state.left) return undefined;
    values.push(String(n));
  }
  return { words: values, unresolved: false, homePath: undefined, onlyHome: undefined };
}

// Runs token groups as the shell would, with one shell state for assignments, `for` loops, groups and functions.
// Anything unfollowable or unresolved sets `state.incomplete` and yields no words.
function runGroups(groups: string[][], vars: Map<string, string>, state: ReadState, bodies: string[], functions: Map<string, ShellFunction>): ShellCommand[] {
  const out: ShellCommand[] = [];
  const append = (commands: ShellCommand[]) => { for (const entry of commands) out.push(entry); };
  // A substitution runs before the command it is in, in a subshell that sees the variables set so far.
  const substitute = (tokens: string[]) => {
    for (const token of tokens) for (const m of token.matchAll(SUBSTITUTED)) append(parse(bodies[Number(m[1])]!, state, new Map(vars), new Map(functions)));
  };
  const redirectsOf = (tokens: string[]): Redirect[] => tokens.filter(token => token.startsWith(MARK)).map(token => {
    const [, op = "", target = ""] = token.split(MARK);
    const expanded = expandToken(target.replace(NAMES_DOAN_BODY, "").replace(BACKTICK_BODY, ""), vars);
    return { op, target: expanded.words.join(" "), unresolved: expanded.unresolved, homePath: expanded.homePath };
  });
  for (let i = 0; i < groups.length; i++) {
    // Inside `[[ … ]]`, `<` and `>` compare strings: the shell opens no file for them.
    const close = groups[i]![0] === "[[" ? groups[i]!.indexOf("]]") : -1;
    const raw = close < 0 ? groups[i]! : [...groups[i]!.slice(0, close).flatMap(token => token.startsWith(MARK) ? token.split(MARK).slice(1) : [token]), ...groups[i]!.slice(close)];
    const group = raw.filter(token => !token.startsWith(MARK));
    if (group[0] === "for" && /^[A-Za-z_]\w*$/.test(group[1] ?? "") && group[2] === "in") {
      const head = groups[i + 1];
      const rest = head?.[0] === "do" && head.length > 1 ? [head.slice(1)] : [];
      const body = head?.[0] === "do" ? [...rest, ...groups.slice(i + 2)] : [];
      let depth = 1, done = -1;
      for (let j = 0; j < body.length && done < 0; j++) {
        // A nested loop can open right after its parent's `do`.
        if (["for", "while", "until", "select"].includes((body[j]![0] === "do" ? body[j]![1] : body[j]![0]) ?? "")) depth++;
        if (body[j]![0] === "done" && --depth === 0) done = j;
      }
      if (done < 0) { state.incomplete = true; return out; }
      substitute(group.slice(3));
      const lists = group.slice(3).map(token => seqList(token, bodies, state, functions) ?? expandToken(token, vars));
      const values = lists.flatMap(list => list.words.map(word => ({ word, home: list.onlyHome })));
      if (lists.some(list => list.unresolved) || values.length > state.left) {
        // The body ran an unknown number of times with unknown values: nothing after it can rely on the variables.
        state.incomplete = true;
        vars.clear();
      } else {
        state.left -= values.length;
        // A redirection on `done` is set up once, before the body runs, and applies to every command in it.
        substitute(body[done]!);
        const loop = redirectsOf(body[done]!);
        for (const value of values) {
          vars.set(group[1]!, value.word);
          if (value.home === undefined) vars.delete(HOME_OF + group[1]!); else vars.set(HOME_OF + group[1]!, value.home);
          append(runGroups(body.slice(0, done), vars, state, bodies, functions).map(entry => ({ ...entry, redirects: [...entry.redirects, ...loop] })));
        }
      }
      // Continue after the loop's `done`.
      i += 2 + done - rest.length;
      continue;
    }
    let skipped = 0;
    while (ASSIGNMENT.test(group[skipped] ?? "")) skipped++;
    // Assignments before a command belong to that command alone; a group of only assignments sets them for the rest.
    if (skipped > 0 && skipped === group.length) {
      for (const token of group) {
        const name = token.slice(0, token.indexOf("="));
        const value = expandToken(token.slice(token.indexOf("=") + 1), vars);
        if (value.unresolved) vars.delete(name); else vars.set(name, value.words.join(" "));
        if (value.onlyHome === undefined) vars.delete(HOME_OF + name); else vars.set(HOME_OF + name, value.onlyHome);
      }
    }
    // export, local and the like assign too. The reader does not take their values (a value it already knows may go
    // stale), only whether the variable now holds just the home directory.
    if (/^(?:export|local|declare|typeset|readonly)$/.test(group[skipped] ?? "")) {
      for (const token of group.slice(skipped + 1).filter(token => ASSIGNMENT.test(token))) {
        const name = token.slice(0, token.indexOf("="));
        const home = expandToken(token.slice(token.indexOf("=") + 1), vars).onlyHome;
        if (home === undefined) vars.delete(HOME_OF + name); else vars.set(HOME_OF + name, home);
      }
      // An exported function (`export -f`, `declare -fx`) also runs in child shells, which the reader reads fresh.
      if (group.slice(skipped + 1).some(token => /^-\w*f/.test(token))) state.incomplete = true;
    }
    // unset -f removes a function; a plain unset removes a variable of that name first, so whether the function is
    // still there is not known.
    if (group[skipped] === "unset") {
      const names = group.slice(skipped + 1).filter(token => !token.startsWith("-"));
      if (group.slice(skipped + 1).some(token => /^-\w*f/.test(token))) for (const name of names) functions.delete(name);
      else if (names.some(name => functions.has(name))) state.incomplete = true;
    }
    // A `{ …; }` group runs its commands in this shell; a function definition (`f() { …; }`) only keeps its body for
    // the calls below. Either ends at the matching `}`, which may carry redirections and nothing else.
    if (skipped === 0) {
      const head = definitionHead(raw);
      let start = i, at = -1;
      if (head && raw[head.at] === "{") at = head.at;
      else if (head && raw.length === head.at && groups[i + 1]?.[0] === "{") { start = i + 1; at = 0; }
      else if (!head && raw[0] === "{") at = 0;
      if (at >= 0) {
        const first = groups[start]!.slice(at + 1);
        const end = braceEnd(groups, start + 1, 1 + bracesOpened(first));
        if (end < 0 || groups[end]!.slice(1).some(token => !token.startsWith(MARK))) { state.incomplete = true; vars.clear(); return out; }
        const body = [...(first.length ? [first] : []), ...groups.slice(start + 1, end)];
        if (head) functions.set(head.name, { body, close: groups[end]! });
        else {
          substitute(groups[end]!);
          const redirects = redirectsOf(groups[end]!);
          const was = state.incomplete;
          state.incomplete = false;
          append(runGroups(body, vars, state, bodies, functions).map(entry => ({ ...entry, redirects: [...entry.redirects, ...redirects] })));
          // Where the group ends was matched by its braces; if its body held a construct the reader does not follow,
          // that match may be wrong, so nothing after it is read.
          // oxlint-disable-next-line typescript/no-unnecessary-condition -- runGroups() sets state.incomplete after the reset above
          if (state.incomplete) { vars.clear(); return out; }
          state.incomplete = was;
        }
        i = end;
        continue;
      }
    }
    // Where such a construct ends is not known, so nothing after it is read and no variable is trusted past it.
    if (UNSUPPORTED.test(group[skipped] ?? "") || group[skipped + 1] === "()") { state.incomplete = true; vars.clear(); return out; }
    // Only after that check: a substitution in a function or case body may never run. One in a redirection target runs too.
    substitute(raw);
    const redirects = redirectsOf(raw);
    const expanded = group.slice(skipped).map(token => expandToken(token, vars));
    let words = expanded.flatMap(token => token.words);
    let open = expanded.flatMap(token => token.words.map(() => token.unresolved));
    let homePaths = expanded.flatMap(token => token.words.map(() => token.homePath));
    // A call runs the function's body with the call's words as $1, $2, …; only a direct call does (env, command and
    // the like look the name up as a program).
    const called = !open[0] ? functions.get(words[0] ?? "") : undefined;
    if (called) {
      // Incomplete if anywhere in the body: $@, $*, $#, $10, ${1:-x}, local/declare/typeset/set/shift/trap, early return
      // or exit; also on a prefix assignment or a spent budget (self-recursion). A quoted mention counts too.
      const last = called.body.at(-1);
      const groups = last?.[0] === "return" && last.length <= 2 ? called.body.slice(0, -1) : called.body;
      const text = [...groups.flat(), ...called.close].join(" ").replace(SUBSTITUTED, (_, n: string) => ` ${bodies[Number(n)]} `);
      if (skipped > 0 || state.left <= 0 || /\$\{?[@*#]|\$\d\d|\$\{\d+[^}\d]/.test(text) ||
        /(?:^|[\s;&|(){}'"`])(?:local|declare|typeset|set|shift|trap|return|exit)(?=$|[\s;&|(){}'"`])/.test(text)) { state.incomplete = true; continue; }
      state.left--;
      // Positional parameters ($1 …, and HOME_OF entries for those holding just the home directory) belong to the call.
      const positional = (name: string) => /^\u0002?\d+$/.test(name);
      const outer = [...vars].filter(([name]) => positional(name));
      const clearPositional = () => { for (const name of [...vars.keys()]) if (positional(name)) vars.delete(name); };
      clearPositional();
      // An unresolved argument may be no word or several, so which argument is $n is then unknown.
      if (open.some(Boolean)) state.incomplete = true;
      else {
        // HOME_OF holds the path below the home directory, so `$1/x` expands into it just as the argument did.
        const args = expanded.flatMap(token => token.words.map(word => ({ word, home: token.words.length === 1 ? token.homePath : undefined }))).slice(1);
        args.forEach((arg, index) => {
          vars.set(String(index + 1), arg.word);
          if (arg.home !== undefined) vars.set(HOME_OF + String(index + 1), arg.home);
        });
      }
      substitute(called.close);
      const defined = redirectsOf(called.close);
      append(runGroups(called.body, vars, state, bodies, functions).map(entry => ({ ...entry, redirects: [...entry.redirects, ...defined, ...redirects] })));
      clearPositional();
      for (const [name, value] of outer) vars.set(name, value);
      continue;
    }
    let at: number | null | undefined = null;
    const unwrapped = words.length;
    while (!open[0] && (at = wrappedAt(words)) !== null) {
      // An option value the shell may expand to no word or several moves where the command starts.
      if (at === undefined || words.slice(0, at).some((word, index) => open[index] && !ASSIGNMENT.test(word))) { at = undefined; break; }
      words = words.slice(at);
      open = open.slice(at);
      homePaths = homePaths.slice(at);
    }
    if (at === undefined) { state.incomplete = true; continue; }
    // `time f` runs the function; env, command and exec run a program of that name. Which one a wrapper does is not
    // tracked here.
    if (words.length !== unwrapped && functions.has(words[0] ?? "")) { state.incomplete = true; continue; }
    if (/^(?:.*\/)?(?:ba|z|da)?sh$/.test(words[0] ?? "") && /^-[a-z]*c$/.test(words[1] ?? "") && words[2]) { append(parse(words[2], state)); continue; }
    // A script the reader cannot see into may run doan: a shell reading a file or its input, a sourced or executed
    // script file, or a script of another language that may (see interpreterMayRunDoan).
    const program = words[0]?.split("/").pop() ?? "";
    // The last input redirection is the script; its calls are read only when it is a heredoc.
    const input = raw.filter(token => /^\u00010?(?:<<<|<<-?|<)\u0001/.test(token)).at(-1);
    const read = input === undefined || !/^\u00010?<<-?\u0001/.test(input) ? undefined : new RegExp(`${PYTHON_CALLS}(\\d+)`).exec(input)?.[1];
    const interpreted = INTERPRETER.test(program) && interpreterMayRunDoan(program, words.slice(1), redirects,
      raw.some(token => token.startsWith(MARK) && (token.includes(NAMES_DOAN_BODY) || token.includes(PYTHON_CALLS) || (/^(?:perl|ruby)$/.test(program) && token.includes(BACKTICK_BODY)))), read !== undefined);
    if (/^(?:ba|z|da)?sh$/.test(program) || ["source", "."].includes(program) || /\.(?:ba|z)?sh$/.test(program) || interpreted === true) { state.incomplete = true; continue; }
    if (interpreted === "heredoc") {
      out.push({ words, homePaths, redirects });
      for (const call of state.pythonCalls[Number(read)]!) out.push({ words: call, homePaths: call.map(() => undefined), redirects: [] });
      continue;
    }
    // eval runs its words, joined, as a command of this shell.
    if (words[0] === "eval") {
      if (open.some(Boolean)) state.incomplete = true; else append(parse(words.slice(1).join(" "), state, vars, functions));
      continue;
    }
    if (!words.length) { if (redirects.length) out.push({ words, homePaths, redirects }); continue; }
    // xargs adds words read from its input to the command it runs, so a doan run (or a shell or wrapper that may run
    // one) through it cannot be read.
    if (/^(?:.*\/)?xargs$/.test(words[0]!) && (open.some(Boolean) || words.slice(1).some(word => RUNNER.test(word)))) { state.incomplete = true; continue; }
    // find runs the command after -exec (or -execdir, -ok, -okdir) once per file, with the file's name in it: a shell
    // -c script is read as one, and doan, another shell or a wrapper cannot be.
    if (/^(?:.*\/)?find$/.test(words[0]!)) {
      const runs = words.flatMap((_word, k) => /^-(?:exec|execdir|ok|okdir)$/.test(words[k - 1] ?? "") ? [k] : []);
      const script = (k: number) => /^(?:.*\/)?(?:ba|z|da)?sh$/.test(words[k]!) && /^-[a-z]*c$/.test(words[k + 1] ?? "") && words[k + 2] !== undefined && !open[k + 2];
      if (runs.some(k => open[k] || (RUNNER.test(words[k]!) && !script(k)))) { state.incomplete = true; continue; }
      out.push({ words, homePaths, redirects });
      for (const k of runs) if (script(k)) append(parse(words[k + 2]!, state));
      continue;
    }
    // A program or a doan operand the reader could not resolve may be anything, including a lookup.
    let known = !open[0];
    if (known && /^(?:.*\/)?doan$/.test(words[0]!)) {
      // An unresolved word may stand for no word or several, so a command that reads as refused may not be one.
      const read = readDoanArgs(words.map((word, index) => open[index] ? "\0" : word))!;
      known = !read.ambiguous && (read.args.refused ? !open.some(Boolean) : !read.args.positionals.some(operand => operand.includes("\0")));
    }
    if (known) out.push({ words, homePaths, redirects }); else state.incomplete = true;
  }
  return out;
}

function parse(command: string, state: ReadState, vars = new Map<string, string>(), functions = new Map<string, ShellFunction>()): ShellCommand[] {
  const plain = withoutHeredocsAndComments(command, state.pythonCalls);
  if (plain.unread) state.incomplete = true;
  const taken = substitutions(plain.text);
  if (taken === null) { state.incomplete = true; return []; }
  const groups: string[][] = [[]];
  // An unquoted redirection operator is a token of its own (`2>&1` is not a background `&`), joined with the word
  // after it, its target; heredoc bodies are already gone, so a `<<` takes its tag.
  let operator: string | undefined;
  // A backslash quotes the next character (`\>` is a word); withoutHeredocsAndComments has already joined continued lines.
  for (const token of taken.text.matchAll(/\d*(?:&>>?|<<<|<<-?|<>|<&|>&|>>|>\||<|>)|[;&|\n]+|(?:"(?:\\.|[^"\\])*"|'[^']*'|\\[^\n]?|[^\s;&|"'<>\\])+/g)) {
    const value = token[0];
    const separator = /^[;&|\n]+$/.test(value);
    // An operator with no word after it is a syntax error: the shell runs nothing of that command line.
    if (operator !== undefined && (separator || REDIRECT_OPERATOR.test(value))) { state.incomplete = true; return []; }
    if (operator !== undefined && !separator && !REDIRECT_OPERATOR.test(value)) { groups.at(-1)!.push(`${MARK}${operator}${MARK}${value}`); operator = undefined; continue; }
    operator = undefined;
    if (separator) groups.push([]);
    else if (REDIRECT_OPERATOR.test(value)) operator = value;
    else groups.at(-1)!.push(value);
  }
  if (operator !== undefined) { state.incomplete = true; return []; }
  return runGroups(groups.filter(g => g.length), vars, state, taken.bodies, functions);
}

// Commands with words and redirections (a redirect-only one has no words) and whether the read is complete.
// An incomplete read's commands are real but not all that ran.
export function readCommands(command: string): { commands: ShellCommand[]; incomplete: boolean } {
  const state: ReadState = { left: LOOP_BUDGET, incomplete: false, pythonCalls: [], seqUnknown: /\b(?:alias|IFS)\b/.test(command) };
  const commands = parse(command, state);
  return { commands, incomplete: state.incomplete };
}

// The words of what a command runs, and whether the read is complete (see readCommands).
export function parseCommand(command: string): { words: string[][]; incomplete: boolean } {
  const read = readCommands(command);
  return { words: read.commands.filter(entry => entry.words.length).map(entry => entry.words), incomplete: read.incomplete };
}

// Whether any command could not be read to the end. Its missing words may have been anything, so a check that needs
// the full list of what ran (an absence check) never holds beside one.
export function incompleteRead(commands: string[]): boolean {
  return commands.some(command => parseCommand(command).incomplete);
}

// Preserve quoted arguments so echoing a command cannot count as invoking it.
export function commandWords(command: string): string[][] {
  return parseCommand(command).words;
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
  const recorded = recordedExecs(transcript);
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
      for (const call of rolloutCalls(event, recorded)) addCall(call, p.call_id, p.type === "custom_tool_call" ? "batch" : "call");
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
    const excerpt = (texts.length ? texts.join("\n") : typeof output === "string" ? output : (JSON.stringify(output) as string | undefined) ?? "").slice(0, 300);
    return { ...search, excerpt };
  });
}

// patchFiles: the files apply_patch calls name (added, updated, deleted or moved to), candidates included.
// commandCandidates: Codex exec literals no recorded process matches (pairedWithRecords), lexical evidence only.
export interface ToolCalls { doan?: RecordedCall[]; commands: string[]; mcpTools: string[]; patchCandidates?: string[]; commandCandidates?: string[]; patchFiles?: string[]; outputs?: InvocationOutput[]; toolSearches?: ToolSearch[] }

export function toolCalls(transcript: string): ToolCalls {
  const outputs = invocationOutputs(transcript);
  const searches = toolSearches(transcript);
  const recorded = recordedExecs(transcript);
  const patchCalls = transcript.split(/\r?\n/).flatMap(line => {
    try { return rolloutCalls(JSON.parse(line), recorded); }
    catch { return []; }
  });
  const patchCandidates = patchCalls.flatMap(call => call.patchCandidate === undefined ? [] : [call.patchCandidate]);
  const commandCandidates = patchCalls.flatMap(call => call.commandCandidate === undefined ? [] : [call.commandCandidate]);
  const patchFiles = [...new Set(patchCalls.flatMap(call => [...(call.patch ?? "").matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/gm)].map(m => m[1]!.trim())))];
  return { commands: [...new Set(shellCommands(transcript))], mcpTools: [...new Set(mcpTools(transcript))], ...(patchCandidates.length ? { patchCandidates } : {}), ...(commandCandidates.length ? { commandCandidates } : {}), ...(patchFiles.length ? { patchFiles } : {}), ...(outputs.length ? { outputs } : {}), ...(searches.length ? { toolSearches: searches } : {}) };
}
