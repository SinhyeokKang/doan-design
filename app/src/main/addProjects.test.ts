import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test, vi } from "vitest";
import { createAddFlow, droppedPaths, gitChildren, type AddFlowDeps, type ScanSnapshot } from "./addProjects";
import type { LsTarget } from "./cli";
import type { FolderState } from "./folderState";

const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-add-test-")));
let count = 0;
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function dir(parent = tmp, name = `d${count++}`): string {
  const path = join(parent, name);
  mkdirSync(path, { recursive: true });
  return path;
}

function gitDir(parent: string, name: string, kind: "dir" | "file" = "dir"): string {
  const path = dir(parent, name);
  if (kind === "dir") mkdirSync(join(path, ".git"));
  else writeFileSync(join(path, ".git"), "gitdir: /elsewhere/.git/worktrees/x\n");
  return path;
}

const list = (root: string, git?: { common: string; worktrees: string[]; main?: string }): FolderState =>
  ({ kind: "list", root, scope: [], canvases: [], ...(git ? { git } : {}) }) as FolderState;
const notSetUp: FolderState = { kind: "uninitialized" };

interface Fake {
  deps: AddFlowDeps;
  saved: string[];
  calls: { target: LsTarget; signal?: AbortSignal | undefined }[];
  snapshots: ScanSnapshot[];
}

// `answers` is keyed by the folder a run is about (cwd or --repo); a folder
// without an answer is not a repo.
function fake(answers: Record<string, FolderState | (() => Promise<FolderState>)>, saved: string[] = []): Fake {
  const calls: Fake["calls"] = [];
  const snapshots: ScanSnapshot[] = [];
  const deps: AddFlowDeps = {
    async ls(target, signal) {
      calls.push({ target, signal });
      const answer = answers["repo" in target ? target.repo : target.cwd];
      if (typeof answer === "function") return answer();
      return answer ?? notSetUp;
    },
    saved: () => [...saved],
    async store(paths) {
      const added = paths.filter((path, index) => !saved.includes(path) && paths.indexOf(path) === index);
      saved.push(...added);
      return added;
    },
    progress: (snapshot) => snapshots.push(snapshot),
  };
  return { deps, saved, calls, snapshots };
}

async function finished(flow: ReturnType<typeof createAddFlow>, scanId: string | null): Promise<ScanSnapshot> {
  if (scanId === null) throw new Error("no scan");
  await vi.waitFor(() => expect(flow.scan(scanId)?.done).toBe(true));
  const snapshot = flow.scan(scanId);
  if (!snapshot) throw new Error("scan vanished");
  return snapshot;
}

describe("droppedPaths", () => {
  test("accepts up to 32 absolute paths", () => {
    const paths = Array.from({ length: 32 }, (_, i) => `/p/${i}`);
    expect(droppedPaths({ paths })).toEqual(paths);
    expect(droppedPaths({ paths: ["/a/" + "x".repeat(4093)] })).toEqual(["/a/" + "x".repeat(4093)]);
  });

  test.each<[string, unknown]>([
    ["33 paths", { paths: Array.from({ length: 33 }, (_, i) => `/p/${i}`) }],
    ["no paths", { paths: [] }],
    ["a relative path", { paths: ["/a", "repo"] }],
    ["a dot path", { paths: ["./repo"] }],
    ["an empty string", { paths: [""] }],
    ["a non-string", { paths: ["/a", 1] }],
    ["a path over 4096 characters", { paths: ["/" + "x".repeat(4096)] }],
    ["a bare array", ["/a"]],
    ["an extra key", { paths: ["/a"], more: 1 }],
    ["null", null],
  ])("refuses %s", (_label, value) => {
    expect(droppedPaths(value)).toBeNull();
  });
});

