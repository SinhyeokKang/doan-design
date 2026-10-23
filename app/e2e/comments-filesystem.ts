import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { utilityProcess } from "electron";

// Loaded by the runtime harness in main, after type erasure. Instrumented copies
// live only in its temp directory; the product child has no barrier protocol.
export async function checkCommentFilesystem(base: string, modulePath: string, childPath: string, sourcePath: string): Promise<string[]> {
  const files: typeof import("../src/main/comments/files") = await import(pathToFileURL(modulePath).href);
  const cwd = process.cwd();
  const rows: string[] = [];
  let serial = 0;
  async function fixture(state: string) {
    const home = join(base, String(++serial)), root = join(home, "repo"), outside = join(home, "outside");
    await fs.mkdir(root, { recursive: true }); await fs.mkdir(outside); await fs.writeFile(join(outside, "sentinel"), "safe");
    if (state !== "missing-doan") await fs.mkdir(join(root, ".doan"));
    if (state === "existing") { await fs.mkdir(join(root, ".doan/comments")); await fs.writeFile(join(root, ".doan/comments/canvas.jsonl"), "old\n"); }
    return { home, root, outside };
  }
  async function snapshot(path: string): Promise<unknown[]> {
    const rows: unknown[] = [];
    for (const name of (await fs.readdir(path)).sort()) {
      const full = join(path, name), stat = await fs.lstat(full, { bigint: true });
      rows.push([name, String(stat.dev), String(stat.ino), stat.isSymbolicLink() ? await fs.readlink(full) : stat.isDirectory() ? await snapshot(full) : await fs.readFile(full, "utf8")]);
    }
    return rows;
  }
  async function job(path: string, request: unknown, stage?: string, attack?: () => Promise<void>, extra?: unknown): Promise<{ code: number; messages: unknown[] }> {
    return new Promise((resolve, reject) => {
      const child = utilityProcess.fork(path, [], { stdio: "pipe" });
      const messages: unknown[] = [];
      let failure: unknown, stderr = "";
      const timer = setTimeout(() => { failure = new Error(`child timeout ${stderr}`); child.kill(); }, 10_000);
      child.stderr?.on("data", data => { stderr += String(data); });
      child.on("message", (message: unknown) => {
        if (typeof message === "object" && message !== null && "stage" in message) {
          void (async () => { if (message.stage === stage) await attack?.(); child.postMessage({ go: true }); })().catch(error => { failure = error; child.kill(); });
        } else { messages.push(message); child.kill(); }
      });
      child.once("exit", code => { clearTimeout(timer); if (failure) reject(failure); else resolve({ code, messages }); });
      child.postMessage(request);
      if (extra !== undefined) child.postMessage(extra);
    });
  }
  const original = await fs.readFile(sourcePath, "utf8");
  function replace(source: string, before: string, after: string): string { assert(source.includes(before), `instrumentation anchor: ${before}`); return source.replace(before, after); }
  let instrumented = original;
  instrumented = replace(instrumented, 'let consumed = false;', `let consumed = false;
let resume;
function barrier(stage) { return new Promise(resolve => { resume = resolve; port.postMessage({stage}); }); }`);
  instrumented = replace(instrumented, 'if (consumed)', 'if (data && data.go === true) { resume(); return; }\n  if (consumed)');
  instrumented = replace(instrumented, 'setImmediate(() => {', 'setImmediate(async () => {');
  for (const [needle, stage] of [
    ['const fd = fs.openSync', 'before-open'], ['process.chdir(parent);', 'before-chdir'],
    ['const cwd = fs.statSync', 'before-verify'], ['const verify = fs.openSync', 'after-cwd-stat'],
    ['const reopened = fs.fstatSync', 'after-reopen'], ['try { fs.mkdirSync(name);', 'before-mkdir'],
  ]) { assert(needle && stage); instrumented = replace(instrumented, needle, `await barrier(${JSON.stringify(stage)});\n${needle}`); }
  const controlled = join(base, "controlled.cjs");
  // The built ESM child has imports; use .mjs regardless of the main package.
  const controlledPath = controlled.replace(/cjs$/, "mjs");
  await fs.writeFile(controlledPath, instrumented);
  for (const state of ["missing-doan", "missing-comments", "existing"]) {
    const f = await fixture(state);
    await files.withCommentAppend(f.root, "canvas", async latest => { assert.equal(latest.toString(), state === "existing" ? "old\n" : ""); return Buffer.from("new\n"); });
    assert.equal((await files.readCommentBytes(f.root, "canvas")).toString(), state === "existing" ? "old\nnew\n" : "new\n");
    rows.push(`real-wrapper:${state}`);
    for (const stage of ["before-open", "before-chdir", "before-verify", "after-cwd-stat", "after-reopen", "before-mkdir"]) {
      const f = await fixture(state), parent = state === "missing-doan" ? f.root : join(f.root, ".doan"), name = state === "missing-doan" ? ".doan" : "comments";
      const before = await snapshot(f.outside);
      const result = await job(controlledPath, { parent, name }, stage, async () => { await fs.rename(parent, parent + "-parked"); await fs.symlink(f.outside, parent); });
      assert.deepEqual(await snapshot(f.outside), before);
      const expected = ["after-reopen", "before-mkdir"].includes(stage);
      assert.equal((result.messages[0] as { ok: boolean }).ok, expected, `${state}:${stage}`);
      rows.push(`swap:${state}:${stage}`);
    }
  }
  for (const [label, mutation, stage, attackKind] of [
    ["cwd", 'if (pinned.dev !== cwd.dev || pinned.ino !== cwd.ino)', "before-chdir", "restore"],
    ["reopen", 'const verify = fs.openSync(parent, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | O_NOFOLLOW_ANY);', "before-chdir", "same"],
  ]) {
    assert(label && mutation && stage && attackKind);
    let mutant = label === "cwd" ? replace(instrumented, mutation, "if (false)") : replace(instrumented, mutation, "const verify = fs.openSync(parent, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);");
    const path = join(base, `mutant-${label}.mjs`); await fs.writeFile(path, mutant);
    for (const guarded of [true, false]) {
      const f = await fixture("missing-comments"), parent = join(f.root, ".doan");
      const before = await snapshot(f.outside);
      let swapped = false;
      // The cwd check is independently needed if the pathname is restored before reopen.
      const source = attackKind === "restore" ? replace(guarded ? instrumented : mutant, 'await barrier("after-cwd-stat");', 'await barrier("restore-path");\nawait barrier("after-cwd-stat");') : guarded ? instrumented : mutant;
      const local = join(f.home, "child.mjs"); await fs.writeFile(local, source);
      // For restore, restoration happens after cwd is captured and before pathname reopen.
      const runSource = attackKind === "restore" ? replace(source, 'const cwd = fs.statSync', 'await barrier("restore-now");\nconst cwd = fs.statSync') : source;
      await fs.writeFile(local, runSource);
      const result = await new Promise<{ ok: boolean }>((resolve, reject) => {
        const child = utilityProcess.fork(local, [], { stdio: "ignore" }); let reply: { ok: boolean } | undefined;
        const timer = setTimeout(() => { child.kill(); reject(new Error("mutation timeout")); }, 10_000);
        child.on("message", async value => {
          try {
            if (value.stage === "before-chdir") { await fs.rename(parent, parent + "-parked"); await fs.symlink(attackKind === "same" ? parent + "-parked" : f.outside, parent); swapped = true; }
            if (value.stage === "restore-now") { await fs.unlink(parent); await fs.rename(parent + "-parked", parent); }
            if (value.stage) child.postMessage({ go: true }); else { reply = value; child.kill(); }
          } catch (error) { child.kill(); reject(error); }
        });
        child.once("exit", () => { clearTimeout(timer); if (reply) resolve(reply); else reject(new Error("missing mutation reply")); });
        child.postMessage({ parent, name: "comments" });
      });
      assert(swapped); assert.equal(result.ok, !guarded, label);
      assert.equal(JSON.stringify(await snapshot(f.outside)) === JSON.stringify(before), guarded || attackKind === "same");
      rows.push(`individual-guard:${label}:${guarded}`);
    }
  }
  for (const name of ["", "/tmp/x", "..", "../x", "a/b", "arbitrary", "comments\0"]) {
    const f = await fixture("missing-comments"), before = await snapshot(f.root);
    const result = await job(childPath, { parent: join(f.root, ".doan"), name });
    assert.equal((result.messages[0] as { ok: boolean }).ok, false); assert.deepEqual(await snapshot(f.root), before); rows.push(`invalid-name:${JSON.stringify(name)}`);
  }
  for (const extra of [{ guard: false }, { unknown: true }]) {
    const f = await fixture("missing-comments"); const result = await job(childPath, { parent: join(f.root, ".doan"), name: "comments", ...extra });
    assert.equal((result.messages[0] as { ok: boolean }).ok, false); rows.push("unknown-field");
  }
  { const f = await fixture("missing-comments"), request = { parent: join(f.root, ".doan"), name: "comments" }; const result = await job(childPath, request, undefined, undefined, request); assert(result.code !== 0 || result.messages.some(value => (value as { ok: boolean }).ok === false)); rows.push("duplicate-job"); }
  for (const state of ["missing-doan", "missing-comments", "existing"]) for (const layer of ["repo", ".doan", "comments"]) {
    if (state === "missing-doan" && layer !== "repo" || state === "missing-comments" && layer === "comments") continue;
    const f = await fixture(state), target = layer === "repo" ? f.root : layer === ".doan" ? join(f.root, ".doan") : join(f.root, ".doan/comments");
    const before = await snapshot(f.outside); await fs.rename(target, target + "-parked"); await fs.symlink(f.outside, target);
    await assert.rejects(files.withCommentAppend(f.root, "canvas", async () => Buffer.from("new\n")));
    assert.deepEqual(await snapshot(f.outside), before); rows.push(`file-ancestor:${state}:${layer}`);
  }
  for (const dangling of [true, false]) {
    const f = await fixture("existing"), path = join(f.root, ".doan/comments/canvas.jsonl");
    await fs.unlink(path); await fs.symlink(join(f.outside, dangling ? "absent" : "sentinel"), path); const before = await snapshot(f.outside);
    await assert.rejects(files.withCommentAppend(f.root, "canvas", async () => Buffer.from("new\n"))); assert.deepEqual(await snapshot(f.outside), before); rows.push(`leaf:${dangling}`);
  }
  for (const phase of ["during", "after"]) {
    const f = await fixture("missing-comments"), before = await snapshot(f.outside);
    await new Promise<void>((resolve, reject) => {
      const child = utilityProcess.fork(controlledPath, [], { stdio: "ignore" });
      let sent = false;
      const timer = setTimeout(() => { child.kill(); reject(new Error("extra-job timeout")); }, 10_000);
      child.on("message", value => {
        if (!sent && (phase === "during" && value.stage === "before-chdir" || phase === "after" && value.ok === true)) {
          sent = true; child.postMessage({ parent: f.outside, name: ".doan" });
        } else if (value.stage) child.postMessage({ go: true });
      });
      child.once("exit", code => { clearTimeout(timer); try { assert(sent); assert.notEqual(code, 0); resolve(); } catch (error) { reject(error); } });
      child.postMessage({ parent: join(f.root, ".doan"), name: "comments" });
    });
    assert.deepEqual(await snapshot(f.outside), before); rows.push(`extra-job:${phase}`);
  }
  const wrapperPath = join(modulePath, "..", "m1-mkdir.js");
  const wrapperSource = await fs.readFile(wrapperPath, "utf8");
  for (const mode of ["crash", "malformed", "timeout", "duplicate"]) {
    const child = join(base, `lifecycle-${mode}.mjs`), pidFile = child + ".pid";
    const behavior = mode === "crash" ? "process.exit(2);" : mode === "malformed" ? "process.parentPort.postMessage({bogus:true});" : mode === "duplicate" ? "process.parentPort.postMessage({ok:true});process.parentPort.postMessage({ok:true});" : "";
    await fs.writeFile(child, `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); process.parentPort.on('message', () => {${behavior}});`);
    const source = replace(wrapperSource, 'new URL("./mkdir-child.js", import.meta.url)', `new URL(${JSON.stringify(pathToFileURL(child).href)})`);
    const path = modulePath + `-lifecycle-${mode}.js`; await fs.writeFile(path, source);
    const wrapper: typeof import("../src/main/comments/mkdir") = await import(pathToFileURL(path).href);
    await assert.rejects(wrapper.createCommentDirectory(base, ".doan"));
    const pid = Number(await fs.readFile(pidFile, "utf8"));
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    rows.push(`real-lifecycle:${mode}:exited`);
  }
  const fileSource = await fs.readFile(modulePath, "utf8");
  for (const kind of ["existing", "new"]) for (const layer of ["repo", ".doan", "comments"]) for (const guarded of [true, false]) {
    const f = await fixture("existing");
    await fs.mkdir(join(f.outside, ".doan/comments"), { recursive: true });
    await fs.mkdir(join(f.outside, "comments"));
    for (const dir of [f.outside, join(f.outside, "comments"), join(f.outside, ".doan/comments")]) await fs.writeFile(join(dir, "canvas.jsonl"), "outside\n");
    const before = await snapshot(f.outside);
    const target = layer === "repo" ? f.root : layer === ".doan" ? join(f.root, ".doan") : join(f.root, ".doan/comments");
    const injection = `await testFs.rename(${JSON.stringify(target)}, ${JSON.stringify(target + "-parked")}); await testFs.symlink(${JSON.stringify(f.outside)}, ${JSON.stringify(target)});\n`;
    let source = 'import * as testFs from "node:fs/promises";\n' + replace(fileSource, "const flags = O_NOFOLLOW_ANY", injection + "const flags = " + (guarded ? "O_NOFOLLOW_ANY" : "constants.O_NOFOLLOW"));
    const testPath = modulePath + `-swap-${serial}-${guarded}.js`; await fs.writeFile(testPath, source);
    const writer: typeof files = await import(pathToFileURL(testPath).href);
    const operation = writer.withCommentAppend(f.root, kind === "existing" ? "canvas" : "new", async () => Buffer.from("new\n"));
    if (guarded) await assert.rejects(operation); else await operation;
    assert.equal(JSON.stringify(await snapshot(f.outside)) === JSON.stringify(before), guarded);
    rows.push(`file-open-negative:${kind}:${layer}:${guarded}`);
  }
  for (const name of [".doan", "comments"]) for (const exists of [false, true]) {
    const f = await fixture(name === ".doan" ? "missing-doan" : "missing-comments");
    const before = await snapshot(f.outside);
    const injection = (exists ? "await testFs.mkdir(path);\n" : "") + "await createCommentDirectory(parent, name);\n" +
      `await testFs.rename(path, path + "-parked"); await testFs.symlink(${JSON.stringify(f.outside)}, path);`;
    const source = 'import * as testFs from "node:fs/promises";\n' + replace(fileSource, "await createCommentDirectory(parent, name);", injection);
    const testPath = modulePath + `-mkdir-${serial}.js`; await fs.writeFile(testPath, source);
    const writer: typeof files = await import(pathToFileURL(testPath).href);
    await assert.rejects(writer.withCommentAppend(f.root, "canvas", async () => Buffer.from("new\n")));
    assert.deepEqual(await snapshot(f.outside), before); rows.push(`next-open:${name}:EEXIST=${exists}`);
  }
  assert.equal(process.cwd(), cwd);
  rows.push("main-cwd-unchanged");
  return rows;
}
