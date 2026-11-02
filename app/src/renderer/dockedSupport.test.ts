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

// RV-B 🟡3: a pending pick remembers the stored mode it was made from. When main moves the stored mode off that value
// (a plan approval the list read caught only at its end), the pick is dropped and the stored mode shows.
test("a pending pick is dropped when the stored mode changes from the one it was made from", async () => {
  vi.stubGlobal("window", { doan: { setConversationPermissionMode: vi.fn(async () => undefined) } });
  const support = new DockedSupport(() => {});
  support.pickPermission("conversation:c1", "c1", "acceptEdits", "plan");
  await flush();
  support.settlePermission("conversation:c1", "plan");
  expect(support.picks["conversation:c1"]).toMatchObject({ permissionMode: "acceptEdits" });
  support.settlePermission("conversation:c1", "default");
  expect(support.picks["conversation:c1"]).toEqual({});
});

// RV-B 🟡2: a conversation started here shows the mode it was started in until its summary arrives; the summary then
// speaks, whatever it says. It is no pick of the person's: it is not sent or remembered.
test("a just-started conversation's mode shows until its summary arrives", () => {
  const support = new DockedSupport(() => {});
  support.startedIn("conversation:c1", "bypass");
  expect(support.started["conversation:c1"]).toBe("bypass");
  expect(support.picks["conversation:c1"]).toBeUndefined();
  support.settlePermission("conversation:c1", null);
  expect(support.started["conversation:c1"]).toBe("bypass");
  support.settlePermission("conversation:c1", "default");
  expect(support.started["conversation:c1"]).toBeUndefined();
});
