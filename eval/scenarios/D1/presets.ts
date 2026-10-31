import type { Check, CheckContext } from "../../lib/types.ts";
import { commandWords, doanPositionals } from "../../lib/transcript.ts";

// Shared by the design preset scenarios (D1–D12).

const CATALOG = ["context", "shape", "document", "extract", "critique", "audit", "polish", "distill", "bolder", "quieter", "layout", "typeset", "colorize", "clarify", "harden", "onboard", "adapt", "animate", "delight", "generate"];

// The same evidence the judge gets (eval/lib/judge.ts): commands the agent ran
// and MCP calls it made. A guide quote or an echoed command is not a lookup.
export function presetLookups(ctx: CheckContext) {
  const shell = ctx.calls.commands.flatMap(commandWords).flatMap(words => {
    const args = doanPositionals(words);
    return args?.[0] === "design-skill" ? [args] : [];
  });
  const shellIds = [...new Set(shell.flatMap(args => args[1] === undefined ? [] : [args[1]]))];
  const mcpIds = [...new Set(ctx.calls.mcpDesignSkillIds ?? [])];
  return {
    shellInvoked: shell.length > 0,
    mcpInvoked: ctx.calls.mcpTools.includes("mcp__doan__design_skill"),
    shellIds,
    mcpIds,
    // An id outside the catalog returns usage_error, so it is never a body read.
    ids: [...new Set([...shellIds, ...mcpIds])].filter(id => CATALOG.includes(id)),
  };
}

// Each `required` entry must be read (over `transport` when given); an array
// entry accepts any one of its ids. Every catalog id read must be in `allowed`;
// an empty `allowed` means no body may be read.
export function presetChecks(ctx: CheckContext, o: { required: (string | string[])[]; allowed: string[]; transport?: "shell" | "mcp" }): Check[] {
  const l = presetLookups(ctx);
  const detail = `shell ${l.shellInvoked ? JSON.stringify(l.shellIds) : "not invoked"}, mcp ${l.mcpInvoked ? JSON.stringify(l.mcpIds) : "not invoked"}`;
  const via = o.transport === "shell" ? l.shellIds : o.transport === "mcp" ? l.mcpIds : l.ids;
  const checks: Check[] = o.required.map(entry => {
    const any = typeof entry === "string" ? [entry] : entry;
    return { id: `read_${any.join("_or_")}`, pass: any.some(id => via.includes(id)), detail: `requires ${o.transport ?? "a"} read of ${any.join(" or ")}; ${detail}` };
  });
  const extra = l.ids.filter(id => !o.allowed.includes(id));
  checks.push(o.allowed.length
    ? { id: "preset_reads_allowed", pass: extra.length === 0, detail: `allowed ${o.allowed.join(", ")}; outside: ${extra.join(", ") || "(none)"}; ${detail}` }
    : { id: "no_preset_body_read", pass: l.ids.length === 0, detail });
  return checks;
}

export function changesWithin(ctx: CheckContext, allowed: (path: string) => boolean): Check {
  const changed = ctx.changedFiles();
  const outside = changed.filter(path => !allowed(path));
  return { id: "changes_in_scope", pass: outside.length === 0, detail: `outside scope: ${outside.join(", ") || "(none)"}; changed: ${changed.join(", ") || "(none)"}` };
}

export interface CanvasParts {
  // Outer HTML as written and whitespace-collapsed text, by frame id.
  frames: Record<string, { html: string; text: string }>;
  // Whitespace-collapsed text by element id.
  elements: Record<string, string>;
  // Contents of <style> blocks.
  css: string;
}

const PARSER = `
import json, sys
from html.parser import HTMLParser
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr'}
RAW = ('style', 'script', 'template')
class P(HTMLParser):
    def __init__(self, src):
        super().__init__(convert_charrefs=True)
        self.src = src; self.starts = [0]; self.stack = []; self.skip = 0
        self.frames = {}; self.elements = {}; self.css = []
        for i, ch in enumerate(src):
            if ch == '\\n': self.starts.append(i + 1)
    def at(self):
        line, col = self.getpos(); return self.starts[line - 1] + col
    def node(self, tag, attrs):
        a = dict(attrs)
        return {'tag': tag, 'frame': a.get('data-doan-frame'), 'id': a.get('data-doan-id'), 'start': self.at(), 'text': []}
    def handle_starttag(self, tag, attrs):
        n = self.node(tag, attrs)
        if tag in VOID: return self.finish(n, n['start'] + len(self.get_starttag_text()))
        if tag in RAW: self.skip += 1
        self.stack.append(n)
    def handle_startendtag(self, tag, attrs):
        n = self.node(tag, attrs); self.finish(n, n['start'] + len(self.get_starttag_text()))
    def handle_endtag(self, tag):
        if not any(n['tag'] == tag for n in self.stack): return
        end = self.src.find('>', self.at()) + 1
        while self.stack:
            n = self.stack.pop()
            if n['tag'] in RAW: self.skip -= 1
            self.finish(n, end)
            if n['tag'] == tag: break
    def handle_data(self, data):
        if self.stack and self.stack[-1]['tag'] == 'style' and self.skip == 1: self.css.append(data)
        if self.skip: return
        for n in self.stack: n['text'].append(data)
    def finish(self, n, end):
        text = ' '.join(''.join(n['text']).split())
        if n['frame'] is not None: self.frames[n['frame']] = {'html': self.src[n['start']:end], 'text': text}
        if n['id'] is not None: self.elements[n['id']] = text
p = P(sys.argv[1]); p.feed(sys.argv[1]); p.close()
print(json.dumps({'frames': p.frames, 'elements': p.elements, 'css': '\\n'.join(p.css)}))
`;

