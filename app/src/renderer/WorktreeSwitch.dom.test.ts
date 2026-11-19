import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { build, type Rolldown } from "vite";
import { launchElectronDom, type ElectronDom } from "../../runtime/electronDom";

let dom: ElectronDom;
let script: string;

beforeAll(async () => {
  const entry = fileURLToPath(new URL("./worktree-probe.tsx", import.meta.url));
  const result = await build({ configFile: false, logLevel: "silent", define: { "process.env.NODE_ENV": JSON.stringify("development") }, plugins: [{
    name: "worktree-probe",
    resolveId(id) { if (id === entry) return entry; },
    load(id) {
      if (id !== entry) return;
      return `
        import { createRoot } from "react-dom/client";
        import { WorktreeSwitch } from "./WorktreeSwitch";
        import { TooltipProvider } from "./components/ui/tooltip";
        import { headerRowState, worktreeSwitchModel } from "./worktreeSwitchModel";
        const main = { path: "/code/demo", kind: "list", git: { branch: "main" }, canvases: [{path: "a.html"}] };
        const root = createRoot(document.querySelector("main"));
        window.draw = (ready, reason, problem) => {
          const other = ready ? {...main, path: "/code/next", git: {branch: "next"}} : {kind: "loading", path: "/code/next"};
          const rows = [main, problem ? {kind: problem, path: other.path} : other];
          const model = worktreeSwitchModel(rows, main.path, "/code", problem ? undefined : row => headerRowState(row, "a.html"));
          root.render(<TooltipProvider><div onKeyDown={() => document.body.dataset.key = "bubbled"} onClick={() => document.body.dataset.click = "bubbled"}>
            <WorktreeSwitch model={model} reason={reason} tabIndex={0} onWorktree={root => document.body.dataset.moved = root}
              recovery={{action: (name, root) => document.body.dataset.action = name + root, projectSettings: () => {}}} />
          </div></TooltipProvider>);
        };
        window.draw(false, null);
      `;
    },
  }], build: { write: false, lib: { entry, formats: ["iife"], name: "Probe" } } });
  script = ((Array.isArray(result) ? result[0] : result) as Rolldown.RolldownOutput).output[0].code;
  dom = await launchElectronDom();
}, 60_000);
afterAll(async () => { await dom?.close(); }, 30_000);

test("a reading row becomes selectable under the same focus, and reselecting the current row only closes", async () => {
  const frame = await dom.load("<main></main>");
  frame.page().setDefaultTimeout(4_000);
  await frame.addScriptTag({ content: script });
  const trigger = frame.getByRole("button", { name: "Worktree: main" });
  await trigger.press("ArrowDown");
  const next = frame.getByRole("menuitem", { name: /next/ });
  await next.focus();
  expect(await next.getAttribute("aria-disabled")).toBe("true");
  await next.press("Enter");
  expect(await next.isVisible()).toBe(true);
  await frame.evaluate(() => (window as unknown as { draw(ready: boolean, reason: null): void }).draw(true, null));
  await next.locator("small").waitFor();
  await expect.poll(() => next.getAttribute("aria-disabled")).toBeNull();
  expect(await next.evaluate(node => document.activeElement === node)).toBe(true);
  await frame.getByRole("menuitem", { name: /main/ }).click();
  await next.waitFor({ state: "hidden" });
  expect(await frame.locator("body").getAttribute("data-moved")).toBeNull();
  await trigger.press("ArrowDown");
  await next.click();
  expect(await frame.locator("body").getAttribute("data-moved")).toBe("/code/next");
});

test.each([["cliError", "CLI error"], ["error", "Config error"]] as const)("a %s row shows its status, repair icons and actions for its root", async (kind, label) => {
  const frame = await dom.load("<main></main>");
  frame.page().setDefaultTimeout(4_000);
  await frame.addScriptTag({ content: script });
  await frame.evaluate(kind => (window as unknown as { draw(ready: boolean, reason: null, problem: string): void }).draw(false, null, kind), kind);
  await frame.getByRole("button", { name: "Worktree: main" }).press("ArrowDown");
  await frame.getByRole("menuitem", { name: new RegExp(label) }).click();
  for (const [name, icon] of [["Retry", "rotate-cw"], ["Details", "info"]] as const) {
    const action = frame.getByRole("menuitem", { name, exact: true });
    expect(await action.locator(`svg.lucide-${icon}`).getAttribute("aria-hidden")).toBe("true");
    await action.press("Enter");
    expect(await frame.locator("body").getAttribute("data-action")).toBe(name.toLowerCase() + "/code/next");
  }
});
