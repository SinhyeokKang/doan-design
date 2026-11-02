import { createHash } from "node:crypto";
import type { Check, CheckContext } from "./types.ts";

export const contentHash = (bytes: string | Buffer | null): string | null => bytes === null ? null : createHash("sha256").update(bytes).digest("hex");

export function workChecks(ctx: CheckContext): Check[] {
  const changed = ctx.changedFiles().filter(path => /^\.doan\/(canvases|ds)\/[^/]+\.html$/.test(path));
  const log = ctx.work().filter(entry => entry.response.ok);
  const starts = changed.map(path => ({ path, first: log.find(entry => entry.request.action === "start" && entry.request.path === path) }));
  const done = log.findLast(entry => entry.request.action === "done");
  return [
    { id: "start_before_edit", pass: changed.length > 0 && starts.every(({ path, first }) => first !== undefined && path in first.hashes && first.hashes[path] === contentHash(ctx.seed(path))), detail: JSON.stringify(starts) },
    { id: "done_at_end", pass: changed.length > 0 && done !== undefined && changed.every(path => path in done.hashes && done.hashes[path] === contentHash(ctx.read(path))), detail: JSON.stringify(done ?? "no done received") },
    { id: "start_path", pass: changed.length > 0 && starts.every(({ first }) => first !== undefined), detail: JSON.stringify(starts.map(({ path, first }) => ({ path, started: first !== undefined }))) },
  ];
}
