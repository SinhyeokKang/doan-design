// Package exporttest builds seed repositories for export tests. It is a
// regular package (imported only from tests) so the export package and the
// CLI command tests share one fixture.
package exporttest

import (
	"os"
	"path/filepath"
	"testing"
)

// Canvases in the repository Seed builds.
const (
	// Full reaches every inlined kind: token CSS with a diamond, a cycle and
	// a missing @import, shared .doan/ds CSS, @font-face, images, srcset,
	// SVG <use>, a local script, external URLs, `//` URLs and local links.
	Full = ".doan/canvases/full.html"
	// Empty has no frames.
	Empty = ".doan/canvases/empty.html"
	// Nested sits in a subdirectory and has a space and Hangul in its name.
	Nested = ".doan/canvases/flows/공백 화면.html"

	RefuseParent   = ".doan/canvases/refuse-parent.html"    // ../ outside the repository
	RefuseRoot     = ".doan/canvases/refuse-root.html"      // leading /
	RefuseScope    = ".doan/canvases/refuse-scope.html"     // in the repository, not served
	RefuseCSSScope = ".doan/canvases/refuse-css-scope.html" // a served CSS file whose url() is not served
	RefuseMeta     = ".doan/canvases/refuse-meta.html"      // .doan/config.json and .doan/comments/
	RefuseMissing  = ".doan/canvases/refuse-missing.html"   // a direct reference to no file
	RefuseFrame    = ".doan/canvases/refuse-frame.html"     // a local iframe
	RefuseLink     = ".doan/canvases/refuse-link.html"      // a served path that links outside the repository
	NoWidth        = ".doan/canvases/no-width.html"
	BadWidth       = ".doan/canvases/bad-width.html"

	// Linked is the canvas of SeedLinkedAssets.
	Linked = ".doan/canvases/linked.html"
)

// Asset bytes, kept small and distinct so tests can find them after decoding.
var (
	HeroPNG   = []byte("\x89PNG\r\n\x1a\nhero-image")
	LogoPNG   = []byte("\x89PNG\r\n\x1a\nlogo-image")
	BrandFont = []byte("wOF2brand-font\x00\x01")
	SpriteSVG = `<svg xmlns="http://www.w3.org/2000/svg"><symbol id="icon"><path d="M0 0h10v10z" style="fill:#000"/></symbol></svg>`
	DotSVG    = `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><circle cx="2" cy="2" r="2" fill="#3366ff"/></svg>`
	AppJS     = "document.body.dataset.ready = \"100% #1\";\n"
)

const head = `<meta charset="utf-8">
<meta name="doan:width" content="1280">
`

func page(id, headExtra, body string) string {
	return "<!doctype html>\n<html><head>\n<meta name=\"doan:canvas\" content=\"" + id + "\">\n" + head + headExtra + "</head><body>\n" + body + "\n</body></html>\n"
}

