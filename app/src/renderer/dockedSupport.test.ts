import { afterEach, expect, test, vi } from "vitest";
import { DockedSupport } from "./dockedSupport";

afterEach(() => vi.unstubAllGlobals());
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

// permission-mode spec decision 7, orch decision 8: an existing conversation's pick is stored by main at once, shows
// until the conversation's summary reports it, and a refused one falls back to the stored mode.
test("an existing conversation's mode pick is stored at once and shows until the summary reports it", async () => {
  const set = vi.fn(async () => undefined);
  vi.stubGlobal("window", { doan: { setConversationPermissionMode: set } });
  const support = new DockedSupport(() => {});
  support.pickPermission("conversation:c1", "c1", "bypass");
  expect(set).toHaveBeenCalledWith({ conversationId: "c1", permissionMode: "bypass" });
  await flush();
  expect(support.picks["conversation:c1"]).toEqual({ permissionMode: "bypass" });
  support.settlePermission("conversation:c1", "default");
  expect(support.picks["conversation:c1"]).toEqual({ permissionMode: "bypass" });
  support.settlePermission("conversation:c1", "bypass");
  expect(support.picks["conversation:c1"]).toEqual({});
});

test("a refused pick goes back to the stored mode; a new conversation's pick calls nothing", async () => {
  const set = vi.fn(async () => ({ error: "bad_request" }));
  vi.stubGlobal("window", { doan: { setConversationPermissionMode: set } });
  const support = new DockedSupport(() => {});
  support.pickPermission("conversation:c1", "c1", "plan");
  await flush();
  expect(support.picks["conversation:c1"]).toEqual({});
  support.pickPermission("new:/r", null, "plan");
  expect(set).toHaveBeenCalledTimes(1);
  expect(support.picks["new:/r"]).toEqual({ permissionMode: "plan" });
});
