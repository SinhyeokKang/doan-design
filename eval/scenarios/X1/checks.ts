import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type { Checks } from "../../lib/types.ts";
import { commandWords, doanCommand, doanPositionals } from "../../lib/transcript.ts";

const canvas = ".doan/canvases/profile.html";
// The prompt names this file: the folder that holds the repo, outside every checkout.
const OUTPUT = "profile.html";

export interface ExportCall { canvas: string | undefined; output: string | undefined }

export function exportCalls(commands: string[]): ExportCall[] {
  return commands.flatMap(commandWords).filter(words => doanCommand(words) === "export").map(words => {
    let output: string | undefined;
    for (let i = 1; i < words.length; i++) {
      const match = words[i]!.match(/^--?o(?:=(.*))?$/);
      if (match) output = match[1] ?? words[i + 1];
    }
    return { canvas: doanPositionals(words)?.[1], output };
  });
}

const sameCanvas = (repo: string, cwd: string, arg: string | undefined) => arg !== undefined && resolve(cwd, arg) === resolve(repo, canvas);

// The page's own markup and each canvas inside a `srcdoc`, which the browser parses as a second document.
export function documents(page: string): string[] {
  const docs: string[] = [];
  const outer = page.replace(/\bsrcdoc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi, (_, double?: string, single?: string) => {
    docs.push((double ?? single ?? "").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&"));
    return "";
  });
  return [outer, ...docs];
}

const LOCAL = /^(?!(?:data|blob|about|mailto|tel|javascript):|https?:|\/\/|#)/i;

// Every reference in `doc` that still names a file: attribute values, srcset candidates, CSS url() and @import.
// Script bodies are skipped because the viewer's own code is not a reference; style bodies are kept.
export function localReferences(page: string): string[] {
  const found: string[] = [];
  for (const doc of documents(page)) {
    const markup = doc.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "");
    for (const m of markup.matchAll(/\b(?:src|href|poster|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) found.push((m[1] ?? m[2] ?? m[3] ?? "").trim());
    for (const m of markup.matchAll(/\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi))
      for (const candidate of (m[1] ?? m[2] ?? "").split(/,(?=\s)|,$/)) found.push(candidate.trim().split(/\s+/)[0] ?? "");
    for (const m of markup.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)) found.push((m[1] ?? m[2] ?? m[3] ?? "").trim());
    for (const m of markup.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) found.push(m[1] ?? m[2] ?? "");
  }
  return [...new Set(found.filter(ref => ref !== "" && LOCAL.test(ref)))];
}

const checks: Checks = ctx => {
  const output = resolve(ctx.repo, "..", OUTPUT);
  const reference = resolve(ctx.repo, "..", "reference-export.html");
  const calls = exportCalls(ctx.calls.commands);
  const asked = calls.filter(call => sameCanvas(ctx.repo, ctx.cwd, call.canvas));
  const page = existsSync(output) ? readFileSync(output) : null;
  const text = page?.toString("utf8") ?? "";
  const changed = ctx.changedFiles();

  // The same command on the unchanged canvas is the page `doan export` produces; a hand-assembled page differs.
  let same = false, detail = "no output file";
  if (page) {
    const made = ctx.doan(["export", canvas, "-o", reference]);
    try {
      same = made.code === 0 && existsSync(reference) && readFileSync(reference).equals(page);
      detail = made.code !== 0 ? `reference export failed: ${JSON.stringify(made.json)}` : same ? "byte-identical to doan export" : `${page.length} bytes differ from doan export`;
    } finally { rmSync(reference, { force: true }); }
  }
  const refs = page ? localReferences(text) : [];
  const inner = page ? documents(text).slice(1).join("\n") : "";
  return [
    { id: "export_command", pass: asked.length > 0, detail: `doan export commands: ${JSON.stringify(calls)}` },
    { id: "output_outside_repo", pass: page !== null, detail: page ? `${page.length} bytes at ${output}` : `no file at ${output}` },
    { id: "output_is_doan_export", pass: same, detail },
    // Both pages stay in the check: a leftover path breaks for the reviewer, and the shell's own markup must stay clean too.
    { id: "no_repo_relative_reference", pass: page !== null && refs.length === 0, detail: page ? (refs.length ? `still referenced: ${JSON.stringify(refs)}` : "no local reference in the page or its srcdoc") : "no output file" },
    { id: "assets_inlined", pass: page !== null && /data:image\/png;base64,/.test(inner) && /data:text\/css/.test(inner), detail: page ? `canvas has the avatar as a data: image: ${/data:image\/png;base64,/.test(inner)}; the token CSS as data: CSS: ${/data:text\/css/.test(inner)}` : "no output file" },
    { id: "repo_unchanged", pass: changed.length === 0, detail: JSON.stringify(changed) },
  ];
};
export default checks;
