import { existsSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "vite";
import { describe, expect, it } from "vitest";

// The CSP has no 'unsafe-eval' and ajv compiles with new Function: a renderer value import reaching it or any
// Node module blanks the built window while jsdom tests pass (POSTMORTEM 2026-10-30). Type imports are safe.
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = join(APP, "src");
const FORBIDDEN_FILES = [join(SRC, "formats/validate.ts")];
const NODE = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));
// Walked as roots of their own, so each stays under the guard whether or not an entry reaches it
// (POSTMORTEM 2026-10-30).
const EXTRA_ROOTS = [
  // Fixed request lines are shared by main and renderer by value.
  join(SRC, "main/conversation/requestLines.ts"),
  join(SRC, "renderer/ConversationThread.tsx"), join(SRC, "renderer/DockedComposer.tsx"),
  // The chip field and the picker, which import the shared limits.
  join(SRC, "renderer/anchorField.ts"), join(SRC, "renderer/canvasPicker.ts"),
  // The common mode ids and rules the picker imports by value.
  join(SRC, "main/conversation/permissionMode.ts"),
  // The provider table and the Send now rule the composer imports by value.
  join(SRC, "main/conversation/steerSupport.ts"),
  // The presets and connector types MCP Connectors settings import by value.
  join(SRC, "main/mcpConnectors/presets.ts"),
  // The question types and limits and the shared answer check the question card imports by value.
  join(SRC, "main/conversation/question.ts"), join(SRC, "main/conversation/questionAnswer.ts"),
  // Agent usage: the ring value, usage text and description the usage button imports by value.
  join(SRC, "renderer/agentUsage.ts"),
  // The update row, header button and menu item views, which Settings > About and the header import by value.
  join(SRC, "main/update/view.ts"),
];

const PAGES = ["index.html", "prototype.html"];

