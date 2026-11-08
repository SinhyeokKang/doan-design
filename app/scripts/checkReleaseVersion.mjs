// Usage: node app/scripts/checkReleaseVersion.mjs <version>
//        node app/scripts/checkReleaseVersion.mjs --tag v<version>
// The --tag form (the release workflow) also requires app/package.json to carry that version.
// Needs git and gh with access to the repository; drafts are listed only for tokens with write access.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkReleaseVersion } from "./releaseChecks.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    console.error(`${command} ${args.join(" ")} exited ${result.status}`);
    process.exit(2);
  }
  return result.stdout;
}

const args = process.argv.slice(2);
let version;
let packageVersion;
if (args[0] === "--tag" && args.length === 2) {
  if (!args[1].startsWith("v")) {
    console.error(`tag_mismatch: tag ${args[1]} does not start with v`);
    process.exit(1);
  }
  version = args[1].slice(1);
  packageVersion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
} else if (args.length === 1 && !args[0].startsWith("-")) {
  version = args[0];
} else {
  console.error("usage: checkReleaseVersion.mjs <version> | --tag v<version>");
  process.exit(2);
}

const tags = capture("git", ["ls-remote", "--tags", "--refs", "origin", "refs/tags/v*"])
  .split("\n")
  .map((line) => line.split("\t")[1])
  .filter(Boolean)
  .map((ref) => ref.replace(/^refs\/tags\//, ""));
const releases = JSON.parse(capture("gh", ["release", "list", "--limit", "1000", "--json", "tagName,isDraft,isPrerelease"]));

const result = checkReleaseVersion({ version, packageVersion, tags, releases });
if (!result.ok) {
  console.error(`${result.code}: ${result.message}`);
  process.exit(1);
}
console.log(`ok ${version}`);
