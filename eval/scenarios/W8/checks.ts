import type { Checks } from "../../lib/types.ts";
import { prototypeCalls, prototypeCanvasPath } from "../../lib/prototype.ts";
import { contentHash } from "../../lib/work.ts";

const path = ".doan/canvases/onboarding.html";
const frame = "signup-phone";

const checks: Checks = ctx => {
  const calls = prototypeCalls(ctx.calls.commands, "open");
  const asked = calls.some(call => call.prototype && call.frame === frame && call.path !== undefined && prototypeCanvasPath(ctx.repo, call.path) === prototypeCanvasPath(ctx.repo, path));
  const received = ctx.prototype();
  const final = contentHash(ctx.read(path));
  const played = final !== null && received.some(e => e.request.root === ctx.repo && e.request.path === path && e.request.frame === frame
    && e.response.ok && e.response.played && e.hashes[path] === final);
  const changed = ctx.changedFiles();
  return [
    { id: "prototype_open_command", pass: asked, detail: JSON.stringify(calls) },
    { id: "app_played_prototype", pass: played, detail: JSON.stringify(received) },
    { id: "repo_unchanged", pass: changed.length === 0, detail: JSON.stringify(changed) },
  ];
};
export default checks;
