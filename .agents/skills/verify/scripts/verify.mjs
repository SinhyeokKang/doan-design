import { spawn, execFileSync } from "node:child_process";
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function plan(flags) {
  for (const flag of flags) if (!["--runtime", "--eval"].includes(flag)) throw new Error(`Unknown option: ${flag}`);
  const node = (name, args, pass) => ({ name, command: process.execPath, args, pass });
  const npm = (name, args, pass) => ({ name, command: "npm", args: ["--prefix", "app", ...args], pass });
  return [
    node("verify-tests", ["--test", ".agents/skills/verify/scripts/verify.test.mjs"]),
    { name: "go-test", command: "go", args: ["test", "./..."] },
    { name: "go-vet", command: "go", args: ["vet", "./..."] },
    npm("typecheck", ["run", "typecheck"]),
    npm("app-test", ["test"]),
    ...(flags.includes("--eval") ? [
      node("eval-tests", ["--test", "eval/**/*.test.ts"]),
      node("eval-self-test", ["eval/run.ts", "--self-test"], /^self-test PASS \(/m),
    ] : []),
    flags.includes("--runtime")
      ? npm("runtime", ["run", "e2e"], /^runtime-test: PASS$/m)
      : npm("build", ["run", "build"]),
  ];
}

export async function withLock(dir, task) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "running.lock");
  let fd;
  try { fd = openSync(path, "wx"); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error(`Verification is already running, or left a stale lock: ${path}. Inspect its PID before removing it.`);
    throw error;
  }
  try {
    writeFileSync(fd, `${JSON.stringify({ pid: process.pid, started: new Date().toISOString() })}\n`);
    return await task();
  } finally { closeSync(fd); rmSync(path); }
}

async function runStep(step, root, log, signal) {
  const started = Date.now();
  writeFileSync(log, "");
  if (signal?.aborted) return { name: step.name, code: 1, error: "Cancelled", log, ms: 0 };
  console.log(`\nverify: ${step.name} — ${step.command} ${step.args.join(" ")}`);
  return new Promise(resolveResult => {
    // A cancelled npm task must not leave its Electron or test children running.
    const child = spawn(step.command, step.args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], detached: true });
    let spawnError;
    let killTimer;
    const kill = kind => {
      if (!child.pid) return;
      try { process.kill(-child.pid, kind); }
      catch (error) { if (error.code !== "ESRCH") console.error(error); }
    };
    const cancel = () => {
      kill("SIGTERM");
      killTimer = setTimeout(() => kill("SIGKILL"), 5000);
    };
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    child.stdout.on("data", bytes => { appendFileSync(log, bytes); process.stdout.write(bytes); });
    child.stderr.on("data", bytes => { appendFileSync(log, bytes); process.stderr.write(bytes); });
    child.on("error", error => { spawnError = error.message; });
    child.on("close", (exitCode, exitSignal) => {
      signal?.removeEventListener("abort", cancel);
      clearTimeout(killTimer);
      let code = spawnError ? 127 : (exitCode ?? 1);
      let error = spawnError;
      if (signal?.aborted) { code = 1; error = "Cancelled"; }
      if (code === 0 && step.pass && !step.pass.test(readFileSync(log, "utf8"))) {
        code = 1; error = "Missing suite completion marker";
      }
      resolveResult({ name: step.name, command: [step.command, ...step.args], code, signal: exitSignal, error, log, ms: Date.now() - started });
    });
  });
}

export async function runSteps(steps, root, dir, signal) {
  mkdirSync(dir, { recursive: true });
  const results = [];
  for (const step of steps) {
    const result = await runStep(step, root, join(dir, `${step.name}.log`), signal);
    results.push(result);
    writeFileSync(join(dir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
    if (result.code !== 0) {
      console.error(`verify: FAILED at ${step.name} (exit ${result.code}${result.signal ? `, ${result.signal}` : ""}${result.error ? `, ${result.error}` : ""})`);
      return { code: result.code, results };
    }
  }
  return { code: 0, results };
}

async function main() {
  const flags = process.argv.slice(2);
  const steps = plan(flags);
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const base = join(root, ".scratch", "verify");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on("SIGINT", cancel); process.on("SIGTERM", cancel);
  try {
    return await withLock(base, async () => {
      const dir = join(base, `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`);
      mkdirSync(dir);
      const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
      writeFileSync(join(dir, "context.json"), `${JSON.stringify({ root, head: git(["rev-parse", "HEAD"]), status: git(["status", "--short"]), flags }, null, 2)}\n`);
      console.log(`verify: logs ${dir}`);
      const result = await runSteps(steps, root, dir, controller.signal);
      if (result.code === 0) console.log(`verify: PASS — ${result.results.map(row => row.name).join(", ")}`);
      return result.code;
    });
  } finally { process.off("SIGINT", cancel); process.off("SIGTERM", cancel); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(`verify: FAILED — ${error.message}`); process.exitCode = 1; });
}
