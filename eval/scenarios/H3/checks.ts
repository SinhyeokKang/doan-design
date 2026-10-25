import type { Checks } from "../../lib/types.ts";
import { scriptTokens } from "../../lib/transcript.ts";

const copy = ["Ready for dispatch", "Print packing slips", "Three orders are ready for the afternoon pickup.", "Order", "Destination", "Packages", "PK-2048", "North studio", "PK-2051", "Harbor office", "PK-2054", "West workshop", "box", "boxes", "Pickup closes at 16:30."];
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const colors = (s: string) => [...strip(s).matchAll(/#[\da-f]{3,8}\b|\brgba?\s*\(/gi)].map(m => m[0].toLowerCase());

function imports(source: string, path: string): string[] {
  if (/\.css$/i.test(path)) return [...strip(source).matchAll(/@import\s+(?:url\(\s*)?["'](\.[^"']+)["']/g)].map(m => m[1]);
  const tokens = scriptTokens(source), paths: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!["import", "export"].includes(tokens[i])) continue;
    let j = i + 1;
    if (!/^["']/.test(tokens[j] ?? "")) {
      // Only static binding lists are relevant; stop before executable code.
      while (j < tokens.length && /^(?:[\w$]+|[{},*])$/.test(tokens[j]) && tokens[j] !== "from") j++;
      if (tokens[j] !== "from") continue;
      j++;
    }
    if (/^["']\./.test(tokens[j] ?? "")) paths.push(tokens[j].slice(1, -1));
  }
  return paths;
}

const checks: Checks = ctx => {
  const target = "web/src/components/DispatchQueue.tsx";
  const source = strip(ctx.read(target) ?? "");
  const changed = ctx.changedFiles();
  // Follow local imports so extracted rows, CSS modules and shared styles remain valid alternatives.
  const seen = new Set<string>(), sources: string[] = [];
  const visit = (path: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    const raw = ctx.read(path);
    if (raw === null) return;
    const text = strip(raw);
    sources.push(text);
    for (const imported of imports(raw, path)) {
      const parts = path.split("/").slice(0, -1);
      let outside = false;
      for (const part of imported.split("/")) {
        if (part === "..") { if (!parts.length) { outside = true; break; } parts.pop(); }
        else if (part !== ".") parts.push(part);
      }
      if (outside) continue;
      const base = parts.join("/");
      const next = [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`].find(p => ctx.exists(p));
      if (next) visit(next);
    }
  };
  visit(target);
  const reachable = sources.join("\n");
  // Ignore semantic tags when comparing text; numeric row associations and visibility
  // need the judge because source text cannot establish rendered data bindings.
  const normalized = reachable.replace(/<\/?[A-Za-z][^>]*>/g, "").replace(/\s+/g, " ");
  // Existing components accept visible copy through props that tag stripping removes.
  const literals = [...reachable.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)].map(m => m[2]).join("\n");
  const missing = copy.filter(s => !normalized.includes(s) && !literals.includes(s));
  const direct: string[] = [];
  for (const path of changed.filter(p => /\.(?:css|tsx?|jsx?)$/i.test(p))) {
    const old = colors(ctx.seed(path) ?? "");
    for (const color of colors(ctx.read(path) ?? "")) {
      const i = old.indexOf(color);
      if (i >= 0) old.splice(i, 1); else direct.push(`${path}: ${color}`);
    }
  }
  const exported = /\bexport\s+(?:default\s+)?function\s+DispatchQueue\b/.test(source) ||
    (/\bfunction\s+DispatchQueue\b/.test(source) && /\bexport\s*(?:\{[^}]*\bDispatchQueue\b[^}]*\}|default\s+DispatchQueue\b)/.test(source));
  const check = ctx.doan(["check"]);
  return [
    { id: "target_function_implemented", pass: ctx.exists(target) && ctx.read(target) !== ctx.seed(target) && exported && /\breturn\b/.test(source) && /<[A-Za-z]/.test(source), detail: "the connected DispatchQueue file exports a function component with JSX" },
    { id: "canvas_copy_in_component", pass: missing.length === 0, detail: `missing static copy: ${missing.join(", ") || "none"}` },
    { id: "uses_shared_tokens", pass: /var\(\s*--color-[\w-]+\s*[,)]/.test(reachable) && (ctx.read("web/src/App.tsx") ?? "").includes("./tokens.css"), detail: `component imports inspected: ${[...seen].join(", ")}` },
    { id: "no_new_direct_colors", pass: direct.length === 0, detail: `new hex/rgb literals: ${direct.join(", ") || "none"}` },
    { id: "design_and_review_unchanged", pass: !changed.some(p => p.startsWith("design/") || p.startsWith(".doan/")), detail: `changed protected paths: ${changed.filter(p => p.startsWith("design/") || p.startsWith(".doan/")).join(", ") || "none"}` },
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: JSON.stringify(check.json?.result?.summary) },
  ];
};
export default checks;
