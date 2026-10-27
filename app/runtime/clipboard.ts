type ClipboardDependencies = {
  clipboard: Pick<Electron.Clipboard, "read" | "write" | "clear">;
  ClipboardItem: typeof Electron.ClipboardItem;
};

// These callbacks run in Electron's main process; keep them self-contained for evaluate.
export async function saveClipboard({ clipboard, ClipboardItem }: ClipboardDependencies): Promise<void> {
  if (Reflect.has(globalThis, "doanE2EClipboard")) throw new Error("Clipboard snapshot is already pending restoration.");
  try {
    const saved: Electron.ClipboardItem[] = [];
    for (const item of await clipboard.read()) {
      // Electron can expose a native item with no payload types, including an empty clipboard.
      if (!item.types.length) continue;
      const data = Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)])));
      saved.push(new ClipboardItem(data));
    }
    Reflect.set(globalThis, "doanE2EClipboard", saved);
  } catch {
    // Native errors may include clipboard data; never surface them in runtime logs.
    throw new Error("Clipboard snapshot failed; runtime clipboard tests must not proceed.");
  }
}

export async function restoreClipboard({ clipboard }: Pick<ClipboardDependencies, "clipboard">): Promise<void> {
  const saved = Reflect.get(globalThis, "doanE2EClipboard") as Electron.ClipboardItem[] | undefined;
  if (!saved) return;
  try {
    if (saved.length) await clipboard.write(saved);
    else clipboard.clear();
    Reflect.deleteProperty(globalThis, "doanE2EClipboard");
  } catch {
    throw new Error("Clipboard restoration failed.");
  }
}