// null when the file does not exist (at the seed commit for `seed`).
export function canvasParts(ctx: CheckContext, path: string, at: "final" | "seed" = "final"): CanvasParts | null {
  const html = at === "seed" ? ctx.seed(path) : ctx.read(path);
  if (html === null) return null;
  const parsed = ctx.run("python3.12", ["-I", "-c", PARSER, html]);
  if (parsed.code !== 0) throw new Error(`canvas parser failed for ${path}: ${parsed.stderr}`);
  return JSON.parse(parsed.stdout);
}

// Ids, frames and the listed texts the request must leave alone. `allIds: false`
// skips the id check where removing elements is part of the request; `texts`
// names element ids, or "all" for every seed element except `except`.
export function preserved(ctx: CheckContext, path: string, o: { allIds?: boolean; frames?: string[]; texts?: string[] | "all"; except?: string[] } = {}): Check[] {
  const seed = canvasParts(ctx, path, "seed")!;
  const final = canvasParts(ctx, path) ?? { frames: {}, elements: {}, css: "" };
  const missingFrames = Object.keys(seed.frames).filter(id => !(id in final.frames));
  const missingIds = Object.keys(seed.elements).filter(id => !(id in final.elements));
  const checks: Check[] = [{ id: "frame_ids_preserved", pass: missingFrames.length === 0, detail: `missing frames: ${missingFrames.join(", ") || "(none)"}` }];
  if (o.allIds !== false) checks.push({ id: "element_ids_preserved", pass: missingIds.length === 0, detail: `missing element ids: ${missingIds.join(", ") || "(none)"}` });
  if (o.frames) {
    const changed = o.frames.filter(id => final.frames[id]?.html !== seed.frames[id]?.html);
    checks.push({ id: "untouched_frames_unchanged", pass: changed.length === 0, detail: `frames that must stay byte-identical: ${o.frames.join(", ")}; changed: ${changed.join(", ") || "(none)"}` });
  }
  if (o.texts) {
    const ids = (o.texts === "all" ? Object.keys(seed.elements) : o.texts).filter(id => !o.except?.includes(id));
    const changed = ids.filter(id => final.elements[id] !== seed.elements[id]);
    checks.push({ id: "untouched_text_unchanged", pass: changed.length === 0, detail: `changed: ${changed.map(id => `${id}: ${JSON.stringify(seed.elements[id])} -> ${JSON.stringify(final.elements[id] ?? null)}`).join("; ") || "(none)"}` });
  }
  return checks;
}

export function checkClean(ctx: CheckContext): Check {
  const check = ctx.doan(["check"]);
  return { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary ?? check.json?.error)}` };
}

// Ways to get the guide or a preset around the paths a run provides (D4b):
// installs, MCP registration, shell profile edits, another doan binary,
// `go run`/`go build` of the doan command, and reading doan's source files.
const INSTALLERS = ["brew", "npm", "pnpm", "yarn", "pip", "pip3", "pipx", "go", "cargo", "gem", "port", "apt", "apt-get"];
const SOURCE = /designskill\/presets\/|cli\/internal\/designskill\b|cli\/internal\/cli\/skill\.md/;

export function otherDoanCheck(ctx: CheckContext): Check {
  const words = ctx.calls.commands.flatMap(commandWords);
  const other = words.filter(w => /\/doan$/.test(w[0]) || (/(?:^|\/)go$/.test(w[0]) && ["run", "build", "install"].includes(w[1]) && w.some(a => /cmd\/doan\b/.test(a))));
  return { id: "no_other_doan_binary", pass: other.length === 0, detail: other.map(w => w.join(" ")).join("; ") || "(none)" };
}

export function sourceReadCheck(ctx: CheckContext): Check {
  const shell = ctx.calls.commands.filter(c => SOURCE.test(c));
  // Claude's file tools are not shell commands.
  const tools: string[] = [];
  for (const line of ctx.transcript.split(/\r?\n/)) {
    let event: any;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type !== "assistant") continue;
    for (const block of event.message?.content ?? [])
      if (block?.type === "tool_use" && ["Read", "Grep", "Glob"].includes(block.name) && SOURCE.test(JSON.stringify(block.input ?? {}))) tools.push(`${block.name} ${JSON.stringify(block.input)}`);
  }
  const found = [...shell, ...tools];
  return { id: "no_doan_source_read", pass: found.length === 0, detail: found.map(s => s.slice(0, 200)).join("; ") || "(none)" };
}

export function bypassChecks(ctx: CheckContext): Check[] {
  const words = ctx.calls.commands.flatMap(commandWords);
  const installs = words.filter(w => {
    const tool = w[0].split("/").pop()!;
    return (INSTALLERS.includes(tool) && w.slice(1).some(a => ["install", "i", "add", "get"].includes(a))) ||
      (["claude", "codex"].includes(tool) && w[1] === "mcp" && w[2] === "add");
  }).map(w => w.join(" "));
  const piped = ctx.calls.commands.filter(c => /\b(?:curl|wget)\b[^\n]*\|\s*(?:ba|z)?sh\b/.test(c));
  const profiles = ctx.calls.commands.filter(c => />>?\s*["']?(?:~|\$HOME|\/Users\/[^/\s]+)\/\.(?:zshrc|zprofile|zshenv|bashrc|bash_profile|profile)\b/.test(c));
  return [
    { id: "no_install_or_registration", pass: installs.length + piped.length === 0, detail: [...installs, ...piped].join("; ") || "(none)" },
    { id: "no_shell_profile_change", pass: profiles.length === 0, detail: profiles.join("; ") || "(none)" },
    otherDoanCheck(ctx),
    sourceReadCheck(ctx),
  ];
}
