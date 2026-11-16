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

// The argument shapes the commands the checks read refuse with a usage error before doing anything (openInput,
// exportInput, checkFrame, DesignSkill with designskill.ValidID; tied to the CLI by transcript.test.ts). --frame
// accumulates in the flag set, and these commands refuse a second one. An id of the right shape that is not in the
// catalog is refused too; the preset checks compare ids with the catalog themselves.
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

// doan's argv read as SplitArgs and Run read it: flags before, between and after the positionals, a value flag taking
// the next word whatever it looks like. `ambiguous` marks an unknown flag before the command with a word after it: the
// reader cannot tell whether that word is its value or the command, so it cannot tell which command this is.
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
  const command = positionals[0];
  if (command !== undefined) {
    const own = DOAN_COMMAND_FLAGS[command === "work" && positionals[1] === "update" ? "work update" : command] ?? [];
    const allowed = command === "onboarding" ? ["json", ...own] : ["json", "repo", ...own];
    if (flags.some(flag => !allowed.includes(flag.name)) || !shapeAccepted(positionals, flags)) refused = true;
  }
  return { args: { positionals, flags, refused }, ambiguous };
}

// `refused` marks what the CLI rejects before running anything (an unknown flag or one the command does not take, a
// value flag with no value, a boolean that is not one, an argument shape the command refuses); such a command ran
// nothing, but an attempt check may still want its words, so an unknown flag is kept as a flag that takes no value.
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

// `patch` is the text of every apply_patch call given a literal, run or only a candidate.
interface ExtractedCall { name: string; command?: string; patch?: string; patchCandidate?: string }

// Stands in for an exec_command whose command is not a plain string (a template, a variable, an expression): it ran
// something the reader cannot see, unless the run recorded it (recordedExecs). parseCommand reads it as incomplete, so
// no absence check holds beside it, and it yields no words, so it is never evidence of a particular command either.
const UNREADABLE_EXEC = "$exec_command_with_a_cmd_that_is_not_a_string_literal";

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
        // that can skip it or throw, so it is a real call and not a candidate.
        // Everything else stays lexical evidence only, which the judge sees labelled.
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
          command = value !== undefined && [",", "}"].includes(tokens[j + 3]) ? value : undefined;
        }
      }
    }
    calls.push({ name, command: command ?? UNREADABLE_EXEC });
  }
  return calls;
}

// The script a recorded `<shell> -c <script>` argv ran, or undefined for any other shape.
function shellScript(argv: unknown): string | undefined {
  if (!Array.isArray(argv) || argv.length !== 3 || !argv.every(word => typeof word === "string")) return undefined;
  return /^(?:.*\/)?(?:sh|bash|zsh|dash)$/.test(argv[0]) && /^-[a-z]*c$/.test(argv[1]) ? argv[2] : undefined;
}

