import { judge, plan, uniqueIds, type LocalSeen, type RootMemory, type SeenReads, type SeenRow, type Verdict } from "./canvasSeen";
import { MARKER, readOnlyError, recordName, recordText, SeenWriteError, type SeenSnapshot } from "./seenRecords";
import type { CanvasRow, FolderEntry, ReadStateProblem } from "./view";

// The canvas read state as the window shows it: each listed canvas's verdict (canvasSeen.ts) from its HTML fingerprint
// and the project's shared records, the records written when the canvas page shows a canvas, and the failures the
// window tells with a Retry toast. Electron-free; index.ts wires the window, the watcher and the document bindings.
//
// Reading never writes. Writes happen only for a mark (a canvas proven shown), a project's initial records, or Retry,
// so a write's own watcher event reads the same records again and stops there. After a failed write nothing is retried
// on its own: the person's Retry, re-entering the project (`retry`) or showing the canvas again does it.

export interface ReadStateDeps {
  local: LocalSeen;
  fingerprint(root: string, path: string): Promise<string | null>;
  read(root: string, ids: Iterable<string>): Promise<SeenSnapshot>;
  write(root: string, name: string, text: string, expected: Buffer | null): Promise<void>;
  entries(): readonly FolderEntry[];
  // The hash of the bytes the canvas page shows for this row, or null while that is not proven (seenProof.ts).
  shown(root: string, row: CanvasRow): Promise<string | null>;
  // The rows' marks moved: send the list again.
  changed(): void;
  // A failure found while the person did not ask for it, for the window to toast when it is on that project.
  problem(root: string, problem: ReadStateProblem): void;
}

export interface ReadState {
  // The entries with `unseen` and `saveFailed` from the last verdicts. Synchronous: verdicts are worked out after each
  // listing and `changed` says when they moved.
  decorate(entries: readonly FolderEntry[]): FolderEntry[];
  // The shell's list changed: works out the verdicts of each listed root that changed, and forgets roots that left.
  listed(entries: readonly FolderEntry[]): void;
  // `.doan/seen/` of the root changed on disk (a pull, a copy, another device, or this app's own write).
  recordsChanged(root: string): void;
  // `{root, path}` while the canvas page is meant to show that canvas, null when it stops. False for a bad value.
  showing(value: unknown): boolean;
  // Something the visible proof reads moved.
  documentsChanged(): void;
  // `{root, path?}`: Retry, or re-entering the project. Tries the failed writes again and reads the records again;
  // resolves to what still fails (the canvas's own failure first when `path` is given), or null. False for a bad value.
  retry(value: unknown): Promise<ReadStateProblem | null | false>;
  // Resolves once no read-state work is queued (tests).
  idle(): Promise<void>;
}

type ListEntry = Extract<FolderEntry, { kind: "list" }>;
interface Failure { kind: "save" | "id"; readOnly: boolean; hash: string }
interface Run {
  queue: Promise<void>;
  evaluateQueued: boolean;
  listedEntry?: ListEntry;
  judged: boolean;
  rows: Map<string, { verdict: Verdict | undefined; fingerprint: string | null }>;
  snapshot?: SeenSnapshot;
  problem?: ReadStateProblem | undefined;
  // An automatic initial-records write failed: no more until Retry or re-entry.
  blocked: boolean;
  writeProblem?: ReadStateProblem | undefined;
  failures: Map<string, Failure>;
}
// The canvas page's current canvas. `failed`: a write for it failed in this showing, so it is not tried again until the
// canvas is shown again or Retry. `races`: writes refused because the record changed meanwhile, bounded.
interface Intent { root: string; path: string; failed: boolean; races: number }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const readsOf = (snapshot: SeenSnapshot): SeenReads => ({
  dir: snapshot.dir, marker: snapshot.marker.read, records: new Map([...snapshot.records].map(([id, item]) => [id, item.read])),
});
const sameProblem = (a: ReadStateProblem | undefined, b: ReadStateProblem | undefined) => JSON.stringify(a) === JSON.stringify(b);
const MAX_RACES = 2;

