import { pluralComments } from "../comments/panelText";
import type { ProjectCanvasComments, ProjectComments } from "../main/projectComments";
import type { FolderEntry } from "../main/view";
import { frameLabel } from "./canvasTree";
import type { SelectionView } from "./selection";

export interface HomeCard {
  // `git.common` when known; the row's own path for a project outside git.
  key: string;
  name: string;
  rows: FolderEntry[];
}

// Cards keep the saved order: a card sits where its first row is, and its rows
// stay in saved order. A row that is not a list has no `git`, so it stays with
// the card it was last seen in (`lastCommon`, path → common, main's memory)
// until the app restarts. A list row is trusted as it is: without `git` it is
// a project outside git, whatever card it used to be in.
export function groupProjects(entries: readonly FolderEntry[], lastCommon: ReadonlyMap<string, string>): HomeCard[] {
  const cards = new Map<string, HomeCard>();
  for (const entry of entries) {
    const common = entry.kind === "list" ? entry.git?.common : lastCommon.get(entry.path);
    const key = common ?? entry.path;
    const card = cards.get(key);
    if (card) card.rows.push(entry);
    else cards.set(key, { key, name: "", rows: [entry] });
  }
  for (const card of cards.values()) {
    const main = card.rows.flatMap((row) => (row.kind === "list" && row.git?.main !== undefined ? [row.git.main] : []))[0];
    card.name = basename(main ?? card.rows[0]!.path);
  }
  return [...cards.values()];
}

export type RowAction = "setUp" | "locate" | "remove" | "showInFinder" | "retry" | "details";

export interface CardRow {
  chip?: "Not set up" | "Missing" | "Config error" | "CLI error" | "Reading…";
  // The first action takes focus when a problem row is clicked.
  actions: RowAction[];
  // Only for a list row; the view formats `changedAt` and puts `homeSummary`
  // beside it.
  summary?: { branch?: string; toReview?: number; changedAt?: number };
  // This row is the loaded workspace ("Open").
  current: boolean;
  // "Selected for your agent: <selected>" while `current`.
  selected?: string;
  // Config error text behind Details.
  detail?: string;
}

// `loaded` is the root of the loaded workspace, `selection` the one the
// renderer holds for it, `comments` its `comments:project` counts. Design
// 'Problem rows' table.
export function cardRow(entry: FolderEntry, loaded: string | null, selection: SelectionView | null, comments?: readonly ProjectCanvasComments[]): CardRow {
  const current = loaded === entry.path;
  const selected = current && selection ? selectionLabel(selection) : undefined;
  const row = { current, ...(selected === undefined ? {} : { selected }) };
  switch (entry.kind) {
    case "loading":
      return { ...row, chip: "Reading…", actions: [] };
    case "uninitialized":
      return { ...row, chip: "Not set up", actions: ["setUp", "remove"] };
    case "notFound":
      return { ...row, chip: "Missing", actions: ["locate", "remove"] };
    case "error":
      return { ...row, chip: "Config error", actions: ["showInFinder", "retry", "details"], detail: entry.message };
    case "cliError":
      return { ...row, chip: "CLI error", actions: ["retry", "remove"] };
    case "list": {
      const branch = entry.git?.branch ?? (entry.git?.detached === undefined ? undefined : `detached ${entry.git.detached.slice(0, 7)}`);
      const toReview = reviewTotal(comments);
      const summary = {
        ...(branch === undefined ? {} : { branch }),
        ...(toReview === undefined ? {} : { toReview }),
        ...(entry.changedAt === undefined ? {} : { changedAt: entry.changedAt }),
      };
      return { ...row, actions: [], summary };
    }
  }
}

// One canvas whose comment file failed hides the row's count: a sum without
// it would be a wrong count, not a partial one (conductor decision, batch H).
export function reviewTotal(comments: readonly ProjectCanvasComments[] | undefined): number | undefined {
  let total = 0;
  for (const canvas of comments ?? []) {
    if ("error" in canvas) return undefined;
    total += canvas.toReview;
  }
  return comments === undefined ? undefined : total;
}

export interface HomeSummaryItem { kind: "canvases" | "open" | "review" | "orphans"; text: string }

// The summary of a list row (draft `home-summary`): the canvas count, then
// open, resolved to review and without a canvas, each only above 0. The view
// puts the changed time last; a narrow row wraps between these same items.
// `review` is `reviewTotal`. "Without a canvas" counts open orphan comments,
// like "open" beside it (conductor decision 2026-10-26); a file ls could not
// read has no count. A canvas whose comment file failed hides the open count,
// as `reviewTotal` hides the review count: the sum would be wrong, not partial.
export function homeSummary(entry: Extract<FolderEntry, { kind: "list" }>, review: number | undefined): { items: HomeSummaryItem[]; label: string } {
  const canvases = entry.canvases.length;
  const open = entry.canvases.some((canvas) => canvas.commentsError) ? undefined : entry.canvases.reduce((sum, canvas) => sum + canvas.open, 0);
  const orphans = (entry.orphans ?? []).reduce((sum, orphan) => sum + (orphan.comments?.open ?? 0), 0);
  const items: HomeSummaryItem[] = [{ kind: "canvases", text: `${canvases} ${canvases === 1 ? "canvas" : "canvases"}` }];
  const label = [items[0]!.text];
  if (open !== undefined) {
    if (open > 0) items.push({ kind: "open", text: `${open} open` });
    label.push(pluralComments(open));
  }
  if (review) items.push({ kind: "review", text: `${review} resolved to review` });
  if (orphans > 0) items.push({ kind: "orphans", text: `${orphans} without a canvas` });
  label.push(...items.filter((item) => item.kind === "review" || item.kind === "orphans").map((item) => item.text));
  return { items, label: label.join(" · ") };
}

