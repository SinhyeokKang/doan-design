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
      // Electron 45 reads an empty general pasteboard as an item with no types or with only the find pasteboard's text;
      // writing that back would leave the probe's text on the general pasteboard.
      if (item.types.every(type => type === "electron application/findtext")) continue;
      // Electron's text/html writer on macOS prefixes <meta charset='utf-8'>, so a restore under text/html would stack
      // one more prefix per probe; the raw pasteboard type writes the HTML back unchanged.
      const data = Object.fromEntries(await Promise.all(item.types.map(async type => [type === "text/html" ? 'electron application/osclipboard;format="public.html"' : type, await item.getType(type)])));
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
