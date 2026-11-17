import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ReplaceDraftDialog } from "./ReplaceDraftDialog";

// "Replace your draft?" is a confirmation like the others (docs/design/canvas.md 'Trash confirmation'): an alertdialog
// named by its title and described by its body, which the focus guards find by role (POSTMORTEM 2026-10-30).
test("the docked Replace your draft? is an alertdialog named by its title and described by its body", () => {
  const html = renderToStaticMarkup(<ReplaceDraftDialog confirm={{ title: "Replace your draft?", body: "Your draft will be replaced.", cancel: "Keep draft", confirm: "Replace" }} onKeep={() => {}} onReplace={() => {}} />);
  const dialog = html.match(/<dialog[^>]*>/)![0];
  expect(dialog).toContain('role="alertdialog"');
  const labelled = dialog.match(/aria-labelledby="([^"]+)"/)![1], described = dialog.match(/aria-describedby="([^"]+)"/)![1];
  expect(html).toContain(`<h3 class="doan-dialog-title" id="${labelled}">Replace your draft?</h3>`);
  expect(html).toMatch(new RegExp(`<p class="doan-dialog-description[^"]*" id="${described}">Your draft will be replaced.</p>`));
  expect(dialog).not.toContain("aria-label=");
});