function entries(): string[] {
  return PAGES.flatMap(page => {
    const html = readFileSync(join(SRC, "renderer", page), "utf8");
    return [...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)].map(match => resolve(join(SRC, "renderer"), match[1]!.replace(/^\//, "")));
  });
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, "renderer", spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`unresolved import ${spec} in ${relative(APP, from)}`);
}

// Value imports only, read from the syntax (oxc): all-`type` specifiers and type queries are erased;
// side-effect and literal dynamic imports are kept.
function valueImports(source: string, lang: "ts" | "tsx" = "ts"): string[] {
  const { module, errors } = parseSync(`module.${lang}`, source, { lang, sourceType: "module" });
  if (errors.length > 0) throw new Error(`cannot parse: ${errors[0]!.message}`);
  const found: string[] = [];
  for (const record of module.staticImports) if (record.entries.length === 0 || record.entries.some(entry => !entry.isType)) found.push(record.moduleRequest.value);
  for (const record of module.staticExports) for (const entry of record.entries) if (entry.moduleRequest && !entry.isType) found.push(entry.moduleRequest.value);
  for (const record of module.dynamicImports) {
    const literal = source.slice(record.moduleRequest.start, record.moduleRequest.end).match(/^(["'`])([^"'`$]*)\1$/);
    if (literal) found.push(literal[2]!);
  }
  return [...new Set(found)];
}

// A module Worker is its own chunk under the same CSP, so the walk follows it like an import.
function workerImports(source: string): string[] {
  return [...source.matchAll(/new\s+Worker\(\s*new\s+URL\(\s*(["'])([^"'`$]+)\1\s*,\s*import\.meta\.url\s*\)/g)].map(match => match[2]!);
}

function closure(roots: string[] = [...entries(), ...EXTRA_ROOTS]): { files: Map<string, string | null>; node: { spec: string; from: string }[]; ajv: { spec: string; from: string }[]; workers: string[] } {
  const files = new Map<string, string | null>(), node: { spec: string; from: string }[] = [], ajv: { spec: string; from: string }[] = [], workers: string[] = [];
  const queue = [...roots];
  for (const entry of queue) files.set(entry, null);
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (!/\.tsx?$/.test(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const spec of workerImports(source)) { const entry = resolveImport(file, spec)!; if (!workers.includes(entry)) workers.push(entry); }
    for (const spec of [...valueImports(source, file.endsWith(".tsx") ? "tsx" : "ts"), ...workerImports(source)]) {
      if (NODE.has(spec)) { node.push({ spec, from: relative(APP, file) }); continue; }
      if (spec === "ajv" || spec.startsWith("ajv/")) { ajv.push({ spec, from: relative(APP, file) }); continue; }
      const next = resolveImport(file, spec);
      if (next === null || files.has(next)) continue;
      files.set(next, file);
      queue.push(next);
    }
  }
  return { files, node, ajv, workers };
}

function chain(files: Map<string, string | null>, file: string): string {
  const path: string[] = [];
  for (let at: string | null | undefined = file; at; at = files.get(at)) path.unshift(relative(APP, at));
  return path.join(" -> ");
}

// The walker must read syntax, not spacing: a miss lets ajv or Node into the renderer, and a type query
// read as a value import fails the guard for nothing.
describe("value imports the renderer bundle keeps", () => {
  it.each([
    ["import { validateCanvas } from \"../formats/validate\";", ["../formats/validate"]],
    ["import{validateCanvas}from\"../formats/validate\";", ["../formats/validate"]],
    ["export{readFileSync}from\"node:fs\";", ["node:fs"]],
    ["import type { Stats } from \"node:fs\";", []],
    ["type Stats = import(\"node:fs\").Stats;", []],
  ])("%s", (source, expected) => {
    expect(valueImports(source)).toEqual(expected);
  });
  it("keeps side-effect, default, mixed and dynamic imports and drops every erased form", () => {
    expect(valueImports([
      "import \"./side.css\";", "import def, { type T } from \"./default\";", "import { a, type B } from \"./mixed\";",
      "import { type C, type D } from \"./types-only\";", "export type * from \"./type-star\";", "export { type E } from \"./type-named\";",
      "export * from \"./star\";", "const lazy = () => import(\"./lazy\");", "// import x from \"./commented\";",
    ].join("\n")).sort()).toEqual(["./default", "./lazy", "./mixed", "./side.css", "./star"]);
  });
});

describe("renderer import closure", () => {
  it("starts from every renderer page's module entry", () => {
    expect(entries().map(file => relative(APP, file))).toEqual(["src/renderer/main.ts", "src/renderer/prototype/main.tsx"]);
  });

  it("knows every HTML page electron-vite builds as a renderer entry", () => {
    const config = readFileSync(join(APP, "electron.vite.config.ts"), "utf8");
    const pages = [...config.matchAll(/"\.\/src\/renderer\/([^"]+\.html)"/g)].map(match => match[1]);
    expect(pages).toEqual(PAGES);
  });

  it("walks the prototype window's page into its contract modules", () => {
    const { files } = closure();
    expect(files.has(join(SRC, "renderer/prototype/PrototypeWindow.tsx"))).toBe(true);
    expect(files.has(join(SRC, "main/prototype/fit.ts"))).toBe(true);
  });

  it("never reaches the ajv validators, ajv itself or a Node module", () => {
    const { files, node, ajv } = closure();
    // A sanity floor: the walk follows App's imports, so a broken parser cannot pass by finding nothing.
    expect(files.has(join(SRC, "renderer/SettingsAbout.tsx"))).toBe(true);
    expect(files.has(join(SRC, "renderer/threadItems.ts"))).toBe(true);
    expect(FORBIDDEN_FILES.filter(file => files.has(file)).map(file => chain(files, file))).toEqual([]);
    expect(ajv).toEqual([]);
    expect(node).toEqual([]);
  });

  // A Worker has no document and other modules import by value, so only the dot field belongs in its chunk.
  it("follows the dot field Worker, whose bundle holds only dotField.ts", () => {
    const worker = join(SRC, "renderer/dotFieldWorker.ts");
    expect(closure().workers).toEqual([worker]);
    const own = closure([worker]);
    expect([...own.files.keys()].map(file => relative(APP, file))).toEqual(["src/renderer/dotFieldWorker.ts", "src/renderer/dotField.ts"]);
    expect(own.workers).toEqual([]);
  });
});
