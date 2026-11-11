import type { AttachmentRecord } from "./types";

// Attachment records as the history (`<id>.jsonl` user.message) and drafts.json hold them. LEGACY is the shape every
// earlier app wrote, which must keep reading; FOLDER is the directory kind, which carries no size.
export const LEGACY_ATTACHMENTS = [
  { name: "shot.png", size: 2048, kind: "image", path: "/Users/me/Desktop/shot.png" },
  { name: "notes.md", size: 0, kind: "file", path: "/tmp/notes.md" },
] as const satisfies readonly AttachmentRecord[];
export const FOLDER_ATTACHMENT = { name: "references", kind: "directory", path: "/Users/me/Projects/Atlas/references" } as const satisfies AttachmentRecord;
// A folder named like an image is still a folder.
export const IMAGE_NAMED_FOLDER = { name: "shots.png", kind: "directory", path: "/Volumes/Shared/shots.png" } as const satisfies AttachmentRecord;
