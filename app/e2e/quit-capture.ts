// Reenter quit at the native callbacks involved in a thumbnail job. The
// constructor case reproduces the macOS crash without a timing lottery.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication } from "playwright";
const { realState, assertRealState }: typeof import("./real-state") = await import(new URL("./real-state.ts", import.meta.url).href);
const { requestProject }: typeof import("./home") = await import(new URL("./home.ts", import.meta.url).href);

const before = await realState();
const root = fileURLToPath(new URL("../..", import.meta.url));
const work = await realpath(await mkdtemp("/tmp/doan-quit-capture-"));
let running: ElectronApplication | undefined;
const watchdog = setTimeout(() => { running?.process().kill("SIGKILL"); console.error("quit-capture: timed out"); process.exit(1); }, 60_000);
try {
  const home = join(work, "home"), shell = join(work, "shell"), cli = join(work, "doan"), repo = join(work, "repo");
  await mkdir(home);
  await writeFile(shell, '#!/bin/sh\nPATH=/usr/bin:/bin; export PATH\neval "$2"\n', { mode: 0o755 });
  await promisify(execFile)("go", ["build", "-o", cli, "./cli/cmd/doan"], { cwd: root });
  await mkdir(join(repo, ".doan"), { recursive: true }); await mkdir(join(repo, "design"));
  await writeFile(join(repo, ".doan/config.json"), '{"v":1}');
  for (let i = 0; i < 24; i++) await writeFile(join(repo, `design/c${i}.html`), `<!doctype html><title>Canvas ${i}</title><meta name="doan:canvas" content="c${i}"><meta name="doan:width" content="800"><section data-doan-frame="hero">${i}</section>`);
  for (const phase of ["constructor", "load", "capture"] as const) {
    const userData = join(work, phase); await mkdir(userData);
    await writeFile(join(userData, "onboarding.json"), "{}");
    await writeFile(join(userData, "folders.json"), JSON.stringify([repo]));
    const env = { ...process.env, HOME: home, SHELL: shell, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex"), DOAN_CLI: cli, DOAN_RUNTIME: join(userData, "runtime.json") };
    // macOS otherwise prompts to restore windows after the intentionally
    // crashing pre-fix run, before Electron's ready event. Process-local only.
    const app = running = await _electron.launch({ args: [join(root, "app"), `--user-data-dir=${userData}`, "-ApplePersistenceIgnoreState", "YES"], env });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => app.process().once("exit", (code, signal) => resolve({ code, signal })));
    let trace = "";
    app.process().stderr?.on("data", bytes => { trace += String(bytes); });
    const page = await app.firstWindow();
    await page.getByRole("region", { name: "Home", exact: true }).waitFor();
    await app.evaluate(({ app, View }, phase) => {
      app.on("will-quit", () => console.error("quit-capture: will-quit"));
      const quit = () => { console.error(`quit-capture: ${phase}`); app.quit(); };
      if (phase === "constructor") {
        // BaseWindow::SetContentView emits this before its JS wrapper exists.
        // Restore the prototype before quit so no later window is intercepted.
        const emit = View.prototype.emit;
        View.prototype.emit = function (event, ...args) {
          if (event === "bounds-changed") { View.prototype.emit = emit; quit(); }
          return emit.call(this, event, ...args);
        };
      } else {
        app.once("browser-window-created", (_event, window) => {
          if (phase === "load") window.webContents.once("did-start-loading", quit);
          else {
            const capture = window.webContents.capturePage.bind(window.webContents);
            window.webContents.capturePage = (...args) => {
              const pending = capture(...args);
              quit();
              return pending;
            };
          }
        });
      }
    }, phase);
    // Quit can close the page before Playwright acknowledges the click. The
    // phase marker, will-quit and exit status below establish what happened.
    await requestProject(page, repo).catch(() => {});
    const result = await exited;
    running = undefined;
    assert.ok(trace.includes(`quit-capture: ${phase}`), `the ${phase} hook ran`);
    assert.deepEqual(result, { code: 0, signal: null }, `${phase}: clean main-process exit`);
    assert.ok(trace.includes("quit-capture: will-quit"), `${phase}: reached will-quit`);
    console.log(`quit-capture: ${phase} PASS`);
  }
  console.log("quit-capture: PASS");
} finally {
  clearTimeout(watchdog);
  if (running) { const child = running.process(); const exited = new Promise<void>(resolve => child.once("exit", () => resolve())); child.kill("SIGKILL"); if (child.exitCode === null && child.signalCode === null) await exited; }
  await assertRealState(before);
  await rm(work, { recursive: true, force: true });
}
