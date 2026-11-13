import { randomBytes } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { readStarPromptState, starPromptAfter, starPromptDue, starPromptMomentFor, starPromptText, starPromptTurn, type StarMoment, type StarPromptAction, type StarPromptState } from "./starPrompt";

export interface StarPromptStore {
  // Every conversation event main publishes; only a saved turn.done counts.
  event(event: { type: string }): void;
  // The browser opened the repository page.
  opened(): void;
  // Not now, Don’t ask again, or Esc in the card.
  dismissed(): void;
}

export interface StarPromptOptions {
  // <userData>/star-prompt.json, main's alone: the renderer never writes it, and preferences.json is not used because a
  // renderer save could race this one, and a later Doan's preferences refuse every write.
  file: string;
  // Only a copy that checks for updates counts and asks (ARCHITECTURE §7); any other copy reads and writes nothing.
  enabled: boolean;
  now(): number;
  moment(moment: StarMoment): void;
  write?(file: string, text: string): void;
}

// Synchronous temp-and-rename: the file is small, and a synchronous write cannot land after a later one.
function writeAtomic(file: string, text: string): void {
  const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(temp, text, { flag: "wx", mode: 0o600 });
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

function readFile(file: string): string | undefined | null {
  try { return readFileSync(file, "utf8"); } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT" ? undefined : null;
  }
}

const OFF: StarPromptStore = { event() {}, opened() {}, dismissed() {} };

export function createStarPrompt(options: StarPromptOptions): StarPromptStore {
  if (!options.enabled) return OFF;
  const text = readFile(options.file);
  // null for this run: a file Doan cannot read or use, or a write that failed. Nothing is said about it; the card just
  // does not come.
  let state: StarPromptState | null = text === null ? null : readStarPromptState(text);
  const write = options.write ?? writeAtomic;
  const save = (next: StarPromptState) => {
    try { write(options.file, starPromptText(next)); state = next; } catch { state = null; }
  };
  // Turns that end in the same task (several conversations at once) send one moment.
  let queued = false;
  const answer = (action: StarPromptAction) => {
    const now = options.now();
    // Only a card that is due can be shown, so only then can it be answered.
    if (state === null || !starPromptDue(state, now)) return;
    save(starPromptAfter(state, action, now));
  };
  return {
    event(event) {
      if (state === null || event.type !== "turn.done") return;
      save(starPromptTurn(state, options.now()));
      if (queued || state === null || !starPromptDue(state, options.now())) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (state !== null && starPromptDue(state, options.now())) options.moment(starPromptMomentFor(state));
      });
    },
    opened: () => answer("opened"),
    dismissed: () => answer("dismissed"),
  };
}
