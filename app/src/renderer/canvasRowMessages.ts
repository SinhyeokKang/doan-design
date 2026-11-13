import type { ExportReply } from "../main/canvasExport";
import type { TrashReply } from "../main/canvasTrash";

// The toasts of a canvas row's Move to Trash and Export. `stem` is the row's name, the
// file name without `.html`, as the sidebar shows it.
export const canvasStem = (path: string) => path.split("/").at(-1)!.replace(/\.html$/, "");

const REFUSED: Record<Extract<TrashReply, { kind: "refused" }>["reason"], string> = {
  busy: "An agent started working on it.",
  notListed: "It’s no longer in this project.",
  notFile: "It isn’t a regular file.",
  failed: "Try again, or move the file in Finder.",
};

export function trashToast(stem: string, reply: TrashReply): string {
  if (reply.kind === "refused") return `Couldn’t move “${stem}” to Trash. ${REFUSED[reply.reason]}`;
  return `Moved “${stem}” to Trash.`;
}

export const exportProgress = (stem: string) => `Exporting “${stem}”`;

// The result toast, with main's Show in Finder id once the file is written; null for a cancelled save panel. A
// refusal from main (`exporting`, `notListed`) has no sentence of its own and reads as any other failure.
// `prototype`: the prototype window's Export, where `stem` is the frame's title or ID. Its file plays one frame but
// holds the whole canvas, other frames and notes included, so the success toast says so.
export function exportToast(stem: string, reply: ExportReply, prototype = false): { text: string; reveal?: string } | null {
  const failed = `Couldn’t export “${stem}”.`;
  if (reply.kind === "cancelled") return null;
  if (reply.kind === "exported") return { text: `Exported “${stem}”.${prototype ? " The file also contains the rest of the canvas." : ""}${reply.external > 0 ? " Parts of it load from the internet." : ""}`, reveal: reply.reveal };
  // Export again would export the frame playing now, so this names the clicked frame instead of saying Try again.
  if (reply.kind === "refused" && reply.reason === "changed") return { text: `${failed} Another frame started playing first. Play “${stem}” again, then export it.` };
  if (reply.kind === "refused") return { text: `${failed} Try again.` };
  switch (reply.reason) {
    case "refused": return { text: reply.count === 1
      ? `${failed} It uses a file Doan can’t include: ${reply.first}. Ask your agent to fix it.`
      : `${failed} It uses ${reply.count} files Doan can’t include, starting with ${reply.first}. Ask your agent to fix them.` };
    case "unreadable": return { text: `${failed} Doan can’t read this canvas. Ask your agent to run doan check.` };
    // The CLI may name no asset; the sentence then ends at the limit (C2 brief).
    case "tooLarge": return { text: `${failed} The file would be over 50 MB.${reply.largest !== null ? ` The largest file it uses is ${reply.largest}.` : ""}` };
    case "notFound": return { text: `${failed} Doan can export only a frame written in the canvas file, not one a script adds. Ask your agent to write it into the canvas file.` };
    case "notMarked": return { text: `${failed} It isn’t marked for prototyping in the canvas file. Ask your agent to mark it.` };
    case "insideDoan": return { text: `${failed} Choose a folder outside .doan.` };
    case "failed": return { text: `${failed} Try again.` };
  }
}
