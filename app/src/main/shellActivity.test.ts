import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "./conversation/store";
import { parseActivityRoots, readShellActivity } from "./shellActivity";
const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture() {
  const path = mkdtempSync(join(tmpdir(), "shell-activity-")); directories.push(path);
  const store = new ConversationStore(path);
  store.save([{ conversationId: "one", root: "/a", title: "test", state: "archived", owner: { kind: "legacy-external" }, session: { runtime: "codex", origin: "newDesign", sessionId: "session", cwd: "/a", configDir: "/config" } }]);
  return { path, store };
}
it("accepts only a dense unique subset of registered roots", () => {
  expect(parseActivityRoots({ roots: ["/a"] }, ["/a"])).toEqual(["/a"]);
  for (const roots of [["/bad"], ["/a", "/a"], Array(1), [1]]) expect(parseActivityRoots({ roots }, ["/a"])).toBeNull();
});
it("distinguishes missing referenced history from normal empty history", () => {
  const { path, store } = fixture();
  expect(readShellActivity(path, store, ["/a", "/b"])).toEqual([{ root: "/a", incomplete: true }, { root: "/b", incomplete: false }]);
  writeFileSync(join(path, "conversations/one.jsonl"), "");
  expect(readShellActivity(path, store, ["/a"])).toEqual([{ root: "/a", incomplete: false }]);
});
it("uses only activity timestamps, retains known maxima on source failure, and exposes no text", () => {
  const { path, store } = fixture();
  store.append("one", "turn", { type: "activity", kind: "read", summary: "private" });
  const at = Date.parse(store.read("one")[0]!.at);
  store.append("one", "turn", { type: "message.done", messageId: "message", text: "private" });
  expect(readShellActivity(path, store, ["/a"])).toEqual([{ root: "/a", at, incomplete: false }]);
  writeFileSync(join(path, "sessions.jsonl"), "");
  rmSync(join(path, "sessions.jsonl"));
  writeFileSync(join(path, "conversations/index.json"), "broken");
  expect(readShellActivity(path, store, ["/a"])).toEqual([{ root: "/a", incomplete: true }]);
});
