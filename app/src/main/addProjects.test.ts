import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test, vi } from "vitest";
import { createAddFlow, gitChildren, type AddFlowDeps } from "./addProjects";
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
  calls: { target: LsTarget }[];
}

// `answers` is keyed by the folder a run is about (cwd or --repo); a folder
// without an answer is not a repo.
function fake(answers: Record<string, FolderState | (() => Promise<FolderState>)>, saved: string[] = []): Fake {
  const calls: Fake["calls"] = [];
  const deps: AddFlowDeps = {
    async ls(target) {
      calls.push({ target });
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
  };
  return { deps, saved, calls };
}

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
      expect(await flow.add(parent)).toEqual({
        added: [], duplicate: null, messages: [`Couldn’t read ${parent.split("/").at(-1)}.`], confirm: null,
      });
    });
  });

  test("a folder whose only child cannot be read is reported, not offered for set-up", async () => {
    const parent = dir();
    const child = dir(parent, "locked");
    chmodSync(child, 0o000);
    try {
      const flow = createAddFlow(fake({}).deps);
      const outcome = await flow.add(parent);
      expect(outcome.confirm).toBeNull();
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
      expect(await gitChildren(parent)).toEqual([repo]);
      const outcome = await flow.add(parent);
      expect(outcome.confirm).toBeNull();
      expect(outcome.messages).toEqual(["Choose one of the repositories inside this folder."]);
    } finally {
      chmodSync(child, 0o755);
    }
  });
});

describe("adding picked folders", () => {
  test("registers one path without a worktree checklist", async () => {
    const root = dir();
    const tree = dir();
    const { deps, saved, calls } = fake({ [root]: list(root, { common: `${root}/.git`, worktrees: [root, tree] }) });
    const outcome = await createAddFlow(deps).add(root);
    expect(outcome).toEqual({ added: [root], duplicate: null, messages: [], confirm: null });
    expect(saved).toEqual([root]);
    expect(calls.map(call => call.target)).toEqual([{ cwd: root }]);
  });

  test("a parent holding repositories is refused without reading or registering its children", async () => {
    const parent = dir();
    const child = gitDir(parent, "child");
    const { deps, saved, calls } = fake({ [child]: list(child) });
    const outcome = await createAddFlow(deps).add(parent);
    expect(outcome).toEqual({ added: [], duplicate: null, messages: ["Choose one of the repositories inside this folder."], confirm: null });
    expect(saved).toEqual([]);
    expect(calls.map(call => call.target)).toEqual([{ cwd: parent }]);
  });

  test("registers a single symlink by its canonical root", async () => {
    const root = dir();
    const link = join(dir(), "alias");
    symlinkSync(root, link);
    const { deps, saved, calls } = fake({ [root]: list(root) });
    expect(await createAddFlow(deps).add(link)).toEqual({ added: [root], duplicate: null, messages: [], confirm: null });
    expect(saved).toEqual([root]);
    expect(calls.map(call => call.target)).toEqual([{ cwd: root }]);
  });

  test("a doan repo or its subfolder is stored by the root the CLI reports", async () => {
    const root = dir();
    const sub = dir(root, ".doan/canvases");
    const { deps, saved } = fake({ [root]: list(root), [sub]: list(root) });
    const flow = createAddFlow(deps);
    expect(await flow.add(sub)).toEqual({ added: [root], duplicate: null, messages: [], confirm: null });
    expect(saved).toEqual([root]);
  });

  test("an already stored root is not stored again and is reported for highlighting", async () => {
    const root = dir();
    const { deps, saved } = fake({ [root]: list(root) }, [root]);
    const flow = createAddFlow(deps);
    expect(await flow.add(root)).toMatchObject({ added: [], duplicate: root });
    expect(saved).toEqual([root]);
  });

  test("overlapping requests run one after another, so a repo is stored once", async () => {
    const root = dir();
    const { deps, saved } = fake({ [root]: list(root) });
    const store = deps.store;
    deps.store = async (paths) => { await new Promise((resolve) => setTimeout(resolve, 20)); return store(paths); };
    const flow = createAddFlow(deps);
    const [first, second] = await Promise.all([flow.add(root), flow.add(root)]);
    expect(first).toMatchObject({ added: [root], duplicate: null });
    expect(second).toMatchObject({ added: [], duplicate: root });
    expect(saved).toEqual([root]);
  });

  test("files and missing paths are refused without reading or storing them", async () => {
    const file = join(dir(), "a.txt");
    writeFileSync(file, "x");
    const { deps, saved, calls } = fake({});
    for (const path of [file, join(tmp, "gone")]) {
      expect(await createAddFlow(deps).add(path)).toEqual({ added: [], duplicate: null, messages: ["Only folders can be added."], confirm: null });
    }
    expect(saved).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("a folder that is a git repo but not set up is stored as not set up", async () => {
    const repo = gitDir(dir(), "repo", "file");
    const { deps, saved } = fake({});
    expect(await createAddFlow(deps).add(repo)).toMatchObject({ added: [repo], confirm: null });
    expect(saved).toEqual([repo]);
  });

  test("a folder the CLI refuses keeps the existing message", async () => {
    const broken = dir(dir(), ".doan/canvases");
    const { deps, saved } = fake({});
    // Run inside a broken repo's subfolder: `ls` fails, and `--repo` says it is no root.
    deps.ls = async (target) => ("cwd" in target ? { kind: "error", message: "bad config" } : notSetUp);
    expect(await createAddFlow(deps).add(broken)).toMatchObject({ added: [], messages: ["bad config"] });
    expect(saved).toEqual([]);
  });

  test("a folder that is neither a repo nor holds one asks to confirm, and only the confirm stores it", async () => {
    const plain = dir();
    const { deps, saved } = fake({});
    const flow = createAddFlow(deps);
    const outcome = await flow.add(plain);
    expect(outcome).toMatchObject({ added: [], confirm: { confirmId: expect.any(String), path: plain } });
    expect(saved).toEqual([]);
    const confirmId = outcome.confirm?.confirmId;
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
    const confirmId = (await flow.add(plain)).confirm?.confirmId;
    await flow.add(dir());
    expect(await flow.confirm({ confirmId })).toEqual({ kind: "unavailable" });
    expect(saved).toEqual([]);
  });
});

describe("judging a located folder", () => {
  test("stores a doan repo by its root or a git folder as picked", async () => {
    const root = dir();
    const repo = gitDir(dir(), "repo");
    const { deps } = fake({ [join(root, ".doan/canvases")]: list(root) });
    mkdirSync(join(root, ".doan/canvases"), { recursive: true });
    const flow = createAddFlow(deps);
    expect(await flow.judge(join(root, ".doan/canvases"))).toEqual({ root });
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
    expect(await flow.judge(plain)).toEqual({ refused: `${plain.split("/").at(-1)} isn’t the current project folder. Choose the folder where this project is now located.` });
    mkdirSync(join(tmp, "broken"));
    expect(await flow.judge(join(tmp, "broken"))).toEqual({ refused: "bad config" });
  });
});
