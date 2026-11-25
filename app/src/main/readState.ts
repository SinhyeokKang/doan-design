import { absorbFirst, judge, markShown, migrateRoot, uniqueIds, type CanvasRecord, type LocalSeen, type RootRecord, type SeenRow, type Verdict } from "./canvasSeen";
import { GRACE_MS, settlePending, type GitSignalEntry, type Pending } from "./gitSignal";
import { validCanvasId, type SeenSnapshot } from "./seenRecords";
import type { CanvasRow, FolderEntry, ReadStateProblem } from "./view";

// Each listed canvas's verdict from its fingerprint and this device's record; nothing under the root is ever written.
// The first listing is the baseline; a later ID waits GRACE_MS and lights as new unless git or the canvas page explain it.

export interface ReadStateDeps {
  local: LocalSeen;
  fingerprint(root: string, path: string): Promise<string | null>;
  // The root's former shared records, read once for its migration (seenRecords.ts readSeen).
  read(root: string, ids: Iterable<string>): Promise<SeenSnapshot>;
  // The root's git signal now (gitSignal.ts readGitSignal).
  gitSignal(root: string): string;
  entries(): readonly FolderEntry[];
  // The hash of the bytes the canvas page shows for this row, or null while that is not proven (seenProof.ts).
  shown(root: string, row: CanvasRow): Promise<string | null>;
  // The rows' marks moved: send the list again.
  changed(): void;
  // A failure found while the person did not ask for it, for the window to toast when it is on that project.
  problem(root: string, problem: ReadStateProblem): void;
  // The clock and the timer of the grace; real ones unless a test stands in.
  now?(): number;
  after?(ms: number, run: () => void): () => void;
}

export interface ReadState {
  // The entries with `unseen` and `saveFailed` from the last verdicts. Synchronous: verdicts are worked out after each
  // listing and `changed` says when they moved.
  decorate(entries: readonly FolderEntry[]): FolderEntry[];
  // The shell's list changed: works out the verdicts of each listed root that changed, and forgets roots that left.
  listed(entries: readonly FolderEntry[]): void;
  // The root's gitdir HEAD, FETCH_HEAD or ORIG_HEAD changed (watch.ts `git`).
  gitChanged(root: string): void;
  // `{root, path}` while the canvas page is meant to show that canvas, null when it stops. False for a bad value.
  showing(value: unknown): boolean;
  // Something the visible proof reads moved.
  documentsChanged(): void;
  // `{root, path?}`: Retry, or re-entering the project. Tries the failed writes again; resolves to what still fails (the
  // canvas's own failure first when `path` is given), or null. False for a bad value.
  retry(value: unknown): Promise<ReadStateProblem | null | false>;
  // Resolves once no read-state work is queued (tests).
  idle(): Promise<void>;
}

type ListEntry = Extract<FolderEntry, { kind: "list" }>;
interface Failure { kind: "save" | "id"; hash: string }
interface Run {
  queue: Promise<void>;
  evaluateQueued: boolean;
  listedEntry?: ListEntry;
  judged: boolean;
  rows: Map<string, { verdict: Verdict | undefined; fingerprint: string | null }>;
  // The first listing since start or registration was taken as the baseline.
  absorbed: boolean;
  // IDs without a record that count as seen once their content can be read: listed by the first listing while their
  // HTML could not be read or their ID was shared, or brought by git while unreadable. Never treated as appearing.
  baseline: Set<string>;
  pending: Map<string, Pending>;
  // The git signal as observed, oldest first (settlePending).
  history: GitSignalEntry[];
  timer?: { at: number; cancel: () => void } | undefined;
  failures: Map<string, Failure>;
}
// The canvas page's current canvas. `failed`: a write for it failed in this showing, so it is not tried again until the
// canvas is shown again or Retry.
interface Intent { root: string; path: string; failed: boolean }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const recordOf = (record: RootRecord, id: string): CanvasRecord | undefined => Object.hasOwn(record.canvases, id) ? record.canvases[id] : undefined;
const withRecord = (record: RootRecord, id: string, value: CanvasRecord): RootRecord => ({ ...record, canvases: { ...record.canvases, [id]: value } });

