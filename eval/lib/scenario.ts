import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";

export interface Scenario {
  id: string;
  title: string;
  focus: "write" | "comments" | "active" | "injection" | "implement" | "understand";
  init: { tokenCss: string } | null;
  selection: "selection.json" | null;
  timeoutSec: number;
  mcp: boolean;
  shellCli: boolean;
}

export interface LoadedScenario extends Scenario {
  dir: string;
  promptTemplate: string;
  rubric: string;
  // The app-socket v1 selection without `root`; the runner adds the temp repo's root.
  selectionValue: Record<string, unknown> | null;
}

const FOCUS = ["write", "comments", "active", "injection", "implement", "understand"];
const KEYS = ["id", "title", "focus", "init", "selection", "timeoutSec", "mcp", "shellCli"];

function fail(id: string, message: string): never {
  throw new Error(`scenario ${id}: ${message}`);
}

function relativeInside(path: unknown): path is string {
  return typeof path === "string" && path !== "" && !isAbsolute(path) && !normalize(path).startsWith("..");
}

export function parseScenarioJson(value: unknown, dirName: string): Scenario {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(dirName, "scenario.json is not an object");
  const v = value as Record<string, unknown>;
  const extra = Object.keys(v).filter(key => !KEYS.includes(key));
  if (extra.length) fail(dirName, `unknown keys ${extra.join(", ")}`);
  if (v.id !== dirName) fail(dirName, "id must equal the directory name");
  if (typeof v.title !== "string" || v.title === "") fail(dirName, "title must be a non-empty string");
  if (!FOCUS.includes(v.focus as string)) fail(dirName, `focus must be one of ${FOCUS.join(", ")}`);
  const init = v.init ?? null;
  if (init !== null) {
    const keys = typeof init === "object" ? Object.keys(init) : [];
    if (keys.length !== 1 || keys[0] !== "tokenCss" || !relativeInside((init as { tokenCss: unknown }).tokenCss)) fail(dirName, "init must be null or { tokenCss: <seed-relative path> }");
  }
  const selection = v.selection ?? null;
  if (selection !== null && selection !== "selection.json") fail(dirName, 'selection must be null or "selection.json"');
  if (v.mcp !== undefined && typeof v.mcp !== "boolean") fail(dirName, "mcp must be boolean");
  const mcp = v.mcp === true;
  if (v.shellCli !== undefined && typeof v.shellCli !== "boolean") fail(dirName, "shellCli must be boolean");
  const shellCli = v.shellCli !== false;
  const timeoutSec = v.timeoutSec ?? 900;
  if (!Number.isInteger(timeoutSec) || (timeoutSec as number) < 1) fail(dirName, "timeoutSec must be a positive whole number");
  return { mcp, shellCli, id: dirName, title: v.title, focus: v.focus as Scenario["focus"], init: init as Scenario["init"], selection: selection as Scenario["selection"], timeoutSec: timeoutSec as number };
}

export function renderPrompt(template: string, repo: string): string {
  const rendered = template.replace(/\{\{\s*repo\s*\}\}/g, repo);
  const other = rendered.match(/\{\{[^}]*\}\}/);
  if (other) throw new Error(`prompt has a placeholder other than {{repo}}: ${other[0]}`);
  return rendered;
}

export function scenarioIds(root: string): string[] {
  return readdirSync(root).filter(name => statSync(join(root, name)).isDirectory()).sort();
}

// Ids starting with `_` exist only for the self-test and never enter a real round.
export function selectIds(all: string[], requested: string[] | null, selfTest: boolean): string[] {
  if (requested === null) return all.filter(id => selfTest || !id.startsWith("_"));
  for (const id of requested) {
    if (!all.includes(id)) throw new Error(`no scenario ${id} in eval/scenarios/`);
    if (id.startsWith("_") && !selfTest) throw new Error(`${id} is a self-test example, not a scenario for real rounds`);
  }
  return requested;
}

export function loadScenario(root: string, id: string): LoadedScenario {
  const dir = join(root, id);
  const scenario = parseScenarioJson(JSON.parse(readFileSync(join(dir, "scenario.json"), "utf8")), id);
  for (const path of ["prompt.md", "rubric.md", "checks.ts", "seed", "fixtures/pass", "fixtures/fail"])
    if (!existsSync(join(dir, path))) fail(id, `missing ${path}`);
  const promptTemplate = readFileSync(join(dir, "prompt.md"), "utf8");
  renderPrompt(promptTemplate, "/repo");
  if (scenario.init && !existsSync(join(dir, "seed", scenario.init.tokenCss))) fail(id, `init.tokenCss ${scenario.init.tokenCss} is not in seed/`);
  let selectionValue: Record<string, unknown> | null = null;
  if (scenario.selection) {
    selectionValue = JSON.parse(readFileSync(join(dir, scenario.selection), "utf8"));
    if (typeof selectionValue !== "object" || selectionValue === null || "root" in selectionValue) fail(id, "selection.json must be an object without root");
  }
  return { ...scenario, dir, promptTemplate, rubric: readFileSync(join(dir, "rubric.md"), "utf8"), selectionValue };
}
