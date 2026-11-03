import assert from "node:assert/strict";
import { test } from "node:test";
import { documents, exportCalls, localReferences } from "./checks.ts";

const srcdoc = (canvas: string) => `<!doctype html><html><body><iframe srcdoc="${canvas.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"></iframe><script>el.href = "app.js"; fetch("data.json")</script></body></html>`;

test("X1 reads doan export calls with -o and --force as flags", () => {
  assert.deepEqual(exportCalls(["cd repo && doan export .doan/canvases/profile.html -o ../profile.html --force"]), [{ canvas: ".doan/canvases/profile.html", output: "../profile.html" }]);
  assert.deepEqual(exportCalls(["doan export -o out.html a.html --json"]), [{ canvas: "a.html", output: "out.html" }]);
  assert.deepEqual(exportCalls(["echo 'doan export a.html -o b.html'", "doan check"]), []);
});

test("X1 finds references left in the page and in the canvas inside srcdoc", () => {
  const clean = '<link rel="stylesheet" href="data:text/css;charset=utf-8,:root%20{}"><img src="data:image/png;base64,AAAA"><img src="https://example.com/a.png"><a href="#top">top</a>';
  assert.deepEqual(localReferences(srcdoc(clean)), []);
  const left = '<link rel="stylesheet" href="../assets/tokens.css"><img src=\'../assets/avatar.png\'><img srcset="a.png 1x, data:image/png;base64,AA 2x"><style>.x { background: url(bg.png); } @import "more.css";</style>';
  assert.deepEqual(localReferences(srcdoc(left)).sort(), ["../assets/avatar.png", "../assets/tokens.css", "a.png", "bg.png", "more.css"]);
  assert.deepEqual(localReferences('<a href="settings.html">Settings</a>'), ["settings.html"]);
});

test("X1 decodes the srcdoc as a second document and ignores script bodies", () => {
  const page = srcdoc('<p title="x &amp; y">a</p>');
  assert.equal(documents(page).length, 2);
  assert.match(documents(page)[1]!, /title="x &amp; y"/);
  assert.deepEqual(localReferences(page), []);
});