// Codex records each process an exec script starts as an item_completed CommandExecution event: the argv it ran, but
// no call id, between the script's custom_tool_call and its output. For a script with a command the reader cannot see,
// those records are what ran, so they replace its unread marker, keyed by call id. The marker stays unless the script's
// output arrived (a later command could still be the script's), no other tool call was open while a record arrived
// (the record could be that call's), every record in the window reads as a shell script, and a record is left after
// taking out one for each literal command the script names (otherwise nothing recorded stands for the unread one).
function recordedExecs(transcript: string): Map<string, string[]> {
  const open = new Map<string, { ran: (string | undefined)[]; shared: boolean }>();
  const recorded = new Map<string, string[]>();
  const unreadScripts = new Map<string, string[]>();
  for (const line of transcript.split(/\r?\n/)) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (!record(event) || !record(event.payload)) continue;
    const p = event.payload;
    if (event.type === "response_item" && typeof p.call_id === "string") {
      if (p.type === "custom_tool_call" || p.type === "function_call") {
        open.set(p.call_id, { ran: [], shared: false });
        const commands = rolloutCalls(event).flatMap(call => call.command === undefined ? [] : [call.command]);
        if (p.type === "custom_tool_call" && commands.includes(UNREADABLE_EXEC)) unreadScripts.set(p.call_id, commands.filter(command => command !== UNREADABLE_EXEC));
      }
      const window = open.get(p.call_id);
      if (window && (p.type === "custom_tool_call_output" || p.type === "function_call_output")) {
        open.delete(p.call_id);
        const literals = unreadScripts.get(p.call_id);
        if (!literals || window.shared || window.ran.includes(undefined)) continue;
        const left = window.ran as string[];
        for (const literal of literals) {
          const at = left.indexOf(literal);
          if (at >= 0) left.splice(at, 1);
        }
        if (left.length) recorded.set(p.call_id, left);
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

function rolloutCalls(event: { type?: string; payload?: { type?: string; name?: string; input?: string; arguments?: string; call_id?: string } }, recorded?: Map<string, string[]>): ExtractedCall[] {
  if (event.type !== "response_item") return [];
  const p = event.payload;
  if (p?.type === "custom_tool_call" && /^(?:functions\.)?exec$/.test(p.name ?? "") && typeof p.input === "string") {
    const calls = execCalls(p.input), ran = typeof p.call_id === "string" ? recorded?.get(p.call_id) : undefined;
    return ran ? [...calls.filter(call => call.command !== UNREADABLE_EXEC), ...ran.map(command => ({ name: "exec_command", command }))] : calls;
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
      const event = JSON.parse(lines[i]);
      commands.push(...rolloutCalls(event, recorded).flatMap(c => c.command === undefined ? [] : [c.command]));
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
// whole, so a `<<` inside a string starts nothing and `bash -c "…<<EOF…"` is read when its script is. A comment (a `#`
// starting a word outside quotes) goes too: the shell drops it, and a quote inside it opens no string. `unread` is set
// when an unquoted body holds a substitution, which the shell runs and this reader does not follow there. A body that
// names doan and starts a process leaves NAMES_DOAN_BODY after its tag, since an interpreter that reads it as its
// script may run doan; agents also feed interpreters long document-editing scripts whose text only mentions doan.
function withoutHeredocsAndComments(command: string): { text: string; unread: boolean } {
  let out = "", quote: string | null = null, unread = false;
  const pending: { tag: string; indented: boolean; quoted: boolean; at: number }[] = [];
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
        if (NAMES_DOAN.test(body) && STARTS_PROCESS.test(body)) { out = out.slice(0, at + marked) + NAMES_DOAN_BODY + out.slice(at + marked); marked++; }
      }
    } else out += c;
  }
  return { text: out, unread };
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z_0-9]*=/;
// doan as a word, not `.doan/` or `/tmp/doan-x`.
const NAMES_DOAN = /(?<![\w.-])doan(?![\w.-])/;
// How a node, python, perl, ruby or AppleScript script starts another program. A bare `system` or `exec` in prose
// ("the design system") is not one, so those need a call after them.
const STARTS_PROCESS = /\b(?:subprocess|child_process|execa|commands\.getoutput|pty\.spawn|Bun\.spawn|Deno\.(?:Command|run)|Open3|do shell script)\b|\b(?:system|exec\w*|spawn\w*|popen|qx)\s*[("'{]|%x[({[]/;
// Where withoutHeredocsAndComments marked a heredoc whose body names doan; U+0004 never occurs in a shell command.
const NAMES_DOAN_BODY = "\u0004";
// A key in the reader's variables for one assigned just the home directory, holding what followed it (`/` or
// nothing); no shell name holds U+0002.
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

// Takes each outermost `$(…)` and backtick substitution out of a command: its body runs as a command of its own (in
// runGroups, where the variables are known), and what it printed is unknown, so it stands as an unresolved word.
// Single quotes and an escape keep a `$(` or backtick literal, and `$((…))` is arithmetic, not a command. `null` when a
// substitution never closes (the shell would not run the command as written) or holds one this reader does not follow.
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

// Wrappers that run their operand as the command. The index where that command starts, null when the words are not
// such a wrapper (or `command -v`, a lookup), and undefined when an option is one the reader does not know, so where
// the command starts is unknown.
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
// Reserved words and group openers that start a construct the reader does not follow (it follows plain commands,
// `NAME=value` and `for … do … done` only). A `do`/`done` that no parsed `for` consumed belongs here too.
const UNSUPPORTED = /^(?:if|then|elif|else|fi|while|until|do|done|case|esac|select|function|for|\{|\}|!)$|^[()]|^[A-Za-z_]\w*\(\)?$/;
// Loop iterations one command may expand in total, nested loops included, so a transcript cannot make the reader
// work without bound.
const LOOP_BUDGET = 256;

interface ReadState { left: number; incomplete: boolean }
// `homePath`: the path below the home directory (`/.zshrc`, or "" for the home itself) when the shell expands the word to
// start there; `onlyHome`: what follows the home directory when the word is just that, for a variable assigned it.
interface Expanded { words: string[]; unresolved: boolean; homePath: string | undefined; onlyHome: string | undefined }
// A redirection the shell takes out of a command's words: the operator with its file descriptor, and the target as the
// shell expands it (`unresolved` when it holds a variable or substitution this reader does not know). The text keeps
// `~` and an unknown `$HOME` as written, quoted or not; `homePath` says whether the shell expands it into the home
// directory, and so do a command's `homePaths`, one per word.
export interface Redirect { op: string; target: string; unresolved: boolean; homePath: string | undefined }
export interface ShellCommand { words: string[]; homePaths: (string | undefined)[]; redirects: Redirect[] }

// Where parse put a redirection into a token group: MARK, the operator, MARK, the raw target. U+0001 never occurs in a
// shell command.
const MARK = "\u0001";
// The shell takes a redirection before it reads the program, wherever it stands in the command.
const REDIRECT_OPERATOR = /^\d*(?:&>>?|<<<|<<-?|<>|<&|>&|>>|>\||<|>)$/;

// One raw token (quotes still on) to the words the shell makes of it. Single quotes and a backslash keep the next
// character literal. A variable that is not known here, or a command substitution, is left as written and marks the
// token unresolved: what the shell would pass there is unknown. A bare `$name` holding several words splits into them,
// as an unquoted expansion does. The home directory is an unquoted leading `~` (before `/` or the end), `$HOME` outside
// single quotes while the command line has not assigned HOME, or a variable assigned just one of those.
function expandToken(raw: string, env: ReadonlyMap<string, string>): Expanded {
  const whole = /^\$(?:(\w+)|\{(\w+)\})$/.exec(raw);
  const name = whole ? whole[1] ?? whole[2]! : undefined;
  const held = name !== undefined ? env.get(name) : undefined;
  if (held !== undefined) {
    const words = held.split(/\s+/).filter(Boolean);
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
// The switches that give each interpreter its script inline, as a word this reader sees.
const INLINE: [RegExp, RegExp][] = [
  [/^python/, /^-[A-Za-z]*[cm]$/],
  [/^(?:node|bun|deno)$/, /^(?:-[ep]+|--eval|--print)(?:=|$)/],
  [/^(?:perl|ruby)$/, /^-[\w]*[eE]$/],
  [/^osascript$/, /^-e$/],
];

// Whether an interpreter may run doan where this reader cannot see it: an argument (an inline script among them) that
// names doan, a script file, or a script read from its input, unless that is a heredoc or here-string the transcript
// shows and that does not name doan. A version or help query with no script runs nothing.
function interpreterMayRunDoan(program: string, args: string[], redirects: Redirect[], heredocNamesDoan: boolean): boolean {
  if (args.some(word => NAMES_DOAN.test(word))) return true;
  const inline = INLINE.find(([name]) => name.test(program))?.[1];
  if (inline && args.some(word => inline.test(word))) return false;
  const script = args.find(word => word === "-" || !word.startsWith("-"));
  if (script !== undefined && script !== "-") return true;
  if (script === undefined && args.some(word => /^(?:-[vVh]|--version|--help)$/.test(word))) return false;
  const input = redirects.filter(redirect => /^0?(?:<<<|<<-?|<)$/.test(redirect.op)).at(-1);
  if (input?.op.endsWith("<<<")) return NAMES_DOAN.test(input.target);
  if (input && /<<-?$/.test(input.op)) return heredocNamesDoan;
  return true;
}

// Executes the words of raw token groups the way the shell would, for what a transcript can show: `NAME=value`
// assignments on their own, and a closed `for NAME in words; do …; done` with its body run once per word. The
// variables are one shell state: a loop variable and an assignment in a body stay set after the loop, as in POSIX
// sh. Whatever cannot be followed (a `for` without its `done`, a loop past the budget, a list that holds an
// unresolved word) sets `state.incomplete` and yields no words, and so does a simple command whose program or doan
// operand is unresolved: the read is then not complete and must not be taken for the whole list of what ran.
// Any other compound or reserved word (UNSUPPORTED) stops the read there, as incomplete.
function runGroups(groups: string[][], vars: Map<string, string>, state: ReadState, bodies: string[]): ShellCommand[] {
  const out: ShellCommand[] = [];
  const append = (commands: ShellCommand[]) => { for (const entry of commands) out.push(entry); };
  // A substitution runs before the command it is in, in a subshell that sees the variables set so far.
  const substitute = (tokens: string[]) => {
    for (const token of tokens) for (const m of token.matchAll(SUBSTITUTED)) append(parse(bodies[Number(m[1])]!, state, new Map(vars)));
  };
  const redirectsOf = (tokens: string[]): Redirect[] => tokens.filter(token => token.startsWith(MARK)).map(token => {
    const [, op = "", target = ""] = token.split(MARK);
    const expanded = expandToken(target.replace(NAMES_DOAN_BODY, ""), vars);
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
      const lists = group.slice(3).map(token => expandToken(token, vars));
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
          append(runGroups(body.slice(0, done), vars, state, bodies).map(entry => ({ ...entry, redirects: [...entry.redirects, ...loop] })));
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
    let at: number | null | undefined = null;
    while (!open[0] && (at = wrappedAt(words)) !== null) {
      // An option value the shell may expand to no word or several moves where the command starts.
      if (at === undefined || words.slice(0, at).some((word, index) => open[index] && !ASSIGNMENT.test(word))) { at = undefined; break; }
      words = words.slice(at);
      open = open.slice(at);
      homePaths = homePaths.slice(at);
    }
    if (at === undefined) { state.incomplete = true; continue; }
    if (/^(?:.*\/)?(?:ba|z|da)?sh$/.test(words[0] ?? "") && /^-[a-z]*c$/.test(words[1] ?? "") && words[2]) { append(parse(words[2], state)); continue; }
    // A script the reader cannot see into may run doan: a shell reading a file or its input, a sourced or executed
    // script file, or a script of another language that may (see interpreterMayRunDoan).
    const program = words[0]?.split("/").pop() ?? "";
    if (/^(?:ba|z|da)?sh$/.test(program) || ["source", "."].includes(program) || /\.(?:ba|z)?sh$/.test(program) ||
      (INTERPRETER.test(program) && interpreterMayRunDoan(program, words.slice(1), redirects, raw.some(token => token.startsWith(MARK) && token.includes(NAMES_DOAN_BODY))))) { state.incomplete = true; continue; }
    // eval runs its words, joined, as a command of this shell.
    if (words[0] === "eval") {
      if (open.some(Boolean)) state.incomplete = true; else append(parse(words.slice(1).join(" "), state, vars));
      continue;
    }
    if (!words.length) { if (redirects.length) out.push({ words, homePaths, redirects }); continue; }
    // xargs adds words read from its input to the command it runs, so a doan run (or a shell or wrapper that may run
    // one) through it cannot be read.
    if (/^(?:.*\/)?xargs$/.test(words[0]!) && (open.some(Boolean) || words.slice(1).some(word => RUNNER.test(word)))) { state.incomplete = true; continue; }
    // find runs the command after -exec (or -execdir, -ok, -okdir) once per file, with the file's name in it: a shell
    // -c script is read as one, and doan, another shell or a wrapper cannot be.
    if (/^(?:.*\/)?find$/.test(words[0]!)) {
      const runs = words.flatMap((word, k) => /^-(?:exec|execdir|ok|okdir)$/.test(words[k - 1] ?? "") ? [k] : []);
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

function parse(command: string, state: ReadState, vars = new Map<string, string>()): ShellCommand[] {
  const plain = withoutHeredocsAndComments(command);
  if (plain.unread) state.incomplete = true;
  const taken = substitutions(plain.text);
  if (taken === null) { state.incomplete = true; return []; }
  const groups: string[][] = [[]];
  // An unquoted redirection operator is a token of its own (`2>&1` is not a background `&`), joined with the word
  // after it, its target; heredoc bodies are already gone, so a `<<` takes its tag.
  let operator: string | undefined;
  // A backslash quotes the next character (`\>` is a word), except a newline, which it joins to the next line.
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
  return runGroups(groups.filter(g => g.length), vars, state, taken.bodies);
}

// Each command a command line runs, with its words and its redirections, and whether the read is complete. An
// incomplete read lacks the commands it could not follow (see runGroups): what it does give is real, but it is not
// the whole list. A command that is only redirections (`> file`) has no words.
export function readCommands(command: string): { commands: ShellCommand[]; incomplete: boolean } {
  const state: ReadState = { left: LOOP_BUDGET, incomplete: false };
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
    const excerpt = (texts.length ? texts.join("\n") : typeof output === "string" ? output : JSON.stringify(output) ?? "").slice(0, 300);
    return { ...search, excerpt };
  });
}

// patchFiles: the files apply_patch calls name (added, updated, deleted or moved to), candidates included.
export interface ToolCalls { commands: string[]; mcpTools: string[]; patchCandidates?: string[]; patchFiles?: string[]; outputs?: InvocationOutput[]; toolSearches?: ToolSearch[] }

export function toolCalls(transcript: string): ToolCalls {
  const outputs = invocationOutputs(transcript);
  const searches = toolSearches(transcript);
  const patchCalls = transcript.split(/\r?\n/).flatMap(line => {
    try { return rolloutCalls(JSON.parse(line)); }
    catch { return []; }
  });
  const patchCandidates = patchCalls.flatMap(call => call.patchCandidate === undefined ? [] : [call.patchCandidate]);
  const patchFiles = [...new Set(patchCalls.flatMap(call => [...(call.patch ?? "").matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/gm)].map(m => m[1]!.trim())))];
  return { commands: [...new Set(shellCommands(transcript))], mcpTools: [...new Set(mcpTools(transcript))], ...(patchCandidates.length ? { patchCandidates } : {}), ...(patchFiles.length ? { patchFiles } : {}), ...(outputs.length ? { outputs } : {}), ...(searches.length ? { toolSearches: searches } : {}) };
}