export function createReadState(deps: ReadStateDeps): ReadState {
  const now = deps.now ?? Date.now;
  const after = deps.after ?? ((ms, run) => {
    const timer = setTimeout(run, ms);
    timer.unref();
    return () => clearTimeout(timer);
  });
  const runs = new Map<string, Run>();
  let intent: Intent | null = null;
  let marking: Promise<void> | null = null;
  let markAgain = false;
  // canvas-seen.json's own problem, told once: the answer to the first project entry or Retry that has nothing of its own.
  let fileProblem: ReadStateProblem | undefined = deps.local.problem === "newer" ? { kind: "unsupported" } : deps.local.problem === "corrupt" ? { kind: "records" } : undefined;

  const listEntry = (root: string): ListEntry | undefined => {
    const entry = deps.entries().find(item => item.path === root);
    return entry?.kind === "list" ? entry : undefined;
  };
  const runOf = (root: string): Run => {
    let run = runs.get(root);
    if (!run) {
      run = { queue: Promise.resolve(), evaluateQueued: false, judged: false, rows: new Map(), absorbed: false, baseline: new Set(), pending: new Map(), history: [], failures: new Map() };
      runs.set(root, run);
    }
    return run;
  };
  const enqueue = (root: string, task: () => Promise<void>): Promise<void> => {
    const run = runOf(root);
    const next = run.queue.then(task).catch((error: unknown) => { console.error("doan: read state failed", error); });
    run.queue = next;
    return next;
  };

  // A save failure describes the content that was shown: it stays while the canvas stays shown; after that, once the
  // file holds other content, the dot is a change again.
  const marks = (run: Run, root: string, path: string): { unseen?: "new" | "changed"; saveFailed?: "save" | "id" } => {
    const state = run.rows.get(path);
    const unseen = state?.verdict === "new" || state?.verdict === "changed" ? state.verdict : undefined;
    if (!unseen) return {};
    const failure = run.failures.get(path);
    const stillShown = intent?.failed === true && intent.root === root && intent.path === path;
    if (failure?.kind === "id" || (failure?.kind === "save" && (stillShown || failure.hash === state?.fingerprint))) return { unseen, saveFailed: failure.kind };
    return { unseen };
  };
  const decoration = (run: Run, root: string) => JSON.stringify([...run.rows.keys()].map(path => [path, marks(run, root, path)]));
  // Moves the canvas page's current canvas, telling the window when that ends a failed showing's failure dot. Only the
  // old canvas's root can move: a new or cleared showing has failed nothing yet.
  const moveIntent = (change: () => void) => {
    const root = intent?.root;
    const run = root === undefined ? undefined : runs.get(root);
    const before = run?.judged ? decoration(run, root!) : null;
    change();
    if (run?.judged && decoration(run, root!) !== before) deps.changed();
  };

  const lastOf = (run: Run, row: SeenRow): Verdict | undefined => run.rows.get(row.path)?.verdict;

  // Appends the git signal when it moved; true if it did.
  const observeGit = (run: Run, root: string, at: number): boolean => {
    const signal = deps.gitSignal(root);
    if (run.history.at(-1)?.signal === signal) return false;
    run.history.push({ at, signal });
    return true;
  };
  // Keeps what a later settle can still compare with: the entries from GRACE_MS before the oldest pending ID (or now),
  // and the one entry before them, the value a change in that window is compared against.
  const pruneHistory = (run: Run, at: number) => {
    const from = Math.min(at, ...[...run.pending.values()].map(item => item.appearedAt)) - GRACE_MS;
    let keep = 0;
    for (let i = 0; i < run.history.length; i++) if (run.history[i]!.at < from) keep = i;
    run.history.splice(0, keep);
  };
  // Runs the root's evaluation again when its oldest pending ID's grace ends.
  const armTimer = (run: Run, root: string, at: number) => {
    const due = run.pending.size === 0 ? undefined : Math.min(...[...run.pending.values()].map(item => item.appearedAt)) + GRACE_MS;
    if (run.timer?.at === due) return;
    run.timer?.cancel();
    run.timer = undefined;
    if (due === undefined) return;
    run.timer = { at: due, cancel: after(Math.max(0, due - at), () => { if (runs.get(root) === run) { run.timer = undefined; evaluateSoon(root); } }) };
  };

  // Inside the root's queue.
  const evaluate = async (root: string): Promise<void> => {
    const entry = listEntry(root);
    const run = runs.get(root);
    if (!entry || !run) return;
    const rows: SeenRow[] = await Promise.all(entry.canvases.map(async row => ({
      path: row.path, id: row.id, mtimeMs: row.mtimeMs, fingerprint: row.error ? null : await deps.fingerprint(root, row.path),
    })));
    if (runs.get(root) !== run) return;
    const stored = deps.local.root(root);
    let record: RootRecord = stored ?? { canvases: {} };
    if (!record.migrated) {
      // Once per root. Only a root this device knew under an older Doan carries its shared records over; any other is a
      // first registration and its `.doan/seen/` is never read.
      const v2 = record.v2;
      if (v2) {
        const snapshot = await deps.read(root, uniqueIds(rows));
        if (runs.get(root) !== run) return;
        record = migrateRoot(v2, snapshot, rows, row => lastOf(run, row) ?? (row.id === undefined ? undefined : v2.known[row.id]));
      } else record = { migrated: true, canvases: record.canvases };
    }
    const at = now();
    observeGit(run, root, at);
    const ids = uniqueIds(rows);
    if (!run.absorbed) {
      record = absorbFirst(record, rows);
      run.absorbed = true;
      for (const row of rows) if (validCanvasId(row.id) && !recordOf(record, row.id)) run.baseline.add(row.id);
    } else {
      for (const row of rows) {
        const id = row.id;
        if (id === undefined || !ids.has(id) || recordOf(record, id) || run.pending.has(id)) continue;
        if (!run.baseline.has(id)) run.pending.set(id, { appearedAt: at });
        else if (row.fingerprint !== null) {
          record = withRecord(record, id, { html: row.fingerprint });
          run.baseline.delete(id);
        }
      }
    }
    for (const [id, pending] of run.pending) {
      // Gone, shared with another canvas, or recorded meanwhile (shown): no longer waiting.
      if (!ids.has(id) || recordOf(record, id)) { run.pending.delete(id); continue; }
      const outcome = settlePending(pending, run.history, at);
      if (outcome === "pending") continue;
      run.pending.delete(id);
      const fingerprint = rows.find(row => row.id === id)!.fingerprint;
      if (outcome === "new") record = withRecord(record, id, { unseen: "new" });
      else if (fingerprint !== null) record = withRecord(record, id, { html: fingerprint });
      else run.baseline.add(id);
    }
    pruneHistory(run, at);
    armTimer(run, root, at);
    // A record this device cannot save stays in memory for the run: the next run's first listing is a baseline again.
    if (record !== stored) deps.local.set(root, record);
    const verdicts = judge(record, rows, row => lastOf(run, row));
    const before = run.judged ? decoration(run, root) : null;
    run.rows = new Map(rows.map(row => [row.path, { verdict: verdicts.get(row.path), fingerprint: row.fingerprint }]));
    run.judged = true;
    for (const path of [...run.failures.keys()]) if (run.rows.get(path)?.verdict === "seen") run.failures.delete(path);
    if (before !== decoration(run, root)) deps.changed();
    void tryMark();
  };

  function evaluateSoon(root: string): void {
    const run = runOf(root);
    if (run.evaluateQueued) return;
    run.evaluateQueued = true;
    void enqueue(root, async () => {
      run.evaluateQueued = false;
      await evaluate(root);
    });
  }

  // Records `hash` as shown for the canvas at `path`, inside the root's queue. Only a still-unseen canvas carries a
  // failure: a canvas already seen (a stale screen) gets no new dot.
  const mark = async (root: string, path: string, hash: string, quiet: boolean, session: Intent | null): Promise<void> => {
    const entry = listEntry(root);
    const run = runs.get(root);
    const row = entry?.canvases.find(item => item.path === path);
    const record = deps.local.root(root);
    if (!entry || !run || !row || !record) return;
    const unseen = marks(run, root, path).unseen !== undefined;
    const fail = (failure: Failure) => {
      const before = decoration(run, root);
      if (session) session.failed = true;
      if (!unseen) return;
      run.failures.set(path, failure);
      if (before !== decoration(run, root)) deps.changed();
      if (!quiet) deps.problem(root, failure.kind === "id" ? { kind: "id", path } : { kind: "save", path });
    };
    if (row.id === undefined || !uniqueIds(entry.canvases).has(row.id)) {
      if (unseen) fail({ kind: "id", hash });
      return;
    }
    const next = markShown(record, row, hash, entry.canvases);
    if (next !== record && !deps.local.commit(root, next)) {
      fail({ kind: "save", hash });
      return;
    }
    run.pending.delete(row.id);
    run.baseline.delete(row.id);
    run.failures.delete(path);
    await evaluate(root);
  };

  const markOnce = async (): Promise<void> => {
    const current = intent;
    if (!current || current.failed) return;
    const entry = listEntry(current.root);
    const run = runs.get(current.root);
    const row = entry?.canvases.find(item => item.path === current.path);
    if (!entry || !run?.judged || !row) return;
    const hash = await deps.shown(current.root, row);
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- a failed write can set intent.failed while the proof is read
    if (!hash || intent !== current || current.failed) return;
    const record = deps.local.root(current.root);
    const kept = record && row.id !== undefined && uniqueIds(entry.canvases).has(row.id) ? recordOf(record, row.id) : undefined;
    const stored = kept && "html" in kept ? kept.html : undefined;
    // The record already holds what the disk holds and the page is behind it: the reload records nothing new.
    if (stored === hash || (stored !== undefined && stored === run.rows.get(row.path)?.fingerprint)) return;
    await enqueue(current.root, () => mark(current.root, current.path, hash, false, current));
  };

  // One pass at a time; a call during a pass runs one more pass after it, so the latest proof is never missed.
  function tryMark(): Promise<void> {
    if (marking) {
      markAgain = true;
      return marking;
    }
    marking = (async () => {
      try {
        do {
          markAgain = false;
          await markOnce();
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- tryMark() sets this while markOnce awaits
        } while (markAgain);
      } finally {
        marking = null;
      }
    })();
    return marking;
  }

  // The root's local record stays: registering it again compares with it.
  const forget = (root: string) => {
    runs.get(root)?.timer?.cancel();
    runs.delete(root);
    if (intent?.root === root) intent = null;
  };

  const relevant = (run: Run, root: string, path: string | undefined): ReadStateProblem | null => {
    const visible = (at: string): ReadStateProblem | null => {
      const failure = run.failures.get(at);
      const shown = marks(run, root, at).saveFailed;
      if (!failure || !shown) return null;
      return failure.kind === "id" ? { kind: "id", path: at } : { kind: "save", path: at };
    };
    if (path !== undefined) {
      const own = visible(path);
      if (own) return own;
    }
    if (fileProblem) {
      const told = fileProblem;
      fileProblem = undefined;
      return told;
    }
    for (const at of run.failures.keys()) {
      const other = visible(at);
      if (other) return other;
    }
    return null;
  };

  return {
    decorate(entries) {
      return entries.map((entry): FolderEntry => {
        if (entry.kind !== "list") return entry;
        const run = runs.get(entry.path);
        if (!run?.judged) return entry;
        let touched = false;
        const canvases = entry.canvases.map(row => {
          const mark = marks(run, entry.path, row.path);
          if (!mark.unseen) return row;
          touched = true;
          return { ...row, ...mark };
        });
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- the map callback sets this
        return touched ? { ...entry, canvases } : entry;
      });
    },
    listed(entries) {
      const registered = new Set(entries.map(entry => entry.path));
      for (const root of [...runs.keys()]) if (!registered.has(root)) forget(root);
      for (const entry of entries) {
        if (entry.kind !== "list") continue;
        const run = runOf(entry.path);
        if (run.listedEntry === entry) continue;
        run.listedEntry = entry;
        evaluateSoon(entry.path);
      }
    },
    gitChanged(root) {
      const run = runs.get(root);
      // Before the first listing there is nothing to compare with: that listing reads the signal itself.
      if (!run?.absorbed) return;
      if (observeGit(run, root, now()) && run.pending.size > 0) evaluateSoon(root);
    },
    showing(value) {
      if (value === null) {
        moveIntent(() => { intent = null; });
        return true;
      }
      if (!isObject(value) || typeof value.root !== "string" || typeof value.path !== "string" || Object.keys(value).length !== 2) return false;
      const { root, path } = value;
      if (!deps.entries().some(entry => entry.path === root)) return false;
      if (intent?.root === root && intent.path === path) return true;
      moveIntent(() => { intent = { root, path, failed: false }; });
      void tryMark();
      return true;
    },
    documentsChanged() {
      if (intent && !intent.failed) void tryMark();
    },
    async retry(value) {
      if (!isObject(value) || typeof value.root !== "string" || (value.path !== undefined && typeof value.path !== "string")) return false;
      const root = value.root;
      const path = typeof value.path === "string" ? value.path : undefined;
      if (!listEntry(root)) return deps.entries().some(entry => entry.path === root) ? null : false;
      const run = runOf(root);
      await enqueue(root, async () => {
        for (const [at, failure] of [...run.failures]) await mark(root, at, failure.hash, true, null);
        await evaluate(root);
      });
      const current = intent;
      if (current?.root === root && !run.failures.has(current.path)) moveIntent(() => { current.failed = false; });
      void tryMark();
      return relevant(run, root, path);
    },
    async idle() {
      for (;;) {
        const pending = [...runs.values()].map(run => run.queue);
        await Promise.all([...pending, marking]);
        if ([...runs.values()].every((run, i) => run.queue === pending[i]) && !marking) return;
      }
    },
  };
}
