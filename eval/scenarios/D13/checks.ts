import type { Checks } from "../../lib/types.ts";
import { canvasParts, changesWithin, checkClean, preserved, presetChecks } from "../D1/presets.ts";

const paths = ["colors", "typography", "spacing", "shapes", "button", "input", "card"].map(id => `.doan/ds/${id}.html`);
const token = "--color-primary-hover";
const checks: Checks = ctx => {
  const listing = ctx.doan(["ls"]);
  const canvases: { id: string; path: string; frames: { id: string }[] }[] = listing.json?.result?.canvases ?? [];
  // Read the baseline ids from seed bytes, not filenames: moves must not rename ids.
  const seedIds = paths.map(path => ctx.seed(path)?.match(/name="doan:canvas" content="([^"]+)"/)?.[1]).sort();
  const ids = canvases.map(c => c.id).sort();
  const changed = ctx.changedFiles();
  const colors = canvasParts(ctx, ".doan/ds/colors.html");
  const button = canvasParts(ctx, ".doan/ds/button.html");
  const mentions = (text: string) => /--color-primary-hover(?![a-z0-9-])/.test(text);
  const preservedChecks = paths.flatMap(path => preserved(ctx, path, path.endsWith("/button.html") ? { frames: ["button"] } : {}));
  return [
    ...presetChecks(ctx, { required: ["document"], allowed: ["context", "document"] }),
    checkClean(ctx),
    { id: "canvas_ids_unchanged", pass: listing.code === 0 && JSON.stringify(ids) === JSON.stringify(seedIds), detail: JSON.stringify({ ids, seedIds }) },
    { id: "frame_ids_unchanged", pass: paths.every(path => JSON.stringify(Object.keys(canvasParts(ctx, path)?.frames ?? {}).sort()) === JSON.stringify(Object.keys(canvasParts(ctx, path, "seed")?.frames ?? {}).sort())), detail: "All seed frame id sets must remain equal" },
    ...preservedChecks.map((check, index) => ({ ...check, id: `${check.id}_${index}` })),
    { id: "new_token_documented", pass: mentions(ctx.read("DESIGN.md") ?? "") && mentions(colors?.frames.colors?.text ?? ""), detail: `${token} must appear in the rules and colors frame` },
    { id: "button_state_updated", pass: mentions(button?.frames["button-states"]?.text ?? "") && changed.includes(".doan/ds/button.html"), detail: "Button states must document the new token" },
    changesWithin(ctx, path => ["DESIGN.md", ".doan/ds/colors.html", ".doan/ds/button.html"].includes(path)),
  ];
};
export default checks;
