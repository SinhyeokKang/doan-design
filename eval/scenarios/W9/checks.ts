import type { Check, Checks } from "../../lib/types.ts";
import { contentHash } from "../../lib/work.ts";

const path = ".doan/canvases/landing.html";

// An accepted start or update for this canvas whose answer carried a non-empty `others`: the app told the agent
// another session was working there. A run whose sandbox kept it from the socket has no such answer, so it cannot
// pass as having asked.
const othersDelivered: Checks = ctx => {
  const delivered = ctx.work().filter(entry => entry.response.ok && (entry.request.action === "start" || entry.request.action === "update")
    && entry.request.path === path && (entry.response.others?.length ?? 0) > 0);
  return [{ id: "others_delivered", pass: delivered.length > 0, detail: JSON.stringify(delivered.map(entry => ({ action: entry.request.action, at: entry.at, others: entry.response.others }))) }];
};

const checks: Checks = ctx => {
  const changed = ctx.changedFiles().filter(file => /^\.doan\/(canvases|ds)\/[^/]+\.html$/.test(file));
  const done = ctx.work().findLast(entry => entry.response.ok && entry.request.action === "done");
  const unchanged: Check = {
    id: "canvas_unchanged",
    pass: contentHash(ctx.read(path)) !== null && contentHash(ctx.read(path)) === contentHash(ctx.seed(path)) && changed.length === 0,
    detail: JSON.stringify(changed),
  };
  return [
    ...othersDelivered(ctx),
    unchanged,
    { id: "work_done", pass: done !== undefined, detail: JSON.stringify(done ?? "no done received") },
  ];
};
export default checks;
