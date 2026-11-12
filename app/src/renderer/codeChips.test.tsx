import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { withChips } from "./codeChips";

const html = (text: string, paths: string[] = []) => renderToStaticMarkup(<>{withChips(text, paths)}</>);

// Commands, fixed paths and a .git Doan left behind read as code on every setup surface and in Project Settings.
test("commands, Doan's fixed paths and a named .git read as code", () => {
  expect(html("Install the Command Line Tools with xcode-select --install, then try again.")).toBe("Install the Command Line Tools with <code>xcode-select --install</code>, then try again.");
  expect(html("Doan will run git init here, then keep .doan/ out of it.")).toBe("Doan will run <code>git init</code> here, then keep <code>.doan/</code> out of it.");
  expect(html("Couldn’t add Doan’s lines to .git/info/exclude, so nothing was set up.")).toBe("Couldn’t add Doan’s lines to <code>.git/info/exclude</code>, so nothing was set up.");
  expect(html("it created at /Users/you/a b/new/.git. Remove it", ["/Users/you/a b/new/.git"])).toBe("it created at <code>/Users/you/a b/new/.git</code>. Remove it");
});

test("text without them stays as it is, and a longer path is never cut into a chip", () => {
  expect(html("Couldn’t set up this folder.")).toBe("Couldn’t set up this folder.");
  expect(html("Cannot read config: /w/.doan/config.json")).toBe("Cannot read config: /w/.doan/config.json");
  expect(html("at /w/new/.git/info", ["/w/new/.git"])).toBe("at /w/new/.git/info");
});
