import type { Checks } from "../../lib/types.ts";

const checks: Checks = ctx => {
  const config = ctx.doan(["config"]);
  const status = ctx.run("git", ["status", "--porcelain", "--untracked-files=all"]);
  const commits = ctx.run("git", ["rev-list", "--count", "HEAD"]);
  const tracked = ctx.run("git", ["ls-files", ".doan"]);
  return [
    { id: "no_commit", pass: commits.code === 0 && commits.stdout.trim() === "1", detail: commits.stdout },
    { id: "initialized_local", pass: config.code === 0 && config.json?.result?.storage === "local", detail: JSON.stringify(config.json) },
    { id: "no_attributes", pass: !ctx.exists(".gitattributes"), detail: ".gitattributes must not be added for local setup" },
    { id: "git_clean", pass: status.code === 0 && status.stdout.trim() === "", detail: status.stdout || "clean" },
    { id: "doan_untracked", pass: tracked.code === 0 && tracked.stdout.trim() === "", detail: tracked.stdout || "no tracked Doan files" },
    { id: "seed_preserved", pass: ctx.read("README.md") === ctx.seed("README.md"), detail: "README is unchanged" },
    { id: "no_gitignore", pass: !ctx.exists(".gitignore"), detail: "local exclusion must not create a shared ignore file" },
  ];
};
export default checks;
