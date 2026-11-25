import { lstatSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { readRegularFileSync } from "../regularFile";

// Remotes come from the config files: git can run a repository's fsmonitor, hooks and filters (POSTMORTEM 2026-10-25 'Eval
// inspection executed repository-configured helpers'). urls may carry a token: main-only, never in a DTO or message.
export type RemoteRead = { ok: true; urls: readonly string[]; uncertain: boolean } | { ok: false; reason: "not_repository" | "unreadable" };
// unsupported: a setting that can change or add remotes in ways this reader does not resolve (config.worktree,
// URL rewrites). Its presence makes the read uncertain rather than complete.
type Item = { kind: "remote"; name: string; url: string } | { kind: "include"; path: string; conditional: boolean } | { kind: "unsupported" };
const GIT_FALSE = ["false", "no", "off", "0", ""];
// git's own include depth limit.
const MAX_INCLUDE_DEPTH = 10;
// Include reads for one whole walk. The cycle check sees only the current chain, so a file included from several
// places is read each time; ten includes per file nine levels deep would be 10^9 reads on main.
const MAX_INCLUDE_READS = 64;
const ESCAPES: Record<string, string> = { n: "\n", t: "\t", b: "\b", "\\": "\\", "\"": "\"" };

// git-config(1) syntax, slightly looser than git in places. null means the text could not be parsed, so it says
// nothing about the remotes.
function parseItems(text: string): Item[] | null {
  const items: Item[] = [];
  let section: string | null = null, subsection: string | null = null, i = 0;
  const at = (offset = 0) => text[i + offset];
  const skipComment = () => { while (i < text.length && at() !== "\n") i++; };
  while (i < text.length) {
    const c = at()!;
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { i++; continue; }
    if (c === "#" || c === ";") { skipComment(); continue; }
    if (c === "[") {
      i++;
      const name = /^[A-Za-z0-9.-]*/.exec(text.slice(i))![0];
      i += name.length;
      if (!name) return null;
      subsection = null;
      if (at() === "]") {
        // Deprecated [section.subsection]: git lowercases the whole name.
        const dot = name.indexOf(".");
        section = (dot < 0 ? name : name.slice(0, dot)).toLowerCase();
        if (dot >= 0) subsection = name.slice(dot + 1).toLowerCase();
        i++; continue;
      }
      if (name.includes(".")) return null;
      while (at() === " " || at() === "\t") i++;
      if (at() !== "\"") return null;
      i++;
      let sub = "";
      for (;;) {
        const s = at();
        if (s === undefined || s === "\n") return null;
        if (s === "\"") { i++; break; }
        if (s === "\\") { const next = at(1); if (next === undefined || next === "\n") return null; sub += next; i += 2; continue; }
        sub += s; i++;
      }
      if (at() !== "]") return null;
      i++;
      section = name.toLowerCase(); subsection = sub; continue;
    }
    if (!/[A-Za-z]/.test(c) || section === null) return null;
    const key = /^[A-Za-z][A-Za-z0-9-]*/.exec(text.slice(i))![0].toLowerCase();
    i += key.length;
    while (at() === " " || at() === "\t") i++;
    let value = "true";
    if (at() === "=") {
      i++;
      while (at() === " " || at() === "\t") i++;
      value = "";
      let quoted = false, space = "";
      for (;;) {
        const v = at();
        if (v === undefined || v === "\n") { if (quoted) return null; break; }
        if (!quoted && (v === "#" || v === ";")) { skipComment(); break; }
        if (v === "\\") {
          const next = at(1);
          if (next === "\n") { i += 2; continue; }
          if (next === "\r" && at(2) === "\n") { i += 3; continue; }
          if (next === undefined || !(next in ESCAPES)) return null;
          value += space + ESCAPES[next]; space = ""; i += 2; continue;
        }
        if (v === "\"") { quoted = !quoted; value += space; space = ""; i++; continue; }
        // Unquoted trailing whitespace is dropped; inner whitespace stays.
        if (!quoted && (v === " " || v === "\t" || v === "\r")) { space += v; i++; continue; }
        value += space + v; space = ""; i++;
      }
    } else if (at() !== undefined && at() !== "\n" && at() !== "\r" && at() !== "#" && at() !== ";") return null;
    if (section === "remote" && subsection !== null && key === "url") items.push({ kind: "remote", name: subsection, url: value });
    else if (section === "extensions" && subsection === null && key === "worktreeconfig" && !GIT_FALSE.includes(value.toLowerCase())) items.push({ kind: "unsupported" });
    else if (section === "url" && subsection !== null && (key === "insteadof" || key === "pushinsteadof")) items.push({ kind: "unsupported" });
    else if ((section === "include" && subsection === null) || section === "includeif") {
      if (key === "path") items.push({ kind: "include", path: value, conditional: section === "includeif" });
    }
  }
  return items;
}

export function parseGitConfig(text: string): { remotes: { name: string; url: string }[]; includes: { path: string; conditional: boolean }[] } | null {
  const items = parseItems(text);
  if (!items) return null;
  return {
    remotes: items.flatMap(item => item.kind === "remote" ? [{ name: item.name, url: item.url }] : []),
    includes: items.flatMap(item => item.kind === "include" ? [{ path: item.path, conditional: item.conditional }] : []),
  };
}

function errorCode(error: unknown): string { return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "UNKNOWN"; }

// The gitdir a linked worktree's .git file names, resolved against the worktree root; null when the first line is not a
// `gitdir:` link.
export function gitdirFromLink(root: string, text: string): string | null {
  const line = /^gitdir: (.+)$/.exec(text.split("\n", 1)[0]!.replace(/\r$/, ""));
  return line ? resolve(root, line[1]!) : null;
}

// A linked worktree's .git is a file naming its gitdir, whose commondir points at the shared repository and config.
function configPath(root: string): string | RemoteRead {
  const dotGit = join(root, ".git");
  let gitDir = dotGit;
  // Only an absent entry means "not a repository"; a .git link that cannot be followed is unreadable metadata.
  try { lstatSync(dotGit); }
  catch (error) {
    if (errorCode(error) !== "ENOENT") return { ok: false, reason: "unreadable" };
    try { return statSync(root).isDirectory() ? { ok: false, reason: "not_repository" } : { ok: false, reason: "unreadable" }; }
    catch { return { ok: false, reason: "unreadable" }; }
  }
  try {
    if (!statSync(dotGit).isDirectory()) {
      const linked = gitdirFromLink(root, readRegularFileSync(dotGit));
      if (!linked) return { ok: false, reason: "unreadable" };
      gitDir = linked;
    }
  } catch { return { ok: false, reason: "unreadable" }; }
  try { return join(resolve(gitDir, readRegularFileSync(join(gitDir, "commondir")).trim()), "config"); }
  catch (error) { return errorCode(error) === "ENOENT" ? join(gitDir, "config") : { ok: false, reason: "unreadable" }; }
}

export function readGitRemotes(root: string, home: string = homedir()): RemoteRead {
  const config = configPath(root);
  if (typeof config !== "string") return config;
  let items: Item[] | null;
  try { items = parseItems(readRegularFileSync(config)); } catch { return { ok: false, reason: "unreadable" }; }
  if (!items) return { ok: false, reason: "unreadable" };
  const urls: string[] = [];
  let uncertain = false, reads = 0;
  // Includes are expanded where they appear, as git does. Anything not followed may hold a remote.
  const walk = (file: string, list: Item[], chain: string[]) => {
    for (const item of list) {
      if (item.kind === "remote") { urls.push(item.url); continue; }
      if (item.kind === "unsupported") { uncertain = true; continue; }
      if (item.conditional || (item.path.startsWith("~") && !item.path.startsWith("~/"))) { uncertain = true; continue; }
      const path = item.path.startsWith("~/") ? join(home, item.path.slice(2)) : isAbsolute(item.path) ? item.path : resolve(dirname(file), item.path);
      if (chain.length >= MAX_INCLUDE_DEPTH || chain.includes(path) || reads >= MAX_INCLUDE_READS) { uncertain = true; continue; }
      reads += 1;
      let nested: Item[] | null;
      try { nested = parseItems(readRegularFileSync(path)); }
      catch (error) { if (errorCode(error) !== "ENOENT") uncertain = true; continue; }
      if (!nested) { uncertain = true; continue; }
      walk(path, nested, [...chain, path]);
    }
  };
  walk(config, items, [config]);
  return { ok: true, urls, uncertain };
}
