import { execFile } from "node:child_process";
import type { Author } from "../../formats/types";

function config(root: string, key: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  return new Promise((resolve, reject) => {
    execFile("git", ["config", "--get", key], { cwd: root, env, timeout: 10_000, encoding: "utf8" }, (error, stdout) => {
      if (!error) resolve(stdout.trim());
      else if (error.code === 1 && !error.killed) resolve(null);
      else reject(new Error(`Git configuration could not be read: ${error.message}`));
    });
  });
}

export async function readAuthor(root: string, env = process.env): Promise<Author> {
  const name = await config(root, "user.name", env);
  if (!name) throw new Error("Configure a Git user name before saving comments.");
  const email = await config(root, "user.email", env);
  return email ? { kind: "human", name, email } : { kind: "human", name };
}
