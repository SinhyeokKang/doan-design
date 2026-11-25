import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

// DESIGN 'Tooltip': the shared tooltip replaces every native `title` in the renderer. An iframe's title is its
// accessible name, not a tooltip.
const renderer = new URL("./", import.meta.url);
function sources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: URL, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { walk(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`); continue; }
      if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$|\.d\.ts$/.test(entry.name)) continue;
      out.push({ path: `${prefix}${entry.name}`, text: readFileSync(new URL(entry.name, dir), "utf8") });
    }
  };
  walk(renderer, "");
  return out;
}

test("no renderer element sets a native title, iframes aside", () => {
  const found: string[] = [];
  for (const file of sources()) {
    file.text.split("\n").forEach((line, index) => {
      for (const match of line.matchAll(/\stitle=[{"]/g)) {
        // The element is the nearest tag opened before the attribute on its line; a capitalised one is a component prop.
        const tag = /<([\w.]+)[^<]*$/.exec(line.slice(0, match.index))?.[1];
        if (tag && /^[a-z]/.test(tag) && tag !== "iframe") found.push(`${file.path}:${index + 1} <${tag}>`);
      }
      if (/\.title\s*=[^=]|setAttribute\(\s*["']title["']/.test(line) && !/document\.title/.test(line)) found.push(`${file.path}:${index + 1} ${line.trim().slice(0, 60)}`);
    });
  }
  expect(found.filter(entry => !/^(CanvasController\.ts|canvasMessage\.ts):/.test(entry))).toEqual([]);
});