describe("gitChildren", () => {
  test("lists visible child directories with a .git entry, by name, without following links", async () => {
    const parent = dir();
    gitDir(parent, "beta", "file");
    const alpha = gitDir(parent, "alpha");
    gitDir(parent, ".hidden");
    dir(parent, "plain");
    writeFileSync(join(parent, "file.txt"), "x");
    symlinkSync(alpha, join(parent, "link"));
    symlinkSync(join(tmp, "nowhere"), join(parent, "broken"));
    expect(await gitChildren(parent)).toEqual([join(parent, "alpha"), join(parent, "beta")]);
  });

  test("looks at only the first 200 child directories by name", async () => {
    const parent = dir();
    for (let i = 0; i < 205; i++) gitDir(parent, `r${String(i).padStart(3, "0")}`);
    const children = await gitChildren(parent);
    expect(children).toHaveLength(200);
    expect(children?.at(-1)).toBe(join(parent, "r199"));
  });

  test("a folder that cannot be listed has no answer rather than no children", async () => {
    expect(await gitChildren(join(tmp, "missing"))).toBeNull();
  });
});

// chmod does not restrict root, so these cannot fail where tests run as root.
describe.skipIf(process.getuid?.() === 0)("adding a folder that cannot be read", () => {
  const unreadable = async (mode: number, setUp: (parent: string) => void, check: (parent: string) => Promise<void>) => {
    const parent = dir();
    setUp(parent);
    chmodSync(parent, mode);
    try {
      await check(parent);
    } finally {
      chmodSync(parent, 0o755);
    }
  };

  // A failed read says nothing about what the folder holds, so it must not
  // lead to the "isn't a repository, set it up?" confirmation (P4).
  test.each([
    ["can be searched but not listed", 0o111],
    ["can be listed but not searched", 0o444],
  ])("a folder that %s is reported, not offered for set-up", async (_label, mode) => {
    await unreadable(mode, (parent) => gitDir(parent, "repo"), async (parent) => {
      const flow = createAddFlow(fake({}).deps);
      expect(await flow.add([parent])).toEqual({
        added: [], duplicate: null, messages: [`Couldn’t read ${parent.split("/").at(-1)}.`], scanId: null, confirms: [],
      });
    });
  });

  test("a folder whose only child cannot be read is reported, not offered for set-up", async () => {
    const parent = dir();
    const child = dir(parent, "locked");
    chmodSync(child, 0o000);
    try {
      const flow = createAddFlow(fake({}).deps);
      const outcome = await flow.add([parent]);
      expect(outcome.confirms).toEqual([]);
      expect(outcome.messages).toEqual([`Couldn’t read ${parent.split("/").at(-1)}.`]);
    } finally {
      chmodSync(child, 0o755);
    }
  });

  test("a child that cannot be read does not hide the repos next to it", async () => {
    const parent = dir();
    const repo = gitDir(parent, "repo");
    const child = dir(parent, "locked");
    chmodSync(child, 0o000);
    try {
      const flow = createAddFlow(fake({ [repo]: list(repo) }).deps);
      const { scanId, messages, confirms } = await flow.add([parent]);
      expect({ messages, confirms }).toEqual({ messages: [], confirms: [] });
      expect((await finished(flow, scanId)).items.map((item) => item.path)).toEqual([repo]);
    } finally {
      chmodSync(child, 0o755);
    }
  });
});

