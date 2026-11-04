import { randomBytes } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { autoAfterAdd, storedAuto } from "./autoFolders";
import { add, load, remove } from "./folders";

export interface FolderStore {
  list(): string[];
  replace(paths: readonly string[]): Promise<Error | null>;
  // Resolve to the write error instead of rejecting: the change is kept in
  // memory either way, and the app keeps running on that list.
  add(path: string): Promise<Error | null>;
  remove(path: string): Promise<Error | null>;
  // Auto-registered roots (terminal-work-worktrees), in list order. Kept in `auto-folders.json` beside folders.json,
  // which stays a plain string array so an older app still reads the list.
  auto(): string[];
  // Adds the root marked as auto-registered.
  adopt(path: string): Promise<Error | null>;
  // Clears the mark, if any: the human added the root by hand.
  claim(path: string): Promise<Error | null>;
}

export async function readFoldersFile(file: string): Promise<string[]> {
  return await readFoldersFileForPruning(file) ?? [];
}

// An empty fallback can start the app, but cannot authorize deleting local
// review markers. Only a valid list (or first-use ENOENT) is safe to prune by.
export async function readFoldersFileForPruning(file: string): Promise<string[] | null> {
  try {
    const text = await readFile(file, "utf8");
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value) || !value.every(entry => typeof entry === "string")) return null;
    return load(text);
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT" ? [] : null;
  }
}

// Written beside the target and renamed over it, so a crash mid-write leaves
// the previous list rather than a truncated file.
export async function writeFoldersFile(file: string, list: readonly string[]): Promise<void> {
  const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(list)}\n`, { flag: "wx" });
    await rename(temp, file);
  } catch (error) {
    // The temp file may never have been created; the write error is what matters.
    await unlink(temp).catch(() => {});
    throw error;
  }
}

// A damaged mark file reads as no marks: that deletes nothing, it only makes the roots hand-added.
async function readMarks(file: string): Promise<string[]> {
  try {
    const value: unknown = JSON.parse(await readFile(file, "utf8"));
    return Array.isArray(value) && value.every(entry => typeof entry === "string") ? [...new Set(value)] : [];
  } catch {
    return [];
  }
}

export async function openFolderStore(file: string): Promise<FolderStore> {
  const autoFile = join(dirname(file), "auto-folders.json");
  const read = await readFoldersFileForPruning(file);
  // Marks are pruned by the list only when folders.json was read (POSTMORTEM 2026-10-26); otherwise the empty
  // fallback list would erase them.
  const prunable = read !== null;
  let folders = read ?? [];
  let marks = await readMarks(autoFile);
  let writtenMarks: string | undefined = JSON.stringify(marks);
  // Writes run one after another so a slow earlier write cannot rename an
  // older list over a newer one.
  let writing: Promise<unknown> = Promise.resolve();
  const writeMarks = async (next: readonly string[]) => {
    const text = JSON.stringify(next);
    if (text === writtenMarks) return;
    // Unknown after a failed write, so the next one writes again.
    writtenMarks = undefined;
    await writeFoldersFile(autoFile, next);
    writtenMarks = text;
  };
  // Each write is a snapshot, in this order: the marks without pruning, folders.json, then the pruned marks. A stop
  // between files then leaves only a mark folders.json does not list, which is ignored: never an auto-registered
  // root without its mark (it would stay hand-added for good), nor a removed one's mark on a root still listed. When
  // the marks cannot be saved, folders.json is not written either.
  const save = (nextFolders: string[], nextMarks: string[]): Promise<Error | null> => {
    folders = nextFolders;
    const kept = storedAuto(nextMarks, prunable ? nextFolders : null);
    marks = kept;
    const result = writing.then(async () => {
      await writeMarks(nextMarks);
      await writeFoldersFile(file, nextFolders);
      await writeMarks(kept);
    }).then(
      () => null,
      (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
    );
    writing = result;
    return result;
  };
  return {
    list: () => [...folders],
    replace: (paths) => save([...paths], marks),
    add: (path) => save(add(folders, path), marks),
    remove: (path) => save(remove(folders, path), marks),
    // A mark folders.json does not list is ignored, so a mark left by an interrupted write never shows.
    auto: () => folders.filter(path => marks.includes(path)),
    adopt: (path) => save(add(folders, path), add(marks, path)),
    claim: (path) => marks.includes(path) ? save([...folders], autoAfterAdd(marks, path)) : Promise.resolve(null),
  };
}
