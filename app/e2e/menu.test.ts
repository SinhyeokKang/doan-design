import assert from "node:assert/strict";
import { test } from "node:test";
const windows: typeof import("./windows") = await import(new URL("./windows.ts", import.meta.url).href);

test("disabled menu handlers and roles never execute; enabled items execute", async () => {
  let clicks = 0, quits = 0, fullscreen = 0;
  const item = { label: "Action", enabled: false, role: undefined as string | undefined, click: () => { clicks++; } };
  const electron = { Menu: { getApplicationMenu: () => ({ items: [item] }), sendActionToFirstResponder: () => { quits++; } } };
  const window = { setFullScreen: () => { fullscreen++; } };
  const invoke = (label: string) => windows.clickMenu(electron as unknown as Parameters<typeof windows.clickMenu>[0], [label, window] as unknown as Parameters<typeof windows.clickMenu>[1]);
  assert.equal(invoke("Action"), false); assert.equal(clicks, 0);
  item.enabled = true; assert.equal(invoke("Action"), true); assert.equal(clicks, 1);
  item.role = "quit"; assert.equal(invoke("Action"), true); assert.equal(quits, 1);
  item.role = "togglefullscreen"; item.enabled = false;
  assert.equal(invoke("Enter Full Screen"), false); assert.equal(fullscreen, 0);
  item.enabled = true; assert.equal(invoke("Enter Full Screen"), true); assert.equal(fullscreen, 1);
});

test("menu polling waits for enablement and fails for a permanently disabled item", async t => {
  let enabled = false, clicks = 0, polls = 0;
  const electron = { Menu: { getApplicationMenu: () => ({ items: [{ label: "Action", get enabled() { return enabled; }, click: () => { clicks++; } }] }) } };
  const app = { browserWindow: async () => ({}), evaluate: async (callback: Function, args: unknown) => callback(electron, args) };
  const page = { waitForTimeout: async () => { polls++; enabled = true; } };
  await windows.menu(app as unknown as Parameters<typeof windows.menu>[0], page as unknown as Parameters<typeof windows.menu>[1], "Action");
  assert.equal(polls, 1); assert.equal(clicks, 1);
  enabled = false;
  let clock = 0; t.mock.method(Date, "now", () => clock += 11_000);
  await assert.rejects(windows.menu(app as unknown as Parameters<typeof windows.menu>[0], page as unknown as Parameters<typeof windows.menu>[1], "Action"), /Disabled or missing menu/);
  assert.equal(clicks, 1);
});
