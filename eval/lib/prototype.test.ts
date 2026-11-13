import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { startFakeApp, validPrototypeRequest, validPrototypeResponse } from "./socket.ts";
import { createContext } from "./context.ts";
import { keepOnboardingLog } from "./workspace.ts";
import { contentHash } from "./work.ts";
import type { PrototypeExchange } from "./types.ts";

const path = ".doan/canvases/onboarding.html";

test("v6 validators decide every shared schema fixture", () => {
  for (const [kind, valid] of [["request", validPrototypeRequest], ["response", validPrototypeResponse]] as const)
    for (const verdict of ["valid", "invalid"])
      for (const name of readdirSync(join(import.meta.dirname, "../../schema/fixtures/app-socket-v6", kind, verdict)))
        assert.equal(valid(JSON.parse(readFileSync(join(import.meta.dirname, "../../schema/fixtures/app-socket-v6", kind, verdict, name), "utf8"))), verdict === "valid", `${kind}/${verdict}/${name}`);
});

test("the fake app accepts v6, refuses invalid requests in order, and preserves token-free evidence", async () => {
  const dir = mkdtempSync("/tmp/doan-proto-test-");
  const root = join(dir, "repo");
  mkdirSync(join(root, ".doan/canvases"), { recursive: true });
  writeFileSync(join(root, path), '<section data-doan-frame="phone" data-doan-prototype="390x844"></section>');
  const app = await startFakeApp({ dir, root, selection: null });
  try {
    const runtime = JSON.parse(readFileSync(app.runtimePath, "utf8"));
    const request = (args: Record<string, unknown>) => new Promise<PrototypeExchange["response"]>((resolve, reject) => {
      const socket = connect(runtime.socket);
      let reply = "";
      socket.on("error", reject).on("data", bytes => { reply += bytes; }).on("end", () => resolve(JSON.parse(reply)));
      socket.end(JSON.stringify({ v: 6, token: runtime.token, root, path, frame: "phone", mark: "390x844", ...args }) + "\n");
    });
    assert.deepEqual(await request({}), { v: 6, ok: true, played: true });
    // The CLI judges the frame and mark; the app only checks the request and canvas list.
    assert.deepEqual(await request({ frame: "not-on-disk" }), { v: 6, ok: true, played: true });
    for (const [args, code] of [
      [{ mark: "390", token: "wrong", root: "/elsewhere" }, "bad_request"],
      [{ token: "wrong", root: "/elsewhere" }, "bad_token"],
      [{ root: "/elsewhere", path: ".doan/canvases/gone.html" }, "project_not_open"],
      [{ path: ".doan/canvases/gone.html" }, "canvas_not_found"],
    ] as const) {
      const response = await request(args);
      assert.equal(response.ok, false);
      if (response.ok) throw new Error("expected refusal");
      assert.equal(response.error.code, code);
      assert.equal(validPrototypeResponse(response), true);
    }
    const raw = readFileSync(app.prototypeLog, "utf8");
    assert.ok(!raw.includes(runtime.token));
    assert.throws(() => readFileSync(app.openLog));
    const ctx = createContext({ repo: root, agent: "fixture", transcript: "", cli: "unused", env: {}, seedCommit: "HEAD", prototypeLog: app.prototypeLog });
    const log = ctx.prototype();
    assert.equal(log.length, 6);
    assert.equal(log[0].hashes[path], contentHash(readFileSync(join(root, path))));
    assert.deepEqual(log[2].hashes, {});
    const out = join(dir, "out");
    mkdirSync(out);
    keepOnboardingLog(app, out);
    assert.equal(readFileSync(join(out, "prototype.jsonl"), "utf8"), raw);
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }); }
});
