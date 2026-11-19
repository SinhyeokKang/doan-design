import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { build, type Rolldown } from "vite";
import { launchElectronDom, type ElectronDom } from "../../runtime/electronDom";

let dom: ElectronDom;
let script: string;

beforeAll(async () => {
  const entry = fileURLToPath(new URL("./worktree-probe.tsx", import.meta.url));
  const result = await build({ configFile: false, logLevel: "silent", define: { __DOAN_BUILD_YEAR__: JSON.stringify(new Date().getFullYear()), "process.env.NODE_ENV": JSON.stringify("development") }, plugins: [{
    name: "worktree-probe",
    resolveId(id) { if (id === entry) return entry; },
    load(id) {
      if (id !== entry) return;
      return `
        import { createRoot } from "react-dom/client";
        import { WorktreeSwitch } from "./WorktreeSwitch";
        import { TooltipProvider } from "./components/ui/tooltip";
        import { headerRowState, worktreeSwitchModel } from "./worktreeSwitchModel";
        import { mountCanvas, mountRecovery } from "./WorktreeSwitch.dom.fixture";
        const main = { path: "/code/demo", kind: "list", git: { branch: "main" }, canvases: [{path: "a.html"}] };
        const root = createRoot(document.querySelector("main"));
        window.mountCanvas = () => { window.pick = mountCanvas(root); };
        window.mountRecovery = (host, kind) => mountRecovery(root, host, kind);
        window.draw = (ready, reason) => {
          const other = ready ? {...main, path: "/code/next", git: {branch: "next"}, canvases: ready === "gone" ? [] : main.canvases} : {kind: "loading", path: "/code/next"};
          const missing = { kind: "notFound", path: "/code/archived" };
          const model = worktreeSwitchModel([main, other, missing], main.path, "/code", row => headerRowState(row, "a.html"));
          root.render(<TooltipProvider><div onKeyDown={() => document.body.dataset.key = "bubbled"} onClick={() => document.body.dataset.click = "bubbled"}>
            <WorktreeSwitch model={model} reason={reason} sidebar tabIndex={0} onWorktree={root => document.body.dataset.moved = root} />
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
  expect(await frame.getByRole("menuitem", { name: "next ~/next", description: "Reading…", exact: true }).count()).toBe(1);
  await next.press("Enter");
  expect(await next.isVisible()).toBe(true);
  await frame.evaluate(() => (window as unknown as { draw(ready: boolean, reason: null): void }).draw(true, null));
  await expect.poll(() => next.getAttribute("aria-disabled")).toBeNull();
  expect(await next.evaluate(node => document.activeElement === node)).toBe(true);
  await frame.getByRole("menuitem", { name: /main/ }).click();
  await next.waitFor({ state: "hidden" });
  expect(await frame.locator("body").getAttribute("data-moved")).toBeNull();
  await trigger.press("ArrowDown");
  await next.click();
  expect(await frame.locator("body").getAttribute("data-moved")).toBe("/code/next");
});

async function canvas() {
  const frame = await dom.load("<main></main>");
  frame.page().setDefaultTimeout(4_000);
  await frame.addScriptTag({ content: script });
  await frame.evaluate(() => (window as unknown as { mountCanvas(): void }).mountCanvas());
  return frame;
}

test("choosing a worktree from the canvas header with the keyboard returns focus to its trigger", async () => {
  const frame = await canvas();
  await frame.getByRole("button", { name: "Worktree: main" }).press("ArrowDown");
  await frame.getByRole("menuitem", { name: /next/ }).press("Enter");
  const trigger = frame.getByRole("button", { name: "Worktree: next" });
  await trigger.waitFor();
  await expect.poll(() => trigger.evaluate(node => document.activeElement === node)).toBe(true);
});

test("Escape cancels a pick while the canvas worktree trigger has focus", async () => {
  const frame = await canvas();
  const trigger = frame.getByRole("button", { name: "Worktree: main" });
  await trigger.focus();
  expect(await frame.evaluate(() => (window as unknown as { pick(): boolean }).pick())).toBe(true);
  await trigger.press("Escape");
  expect(await frame.locator("body").getAttribute("data-picking")).toBe("false");
});

test("H switches tools while the canvas worktree trigger has focus", async () => {
  const frame = await canvas();
  const trigger = frame.getByRole("button", { name: "Worktree: main" });
  await trigger.press("h");
  expect(await frame.locator("body").getAttribute("data-tool")).toBe("hand");
});

for (const host of ["overview", "sidebar"] as const) {
  test.each([["cliError", "CLI error", "warn"], ["error", "Config error", "err"]] as const)(host + " routes the %s row's repair actions to its root", async (kind, label, tone) => {
    const frame = await dom.load("<main></main>");
    frame.page().setDefaultTimeout(4_000);
    await frame.addScriptTag({ content: script });
    await frame.evaluate(({ host, kind }) => (window as unknown as { mountRecovery(host: string, kind: string): void }).mountRecovery(host, kind), { host, kind });
    await frame.getByRole("button", { name: "Worktree: main" }).press("ArrowDown");
    const current = frame.getByRole("menuitem", { name: /main/ });
    const problem = frame.getByRole("menuitem", { name: new RegExp(label) });
    await problem.click();
    expect(await problem.getByText(label, { exact: true }).evaluate((node, tone) => node.matches(".ob-chip." + tone), tone)).toBe(true);
    expect(await problem.locator(".shell-problem").count()).toBe(0);
    expect.soft(await current.getAttribute("aria-current")).toBeNull();
    expect.soft(await current.locator(".lucide-check").count()).toBe(0);
    expect.soft(await problem.getAttribute("aria-current")).toBe("true");
    expect.soft(await problem.locator(".lucide-check").count()).toBe(1);
    for (const [name, icon] of [["Retry", "rotate-cw"], ["Details", "info"]] as const) {
      const action = frame.getByRole("menuitem", { name, exact: true });
      expect(await action.locator(`svg.lucide-${icon}`).getAttribute("aria-hidden")).toBe("true");
      await action.press("Enter");
      expect(await frame.locator("body").getAttribute("data-action")).toBe(name.toLowerCase() + "/code/next");
    }
  });
}

test("the sidebar switch keeps clicks, disclosure and typeahead out of the tree and explains a lock", async () => {
  const frame = await dom.load("<main></main>");
  await frame.addScriptTag({ content: script });
  const trigger = frame.getByRole("button", { name: "Worktree: main" });
  for (const key of ["ArrowLeft", "ArrowRight", "d"]) await trigger.press(key);
  expect(await frame.locator("body").getAttribute("data-key")).toBeNull();
  await trigger.click();
  await frame.getByRole("menu", { name: "Worktrees" }).waitFor();
  expect(await frame.locator("body").getAttribute("data-click")).toBeNull();
  await frame.evaluate(() => (window as unknown as { draw(ready: boolean, reason: string): void }).draw(true, "Finish or cancel the current task."));
  await frame.getByRole("menu").waitFor({ state: "hidden" });
  expect(await trigger.getAttribute("aria-disabled")).toBe("true");
  expect(await trigger.getAttribute("tabindex")).toBe("0");
  expect(await trigger.evaluate(node => node.ownerDocument.getElementById(node.getAttribute("aria-describedby")!)?.textContent)).toBe("Finish or cancel the current task.");
  await trigger.press("Enter");
  expect(await trigger.getAttribute("aria-expanded")).toBe("false");
});

test("a disabled worktree with a status chip exposes the chip as its description", async () => {
  const frame = await dom.load("<main></main>");
  await frame.addScriptTag({ content: script });
  await frame.getByRole("button", { name: "Worktree: main" }).press("ArrowDown");
  await frame.getByRole("menu", { name: "Worktrees" }).waitFor();
  expect(await frame.getByRole("menuitem", { name: "archived ~/archived", description: "Missing", disabled: true, exact: true }).count()).toBe(1);
});

test("a canvas which vanishes from a previously offered worktree is rechecked when pressed", async () => {
  const frame = await dom.load("<main></main>");
  await frame.addScriptTag({ content: script });
  const draw = (state: boolean | string) => frame.evaluate(state => (window as unknown as { draw(ready: boolean | string, reason: null): void }).draw(state, null), state);
  await draw(true);
  await frame.getByRole("button", { name: "Worktree: main" }).press("ArrowDown");
  await draw("gone");
  const gone = frame.getByRole("menuitem", { name: "next ~/next", description: "No a here", exact: true });
  await frame.getByText("No a here", { exact: true }).waitFor();
  expect(await gone.count()).toBe(1);
  expect(await gone.getAttribute("aria-disabled")).toBe("true");
  await gone.press("Enter");
  expect(await frame.locator("body").getAttribute("data-moved")).toBe("/code/next");
});
