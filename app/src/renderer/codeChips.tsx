import type { ReactNode } from "react";

// Commands and Doan's fixed paths read as code, so a person can tell what to type or look for. paths: absolute paths the text may
// name (a .git Doan left behind); they contain spaces, so they are matched as given rather than guessed.
const COMMANDS = ["xcode-select --install", ".git/info/exclude", "git init", ".doan/"];
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function withChips(text: string, paths: readonly string[] = []): ReactNode {
  const tokens = [...paths.filter(Boolean), ...COMMANDS].sort((a, b) => b.length - a.length).map(escape);
  // A token followed by more of a path (".doan/config.json", ".git/info") is part of something longer, not a chip.
  const parts = text.split(new RegExp(`(${tokens.join("|")})(?![\\w/-])`));
  return parts.length === 1 ? text : parts.map((part, i) => i % 2 === 1 ? <code key={i}>{part}</code> : part);
}