describe("adding picked folders", () => {
  test("a doan repo or its subfolder is stored by the root the CLI reports", async () => {
    const root = dir();
    const sub = dir(root, "design");
    const { deps, saved } = fake({ [root]: list(root), [sub]: list(root) });
    const flow = createAddFlow(deps);
    expect(await flow.add([sub])).toEqual({ added: [root], duplicate: null, messages: [], scanId: null, confirms: [] });
    expect(saved).toEqual([root]);
  });

  test("an already stored root is not stored again and is reported for highlighting", async () => {
    const root = dir();
    const { deps, saved } = fake({ [root]: list(root) }, [root]);
    const flow = createAddFlow(deps);
    expect(await flow.add([root])).toMatchObject({ added: [], duplicate: root });
    expect(saved).toEqual([root]);
  });

  test("the same repo picked twice in one request is stored once", async () => {
    const root = dir();
    const sub = dir(root, "design");
    const { deps, saved } = fake({ [root]: list(root), [sub]: list(root) });
    expect(await createAddFlow(deps).add([root, sub])).toMatchObject({ added: [root], duplicate: root });
    expect(saved).toEqual([root]);
  });

  test("overlapping requests run one after another, so a repo is stored once", async () => {
    const root = dir();
    const { deps, saved } = fake({ [root]: list(root) });
    const store = deps.store;
    deps.store = async (paths) => { await new Promise((resolve) => setTimeout(resolve, 20)); return store(paths); };
    const flow = createAddFlow(deps);
    const [first, second] = await Promise.all([flow.add([root]), flow.add([root])]);
    expect(first).toMatchObject({ added: [root], duplicate: null });
    expect(second).toMatchObject({ added: [], duplicate: root });
    expect(saved).toEqual([root]);
  });

  test("files and missing paths are dropped, with a message when nothing is left", async () => {
    const file = join(dir(), "a.txt");
    writeFileSync(file, "x");
    const { deps, saved, calls } = fake({});
    expect(await createAddFlow(deps).add([file, join(tmp, "gone")])).toEqual({ added: [], duplicate: null, messages: ["Only folders can be added."], scanId: null, confirms: [] });
    expect(saved).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("a dropped file next to a folder is ignored without a message", async () => {
    const root = dir();
    const file = join(dir(), "a.txt");
    writeFileSync(file, "x");
    const { deps } = fake({ [root]: list(root) });
    expect(await createAddFlow(deps).add([file, root])).toMatchObject({ added: [root], messages: [] });
  });

  test("a folder that is a git repo but not set up is stored as not set up", async () => {
    const repo = gitDir(dir(), "repo", "file");
    const { deps, saved } = fake({});
    expect(await createAddFlow(deps).add([repo])).toMatchObject({ added: [repo], scanId: null, confirms: [] });
    expect(saved).toEqual([repo]);
  });

  test("a folder the CLI refuses keeps the existing message", async () => {
    const broken = dir(dir(), "design");
    const { deps, saved } = fake({});
    // Run inside a broken repo's subfolder: `ls` fails, and `--repo` says it is no root.
    deps.ls = async (target) => ("cwd" in target ? { kind: "error", message: "bad config" } : notSetUp);
    expect(await createAddFlow(deps).add([broken])).toMatchObject({ added: [], messages: ["bad config"] });
    expect(saved).toEqual([]);
  });

  test("a folder that is neither a repo nor holds one asks to confirm, and only the confirm stores it", async () => {
    const plain = dir();
    const { deps, saved } = fake({});
    const flow = createAddFlow(deps);
    const outcome = await flow.add([plain]);
    expect(outcome).toMatchObject({ added: [], scanId: null, confirms: [{ confirmId: expect.any(String), path: plain, name: plain.split("/").at(-1) }] });
    expect(saved).toEqual([]);
    const confirmId = outcome.confirms[0]?.confirmId;
    expect(await flow.confirm({ confirmId: "forged" })).toEqual({ kind: "unavailable" });
    expect(await flow.confirm({ confirmId, extra: 1 })).toEqual({ kind: "unavailable" });
    expect(saved).toEqual([]);
    expect(await flow.confirm({ confirmId })).toEqual({ kind: "added", added: [plain] });
    expect(saved).toEqual([plain]);
    // One use only.
    expect(await flow.confirm({ confirmId })).toEqual({ kind: "unavailable" });
  });

  test("a new add discards confirmations from the previous one", async () => {
    const plain = dir();
    const { deps, saved } = fake({});
    const flow = createAddFlow(deps);
    const confirmId = (await flow.add([plain])).confirms[0]?.confirmId;
    await flow.add([dir()]);
    expect(await flow.confirm({ confirmId })).toEqual({ kind: "unavailable" });
    expect(saved).toEqual([]);
  });

  test("a stored repo with worktrees not yet stored opens the checklist with those worktrees only", async () => {
    const root = dir();
    const tree = dir();
    const stored = dir();
    const { deps, saved } = fake({ [root]: list(root, { common: `${root}/.git`, main: root, worktrees: [root, tree, stored] }) }, [stored]);
    const flow = createAddFlow(deps);
    const outcome = await flow.add([root]);
    expect(outcome).toMatchObject({ added: [root], scanId: expect.any(String) });
    expect(saved).toEqual([stored, root]);
    const snapshot = await finished(flow, outcome.scanId);
    expect(snapshot).toMatchObject({ total: 0, finished: 0, done: true, sources: [] });
    expect(snapshot.items).toEqual([
      { id: expect.any(String), path: root, name: root.split("/").at(-1), status: "added", checked: false, disabled: true, canvasCount: null,
        worktrees: [{ id: expect.any(String), path: tree, name: tree.split("/").at(-1), checked: false }] },
    ]);
  });
});

describe("scanning a folder of repos", () => {
  function layout() {
    const parent = dir();
    const alpha = gitDir(parent, "alpha");
    const beta = gitDir(parent, "beta", "file");
    const gamma = gitDir(parent, "gamma");
    // On disk gamma looks set up; only the CLI's answer counts.
    mkdirSync(join(gamma, ".doan"));
    writeFileSync(join(gamma, ".doan", "config.json"), '{"v":1}');
    const delta = gitDir(parent, "delta");
    const epsilon = gitDir(parent, "epsilon");
    const zeta = gitDir(parent, "zeta");
    // A child with no .git, set up per the CLI, is not a candidate at all.
    const plain = dir(parent, "plain");
    const outside = dir();
    return { parent, alpha, beta, gamma, delta, epsilon, zeta, plain, outside };
  }

  test("the parent is never stored and doan status comes only from the CLI", async () => {
    const l = layout();
    const { deps, saved, calls } = fake({
      [l.alpha]: list(l.alpha, { common: `${l.alpha}/.git`, main: l.alpha, worktrees: [l.alpha, l.outside, l.zeta] }),
      [l.beta]: notSetUp,
      [l.gamma]: notSetUp,
      [l.delta]: { kind: "cliError", reason: "timed out after 10 s" },
      [l.epsilon]: { kind: "error", message: "bad config" },
      [l.zeta]: list(l.zeta),
      [l.plain]: list(l.plain),
    }, [l.zeta]);
    const flow = createAddFlow(deps);
    const outcome = await flow.add([l.parent]);
    expect(outcome).toEqual({ added: [], duplicate: null, messages: [], scanId: expect.any(String), confirms: [] });
    const snapshot = await finished(flow, outcome.scanId);
    expect(saved).toEqual([l.zeta]);
    expect(snapshot).toMatchObject({ total: 6, finished: 6, done: true });
    expect(snapshot.items.map(({ path, status, checked, disabled }) => ({ path, status, checked, disabled }))).toEqual([
      { path: l.alpha, status: "ready", checked: true, disabled: false },
      { path: l.beta, status: "notSetUp", checked: false, disabled: false },
      { path: l.delta, status: "unreadable", checked: false, disabled: true },
      { path: l.epsilon, status: "unreadable", checked: false, disabled: true },
      { path: l.gamma, status: "notSetUp", checked: false, disabled: false },
      { path: l.zeta, status: "added", checked: false, disabled: true },
    ]);
    // The worktree outside the parent is offered under its repo, unchecked; a
    // stored worktree is not.
    expect(snapshot.items[0]?.worktrees).toEqual([{ id: expect.any(String), path: l.outside, name: l.outside.split("/").at(-1), checked: false }]);
    const checkedIds = snapshot.items.flatMap((item) => [item, ...item.worktrees]).filter((item) => item.checked).map((item) => item.id);
    expect(checkedIds).toEqual([snapshot.items[0]?.id]);
    expect(calls.filter((call) => "repo" in call.target).map((call) => "repo" in call.target && call.target.repo).sort())
      .toEqual([l.alpha, l.beta, l.delta, l.epsilon, l.gamma, l.zeta].sort());
  });

  test("names the picked folders and counts the canvases of each ready repo", async () => {
    const first = dir();
    const alpha = gitDir(first, "alpha");
    const second = dir();
    const beta = gitDir(second, "beta");
    const repo = dir();
    const tree = dir();
    const { deps } = fake({
      [alpha]: { ...list(alpha), canvases: [{}, {}, {}] } as FolderState,
      [repo]: list(repo, { common: `${repo}/.git`, main: repo, worktrees: [repo, tree] }),
    });
    const flow = createAddFlow(deps);
    const { scanId } = await flow.add([first, repo, second, first]);
    const name = (path: string) => path.split("/").at(-1);
    const snapshot = await finished(flow, scanId);
    // Only the folders whose children were scanned; the repo stored outright
    // is its own row.
    expect(snapshot.sources).toEqual([{ name: name(first), path: first }, { name: name(second), path: second }]);
    expect(snapshot.items.map(({ path, status, canvasCount }) => ({ path, status, canvasCount }))).toEqual([
      { path: repo, status: "added", canvasCount: null },
      { path: alpha, status: "ready", canvasCount: 3 },
      { path: beta, status: "notSetUp", canvasCount: null },
    ]);
  });

  test("a child with no answer or a timeout reads as unreadable", async () => {
    const parent = dir();
    const child = gitDir(parent, "child");
    const { deps } = fake({ [child]: { kind: "cliError", reason: "timed out after 10 s" } });
    const flow = createAddFlow(deps);
    const snapshot = await finished(flow, (await flow.add([parent])).scanId);
    expect(snapshot.items[0]).toMatchObject({ path: child, status: "unreadable", disabled: true });
  });

  test("progress shows unread children as checking, at most four runs at once", async () => {
    const parent = dir();
    const children = Array.from({ length: 9 }, (_, i) => gitDir(parent, `c${i}`));
    let running = 0;
    let most = 0;
    const releases: (() => void)[] = [];
    const answers = Object.fromEntries(children.map((child) => [child, () => {
      running++;
      most = Math.max(most, running);
      return new Promise<FolderState>((resolve) => releases.push(() => { running--; resolve(list(child)); }));
    }]));
    const { deps, snapshots } = fake(answers);
    const flow = createAddFlow(deps);
    const { scanId } = await flow.add([parent]);
    if (scanId === null) throw new Error("no scan");
    await vi.waitFor(() => expect(releases).toHaveLength(4));
    const first = flow.scan(scanId);
    expect(first).toMatchObject({ finished: 0, total: 9, done: false });
    expect(first?.items.every((item) => item.status === "checking" && item.disabled && !item.checked)).toBe(true);
    while (releases.length > 0) {
      releases.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const done = await finished(flow, scanId);
    expect(most).toBe(4);
    expect(done.items.every((item) => item.status === "ready")).toBe(true);
    // Every snapshot goes out with a growing sequence number, ending done.
    const seqs = snapshots.map((snapshot) => snapshot.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(snapshots.at(-1)).toMatchObject({ done: true, finished: 9 });
    // Ids stay the same from snapshot to snapshot.
    expect(done.items.map((item) => item.id)).toEqual(first?.items.map((item) => item.id));
  });

  test("cancel ends the running runs, starts no more and forgets the scan", async () => {
    const parent = dir();
    const children = Array.from({ length: 8 }, (_, i) => gitDir(parent, `c${i}`));
    const { deps, calls } = fake(Object.fromEntries(children.map((child) => [child, () => new Promise<FolderState>(() => {})])));
    const flow = createAddFlow(deps);
    const { scanId } = await flow.add([parent]);
    await vi.waitFor(() => expect(calls.filter((call) => "repo" in call.target)).toHaveLength(4));
    flow.cancel(scanId);
    const scanRuns = calls.filter((call) => "repo" in call.target);
    expect(scanRuns.every((call) => call.signal?.aborted)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls.filter((call) => "repo" in call.target)).toHaveLength(4);
    expect(flow.scan(scanId)).toBeNull();
    expect(await flow.addCandidates({ scanId, ids: [] })).toEqual({ kind: "unavailable" });
  });

  test("adds only issued, selectable ids once the scan is done", async () => {
    const l = layout();
    const { deps, saved } = fake({
      [l.alpha]: list(l.alpha, { common: `${l.alpha}/.git`, worktrees: [l.alpha, l.outside] }),
      [l.beta]: notSetUp,
      [l.delta]: { kind: "cliError", reason: "x" },
      [l.zeta]: list(l.zeta),
    }, [l.zeta]);
    const flow = createAddFlow(deps);
    const { scanId } = await flow.add([l.parent]);
    const snapshot = await finished(flow, scanId);
    const byPath = (path: string) => snapshot.items.find((item) => item.path === path);
    const alpha = byPath(l.alpha);
    const beta = byPath(l.beta);
    const tree = alpha?.worktrees[0];
    if (!alpha || !beta || !tree) throw new Error("missing candidates");
    for (const ids of [["forged"], [alpha.id, "forged"], [byPath(l.delta)?.id], [byPath(l.zeta)?.id], "x", [1]]) {
      expect(await flow.addCandidates({ scanId, ids }), JSON.stringify(ids)).toEqual({ kind: "unavailable" });
    }
    expect(await flow.addCandidates({ scanId: "forged", ids: [alpha.id] })).toEqual({ kind: "unavailable" });
    expect(await flow.addCandidates({ scanId, ids: [alpha.id], more: 1 })).toEqual({ kind: "unavailable" });
    expect(saved).toEqual([l.zeta]);
    expect(await flow.addCandidates({ scanId, ids: [alpha.id, tree.id, beta.id] })).toEqual({ kind: "added", added: [l.alpha, l.outside, l.beta] });
    expect(saved).toEqual([l.zeta, l.alpha, l.outside, l.beta]);
    expect(await flow.addCandidates({ scanId, ids: [alpha.id] })).toEqual({ kind: "unavailable" });
  });

  test("ids are refused while the scan is still running", async () => {
    const parent = dir();
    const child = gitDir(parent, "child");
    let release = () => {};
    const { deps, saved } = fake({ [child]: () => new Promise<FolderState>((resolve) => { release = () => resolve(list(child)); }) });
    const flow = createAddFlow(deps);
    const { scanId } = await flow.add([parent]);
    if (scanId === null) throw new Error("no scan");
    const id = flow.scan(scanId)?.items[0]?.id;
    expect(await flow.addCandidates({ scanId, ids: [id] })).toEqual({ kind: "unavailable" });
    release();
    await finished(flow, scanId);
    expect(await flow.addCandidates({ scanId, ids: [id] })).toEqual({ kind: "added", added: [child] });
    expect(saved).toEqual([child]);
  });

  test("a new add cancels the running scan", async () => {
    const parent = dir();
    gitDir(parent, "child");
    const { deps, calls } = fake({ [join(parent, "child")]: () => new Promise<FolderState>(() => {}) });
    const flow = createAddFlow(deps);
    const { scanId } = await flow.add([parent]);
    await vi.waitFor(() => expect(calls.some((call) => "repo" in call.target)).toBe(true));
    await flow.add([join(tmp, "gone")]);
    expect(calls.find((call) => "repo" in call.target)?.signal?.aborted).toBe(true);
    expect(flow.scan(scanId)).toBeNull();
  });
});

describe("judging a located folder", () => {
  test("stores a doan repo by its root or a git folder as picked", async () => {
    const root = dir();
    const repo = gitDir(dir(), "repo");
    const { deps } = fake({ [join(root, "design")]: list(root) });
    mkdirSync(join(root, "design"));
    const flow = createAddFlow(deps);
    expect(await flow.judge(join(root, "design"))).toEqual({ root });
    expect(await flow.judge(repo)).toEqual({ root: repo });
  });

  test("refuses a file, a missing folder and a folder that is not a repo", async () => {
    const file = join(dir(), "a.txt");
    writeFileSync(file, "x");
    const plain = dir();
    gitDir(plain, "child");
    const { deps } = fake({});
    deps.ls = async (target) => ("cwd" in target && target.cwd === join(tmp, "broken") ? { kind: "error", message: "bad config" } : notSetUp);
    const flow = createAddFlow(deps);
    expect(await flow.judge(file)).toEqual({ refused: "Only folders can be added." });
    expect(await flow.judge(join(tmp, "gone"))).toEqual({ refused: "Only folders can be added." });
    expect(await flow.judge(plain)).toEqual({ refused: `${plain.split("/").at(-1)} isn’t a doan project or a git repository.` });
    mkdirSync(join(tmp, "broken"));
    expect(await flow.judge(join(tmp, "broken"))).toEqual({ refused: "bad config" });
  });
});
