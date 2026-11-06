import { contentHash } from "../../lib/work.ts";
import { noOpen } from "../../lib/open.ts";
import type { Checks } from "../../lib/types.ts";

const CANVAS = /^\.doan\/canvases\/[^/]+\.html$/;

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  const changed = ctx.changedFiles();
  // The canvas the turn made: a changed canvas file the seed did not have. The task asks for exactly one, and the
  // source canvas must stay as it was, so the only change is that one file.
  const made = changed.filter(path => CANVAS.test(path) && ctx.seed(path) === null);
  const target = made.length === 1 && changed.length === 1 ? made[0]! : null;
  // Every request the app received, refused ones included: the guidance asks for the command once.
  const requests = ctx.handoff();
  const asked = requests[0];
  const accepted = requests.length === 1 && asked!.response.ok === true;
  const text = asked?.request.text ?? "";
  return [
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    { id: "only_new_canvas_added", pass: target !== null, detail: `changed: ${changed.join(", ") || "(none)"}` },
    { id: "handoff_requested_once", pass: accepted, detail: `v5 requests the app received: ${JSON.stringify(requests.map(e => ({ path: e.request.path, ok: e.response.ok, error: e.response.ok ? undefined : e.response.error.code })))}` },
    { id: "handoff_path_is_new_canvas", pass: target !== null && asked?.request.path === target, detail: `requested ${JSON.stringify(asked?.request.path ?? null)}; new canvas ${JSON.stringify(target)}` },
    // The app judges a handoff when the turn ends, so the canvas has to be complete by the time it is asked for.
    { id: "canvas_written_before_request", pass: target !== null && accepted && asked!.hashes[target] === contentHash(ctx.read(target)), detail: `hash at the request ${JSON.stringify(asked?.hashes ?? null)}` },
    { id: "handoff_message_not_empty", pass: text.trim().length > 0, detail: `message of ${[...text].length} characters` },
    // The turn prompt tells the agent this conversation is inside Doan, so it neither offers nor runs `doan open`.
    noOpen(ctx),
  ];
};
export default checks;
