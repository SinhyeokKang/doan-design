import { expect, test } from "vitest";
import { senderAllowed } from "./senderAllowed";
const mainOnly = [
  "app:home", "comments:list", "comments:begin", "comments:mutate", "comments:status", "comments:author", "comments:copy", "comments:guard", "comments:transition-answer",
  "project:choose-token-css", "project:init", "folders:add", "folders:add-paths", "folders:scan", "folders:scan-cancel", "folders:add-candidates", "folders:confirm-folder",
  "folders:remove", "folders:restore", "folders:forget-removal", "folders:locate", "folders:reveal", "folders:open", "folders:reopen",
  "selection:set", "inspect:get", "thumbnails:get", "thumbnails:visible", "menu:state", "ui-state:get", "ui-state:save", "onboarding:get-open", "onboarding:close", "onboarding:first-prompt", "onboarding:copy",
];
const shared = ["onboarding:read", "onboarding:run", "onboarding:answer", "setup:read", "setup:run", "setup:answer", "setup:check-again", "setup:open-external", "folders:get"];
const settingsOnly = ["config:read", "config:write", "config:choose"];
test.each(mainOnly)("restricts %s to main", channel => {
  expect(senderAllowed(channel, "main")).toBe(true);
  expect(senderAllowed(channel, "settings")).toBe(false);
});
test.each(shared)("shares %s with Settings", channel => {
  expect(senderAllowed(channel, "main")).toBe(true);
  expect(senderAllowed(channel, "settings")).toBe(true);
});
test.each(settingsOnly)("restricts %s to Settings", channel => {
  expect(senderAllowed(channel, "main")).toBe(false);
  expect(senderAllowed(channel, "settings")).toBe(true);
});
test("rejects unknown channels and every unregistered window", () => {
  for (const channel of [...mainOnly, ...shared, ...settingsOnly, "", "setup:delete", "comments:evil", "toString", "__proto__"]) {
    for (const kind of [undefined, null, "thumbnail", "unknown", "", 1, {}]) expect(senderAllowed(channel, kind)).toBe(false);
  }
  for (const kind of ["main", "settings"]) for (const channel of ["", "setup:delete", "comments:evil", "toString", "__proto__"]) expect(senderAllowed(channel, kind)).toBe(false);
});