var seedFiles = map[string]string{
	".doan/config.json": `{"v":1,"tokenCss":"styles/tokens.css","serve":["styles"]}`,
	"styles/tokens.css": `@import "a.css";
@import url(b.css) layer(base) screen;
@import url("https://fonts.example.com/css2?family=Inter");
@import "missing.css";
/* url(commented.png) is not a reference */
@font-face { font-family: Brand; src: url("../.doan/assets/fonts/brand.woff2") format("woff2"); }
:root { --brand: #3366ff; --hero: url(../.doan/assets/images/hero.png); --gone: url(gone.png); --cdn: url(//cdn.example.com/bg.png); }
`,
	"styles/a.css":                   "@import \"c.css\";\n.a { color: red; }\n",
	"styles/b.css":                   "@import 'c.css';\n.b { color: blue; }\n",
	"styles/c.css":                   ".c { background: url(../.doan/assets/images/dot.svg); }\n",
	"styles/cycle-a.css":             "@import \"cycle-b.css\";\n.cycle-a { color: green; }\n",
	"styles/cycle-b.css":             "@import \"cycle-a.css\";\n.cycle-b { color: olive; }\n",
	"styles/leak.css":                ".leak { background: url(../src/secret.png); }\n",
	".doan/ds/index.css":             ".ds-card { border: 1px solid var(--brand); }\n",
	".doan/assets/images/hero.png":   string(HeroPNG),
	".doan/assets/images/로고 파일.png":  string(LogoPNG),
	".doan/assets/images/dot.svg":    DotSVG,
	".doan/assets/sprite.svg":        SpriteSVG,
	".doan/assets/fonts/brand.woff2": string(BrandFont),
	".doan/assets/scripts/app.js":    AppJS,
	".doan/comments/full.jsonl":      "",
	"src/secret.png":                 "secret",
	"src/app.ts":                     "export {}\n",

	Full: page("full", `<link rel="stylesheet" href="../../styles/tokens.css">
<link rel="stylesheet" href="../ds/index.css">
<link rel="stylesheet" href="https://cdn.example.com/x.css">
<link rel="icon" href="../assets/images/dot.svg">
<style>@import "../../styles/cycle-a.css";
.hero { background: url('../assets/images/hero.png'); }</style>
<script src="../assets/scripts/app.js" defer></script>
<script src="//cdn.example.com/lib.js"></script>
`, `<section data-doan-frame="hero" data-doan-title="Hero">
<img src="../assets/images/hero.png" srcset="../assets/images/hero.png 1x, ../assets/images/%EB%A1%9C%EA%B3%A0%20%ED%8C%8C%EC%9D%BC.png 2x" alt="">
<img src="../assets/images/로고 파일.png" alt="logo">
<svg><use href="../assets/sprite.svg#icon"/><rect fill="url(#g)"/></svg>
<div style="background-image: url(../assets/images/hero.png)">Hero</div>
<img src="data:image/png;base64,AAAA" alt="">
<a href="other.html#top">Other</a>
<a href="https://example.com/">Example</a>
<form action="submit.html"></form>
<template><img src="../../src/secret.png"></template>
</section>`),
	Empty: page("empty", "", `<p>No frames here.</p>`),
	Nested: page("nested", `<link rel="stylesheet" href="../../../styles/tokens.css">
`, `<section data-doan-frame="one"><img src="../../assets/images/%EB%A1%9C%EA%B3%A0%20%ED%8C%8C%EC%9D%BC.png" alt=""></section>`),

	RefuseParent: page("refuse-parent", "", `<section data-doan-frame="a"><img src="../../../outside.png"></section>`),
	RefuseRoot:   page("refuse-root", "", `<section data-doan-frame="a"><img src="/logo.png"></section>`),
	RefuseScope:  page("refuse-scope", "", `<section data-doan-frame="a"><img src="../../src/secret.png"></section>`),
	RefuseCSSScope: page("refuse-css-scope", `<link rel="stylesheet" href="../../styles/leak.css">
`, `<section data-doan-frame="a"></section>`),
	RefuseMeta:    page("refuse-meta", "", `<section data-doan-frame="a"><img src="../config.json"><img src="../comments/full.jsonl"></section>`),
	RefuseMissing: page("refuse-missing", "", `<section data-doan-frame="a"><img src="../assets/images/none.png"></section>`),
	RefuseFrame:   page("refuse-frame", "", `<section data-doan-frame="a"><iframe src="full.html"></iframe></section>`),
	RefuseLink:    page("refuse-link", "", `<section data-doan-frame="a"><img src="../assets/escape.png"></section>`),
	NoWidth:       "<!doctype html>\n<html><head><meta name=\"doan:canvas\" content=\"no-width\"></head><body><section data-doan-frame=\"a\"></section></body></html>\n",
	BadWidth:      "<!doctype html>\n<html><head><meta name=\"doan:canvas\" content=\"bad-width\"><meta name=\"doan:width\" content=\"wide\"></head><body><section data-doan-frame=\"a\"></section></body></html>\n",
}

// Seed builds the main export fixture in a temporary directory and returns the
// repository root as a real path. Its parent holds outside.png and outside/,
// which references from the repository must never reach.
func Seed(t testing.TB) string {
	t.Helper()
	parent := realDir(t)
	root := filepath.Join(parent, "repo")
	for p, body := range seedFiles {
		Put(t, root, p, body)
	}
	Put(t, parent, "outside.png", "outside")
	Put(t, parent, "outside/escape.png", "escape")
	Link(t, filepath.Join(parent, "outside/escape.png"), filepath.Join(root, ".doan/assets/escape.png"))
	return root
}

// SeedLinkedAssets builds a repository whose .doan/assets is a symlink to the
// internal directory media/ (POSTMORTEM 2026-10-31): the default directory is
// not served, so its files are served only when `serve` names it.
func SeedLinkedAssets(t testing.TB) string {
	t.Helper()
	root := filepath.Join(realDir(t), "repo")
	Put(t, root, ".doan/config.json", `{"v":1}`)
	Put(t, root, "media/logo.png", string(LogoPNG))
	Put(t, root, Linked, page("linked", "", `<section data-doan-frame="a"><img src="../assets/logo.png" alt=""></section>`))
	Link(t, "../media", filepath.Join(root, ".doan/assets"))
	return root
}

func realDir(t testing.TB) string {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return dir
}

// Put writes body to root/p, creating parent directories.
func Put(t testing.TB, root, p, body string) {
	t.Helper()
	full := filepath.Join(root, filepath.FromSlash(p))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

// Link creates a symlink at name pointing to target.
func Link(t testing.TB, target, name string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(name), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, name); err != nil {
		t.Fatal(err)
	}
}