export function createReadState(deps: ReadStateDeps): ReadState {
  const runs = new Map<string, Run>();
  let intent: Intent | null = null;
  let marking: Promise<void> | null = null;
  let markAgain = false;

  const listEntry = (root: string): ListEntry | undefined => {
    const entry = deps.entries().find(item => item.path === root);
    return entry?.kind === "list" ? entry : undefined;
  };
  const runOf = (root: string): Run => {
    let run = runs.get(root);
    if (!run) {
      run = { queue: Promise.resolve(), evaluateQueued: false, judged: false, rows: new Map(), blocked: false, failures: new Map() };
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

  // What the window shows for a row: the dot's verdict, and a failure only on a canvas still unseen. A save failure
  // describes the content that was shown; once the file holds other content, the dot is a change again.
  const marks = (run: Run, path: string): { unseen?: "new" | "changed"; saveFailed?: "save" | "id" } => {
    const state = run.rows.get(path);
    const unseen = state?.verdict === "new" || state?.verdict === "changed" ? state.verdict : undefined;
    if (!unseen) return {};
    const failure = run.failures.get(path);
    if (failure?.kind === "id" || (failure?.kind === "save" && failure.hash === state?.fingerprint)) return { unseen, saveFailed: failure.kind };
    return { unseen };
  };
  const decoration = (run: Run) => JSON.stringify([...run.rows.keys()].map(path => [path, marks(run, path)]));

  const lastOf = (run: Run, memory: RootMemory | undefined, row: SeenRow): Verdict | undefined =>
    run.rows.get(row.path)?.verdict ?? (row.id === undefined ? undefined : memory?.known[row.id]);

  const recordIds = (root: string, rows: readonly SeenRow[]) => new Set([...uniqueIds(rows), ...Object.keys(deps.local.root(root)?.baseline ?? {})]);

  // Inside the root's queue. `quiet`: the caller (Retry) answers with the outcome itself, so no toast event goes out.
  const evaluate = async (root: string, quiet: boolean): Promise<void> => {
    const entry = listEntry(root);
    const run = runs.get(root);
    if (!entry || !run) return;
    const rows: SeenRow[] = await Promise.all(entry.canvases.map(async row => ({
      path: row.path, id: row.id, mtimeMs: row.mtimeMs, fingerprint: row.error ? null : await deps.fingerprint(root, row.path),
    })));
    let snapshot = await deps.read(root, recordIds(root, rows));
    if (runs.get(root) !== run) return;
    if (!run.blocked) {
      const steps = plan(deps.local.root(root), readsOf(snapshot), rows);
      if (steps) {
        // The frozen baseline is stored before the first write, so an interruption retries the same set.
        deps.local.set(root, steps.before);
        let failed: unknown;
        for (const write of steps.writes) {
          const name = write.id === undefined ? MARKER : recordName(write.id);
          try { await deps.write(root, name, recordText(write.value), null); } catch (error) { failed = error; break; }
        }
        if (failed === undefined) {
          deps.local.set(root, steps.after);
          run.writeProblem = undefined;
        } else if (!(failed instanceof SeenWriteError && failed.code === "changed")) {
          // Another writer's record is read again by the watcher's next pass; any other failure waits for the person.
          run.blocked = true;
          run.writeProblem = { kind: "baseline", readOnly: readOnlyError(failed) };
        }
        if (steps.writes.length > 0) snapshot = await deps.read(root, recordIds(root, rows));
        if (runs.get(root) !== run) return;
      }
    }
    const memory = deps.local.root(root);
    const judgement = judge(memory, readsOf(snapshot), rows, row => lastOf(run, memory, row));
    if (memory) {
      const known = { ...memory.known };
      const ids = uniqueIds(rows);
      for (const row of rows) {
        const record = row.id !== undefined && ids.has(row.id) ? snapshot.records.get(row.id)?.read.kind : undefined;
        const verdict = judgement.verdicts.get(row.path);
        if ((record === "seen" || record === "migrated") && (verdict === "seen" || verdict === "changed")) known[row.id!] = verdict;
      }
      if (JSON.stringify(known) !== JSON.stringify(memory.known)) deps.local.set(root, { ...memory, known });
    }
    const before = run.judged ? decoration(run) : null;
    run.rows = new Map(rows.map(row => [row.path, { verdict: judgement.verdicts.get(row.path), fingerprint: row.fingerprint }]));
    run.snapshot = snapshot;
    run.judged = true;
    for (const path of [...run.failures.keys()]) if (run.rows.get(path)?.verdict === "seen") run.failures.delete(path);
    const problem = run.writeProblem ?? (judgement.problem ? { kind: judgement.problem } : undefined);
    if (!sameProblem(problem, run.problem)) {
      run.problem = problem;
      if (problem && !quiet) deps.problem(root, problem);
    }
    if (before !== decoration(run)) deps.changed();
    void tryMark();
  };

  const evaluateSoon = (root: string) => {
    const run = runOf(root);
    if (run.evaluateQueued) return;
    run.evaluateQueued = true;
    void enqueue(root, async () => {
      run.evaluateQueued = false;
      await evaluate(root, false);
    });
  };

  const storedHtml = (run: Run, row: CanvasRow, ids: Set<string>): string | undefined => {
    if (row.id === undefined || !ids.has(row.id)) return undefined;
    const record = run.snapshot?.records.get(row.id)?.read;
    return record?.kind === "seen" ? record.html : undefined;
  };

  // Records `hash` as shown for the canvas at `path`, inside the root's queue. Never replaces a record that cannot be
  // read as one, and only a still-unseen canvas carries a failure: a canvas already seen (a first registration whose
  // records could not be written, a stale screen) gets no new dot.
  const mark = async (root: string, path: string, hash: string, quiet: boolean, session: Intent | null): Promise<void> => {
    const entry = listEntry(root);
    const run = runs.get(root);
    const row = entry?.canvases.find(item => item.path === path);
    if (!entry || !run || !row) return;
    const unseen = marks(run, path).unseen !== undefined;
    const fail = (failure: Failure) => {
      if (session) session.failed = true;
      if (!unseen) return;
      const before = decoration(run);
      run.failures.set(path, failure);
      if (before !== decoration(run)) deps.changed();
      if (!quiet) deps.problem(root, failure.kind === "id" ? { kind: "id", path } : { kind: "save", path, readOnly: failure.readOnly });
    };
    const ids = uniqueIds(entry.canvases);
    if (row.id === undefined || !ids.has(row.id)) {
      if (unseen) fail({ kind: "id", readOnly: false, hash });
      return;
    }
    const fresh = (await deps.read(root, [row.id])).records.get(row.id);
    const read = fresh?.read;
    if (read?.kind === "seen" && read.html === hash) {
      run.failures.delete(path);
      await evaluate(root, quiet);
      return;
    }
    if (!fresh || fresh.bytes === undefined || !(read?.kind === "absent" || read?.kind === "seen" || read?.kind === "migrated")) {
      // A damaged or later-version record is the project's records problem, told by the evaluation.
      if (session) session.failed = true;
      await evaluate(root, quiet);
      return;
    }
    try {
      await deps.write(root, recordName(row.id), recordText({ html: hash }), fresh.bytes);
    } catch (error) {
      if (error instanceof SeenWriteError && error.code === "changed" && session && session.races < MAX_RACES) {
        // Another writer got there first: judge from what it wrote, then the next pass decides again.
        session.races++;
        await evaluate(root, quiet);
        return;
      }
      fail({ kind: "save", readOnly: readOnlyError(error), hash });
      return;
    }
    run.failures.delete(path);
    await evaluate(root, quiet);
  };

  const markOnce = async (): Promise<void> => {
    const current = intent;
    if (!current || current.failed) return;
    const entry = listEntry(current.root);
    const run = runs.get(current.root);
    const row = entry?.canvases.find(item => item.path === current.path);
    if (!entry || !run?.judged || !row) return;
    const hash = await deps.shown(current.root, row);
    if (!hash || intent !== current || current.failed) return;
    if (storedHtml(run, row, uniqueIds(entry.canvases)) === hash) return;
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
        } while (markAgain);
      } finally {
        marking = null;
      }
    })();
    return marking;
  }

  const forget = (root: string) => {
    runs.delete(root);
    if (intent?.root === root) intent = null;
  };

  const relevant = (run: Run, path: string | undefined): ReadStateProblem | null => {
    const visible = (at: string): ReadStateProblem | null => {
      const failure = run.failures.get(at);
      const shown = marks(run, at).saveFailed;
      if (!failure || !shown) return null;
      return failure.kind === "id" ? { kind: "id", path: at } : { kind: "save", path: at, readOnly: failure.readOnly };
    };
    if (path !== undefined) {
      const own = visible(path);
      if (own) return own;
    }
    if (run.problem) return run.problem;
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
          const mark = marks(run, row.path);
          if (!mark.unseen) return row;
          touched = true;
          return { ...row, ...mark };
        });
        return touched ? { ...entry, canvases } : entry;
      });
    },
    listed(entries) {
      const registered = new Set(entries.map(entry => entry.path));
      for (const root of [...runs.keys()]) if (!registered.has(root)) forget(root);
      // A root that leaves the list leaves its device-local memory; its shared records stay in the project.
      for (const root of deps.local.roots()) if (!registered.has(root)) deps.local.set(root, undefined);
      for (const entry of entries) {
        if (entry.kind !== "list") continue;
        const run = runOf(entry.path);
        if (run.listedEntry === entry) continue;
        run.listedEntry = entry;
        evaluateSoon(entry.path);
      }
    },
    recordsChanged(root) {
      if (listEntry(root)) evaluateSoon(root);
    },
    showing(value) {
      if (value === null) {
        intent = null;
        return true;
      }
      if (!isObject(value) || typeof value.root !== "string" || typeof value.path !== "string" || Object.keys(value).length !== 2) return false;
      const { root, path } = value;
      if (!deps.entries().some(entry => entry.path === root)) return false;
      if (intent?.root === root && intent.path === path) return true;
      intent = { root, path, failed: false, races: 0 };
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
      run.blocked = false;
      run.writeProblem = undefined;
      await enqueue(root, async () => {
        for (const [at, failure] of [...run.failures]) await mark(root, at, failure.hash, true, null);
        await evaluate(root, true);
      });
      if (intent?.root === root && !run.failures.has(intent.path)) {
        intent.failed = false;
        intent.races = 0;
      }
      void tryMark();
      return relevant(run, path);
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
