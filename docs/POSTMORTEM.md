# Postmortem

> Canvas paths in historical entries retain `design/`; the current canvas directories are `.doan/canvases/` (since 2026-10-28) and `.doan/ds/` for design-system canvases. File moves preserve canvas/frame/element IDs.

> Pitfalls we hit, one file per month under `docs/postmortem/`, newest date first in each file. Preserve existing entry content; insert new entries at the top of the current month's file.
> Historical `app/e2e/` paths refer to the suite retired on 2026-10-27. Current runtime safety helpers live in `app/runtime/`; use focused probes under `.scratch/`, as specified in AGENTS.md.
> Some entries name code removed later: the app's comment UI (`useComments.tsx`, `CommentsSession.ts`, `CommentsPanel.tsx`, `CommentPins.ts` and most of `app/src/comments/` and `app/src/main/comments/`, with their tests) on 2026-11-01; the rest of comments on 2026-11-08 (`doan comments`, `doan comment resolve`, `cli/internal/comments/`, `cli/internal/repo/orphans.go`, `cli/internal/formats/fold*.go`, `app/src/comments/`, `app/src/formats/fold*.ts` and `schema/comment-event.v1.schema.json`; `app/src/main/comments/document.ts` and `identity.ts` now live in `app/src/main/document/` as `bindings.ts` and `identity.ts`); the separate Settings window (`settingsWindow.tsx`) and the `Sidebar.tsx` component on 2026-10-30; Settings > Connections (`ConnectionRows.tsx`, `connectionRowView.ts`, `setupBroker.ts`) on 2026-10-31. Other entries name files or symbols removed or renamed since (for example `ProjectSettingsDialog.tsx` and its test, which became the Project Settings page `ProjectSettingsPage.tsx` on 2026-11-03); `git log --diff-filter=D --oneline -1 -- <path>` finds when a path was removed. Their search commands and test pointers apply only to code that still exists.

## Month files

- [2026-11](postmortem/2026-11.md)
- [2026-10](postmortem/2026-10.md)

Search every entry, not this index: `grep -rn "<pattern>" docs/postmortem/`. A citation such as "POSTMORTEM 2026-10-27 …" is found in the file for its month.
