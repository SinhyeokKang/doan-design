// R8d's Electron main script, usage `electron layout.cjs --user-data-dir=<tmp> <width> <file>`; prints JSON.
// One file per launch: a second window loading from another directory failed with ERR_FAILED (Electron 45).
const { app, BrowserWindow } = require("electron");

const [width, file] = process.argv.slice(2).filter(arg => !arg.startsWith("--"));

// Runs in the page. `own` is an identity's direct text (a renamed child leaves its parent unchanged), `label` its
// whole text, and `within` the nearest identity above it.
function measure() {
  const norm = text => text.replace(/\s+/g, " ").trim();
  const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; };
  const key = el => el.hasAttribute("data-doan-frame") ? `frame:${el.getAttribute("data-doan-frame")}` : el.hasAttribute("data-doan-id") ? `id:${el.getAttribute("data-doan-id")}` : null;
  const identityOf = el => { for (let p = el; p; p = p.parentElement) if (key(p)) return key(p); return null; };
  const own = el => norm([...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(" "));
  const all = [...document.body.querySelectorAll("*")].filter(el => !el.closest("template"));
  const identities = all.filter(key).map(el => ({ key: key(el), tag: el.localName, parent: el.parentElement ? identityOf(el.parentElement) : null, own: own(el), label: norm(el.textContent) }));
  // The badge: innermost elements whose whole text reads "Draft".
  const isDraft = el => norm(el.textContent).toLowerCase() === "draft" && !["style", "script", "title"].includes(el.localName);
  const badges = all.filter(el => isDraft(el) && ![...el.children].some(isDraft)).map(el => ({ frame: el.closest("[data-doan-frame]")?.getAttribute("data-doan-frame") ?? null, within: el.parentElement ? identityOf(el.parentElement) : null, rect: rect(el), html: el.outerHTML.slice(0, 300) }));
  // Structure per frame (and outside frames) without the badge, its wrappers and their content.
  const draftTree = el => { for (let p = el; p && p !== document.body; p = p.parentElement) if (isDraft(p)) return true; return false; };
  const structure = {};
  for (const el of all) {
    if (["style", "link"].includes(el.localName) || el.hasAttribute("data-doan-frame") || draftTree(el)) continue;
    const frame = el.closest("[data-doan-frame]")?.getAttribute("data-doan-frame") ?? "(outside frames)";
    (structure[frame] ??= []).push([el.localName, key(el), own(el), el.parentElement ? identityOf(el.parentElement) : null]);
  }
  const frames = Object.fromEntries([...document.querySelectorAll("[data-doan-frame]")].map(f => [f.getAttribute("data-doan-frame"), rect(f)]));
  return { frames, identities, badges, structure };
}

app.dock?.hide();
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false, useContentSize: true, width: Number(width), height: 1000, webPreferences: { sandbox: true } });
    await win.loadFile(file);
    process.stdout.write(JSON.stringify(await win.webContents.executeJavaScript(`(${measure})()`)) + "\n");
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
  app.exit(process.exitCode ?? 0);
});
