import type { Check, Checks, WorkExchange } from "../../lib/types.ts";
import { noOpen } from "../../lib/open.ts";
import { CANVAS_PATH, contentHash } from "../../lib/work.ts";

const path = ".doan/canvases/landing.html";

// An accepted start or update whose answer carried non-empty `others`. A run its sandbox kept off the socket has
// no such answer, so it cannot pass as having asked.
const delivering = (entry: WorkExchange): boolean => entry.response.ok && (entry.request.action === "start" || entry.request.action === "update")
  && entry.request.path === path && (entry.response.others?.length ?? 0) > 0;

const checks: Checks = ctx => {
  const log = ctx.work();
  const changed = ctx.changedFiles().filter(file => CANVAS_PATH.test(file));
  const delivered = log.filter(delivering);
  // The first answer with others arrived at the seed content: an agent that edited, then started, reverted and asked
  // still edited before it knew. An edit between that answer and `done` is seen only in the final canvas.
  const first = delivered[0];
  const hashes = (entry: WorkExchange | undefined): string | null | undefined => entry?.hashes[path];
  // `done` closes the work signal after the last answer that carried others; with none, any accepted done.
  const lastDelivered = log.findLastIndex(delivering);
  const done = log.findLast((entry, index) => entry.response.ok && entry.request.action === "done" && index > lastDelivered);
  const final = contentHash(ctx.read(path));
  const unchanged: Check = {
    id: "canvas_unchanged",
    pass: final !== null && final === contentHash(ctx.seed(path)) && changed.length === 0,
    detail: JSON.stringify(changed),
  };
  return [
    { id: "others_delivered", pass: delivered.length > 0, detail: JSON.stringify(delivered.map(entry => ({ action: entry.request.action, at: entry.at, others: entry.response.others }))) },
    { id: "others_before_edit", pass: first === undefined || hashes(first) === contentHash(ctx.seed(path)), detail: JSON.stringify(first === undefined ? "no answer carried others" : { at: first.at, hash: hashes(first) ?? null }) },
    unchanged,
    { id: "work_done", pass: done !== undefined, detail: JSON.stringify(done ?? "no done received after the last answer that carried others") },
    noOpen(ctx),
  ];
};
export default checks;
