// A drop on the 'Open a local folder' card (buzz-add-projects design '폴더 드롭'). path is what preload's
// webUtils.getPathForFile read; an item not backed by a file has none ("").
export type FolderDrop = { kind: "folder"; index: number } | { kind: "notice"; text: string };

export function dropFolder(items: readonly { isDirectory: boolean; path: string }[]): FolderDrop {
  if (items.length > 1) return { kind: "notice", text: "Drop one folder at a time." };
  const item = items[0];
  return item?.isDirectory && item.path !== "" ? { kind: "folder", index: 0 } : { kind: "notice", text: "Only folders can be added." };
}
