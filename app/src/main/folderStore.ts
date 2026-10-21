import { randomBytes } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { add, load, remove } from "./folders";

export interface FolderStore {
  list(): string[];
  // Resolve to the write error instead of rejecting: the change is kept in
  // memory either way, and the app keeps running on that list.
  add(path: string): Promise<Error | null>;
  remove(path: string): Promise<Error | null>;
}

export async function readFoldersFile(file: string): Promise<string[]> {
  try {
    return load(await readFile(file, "utf8"));
  } catch {
    return [];
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

export async function openFolderStore(file: string): Promise<FolderStore> {
  let folders = await readFoldersFile(file);
  // Writes run one after another so a slow earlier write cannot rename an
  // older list over a newer one.
  let writing: Promise<unknown> = Promise.resolve();
  const save = (next: string[]): Promise<Error | null> => {
    folders = next;
    const result = writing.then(() => writeFoldersFile(file, next)).then(
      () => null,
      (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
    );
    writing = result;
    return result;
  };
  return {
    list: () => [...folders],
    add: (path) => save(add(folders, path)),
    remove: (path) => save(remove(folders, path)),
  };
}
