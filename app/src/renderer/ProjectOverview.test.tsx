import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ProjectOverview } from "./ProjectOverview";

test("a notice opens the overview as its first child band, and no notice adds nothing", () => {
  const notice = "Checkout moved, but 2 canvases now use the ID checkout. Run doan check in a terminal.";
  const html = renderToStaticMarkup(<ProjectOverview notice={notice} />);
  expect(html).toContain(`<section class="ov native-scroll" role="region" aria-label="Overview"><div class="canvas-notice" role="status">${notice}</div></section>`);
  expect(renderToStaticMarkup(<ProjectOverview />)).not.toContain("canvas-notice");
});
