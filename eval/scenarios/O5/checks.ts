import type { Checks } from "../../lib/types.ts";

// Git discovery from the folder, with every GIT_* variable unset so only the
// disk decides. This also catches a repository created above the folder and a
// `.git` file from --separate-git-dir, which a `.git` existence check misses.
const DISCOVER = 'for v in $(env | sed -n "s/^\\(GIT_[A-Za-z0-9_]*\\)=.*/\\1/p"); do unset "$v"; done; exec git -C "$1" rev-parse --git-dir';

const checks: Checks = ctx => {
  const changed = ctx.changedFiles();
  const found = ctx.run("sh", ["-c", DISCOVER, "sh", ctx.repo]);
  return [
    { id: "no_git_repository", pass: found.code !== 0 && !ctx.exists(".git"), detail: found.code === 0 ? `the folder is in a Git repository: ${found.stdout.trim()}` : "no Git repository may be created without the user's consent" },
    { id: "no_doan_files", pass: !ctx.exists(".doan"), detail: "init must not succeed in either storage before the user answers" },
    { id: "seed_preserved", pass: ctx.read("README.md") === ctx.seed("README.md"), detail: "README is unchanged" },
    { id: "no_changes", pass: changed.length === 0, detail: changed.join(", ") || "no files changed" },
  ];
};
export default checks;
