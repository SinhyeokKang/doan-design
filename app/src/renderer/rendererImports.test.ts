import { existsSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The renderer runs under a CSP without 'unsafe-eval', and ajv compiles its schemas with new Function when
// formats/validate.ts loads. A renderer value import that reaches it (or any Node module) leaves the window blank in
// the built app while every jsdom test still passes (POSTMORTEM 2026-10-30). Type-only imports are erased and safe.
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = join(APP, "src");
const FORBIDDEN_FILES = [join(SRC, "formats/validate.ts")];
const NODE = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));

function entries(): string[] {
  // Every renderer entry electron-vite builds is an HTML file whose module script starts the closure.
  const html = readFileSync(join(SRC, "renderer/index.html"), "utf8");
  return [...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)].map(match => resolve(join(SRC, "renderer"), match[1]!.replace(/^\//, "")));
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, "renderer", spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`unresolved import ${spec} in ${relative(APP, from)}`);
}

// Value imports only: `import type`, `export type` and clauses whose every specifier is `type X` are erased.
function valueImports(file: string): string[] {
  const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const found: string[] = [];
  for (const match of source.matchAll(/(?:^|[;\n])\s*(import|export)\s+(type\s+)?([^;'"`]*?)\s*from\s*["']([^"']+)["']/g)) {
    const [, , typeOnly, clause, spec] = match;
    if (typeOnly) continue;
    const named = clause!.match(/^\{([\s\S]*)\}$/);
    if (named && named[1]!.split(",").map(part => part.trim()).filter(Boolean).every(part => part.startsWith("type "))) continue;
    found.push(spec!);
  }
  for (const match of source.matchAll(/(?:^|[;\n])\s*import\s*["']([^"']+)["']/g)) found.push(match[1]!);
  for (const match of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) found.push(match[1]!);
  return found;
}

function closure(): { files: Map<string, string | null>; node: { spec: string; from: string }[]; ajv: { spec: string; from: string }[] } {
  const files = new Map<string, string | null>(), node: { spec: string; from: string }[] = [], ajv: { spec: string; from: string }[] = [];
  const queue = entries();
  for (const entry of queue) files.set(entry, null);
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (!/\.tsx?$/.test(file)) continue;
    for (const spec of valueImports(file)) {
      if (NODE.has(spec)) { node.push({ spec, from: relative(APP, file) }); continue; }
      if (spec === "ajv" || spec.startsWith("ajv/")) { ajv.push({ spec, from: relative(APP, file) }); continue; }
      const next = resolveImport(file, spec);
      if (next === null || files.has(next)) continue;
      files.set(next, file);
      queue.push(next);
    }
  }
  return { files, node, ajv };
}

function chain(files: Map<string, string | null>, file: string): string {
  const path: string[] = [];
  for (let at: string | null | undefined = file; at; at = files.get(at)) path.unshift(relative(APP, at));
  return path.join(" -> ");
}

describe("renderer import closure", () => {
  it("starts from the renderer's module entry", () => {
    expect(entries().map(file => relative(APP, file))).toEqual(["src/renderer/main.ts"]);
  });

  it("never reaches the ajv validators, ajv itself or a Node module", () => {
    const { files, node, ajv } = closure();
    // A sanity floor: the walk follows App's imports, so a broken parser cannot pass by finding nothing.
    expect(files.has(join(SRC, "renderer/SettingsAbout.tsx"))).toBe(true);
    expect(FORBIDDEN_FILES.filter(file => files.has(file)).map(file => chain(files, file))).toEqual([]);
    expect(ajv).toEqual([]);
    expect(node).toEqual([]);
  });
});
