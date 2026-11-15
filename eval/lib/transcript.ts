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

// The argument shapes the commands the checks read refuse with a usage error before doing anything (openInput,
// exportInput, DesignSkill; tied to the CLI by transcript.test.ts). --frame accumulates in the flag set, and these
// commands refuse a second one.
function shapeAccepted(positionals: string[], flags: DoanArgs["flags"]): boolean {
  const all = (name: string) => flags.filter(flag => flag.name === name);
  const frames = all("frame").length;
  const last = (name: string) => all(name).at(-1);
  const prototype = last("prototype") !== undefined && (last("prototype")!.value === undefined || TRUE.test(last("prototype")!.value!));
  const operands = positionals.length - 1;
  switch (positionals[0]) {
    case "open": return operands === 1 && frames <= 1 && (frames === 1 || !prototype);
    case "export": return operands === 1 && !!last("o")?.value && frames <= 1 && prototype === (frames === 1);
    case "design-skill": return operands <= 1;
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

interface ExtractedCall { name: string; command?: string; patchCandidate?: string }

// Stands in for an exec_command whose command is not a plain string (a template, a variable, an expression): it ran
// something the reader cannot see. parseCommand reads it as incomplete, so no absence check holds beside it, and it
// yields no words, so it is never evidence of a particular command either.
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
        if (!standalone) calls.push({ name, patchCandidate: patch });
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

function rolloutCalls(event: { type?: string; payload?: { type?: string; name?: string; input?: string; arguments?: string } }): ExtractedCall[] {
  if (event.type !== "response_item") return [];
  const p = event.payload;
  if (p?.type === "custom_tool_call" && /^(?:functions\.)?exec$/.test(p.name ?? "") && typeof p.input === "string") return execCalls(p.input);
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
// Where substitutions(n) took the nth command substitution out of a command; NUL never occurs in a shell command.
const SUBSTITUTED = /\$\(\0(\d+)\)/g;

// The index of the `)` that closes a `$(` or `(` opened before `from`, or -1. Quotes, escapes, backticks and nested
// substitutions inside are skipped, so a `)` in them does not close it.
function closing(text: string, from: number): number {
  let depth = 1, quote: string | null = null;
  for (let i = from; i < text.length; i++) {
    const c = text[i]!;
    if (quote === "'") { if (c === "'") quote = null; continue; }
    if (c === "\\") { i++; continue; }
    if (c === "$" && text[i + 1] === "(") { i = closing(text, i + 2); if (i < 0) return -1; continue; }
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
// substitution never closes: the shell would not run the command as written.
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
      // Arithmetic yields a number; a substitution inside it is not followed, so it is left in to be unresolved.
      if (body.startsWith("(") && body.endsWith(")")) text += /\$\(|`/.test(body) ? command.slice(i, end + 1) : "$(())";
      else { bodies.push(body); text += `$(\0${bodies.length - 1})`; }
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
    if (quote === null && (c === "'" || c === '"')) quote = c;
    else if (quote === '"' && c === '"') quote = null;
    text += c;
  }
  return { text, bodies };
}

// Wrappers that run their operand as the command. The index where that command starts, null when the words are not
// such a wrapper (or `command -v`, a lookup), and undefined when an option is one the reader does not know, so where
// the command starts is unknown.
const WRAPPER = /^(?:.*\/)?(env|timeout|nohup|nice)$/;
function wrappedAt(words: string[]): number | null | undefined {
  const name = words[0] === "command" ? "command" : WRAPPER.exec(words[0] ?? "")?.[1];
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
interface Expanded { words: string[]; unresolved: boolean }

// One raw token (quotes still on) to the words the shell makes of it. Single quotes and an escaped `\$` keep a
// literal `$`. A variable that is not known here, or a command substitution, is left as written and marks the token
// unresolved: what the shell would pass there is unknown. A bare `$name` holding several words splits into them, as
// an unquoted expansion does.
function expandToken(raw: string, env: ReadonlyMap<string, string>): Expanded {
  const whole = /^\$(?:(\w+)|\{(\w+)\})$/.exec(raw);
  const held = whole ? env.get(whole[1] ?? whole[2]!) : undefined;
  if (held !== undefined) return { words: held.split(/\s+/).filter(Boolean), unresolved: false };
  let unresolved = false;
  const known = (written: string, plain?: string, braced?: string) => {
    const value = env.get(plain ?? braced!);
    if (value === undefined) unresolved = true;
    return value ?? written;
  };
  // What is left after the variables: a `$(` or a backtick starts a substitution this reader does not run.
  const substitution = (text: string) => { if (/\$\(|`/.test(text)) unresolved = true; return text; };
  const word = raw.replace(/"((?:\\.|[^"\\])*)"|'([^']*)'|([^"']+)/g, (_, double, single, bare) => {
    if (single !== undefined) return single;
    const text = (double ?? bare) as string;
    const pattern = double !== undefined ? /\\([\$`"\\\n])|\$(?:(\w+)|\{(\w+)\})/g : /\\(\$)|\$(?:(\w+)|\{(\w+)\})/g;
    return substitution(text.replace(pattern, (m: string, escaped: string | undefined, plain?: string, braced?: string) => escaped ?? known(m, plain, braced)).replace(/\\\$/g, "$"));
  });
  // A substitution the reader has already read (see substitutions) leaves only that it was there.
  return { words: [word.replace(SUBSTITUTED, "$()")], unresolved };
}

// Executes the words of raw token groups the way the shell would, for what a transcript can show: `NAME=value`
// assignments on their own, and a closed `for NAME in words; do …; done` with its body run once per word. The
// variables are one shell state: a loop variable and an assignment in a body stay set after the loop, as in POSIX
// sh. Whatever cannot be followed (a `for` without its `done`, a loop past the budget, a list that holds an
// unresolved word) sets `state.incomplete` and yields no words, and so does a simple command whose program or doan
// operand is unresolved: the read is then not complete and must not be taken for the whole list of what ran.
// Any other compound or reserved word (UNSUPPORTED) stops the read there, as incomplete.
function runGroups(groups: string[][], vars: Map<string, string>, state: ReadState, bodies: string[]): string[][] {
  const out: string[][] = [];
  const append = (words: string[][]) => { for (const entry of words) out.push(entry); };
  // A substitution runs before the command it is in, in a subshell that sees the variables set so far.
  const substitute = (tokens: string[]) => {
    for (const token of tokens) for (const m of token.matchAll(SUBSTITUTED)) append(parse(bodies[Number(m[1])]!, state, new Map(vars)));
  };
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]!;
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
      const values = lists.flatMap(list => list.words);
      if (lists.some(list => list.unresolved) || values.length > state.left) {
        // The body ran an unknown number of times with unknown values: nothing after it can rely on the variables.
        state.incomplete = true;
        vars.clear();
      } else {
        state.left -= values.length;
        for (const value of values) { vars.set(group[1]!, value); append(runGroups(body.slice(0, done), vars, state, bodies)); }
      }
      // Continue after the loop's `done`.
      i += 2 + done - rest.length;
      continue;
    }
    substitute(group);
    let skipped = 0;
    while (ASSIGNMENT.test(group[skipped] ?? "")) skipped++;
    // Assignments before a command belong to that command alone; a group of only assignments sets them for the rest.
    if (skipped > 0 && skipped === group.length) {
      for (const token of group) {
        const name = token.slice(0, token.indexOf("="));
        const value = expandToken(token.slice(token.indexOf("=") + 1), vars);
        if (value.unresolved) vars.delete(name); else vars.set(name, value.words.join(" "));
      }
    }
    // Where such a construct ends is not known, so nothing after it is read and no variable is trusted past it.
    if (UNSUPPORTED.test(group[skipped] ?? "") || group[skipped + 1] === "()") { state.incomplete = true; vars.clear(); return out; }
    const expanded = group.slice(skipped).map(token => expandToken(token, vars));
    let words = expanded.flatMap(token => token.words);
    let open = expanded.flatMap(token => token.words.map(() => token.unresolved));
    let at: number | null | undefined = null;
    while (!open[0] && (at = wrappedAt(words)) !== null) {
      if (at === undefined) break;
      words = words.slice(at);
      open = open.slice(at);
    }
    if (at === undefined) { state.incomplete = true; continue; }
    if (/^(?:.*\/)?(?:ba|z|da)?sh$/.test(words[0] ?? "") && /^-[a-z]*c$/.test(words[1] ?? "") && words[2]) { append(parse(words[2], state)); continue; }
    if (!words.length) continue;
    // xargs adds words read from its input to the command it runs, so a doan run (or a shell or wrapper that may run
    // one) through it cannot be read.
    if (/^(?:.*\/)?xargs$/.test(words[0]!) && (open.some(Boolean) || words.slice(1).some(word => /^(?:.*\/)?(?:doan|(?:ba|z|da)?sh|env|timeout|nohup|nice|command|xargs)$/.test(word)))) { state.incomplete = true; continue; }
    // A program or a doan operand the reader could not resolve may be anything, including a lookup.
    let known = !open[0];
    if (known && /^(?:.*\/)?doan$/.test(words[0]!)) {
      // An unresolved word may stand for no word or several, so a command that reads as refused may not be one.
      const read = readDoanArgs(words.map((word, index) => open[index] ? "\0" : word))!;
      known = !read.ambiguous && (read.args.refused ? !open.some(Boolean) : !read.args.positionals.some(operand => operand.includes("\0")));
    }
    if (known) out.push(words); else state.incomplete = true;
  }
  return out;
}

function parse(command: string, state: ReadState, vars = new Map<string, string>()): string[][] {
  const taken = substitutions(withoutHeredocBodies(command));
  if (taken === null) { state.incomplete = true; return []; }
  const groups: string[][] = [[]];
  for (const token of taken.text.matchAll(/[;&|\n]+|(?:"(?:\\.|[^"\\])*"|'[^']*'|[^\s;&|"'])+/g)) {
    const value = token[0];
    if (/^[;&|\n]+$/.test(value)) groups.push([]);
    else groups.at(-1)!.push(value);
  }
  return runGroups(groups.filter(g => g.length), vars, state, taken.bodies);
}

// The words of what a command runs, and whether the read is complete. An incomplete read lacks the commands it
// could not follow (see runGroups): the words it does give are real, but they are not the whole list.
export function parseCommand(command: string): { words: string[][]; incomplete: boolean } {
  const state: ReadState = { left: LOOP_BUDGET, incomplete: false };
  const words = parse(command, state);
  return { words, incomplete: state.incomplete };
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

export interface ToolCalls { commands: string[]; mcpTools: string[]; patchCandidates?: string[]; outputs?: InvocationOutput[]; toolSearches?: ToolSearch[] }

export function toolCalls(transcript: string): ToolCalls {
  const outputs = invocationOutputs(transcript);
  const searches = toolSearches(transcript);
  const patchCalls = transcript.split(/\r?\n/).flatMap(line => {
    try { return rolloutCalls(JSON.parse(line)); }
    catch { return []; }
  });
  const patchCandidates = patchCalls.flatMap(call => call.patchCandidate === undefined ? [] : [call.patchCandidate]);
  return { commands: [...new Set(shellCommands(transcript))], mcpTools: [...new Set(mcpTools(transcript))], ...(patchCandidates.length ? { patchCandidates } : {}), ...(outputs.length ? { outputs } : {}), ...(searches.length ? { toolSearches: searches } : {}) };
}
