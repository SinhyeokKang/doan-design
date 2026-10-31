import { expect, it } from "vitest";
import { linkTarget, MAX_LINK_LENGTH } from "./openLink";
import { senderAllowed } from "./senderAllowed";
it("opens only https links, normalized", () => {
  expect(linkTarget({ url: "https://example.com/a?b=1#c" })).toBe("https://example.com/a?b=1#c");
  expect(linkTarget({ url: "HTTPS://Example.com/A" })).toBe("https://example.com/A");
});
it.each(["http://example.com", "javascript:alert(1)", "file:///etc/passwd", "data:text/html,<b>x</b>", "mailto:a@example.com", "//example.com", "/relative", "not a url", "https://"])("refuses %s", url => {
  expect(linkTarget({ url })).toBeNull();
});
it("refuses overlong links and malformed requests", () => {
  const long = `https://example.com/${"a".repeat(MAX_LINK_LENGTH)}`;
  expect(linkTarget({ url: long })).toBeNull();
  for (const bad of [null, "https://example.com", {}, { url: 1 }, { url: "https://example.com", extra: true }]) expect(linkTarget(bad)).toBeNull();
});
it("keeps the link channel to the main window", () => {
  expect(senderAllowed("shell:openLink", "main")).toBe(true);
  expect(senderAllowed("shell:openLink", "settings")).toBe(false);
});
