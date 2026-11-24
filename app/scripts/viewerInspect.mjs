import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseSync, transformSync } from "rolldown/utils";
import { rolldown } from "rolldown";

const app = fileURLToPath(new URL("../", import.meta.url));
const viewer = new URL("../../cli/internal/export/viewer/", import.meta.url);
const entries = [
  ["inspect.js", "inspectCanvas", {
    "main/cssomMatched": "inspectElement",
    "main/canvasScript": "frameStep, escapeTarget, elementSelector, visibleRect, nodeLabel, nodeKind, elementTree, textDragState, textBoundary",
  }],
  ["inspectPanel.js", "inspectPanel", {
    "renderer/inspectorRows": "rowDisplay, rowCopyText, rowTooltip",
    "renderer/rightPanelSize": "inspectorBounds, panelWidth, nudgePanel, PANEL_MIN",
    "renderer/treeScrollLeft": "treeScrollLeft",
  }],
  // The board's Play prototype, play drawer, size bubble and Option measurement, and the player's history, fit, run
  // script, run reports, view rules and toast: the app's own judgments, so the browser and the app cannot drift. `*`
  // re-exports a whole module.
  ["viewerApp.js", "viewerApp", {
    "main/prototype/playability": "PLAY_REASONS, playability, playableFrames",
    "main/prototype/links": "linkGroups",
    "main/prototype/history": "*",
    "main/prototype/fit": "*",
    "renderer/frameDrawerList": "groupDrawer, drawerOrder, drawerKey, focusedRowAfter",
    "renderer/prototypePlay": "canvasPlayability, playTooltip, sizeBubblePlay, playRequest, playDrawer, drawerPlayRequest, closedFocusTarget",
    "renderer/bubbleItems": "bubbleItems",
    "renderer/measure": "measureLines",
    "renderer/selection": "sizeLabel, canvasPx",
    "main/prototypeScript": "prototypeScriptSource",
    "main/prototype/requests": "parseRunReport, parseFramesReport",
    "main/prototype/mark": "parsePrototypeMark",
    "main/prototype/ipc": "PROTOTYPE_LOAD_TIMEOUT_MS",
    "renderer/prototype/view": "LOADING_LABEL, RETRY, CLOSE, windowTitle, modeTooltip, drawerGroups, drawerLabel, exportAvailability, linkMove",
    "renderer/toastState": "TOAST_MS, initialToastState, toastState",
  }],
];

// The app injects these DOM readers inside canvasScript. Share their declarations without installing
// the app's picking, conversation or selection listeners in a folded export.
async function canvasReaders() {
  const path = app + "src/main/canvasScript.ts";
  const source = await readFile(path, "utf8");
  const { program } = parseSync(path, source);
  const canvas = program.body.find(node => node.declaration?.id?.name === "canvasScript").declaration;
  const names = ["MAX_COPY_TEXT", "MAX_TEXT_RECTS", "isRoot", "isText", "isEditable", "isFrame", "framesOf", "insideField", "glyphHolds", "textAt", "textStart", "textRects", "readText", "rectOf"];
  const declarations = canvas.body.body.filter(node => node.type === "VariableDeclaration").flatMap(node => node.declarations);
  const body = names.map(name => {
    const declaration = declarations.find(node => node.id.name === name);
    if (!declaration) throw new Error("Missing canvas reader " + name);
    return "const " + source.slice(declaration.start, declaration.end) + ";";
  }).join("\n");
  // Let the TS transform resolve scopes: a property name, a type, or a shadowing parameter is not
  // a dependency on the outer closure. Any live reference left after extraction needs a reader.
  const locals = canvas.body.body.filter(node => ["VariableDeclaration", "FunctionDeclaration", "ClassDeclaration"].includes(node.type))
    .map(node => "export " + source.slice(node.start, node.end)).join("\n");
  const bindings = parseSync(path, locals).module.staticExports.flatMap(group => group.entries.map(entry => entry.localName.name));
  const omitted = bindings.filter(name => !names.includes(name));
  const imports = `import { ${omitted.join(", ")} } from "canvas-locals";\n`;
  const checked = transformSync(path, imports + body).code;
  const dependencies = parseSync(path, checked).module.staticImports.flatMap(group => group.entries.map(entry => entry.localName.value));
  if (dependencies.length) throw new Error("Unextracted canvas reader dependency: " + dependencies.join(", "));
  return `import * as lib from ${JSON.stringify(path)};\n${body}\nexport { framesOf, textAt, textStart, textRects, readText, rectOf };`;
}

for (const [file, name, sources] of entries) {
  let entry = Object.entries(sources).map(([path, names]) => `export ${names === "*" ? "*" : `{ ${names} }`} from ${JSON.stringify(app + "src/" + path + ".ts")};`).join("\n");
  if (name === "inspectCanvas") entry += "\n" + await canvasReaders();
  // The run report checks share requests.ts with main's other requests, whose imports reach Node and the
  // conversation modules. No app module the viewer bundles needs its side effects, so unused imports go whole and
  // the Node built-ins they name are never bundled.
  const bundle = await rolldown({
    input: "viewer-entry", treeshake: { moduleSideEffects: false }, external: [/^node:/],
    plugins: [{ name: "viewer-entry", resolveId: id => id === "viewer-entry" ? "\0viewer-entry" : null, load: id => id === "\0viewer-entry" ? { code: entry, moduleType: "ts" } : null }],
  });
  try {
    const { output: [chunk] } = await bundle.generate({ format: "iife", name, minify: true, comments: { legal: false } });
    // A bundle runs as one plain script in the export page, with no module loader: an import left in it (a `node:`
    // built-in kept external above) would be an undefined global that stops the whole page script.
    if (chunk.imports.length > 0) throw new Error(file + " still imports " + chunk.imports.join(", ") + ". The viewer bundles must not need a module.");
    const output = "// Generated by app/scripts/viewerInspect.mjs.\n" + chunk.code;
    const path = new URL(file, viewer);
    if (process.argv.includes("--check")) {
      if (await readFile(path, "utf8") !== output) throw new Error(file + " differs from its sources. Run node app/scripts/viewerInspect.mjs.");
    } else await writeFile(path, output);
  } finally {
    await bundle.close();
  }
}
