// Controlled adapter: production controller/script/pins, without App/CRUD wiring.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { arch, cpus, homedir, platform, release } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication, type Frame } from "playwright";
import { build } from "vite";
const root = fileURLToPath(new URL("../..", import.meta.url));
const shots = join(root, ".scratch/comments-ui-A");
const paths = ["folders.json", "runtime.json"].map(n => join(homedir(), "Library/Application Support/doan", n));
const fingerprint = (p: string) => readFile(p).then(b => createHash("sha256").update(b).digest("hex"), () => "absent");
const before = await Promise.all(paths.map(fingerprint));
const work = await realpath(await mkdtemp("/tmp/doan-anchors-"));
let app: ElectronApplication | undefined;
try {
  const repo = join(work, "repo"), userData = join(work, "userData"), cli = join(work, "doan");
  await mkdir(join(repo, ".doan"), { recursive: true }); await mkdir(join(repo, "design")); await mkdir(userData); await mkdir(shots, { recursive: true });
  await writeFile(join(repo, ".doan/config.json"), '{"v":1}');
  await writeFile(join(repo, "design/anchors.html"), `<!doctype html><title>Anchors fixture</title><meta name="doan:canvas" content="anchors"><meta name="doan:width" content="800"><style>
body{margin:0;height:1000px} section{position:absolute;left:80px;top:80px;width:120px;height:80px;background:#555}
#clip{position:absolute;left:300px;top:80px;width:120px;height:100px;overflow:hidden} #scroll{width:100px;height:80px;overflow:auto;border:4px solid black}
#inside{margin-top:100px;width:70px;height:30px}.space{height:300px}</style>
<section data-doan-frame="hero" data-doan-id="hero"><span data-doan-id="child">child</span></section>
<div id="clip"><div id="scroll"><div id="inside" data-doan-id="inside">inside</div><div class="space"></div></div></div>
<b data-doan-id="duplicate">one</b><b data-doan-id="duplicate">two</b>`);
  await writeFile(join(userData, "folders.json"), JSON.stringify([repo]));
  await promisify(execFile)("go", ["build", "-o", cli, "./cli/cmd/doan"], { cwd: root });
  const entry = join(work, "adapter.ts");
  await writeFile(entry, `export { CanvasController } from ${JSON.stringify(join(root, "app/src/renderer/CanvasController.ts"))}; export { projectList } from ${JSON.stringify(join(root, "app/src/comments/projection.ts"))};`);
  const built = await build({ configFile: false, root: join(root, "app"), logLevel: "silent", build: { write: false, minify: false, lib: { entry, name: "AnchorTest", formats: ["iife"] } } });
  const bundle = (Array.isArray(built) ? built[0] : built) as { output: { type: string; code?: string }[] };
  const code = bundle.output.find(c => c.type === "chunk")?.code; assert.ok(code);
  const home = join(work, "home"), fakeShell = join(work, "fake-shell");
  await mkdir(home);
  await writeFile(fakeShell, '#!/bin/sh\nPATH=/usr/bin:/bin; export PATH\neval "$2"\n', { mode: 0o755 });
  await writeFile(join(userData, "onboarding.json"), "{}\n");
  app = await _electron.launch({ args: [join(root, "app"), `--user-data-dir=${userData}`], env: { ...process.env,
    HOME: home, TMPDIR: work, SHELL: fakeShell, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex"),
    DOAN_CLI: cli, DOAN_RUNTIME: join(userData, "runtime.json") } });
  const page = await app.firstWindow(); page.setDefaultTimeout(10_000);
  await page.getByRole("treeitem", { name: "anchors.html", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("iframe")?.getAttribute("src"));
  const url = await page.locator("iframe").getAttribute("src"); assert.ok(url);
  await page.evaluate(code);
  await page.evaluate(({ repo, url }) => {
    const w = window as any, stage = document.createElement("div"), board = document.createElement("div"), overlay = document.createElement("div"), heading = document.createElement("button");
    stage.id = "anchor-stage"; stage.style.cssText = "position:fixed;inset:0;background:#222;z-index:9999;overflow:hidden";
    board.style.cssText = "position:absolute;transform-origin:0 0";
    overlay.style.cssText = "position:absolute;inset:0;pointer-events:none";
    heading.textContent = "Comments fallback"; heading.style.cssText = "position:absolute;right:0;bottom:0";
    stage.append(board, overlay, heading); document.body.append(stage);
    const a: any = { state: null, snapshot: null, opened: [], allow: true, calls: 0, board, stage };
    window.addEventListener("message", event => {
      if (event.data?.type === "anchors" && event.source === a.board.querySelector("iframe")?.contentWindow) a.latestAnchor = event;
      a.gate?.(event);
    }, true);
    a.controller = new w.AnchorTest.CanvasController(stage, board, overlay, (state: unknown) => a.state = state, () => {}, async () => ({ ok: true, rows: [] }));
    a.row = { path: "design/anchors.html", id: "anchors", url, width: 800, open: 0, resolved: 0 };
    a.controller.updateEntries([{ path: repo, kind: "list", servedRev: 0, canvases: [a.row] }]);
    a.hooks = { changed: (s: unknown) => { a.snapshot = s; a.calls++; }, guard: () => a.allow, open: (d: unknown) => a.opened.push(d), focusFallback: () => heading.focus() };
    a.comment = (id: string, target: unknown) => ({ comment: id, target, status: "open", body: "x", canvasHash: "h", createdAt: "t", updatedAt: "t", createdBy: { kind: "human", name: "A" } });
    a.set = (comments: unknown[]) => { a.comments = comments; a.controller.setComments({ root: repo, canvas: "anchors", comments }, a.hooks); };
    a.controller.openCanvas(repo, a.row);
    a.set([a.comment("f", { frame: "hero" }), a.comment("e", { element: { doanId: "hero", selector: "section", html: "" } }), a.comment("child", { element: { doanId: "child", selector: "span", html: "" } }), a.comment("inside", { element: { doanId: "inside", selector: "#inside", html: "" } }), a.comment("bad", { frame: "hero", element: { doanId: "duplicate", selector: "[", html: "" } })]);
    w.anchorTest = a;
  }, { repo, url });
  await page.waitForFunction(() => (window as any).anchorTest.snapshot?.lookup.nodes.size === 4);
  assert.deepEqual(await page.evaluate(() => { const n = (window as any).anchorTest.snapshot.lookup.nodes; return [n.get("f") === n.get("e"), n.get("f") !== n.get("child"), n.has("bad"), document.querySelectorAll(".comment-pin").length]; }), [true, true, false, 2]);
  const frame = page.frames().filter(f => f.url() === url).at(-1)!;
  await frame.evaluate(() => document.querySelector("#scroll")!.scrollTop = 90);
  await page.waitForFunction(() => document.querySelectorAll(".comment-pin").length === 3);
  await frame.evaluate(() => document.querySelector("#clip")!.setAttribute("style", "height:10px"));
  await page.waitForFunction(() => document.querySelectorAll(".comment-pin").length === 2);
  await frame.evaluate(() => { const duplicate = document.createElement("section"); duplicate.id = "duplicate-frame"; duplicate.setAttribute("data-doan-frame", "hero"); document.body.append(duplicate); });
  await page.waitForFunction(() => { const n = (window as any).anchorTest.snapshot.lookup.nodes; return !n.has("f") && n.has("e"); });
  await frame.evaluate(() => document.querySelector("#duplicate-frame")!.remove());
  await page.waitForFunction(() => (window as any).anchorTest.snapshot.lookup.nodes.has("f"));
  for (const scale of [0.05, 0.25, 1, 4]) {
    await page.evaluate(scale => { const a = (window as any).anchorTest, c = a.controller; c.command("actualSize"); let remaining = Math.log(scale);
      while (Math.abs(remaining) > 1e-6) { const step = Math.max(-0.2, Math.min(0.2, remaining)); c.wheel({ dx: 0, dy: -step / 0.01, ctrl: true, meta: false, deltaMode: 0 }, { x: 0, y: 0 }); remaining -= step; }
      const matrix = new DOMMatrix(a.board.style.transform); c.wheel({ dx: matrix.e + 80 * scale - 100, dy: matrix.f + 80 * scale - 100, ctrl: false, meta: false, deltaMode: 0 }, { x: 0, y: 0 });
    }, scale);
    const box = await page.getByRole("button", { name: "2 open comments", exact: true }).boundingBox(); assert.ok(box); assert.equal(box.height, 24); assert.ok(box.width >= 24);
    assert.ok(Math.abs(box.x + box.width / 2 - (100 + 120 * scale)) < 1, JSON.stringify({scale,box,transform:await page.evaluate(() => (window as any).anchorTest.board.style.transform)})); assert.ok(Math.abs(box.y + 12 - 100) < 1);
    await page.screenshot({ path: join(shots, `anchors-${scale}.png`) });
  }
  await page.evaluate(() => (window as any).anchorTest.allow = false);
  await page.getByRole("button", { name: "2 open comments", exact: true }).click();
  assert.equal(await page.evaluate(() => (window as any).anchorTest.state.selection), null);
  await page.evaluate(() => (window as any).anchorTest.allow = true);
  await page.getByRole("button", { name: "2 open comments", exact: true }).focus(); await page.keyboard.press("Enter");
  await page.waitForFunction(() => (window as any).anchorTest.opened.length === 1);
  assert.equal(await page.evaluate(() => (window as any).anchorTest.state.selection.frame.id), "hero");
  await frame.evaluate(() => document.querySelector("section")!.remove());
  await page.waitForFunction(() => document.activeElement?.textContent === "Comments fallback");
  const previous = await page.evaluate(() => (window as any).anchorTest.snapshot.lookup.generation);
  await page.evaluate(() => (window as any).anchorTest.controller.command("reload"));
  await page.waitForFunction(g => { const a = (window as any).anchorTest; return a.snapshot.lookup.generation > g && a.snapshot.lookup.nodes.size === 4; }, previous);
  // Hold genuine input replies while the independent anchor channel advances.
  const reloaded = page.frames().filter(f => f.url() === url).at(-1)!;
  await page.evaluate(() => {
    const a = (window as any).anchorTest; a.controller.command("fit");
    a.held = [];
    a.gate = (event: MessageEvent) => {
      if (["select", "hover"].includes(event.data?.type) && event.source === a.board.querySelector("iframe").contentWindow) {
        a.held.push(event); event.stopImmediatePropagation();
      }
    };

  });
  await reloaded.locator("span").click();
  await reloaded.locator("section").hover({ position: { x: 100, y: 60 } });
  await page.waitForFunction(() => (window as any).anchorTest.held.some((e: MessageEvent) => e.data.type === "select") && (window as any).anchorTest.held.some((e: MessageEvent) => e.data.type === "hover"));
  const calls = await page.evaluate(() => (window as any).anchorTest.calls);
  await reloaded.evaluate(() => document.querySelector("section")!.setAttribute("title", "changed"));
  await page.waitForFunction(c => (window as any).anchorTest.calls > c, calls);
  assert.equal(await page.evaluate(() => (window as any).anchorTest.state.selection?.element?.doanId ?? null), null);
  await page.evaluate(() => { const a = (window as any).anchorTest; a.gate = null;
    for (const e of a.held) window.dispatchEvent(new MessageEvent("message", { source: e.source, origin: e.origin, data: e.data })); });
  await page.waitForFunction(() => (window as any).anchorTest.state.selection.element?.doanId === "child");
  assert.equal(await page.locator("#anchor-stage .mark.hover").isVisible(), true);
  // Delayed old-frame geometry cannot repopulate a new document.
  await page.evaluate(() => { const a = (window as any).anchorTest; a.old = null;
    a.capture = (event: MessageEvent) => { if (event.data?.type === "anchors" && event.source === a.board.querySelector("iframe").contentWindow) a.old = event; };
    window.addEventListener("message", a.capture); });
  await reloaded.evaluate(() => document.querySelector("section")!.setAttribute("title", "old frame"));
  await page.waitForFunction(() => (window as any).anchorTest.old !== null);
  await page.evaluate(() => { const a = (window as any).anchorTest; window.removeEventListener("message", a.capture); a.oldGeneration = a.snapshot.lookup.generation; a.controller.command("reload"); });
  await page.waitForFunction(() => { const a = (window as any).anchorTest; return a.snapshot.lookup.generation > a.oldGeneration && a.snapshot.lookup.nodes.size === 4; });
  assert.equal(await page.evaluate(() => { const a = (window as any).anchorTest, count = a.calls, e = a.old;
    window.dispatchEvent(new MessageEvent("message", { source: e.source, origin: e.origin, data: e.data })); return a.calls === count; }), true);

  const regressionFailures: string[] = [];
  for (const scenario of ["Y1", "Y2", "Y3-new-guard", "Y3-binding", "Y4"]) {
    try {
      await page.evaluate(() => {
        const a = (window as any).anchorTest;
        a.gate = null; a.allow = true; a.hooks.guard = () => true; a.opened = [];
        a.set([a.comment("f", { frame: "hero" }), a.comment("e", { element: { doanId: "hero", selector: "section", html: "" } }), a.comment("child", { element: { doanId: "child", selector: "span", html: "" } })]);
        a.controller.command("reload"); a.controller.command("fit");
      });
      await page.waitForFunction(() => (window as any).anchorTest.snapshot.lookup.nodes.size === 3);
      const live: Frame = page.frames().filter(f => f.url() === url).at(-1)!;
      if (scenario === "Y4") {
        await live.evaluate(() => {
          const host = document.createElement("div");
          host.style.cssText = "position:absolute;left:250px;top:180px;visibility:hidden";
          host.innerHTML = '<button id="visible" style="visibility:visible;width:100px;height:40px">Visible</button><button id="hidden">Hidden</button><div style="display:none"><button id="display" style="visibility:visible">Display</button></div><div style="opacity:0"><button id="opacity" style="visibility:visible">Opacity</button></div>';
          document.body.append(host);
        });
        assert.deepEqual(await live.evaluate(() => ["visible", "hidden"].map(id => getComputedStyle(document.getElementById(id)!).visibility)), ["visible", "hidden"]);
        await page.evaluate(() => { const a = (window as any).anchorTest; a.set(["visible", "hidden", "display", "opacity"].map(id => a.comment(id, { element: { selector: "#" + id, html: "" } }))); });
        await page.waitForFunction(() => (window as any).anchorTest.snapshot.lookup.nodes.size === 4);
        assert.deepEqual(await page.evaluate(() => { const a = (window as any).anchorTest; return a.controller.pins.flatMap((p: any) => p.comments); }), ["visible"]);
        await page.screenshot({ path: join(shots, "Y4-visibility.png") });
      } else if (scenario === "Y2") {
        await page.evaluate(() => { const a = (window as any).anchorTest; void a.controller.activatePin(a.snapshot.lookup.nodes.get("child")); });
        await page.waitForFunction(() => { const a = (window as any).anchorTest; return a.snapshot.selected === a.snapshot.lookup.nodes.get("child"); });
        const old = await page.evaluate(() => (window as any).anchorTest.snapshot.selected);
        await live.evaluate(() => { const el = document.querySelector("span")!; el.replaceWith(el.cloneNode(true)); });
        await page.waitForFunction(old => (window as any).anchorTest.snapshot.lookup.nodes.get("child") !== old, old);
        // Wait only for already queued animation frames; cause no external layout event.
        await live.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.evaluate(() => { const a = (window as any).anchorTest; return a.snapshot.selected === a.snapshot.lookup.nodes.get("child"); }), true);
        await page.screenshot({ path: join(shots, "Y2-replacement.png") });
      } else {
        if (scenario === "Y1") {
          await page.evaluate(() => { const a = (window as any).anchorTest; void a.controller.activatePin(a.snapshot.lookup.nodes.get("f")); });
          await page.waitForFunction(() => { const a = (window as any).anchorTest; return a.snapshot.selected === a.snapshot.lookup.nodes.get("f"); });
        }
        await page.evaluate(() => {
          const a = (window as any).anchorTest; a.held = []; a.opened = [];
          a.gate = (e: MessageEvent) => { if (e.data?.type === "select" && e.source === a.board.querySelector("iframe").contentWindow) { a.held.push(e); e.stopImmediatePropagation(); } };
        });
        await page.evaluate(scenario => { const a = (window as any).anchorTest; void a.controller.activatePin(a.snapshot.lookup.nodes.get(scenario === "Y1" ? "child" : "f")); }, scenario);
        await page.waitForFunction(() => (window as any).anchorTest.held.length === 1);
        await page.waitForFunction(() => { const a = (window as any).anchorTest; return a.latestAnchor.data.selectionSeq === a.held[0].data.seq; });
        if (scenario === "Y1") {
          const projected = await page.evaluate(() => {
            const a = (window as any).anchorTest, s = a.snapshot;
            return { frame: a.state.selection.frame.id, selected: s.selected, list: (window as any).AnchorTest.projectList(a.comments, s.lookup, s.lookup, { scope: "selection", status: "open", node: s.selected }).map((c: any) => c.comment) };
          });
          assert.equal(projected.frame, "hero"); assert.equal(projected.selected, null); assert.deepEqual(projected.list, []);
        } else if (scenario === "Y3-new-guard") {
          await page.evaluate(() => { const a = (window as any).anchorTest; a.hooks.guard = () => new Promise(resolve => a.answer = resolve); a.pending = a.controller.activatePin(a.snapshot.lookup.nodes.get("child")); });
        } else {
          await page.evaluate(() => { const a = (window as any).anchorTest; a.set(a.comments.filter((c: any) => c.comment === "child")); });
          await page.waitForFunction(() => (window as any).anchorTest.snapshot.lookup.nodes.size === 1);
        }
        await page.evaluate(() => { const a = (window as any).anchorTest; a.gate = null; const e = a.held[0]; window.dispatchEvent(new MessageEvent("message", { source: e.source, origin: e.origin, data: e.data })); });
        await page.waitForFunction(() => (window as any).anchorTest.state.selection !== null);
        if (scenario !== "Y1") {
          assert.equal(await page.evaluate(() => (window as any).anchorTest.state.selection.frame.id), "hero");
          assert.equal(await page.evaluate(() => (window as any).anchorTest.opened.length), 0);
          if (scenario === "Y3-new-guard") {
            await page.evaluate(async () => { const a = (window as any).anchorTest; a.answer(true); await a.pending; });
            await page.waitForFunction(() => (window as any).anchorTest.state.selection.element?.doanId === "child");
            assert.equal(await page.evaluate(() => (window as any).anchorTest.opened.length), 1);
          }
        }
      }
      console.log(scenario + ": PASS");
    } catch (error) { regressionFailures.push(scenario + ": " + String(error)); console.error(regressionFailures.at(-1)); }
  }
  assert.deepEqual(regressionFailures, [], "independent review regressions");
  // Fixed before execution: task 0 criteria, measured through actual pin DOM.
  const criteria = { counts: [100, 1000], warmup: 10, samples: 100, kinds: ["scroll", "resize", "mutation"], p95LimitsMs: [50, 200], missing: 0, staleApplies: 0 };
  await writeFile(join(shots, "performance-criteria.json"), JSON.stringify(criteria, null, 2));
  const perfFrame = page.frames().filter(f => f.url() === url).at(-1)!;
  await page.evaluate(() => {
    const a = (window as any).anchorTest;
    a.samples = []; a.start = null; a.staleApplies = 0; a.staleChecks = 0; a.previousAnchor = null;
    window.addEventListener("message", event => { if (event.source === a.board.querySelector("iframe").contentWindow && event.data?.type === "perf-start") a.start = event.data.at; });
    const changed = a.hooks.changed;
    a.hooks.changed = (snapshot: unknown) => {
      changed(snapshot);
      if (a.start === null) return;
      a.samples.push({ ms: performance.timeOrigin + performance.now() - a.start, nodes: a.snapshot.lookup.nodes.size, pins: document.querySelectorAll(".comment-pin").length });
      a.start = null;
      const previous = a.previousAnchor;
      a.previousAnchor = a.latestAnchor;
      if (previous) {
        const calls = a.calls;
        window.dispatchEvent(new MessageEvent("message", { data: previous.data, source: previous.source, origin: previous.origin }));
        a.staleApplies += a.calls - calls; a.staleChecks++;
      }
    };
    a.controller.command("actualSize");
    const matrix = new DOMMatrix(a.board.style.transform);
    a.controller.wheel({ dx: matrix.e, dy: matrix.f, ctrl: false, meta: false, deltaMode: 0 }, { x: 0, y: 0 });
  });
  const performanceResults = [];
  for (const count of criteria.counts) {
    await perfFrame.evaluate(count => {
      document.body.innerHTML = '<div id="perf-scroll" style="position:absolute;left:100px;top:100px;width:400px;height:300px;overflow:auto"><div style="height:600px"></div></div>';
      const container = document.querySelector("#perf-scroll")!;
      for (let i = 0; i < count; i++) { const el = document.createElement("div"); el.setAttribute("data-doan-id", `perf-${i}`); el.style.cssText = "position:absolute;left:50px;top:50px;width:10px;height:10px"; container.append(el); }
    }, count);
    await page.evaluate(count => { const a = (window as any).anchorTest;
      a.set(Array.from({ length: count }, (_, i) => a.comment(`c${i}`, { element: { doanId: `perf-${i}`, selector: `[data-doan-id="perf-${i}"]`, html: "" } }))); }, count);
    await page.waitForFunction(count => document.querySelectorAll(".comment-pin").length === count, count);
    for (const kind of criteria.kinds) {
      console.log(`performance: ${count}/${kind}`);
      await page.evaluate(() => (window as any).anchorTest.samples = []);
      for (let i = 0; i < criteria.warmup + criteria.samples; i++) {
        await perfFrame.evaluate(({ kind, i }) => {
          const container = document.querySelector<HTMLElement>("#perf-scroll")!;
          parent.postMessage({ type: "perf-start", at: performance.timeOrigin + performance.now() }, "*");
          if (kind === "scroll") container.scrollTop = i % 2 + 1;
          else if (kind === "resize") container.style.width = `${401 + i % 2}px`;
          else container.firstElementChild!.setAttribute("title", String(i));
        }, { kind, i });
        await page.waitForFunction(n => (window as any).anchorTest.samples.length > n, i).catch(error => { throw new Error(`${count}/${kind}/${i}: ${error}`); });
      }
      const samples = await page.evaluate(() => (window as any).anchorTest.samples) as { ms: number; nodes: number; pins: number }[];
      assert.ok(samples.every(s => s.nodes === count && s.pins === count), `${count}/${kind}: missing targets`);
      const times = samples.slice(criteria.warmup).map(s => s.ms).sort((a, b) => a - b), p95 = times[94]!;
      const stale = await page.evaluate(() => { const a = (window as any).anchorTest; return { staleApplies: a.staleApplies, staleChecks: a.staleChecks }; });
      assert.equal(stale.staleApplies, 0);
      performanceResults.push({ count, kind, p95, missing: 0, ...stale, samples: times });
      assert.ok(p95 <= (count === 100 ? 50 : 200), `${count}/${kind}: p95 ${p95}`);
    }
  }
  await writeFile(join(shots, "performance.json"), JSON.stringify({ machine: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model }, electron: await app.evaluate(() => process.versions.electron), fixture: "100/1000 distinct absolutely positioned nodes in one inner scroller; all pins visible", results: performanceResults }, null, 2));
  console.log("anchors-test: PASS (controlled adapter; App/CRUD integration remains deferred)");
} catch (error) {
  if (app) await (await app.firstWindow()).screenshot({ path: join(shots, "anchors-failure.png") }).catch(() => {});
  throw error;
} finally {
  await app?.close(); await rm(work, { recursive: true, force: true });
  assert.deepEqual(await Promise.all(paths.map(fingerprint)), before, "real app userData unchanged");
}
