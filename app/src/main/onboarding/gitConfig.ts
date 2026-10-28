import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

// Remotes are read from the config files themselves. Running git in a user's repository can execute its
// fsmonitor, hooks and filters (POSTMORTEM 2026-10-25 'Eval inspection executed repository-configured helpers').
// urls are raw config values and may carry a user or token: main-only, never copied into a DTO or message.
export type RemoteRead = { ok: true; urls: readonly string[]; uncertain: boolean } | { ok: false; reason: "not_repository" | "unreadable" };
type Item = { kind: "remote"; name: string; url: string } | { kind: "include"; path: string; conditional: boolean };
// git's own include depth limit.
const MAX_INCLUDE_DEPTH = 10;
const ESCAPES: Record<string, string> = { n: "\n", t: "\t", b: "\b", "\\": "\\", "\"": "\"" };

// git-config(1) syntax. null is a file git itself would refuse, so it says nothing about the remotes.
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

// A linked worktree's .git is a file naming its gitdir, whose commondir points at the shared repository and config.
function configPath(root: string): string | RemoteRead {
  const dotGit = join(root, ".git");
  let gitDir = dotGit;
  try {
    if (!statSync(dotGit).isDirectory()) {
      const line = /^gitdir: (.+)$/.exec(readFileSync(dotGit, "utf8").split("\n", 1)[0]!.replace(/\r$/, ""));
      if (!line) return { ok: false, reason: "unreadable" };
      gitDir = resolve(root, line[1]!);
    }
  } catch (error) {
    if (errorCode(error) !== "ENOENT") return { ok: false, reason: "unreadable" };
    try { return statSync(root).isDirectory() ? { ok: false, reason: "not_repository" } : { ok: false, reason: "unreadable" }; }
    catch { return { ok: false, reason: "unreadable" }; }
  }
  try { return join(resolve(gitDir, readFileSync(join(gitDir, "commondir"), "utf8").trim()), "config"); }
  catch (error) { return errorCode(error) === "ENOENT" ? join(gitDir, "config") : { ok: false, reason: "unreadable" }; }
}

export function readGitRemotes(root: string, home: string = homedir()): RemoteRead {
  const config = configPath(root);
  if (typeof config !== "string") return config;
  let items: Item[] | null;
  try { items = parseItems(readFileSync(config, "utf8")); } catch { return { ok: false, reason: "unreadable" }; }
  if (!items) return { ok: false, reason: "unreadable" };
  const urls: string[] = [];
  let uncertain = false;
  // Includes are expanded where they appear, as git does. Anything not followed may hold a remote.
  const walk = (file: string, list: Item[], chain: string[]) => {
    for (const item of list) {
      if (item.kind === "remote") { urls.push(item.url); continue; }
      if (item.conditional || (item.path.startsWith("~") && !item.path.startsWith("~/"))) { uncertain = true; continue; }
      const path = item.path.startsWith("~/") ? join(home, item.path.slice(2)) : isAbsolute(item.path) ? item.path : resolve(dirname(file), item.path);
      if (chain.length >= MAX_INCLUDE_DEPTH || chain.includes(path)) { uncertain = true; continue; }
      let nested: Item[] | null;
      try { nested = parseItems(readFileSync(path, "utf8")); }
      catch (error) { if (errorCode(error) !== "ENOENT") uncertain = true; continue; }
      if (!nested) { uncertain = true; continue; }
      walk(path, nested, [...chain, path]);
    }
  };
  walk(config, items, [config]);
  return { ok: true, urls, uncertain };
}
