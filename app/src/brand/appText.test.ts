import { readdirSync, readFileSync } from "node:fs";
import { parseSync, Visitor } from "vite";
import { expect, test } from "vitest";
import { brandCandidates } from "./candidates";

// Human-facing text names the product Doan (doan-naming, 2026-10-30 user); a lowercase
// `doan` may remain only where it is a command, a path or an identifier.

const src = new URL("../", import.meta.url);

function sourceFiles(dir: URL, prefix: string, pattern: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) return entry.name === "brand" ? [] : sourceFiles(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`, pattern);
    return pattern.test(entry.name) && !/\.test\.tsx?$|\.d\.ts$/.test(entry.name) ? [`${prefix}${entry.name}`] : [];
  });
}

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;
const proseDoan = (text: string) => brandCandidates(text).some(found => found.form === "doan" && found.kind === "prose");
// A bare `doan` is a code token, except where it is shown as is: a menu or window label, a tooltip, element text.
const DISPLAY_KEYS = new Set(["label", "title", "aria-label", "placeholder", "alt"]);

function literalViolations(path: string): string[] {
  const text = readFileSync(new URL(path, src), "utf8");
  const found: string[] = [];
  const check = (value: string, start: number, display = false) => {
    if (proseDoan(value) || (display && value.trim() === "doan")) found.push(`${path}:${lineOf(text, start)} ${JSON.stringify(value)}`);
  };
  const displayed = new Set<number>();
  const result = parseSync(path, text);
  expect(result.errors, path).toEqual([]);
  new Visitor({
    Property(node) {
      const key = node.key;
      const name = key.type === "Identifier" ? key.name : key.type === "Literal" && typeof key.value === "string" ? key.value : undefined;
      if (name !== undefined && DISPLAY_KEYS.has(name) && node.value.type === "Literal" && typeof node.value.value === "string") displayed.add(node.value.start);
    },
    JSXAttribute(node) {
      if (node.name.type === "JSXIdentifier" && DISPLAY_KEYS.has(node.name.name) && node.value?.type === "Literal") displayed.add(node.value.start);
    },
    Literal(node) { if (typeof node.value === "string") check(node.value, node.start, displayed.has(node.start)); },
    TemplateElement(node) { check(node.value.cooked ?? node.value.raw, node.start); },
    JSXText(node) { check(node.value, node.start, true); },
  }).visit(result.program);
  return found;
}

// HTML element text, or Markdown lines; the stub's `name: doan` front matter is the skill's identifier.
function markupViolations(path: string): string[] {
  const text = readFileSync(new URL(path, src), "utf8");
  const pieces = path.endsWith(".html")
    ? [...text.matchAll(/>([^<]+)</g)].map(match => ({ value: match[1]!, start: match.index + 1 }))
    : [...text.matchAll(/^.*$/gm)].filter(match => match[0] !== "name: doan").map(match => ({ value: match[0], start: match.index }));
  return pieces.flatMap(piece => brandCandidates(piece.value)
    .filter(found => found.form === "doan" && (found.kind === "prose" || piece.value.trim() === "doan"))
    .map(found => `${path}:${lineOf(text, piece.start + found.index)} ${JSON.stringify(piece.value.trim())}`));
}

test("app source text names the product Doan", () => {
  const files = sourceFiles(src, "", /\.tsx?$/);
  expect(files.length).toBeGreaterThan(0);
  expect(files.flatMap(literalViolations)).toEqual([]);
});

test("app markup and the installed skill stub name the product Doan", () => {
  const files = [...sourceFiles(new URL("renderer/", src), "renderer/", /\.html$/), "main/onboarding/SKILL.md"];
  expect(files.flatMap(markupViolations)).toEqual([]);
});