// One root's last `comments:project` read: the whole list reply, which the
// Feedback panel uses, or `failed` (unavailable, no reply, or the call threw),
// which it shows with Retry. Home and the Overview cards read the counts of a
// list only, so a failed root has no counts there.
export type ProjectRead = Extract<ProjectComments, { kind: "list" }> | { kind: "failed" };

// One root is read at most this often while changes keep coming (tasks 1:
// consecutive saves read up to 5 times a second without it).
export const PROJECT_READ_INTERVAL_MS = 1000;

// `comments:project` reads for the roots on screen. A root is read again when
// its ls row changes (an agent's resolve reaches the app only through the
// watcher's ls), when main invalidates it, and when its owner calls `refresh`
// for a change main does not announce (a review-state raise). Per root, reads
// start at most once per interval; a trigger inside it waits for one trailing
// read, so the last change is always read. An invalidation or a refresh ends
// the reply in flight at once, not when the trailing read starts: the reply
// may predate the change. A row change does not, because main invalidates
// before the ls that changes the row. Otherwise only the newest read may land.
export class ProjectCommentReads {
  private items = new Map<string, ProjectRead>();
  // root → the ls row it was last read for.
  private tracked = new Map<string, string>();
  // root → the revision whose reply may still land.
  private latest = new Map<string, number>();
  private started = new Map<string, number>();
  private waiting = new Map<string, ReturnType<typeof setTimeout>>();
  private seq = 0;
  private disposed = false;

  constructor(private readonly get: (root: string, revision: number) => Promise<ProjectComments | null>, private readonly publish: (items: ReadonlyMap<string, ProjectRead>) => void) {}

  // A root left untracked keeps its last counts, so coming back shows them
  // until the new read lands.
  track(roots: ReadonlyMap<string, string>): void {
    for (const root of [...this.tracked.keys()]) {
      if (roots.has(root)) continue;
      this.tracked.delete(root); this.latest.delete(root); this.started.delete(root);
      clearTimeout(this.waiting.get(root)); this.waiting.delete(root);
    }
    for (const [root, signature] of roots) {
      const previous = this.tracked.get(root);
      if (previous === signature) continue;
      this.tracked.set(root, signature);
      this.request(root);
    }
  }

  invalidated(root: string): void {
    this.refresh(root);
  }

  refresh(root: string): void {
    if (!this.tracked.has(root)) return;
    this.latest.delete(root);
    this.request(root);
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.waiting.values()) clearTimeout(timer);
    this.waiting.clear();
  }

  private request(root: string): void {
    if (this.disposed || this.waiting.has(root)) return;
    const wait = (this.started.get(root) ?? -Infinity) + PROJECT_READ_INTERVAL_MS - Date.now();
    if (wait <= 0) { this.read(root); return; }
    this.waiting.set(root, setTimeout(() => { this.waiting.delete(root); this.read(root); }, wait));
  }

  private read(root: string): void {
    const revision = ++this.seq;
    this.latest.set(root, revision);
    this.started.set(root, Date.now());
    const land = (read: ProjectRead) => {
      if (this.disposed || this.latest.get(root) !== revision) return;
      this.items.set(root, read);
      this.publish(new Map(this.items));
    };
    void this.get(root, revision).then(reply => {
      land(reply?.kind === "list" && reply.root === root && reply.revision === revision ? reply : { kind: "failed" });
    }, (error: unknown) => { console.error("comments:project failed", error); land({ kind: "failed" }); });
  }
}

// Rows whose branch would be cut off beside their summary; the view puts
// those summaries on a line of their own (`narrow`). Each row is measured in
// the wide layout, so the answer never depends on the class it gives.
export function measureNarrow(card: HTMLElement): Set<string> {
  const narrow = new Set<string>();
  for (const row of card.querySelectorAll<HTMLElement>(".wt[data-path]")) {
    const name = row.querySelector<HTMLElement>(".wt-label .name");
    const path = row.dataset.path;
    if (!name || !row.querySelector(".wt-sum") || path === undefined) continue;
    const was = row.classList.contains("narrow");
    row.classList.remove("narrow");
    if (name.scrollWidth > name.clientWidth) narrow.add(path);
    row.classList.toggle("narrow", was);
  }
  return narrow;
}

// A frame selection shows the frame's title, an element its tag and id.
function selectionLabel(selection: SelectionView): string | undefined {
  if (selection.element) return selection.element.doanId === undefined ? selection.tag : `${selection.tag} · ${selection.element.doanId}`;
  return selection.frame ? frameLabel(selection.frame, 0).name : undefined;
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}
