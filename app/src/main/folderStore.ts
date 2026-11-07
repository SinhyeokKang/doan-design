import { randomBytes } from "node:crypto";
import { readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
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
  // Auto-registered roots (ARCHITECTURE §7 `auto-folders.json`), in list order. Kept in `auto-folders.json` beside folders.json,
  // which stays a plain string array so an older app still reads the list.
  auto(): string[];
  // Adds the root marked as auto-registered.
  adopt(path: string): Promise<Error | null>;
  // Clears the mark, if any: the human added the root by hand.
  claim(path: string): Promise<Error | null>;
  // The other spelling of a listed root, mapped to the one this run lists, for ui-state.json to read memory saved
  // under either: alias → real path after the startup step moved the roots, real path → saved alias when it did not.
  spellings(): ReadonlyMap<string, string>;
}

// Moves the memory kept under each alias (a saved spelling) to its real path in the stores keyed by root, before
// folders.json changes; true only when every store holds it under the real path (index.ts: canvas-seen.json, then
// ui-state.json).
export type RootMigration = (aliases: ReadonlyMap<string, string>) => Promise<boolean>;

export async function readFoldersFile(file: string): Promise<string[]> {
  return await readFoldersFileForPruning(file) ?? [];
}

// A run starts only on a root that is its own real path (prepare.ts, ARCHITECTURE §7 'Identity and admission'), and
// registration already stores real paths, so a root saved through a symlink (by hand, a script or an older app) is
// read as its real path; two spellings of one folder become one entry in the first one's place. A root that cannot be
// resolved now (missing, unreadable) keeps its saved spelling, so it still shows as missing instead of leaving the
// list. The promise realpath returns the on-disk spelling. Each spelling is resolved once, however many of the two
// files hold it.
async function realRoots(spellings: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(spellings)];
  const real = await Promise.all(unique.map(path => realpath(path).catch(() => path)));
  return new Map(unique.map((path, i) => [path, real[i]!]));
}

const resolved = (list: readonly string[], real: ReadonlyMap<string, string>) => [...new Set(list.map(path => real.get(path) ?? path))];

// An empty fallback can start the app, but cannot authorize deleting local
// review markers. Only a valid list (or first-use ENOENT) is safe to prune by.
export async function readFoldersFileForPruning(file: string): Promise<string[] | null> {
  const saved = await readSavedList(file);
  return saved === null ? null : resolved(saved, await realRoots(saved));
}

// The list as saved, before realRoots.
async function readSavedList(file: string): Promise<string[] | null> {
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

// A damaged or unreadable mark file reads as no marks, and the next write replaces it, so its roots become
// hand-added for good. Logged because nothing else shows why.
async function readMarks(file: string): Promise<string[]> {
  try {
    const value: unknown = JSON.parse(await readFile(file, "utf8"));
    return Array.isArray(value) && value.every(entry => typeof entry === "string") ? [...new Set(value)] : [];
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) console.error("doan: cannot read auto-folders.json", error);
    return [];
  }
}

// The marks once the list is read as real paths. A mark saved through a symlink still marks its root, also when only
// the list was rewritten before a stop (folders.json goes first). Two list spellings of one folder that collapse keep it
// hand-added when either was hand-added, as a manual add clears the mark.
function realMarks(list: readonly string[], marks: readonly string[], real: ReadonlyMap<string, string>): string[] {
  const to = (path: string) => real.get(path) ?? path;
  const spellings = new Map<string, string[]>();
  for (const path of list) spellings.set(to(path), [...spellings.get(to(path)) ?? [], path]);
  return resolved(marks, real).filter(root => {
    const listed = spellings.get(root) ?? [];
    return listed.length <= 1 || listed.every(path => marks.includes(path));
  });
}

// One ordered startup step (defect-sweep C2): when a saved root or mark reads as another real path, `migrate` moves the
// memory kept under the alias, then folders.json is written with the real paths, then auto-folders.json. A stop or a
// failure at any point leaves files a later launch reads the same way and retries; after a failure this run keeps the
// saved spellings, so nothing keyed by them is dropped. A list that could not be read is never rewritten.
export async function openFolderStore(file: string, migrate: RootMigration = async () => true): Promise<FolderStore> {
  const autoFile = join(dirname(file), "auto-folders.json");
  const saved = await readSavedList(file);
  // Marks are pruned by the list only when folders.json was read (POSTMORTEM 2026-10-26); otherwise the empty
  // fallback list would erase them.
  const prunable = saved !== null;
  const savedMarks = await readMarks(autoFile);
  let folders = saved ?? [];
  let marks = savedMarks;
  let writtenMarks: string | undefined = JSON.stringify(savedMarks);
  let spellings: ReadonlyMap<string, string> = new Map();
  const real = saved === null ? new Map<string, string>() : await realRoots([...saved, ...savedMarks]);
  const aliases: ReadonlyMap<string, string> = new Map([...real].filter(([path, to]) => path !== to));
  if (saved !== null && aliases.size > 0) {
    const nextFolders = resolved(saved, real), nextMarks = realMarks(saved, savedMarks, real);
    const moved = await migrate(aliases).catch((error: unknown) => { console.error("doan: cannot move root memory to real paths", error); return false; });
    const listed = moved && await writeFoldersFile(file, nextFolders).then(() => true, (error: unknown) => { console.error("doan: cannot save folders.json", error); return false; });
    if (listed) {
      folders = nextFolders;
      marks = nextMarks;
      spellings = aliases;
      // After folders.json: a stop before this write leaves marks that still resolve to the listed real paths.
      await writeFoldersFile(autoFile, nextMarks).then(() => { writtenMarks = JSON.stringify(nextMarks); }, (error: unknown) => console.error("doan: cannot save auto-folders.json", error));
    } else {
      // Memory an earlier run already moved to a real path is read under the alias this run lists.
      const reverse = new Map<string, string>();
      for (const [alias, to] of aliases) if (saved.includes(alias) && !saved.includes(to) && !reverse.has(to)) reverse.set(to, alias);
      spellings = reverse;
    }
  }
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
    spellings: () => spellings,
  };
}
