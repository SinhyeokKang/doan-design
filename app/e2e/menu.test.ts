import assert from "node:assert/strict";
import { test } from "node:test";
import * as windows from "./windows.ts";

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
