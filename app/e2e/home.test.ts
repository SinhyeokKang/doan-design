import assert from "node:assert/strict";
import { test } from "node:test";
import type { ElectronApplication, Page } from "playwright";
const { goHome }: typeof import("./home") = await import(new URL("./home.ts", import.meta.url).href);

for (const alreadyHome of [false, true]) {
  test(`Home uses the owning native window only when needed (${alreadyHome})`, async () => {
    const owner = { id: 17 }; let clicked = 0, waited = 0;
    const home = { isVisible: async () => alreadyHome, waitFor: async () => { waited++; } };
    const page = { getByRole: (role: string, options: { name: string }) => {
      assert.equal(role, "region"); assert.equal(options.name, "Home"); return home;
    } } as unknown as Page;
    const app = {
      browserWindow: async (target: Page) => { assert.equal(target, page); return owner; },
      evaluate: async (callback: Function, args: unknown) => callback({ Menu: { getApplicationMenu: () => ({ items: [{ label: "Go", submenu: { items: [{ label: "Home", enabled: true, click: (_item: unknown, window: unknown) => { assert.equal(window, owner); clicked++; } }] } }] }) } }, args),
    } as unknown as ElectronApplication;
    await goHome(page, app);
    assert.equal(clicked, alreadyHome ? 0 : 1);
    assert.equal(waited, alreadyHome ? 0 : 1);
  });
}
