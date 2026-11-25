import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { plannedTargets } from "./agentSetup/plan";
import { cliCommand } from "./cli";

// The packaged layout is what `build.extraResources` copies; the app and agent setup spell the same paths.
const APP = join(__dirname, "../..");
const manifest = JSON.parse(readFileSync(join(APP, "package.json"), "utf8")) as { build: { extraResources: { from: string; to: string }[] } };
const packagedPath = (from: string) => {
  const entry = manifest.build.extraResources.find(resource => resource.from === from);
  if (!entry) throw new Error(`extraResources does not copy ${from}`);
  return entry.to;
};

const HOME = "/Users/someone", RESOURCES = "/Applications/Doan.app/Contents/Resources";
const targets = plannedTargets(HOME, RESOURCES, [], true);
const want = (target: string) => targets.find(planned => planned.target === target)?.want;
// `current` links to the bundle's resources, so a path under it is a packaged path.
const current = `${HOME}/.local/share/doan/current`;

test("the packaged app runs the CLI where the package puts it", () => {
  expect(cliCommand({}, true, RESOURCES)).toBe(`${RESOURCES}/${packagedPath("build/bin/doan")}`);
});

test("agent setup links the CLI and the skill where the package puts them", () => {
  expect(want("current")).toBe(RESOURCES);
  const cli = `${current}/${packagedPath("build/bin/doan")}`;
  expect([want("cli"), want("system-cli")]).toEqual([cli, cli]);
  expect(`${want("skill")}/SKILL.md`).toBe(`${current}/${packagedPath("src/main/onboarding/SKILL.md")}`);
});

test("the packaged skill is the committed stub", () => {
  expect(existsSync(join(APP, "src/main/onboarding/SKILL.md"))).toBe(true);
});

// The CLI spells its own place in the bundle: the guide's onboarding command and the app it may open.
test("the CLI looks for itself where the package puts it", () => {
  const segments = packagedPath("build/bin/doan").split("/");
  const [dir, name, ...deeper] = segments;
  expect(deeper).toEqual([]);
  const source = (file: string) => readFileSync(join(APP, "../cli/internal/cli", file), "utf8");
  const joined = ["Contents", "Resources", ...segments].map(segment => `"${segment}"`).join(", ");
  expect(source("skill.go")).toContain(`filepath.Join(bundle, ${joined})`);
  expect(source("onboarding.go")).toContain(`filepath.Base(real) != "${name}" || filepath.Base(bin) != "${dir}" || filepath.Base(resources) != "Resources"`);
});
