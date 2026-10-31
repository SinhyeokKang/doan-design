import { afterEach, expect, inject, test, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
vi.mock("./mkdir", () => ({ createCommentDirectory: () => { throw new Error("Precreated test directories only"); } }));
import { readCommentBytes, withCommentAppend } from "./files";
import { createCommentsService, type CommentIdentity } from "./service";
import { readFolder } from "../cli";
import { authorizeCanvas } from "./identity";
import { readAuthor } from "./author";
const cli = inject("doanCli");
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
test("app events round trip through the real Go reader and agent resolve, preserving LF and width-only CRUD", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "doan-roundtrip-"))); roots.push(root);
  await mkdir(join(root, ".doan/comments"), { recursive: true }); await mkdir(join(root, ".doan/canvases"));
  await writeFile(join(root, ".doan/config.json"), '{"v":1}');
  const html = '<meta name="doan:canvas" content="a"><meta name="doan:width" content="100"><main>Test</main>';
  await writeFile(join(root, ".doan/canvases/a.html"), html);
  const config = join(root, "git-config"); await writeFile(config, '[user]\n name = Human\n');
  const identity: CommentIdentity = { root, path: ".doan/canvases/a.html", canvas: "a" };
  const service = createCommentsService({
    authorize: async identity => ({ ...authorizeCanvas(identity, await readFolder(cli, root)), url: "url" }), epoch: () => 1,
    currentHash: async () => "sha256:" + "a".repeat(64),
    author: root => readAuthor(root, { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: "1" }),
    read: readCommentBytes, append: withCommentAppend,
    document: async () => ({ generation: "loader", hash: "sha256:" + "a".repeat(64), target: {} }),
    validateDocument: async () => true, clipboard: () => {}, invalidated: () => {},
  });
  const origin = await service.begin("window", { ...identity, requestID: "begin", scope: "canvas" });
  if (!origin.ok) throw new Error(origin.error);
  const payload = { ...identity, project: 1, requestID: "create", origin: origin.value.origin, intent: { type: "create", body: "한글, quotes \" and $(literal)" } };
  expect(await service.mutate("window", payload)).toMatchObject({ ok: true, value: { state: "saved" } });
  const go = JSON.parse(execFileSync(cli, ["comments", "--json", "--repo", root], { encoding: "utf8" }));
  expect(go.result.comments).toHaveLength(1);
  const id = go.result.comments[0].comment;
  const file = join(root, ".doan/comments/a.jsonl");
  await writeFile(file, (await readFile(file, "utf8")).trimEnd());
  execFileSync(cli, ["comment", "resolve", id, "--agent", "test-agent", "--repo", root]);
  const list = await service.list("window", { ...identity, requestID: "list" });
  if (!list.ok) throw new Error(list.error);
  expect(list.value.comments[0]).toMatchObject({ comment: id, status: "resolved", resolvedBy: { kind: "agent", name: "test-agent" } });
  const comment = list.value.comments[0]; if (!comment) throw new Error("missing comment");
  await writeFile(join(root, ".doan/canvases/a.html"), html.replace('content="100"', 'content="invalid"'));
  await writeFile(file, (await readFile(file, "utf8")).trimEnd());
  const expected = { body: comment.body, status: comment.status, updatedAt: comment.updatedAt, resolvedAt: comment.resolvedAt };
  expect(await service.mutate("window", { ...identity, project: 1, requestID: "reopen", intent: { type: "reopen", comment: id, expected } })).toMatchObject({ ok: true, value: { state: "saved" } });
  expect(await service.begin("window", { ...identity, requestID: "bad-width", scope: "canvas" })).toMatchObject({ ok: false });
  expect(await service.copy("window", { ...identity, requestID: "copy", scope: { comments: [id] } })).toMatchObject({ ok: true });
  expect(JSON.parse(execFileSync(cli, ["comments", "--json", "--repo", root], { encoding: "utf8" })).result.comments).toHaveLength(1);
  expect((await readFile(file, "utf8")).split("\n").filter(Boolean)).toHaveLength(3);
});
