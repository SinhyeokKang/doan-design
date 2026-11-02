package export

import (
	"bytes"
	"encoding/base64"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

func inlineSeed(t *testing.T, root, canvasPath string) Result {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(root, ".doan/config.json"))
	if err != nil {
		t.Fatal(err)
	}
	config, code := repo.ParseConfig(data)
	if code != "" {
		t.Fatalf("config: %s", code)
	}
	return inlineWith(t, root, config, canvasPath)
}

func inlineWith(t *testing.T, root string, config repo.Config, canvasPath string) Result {
	t.Helper()
	src, err := ReadFile(root, canvasPath)
	if err != nil {
		t.Fatal(err)
	}
	res, err := Inline(root, config, canvasPath, src)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func decodeData(t *testing.T, uri string) (string, []byte) {
	t.Helper()
	if i := strings.IndexByte(uri, '#'); i >= 0 {
		uri = uri[:i]
	}
	head, body, ok := strings.Cut(strings.TrimPrefix(uri, "data:"), ",")
	if !ok {
		t.Fatalf("not a data URI: %.80s", uri)
	}
	if strings.HasSuffix(head, ";base64") {
		b, err := base64.StdEncoding.DecodeString(body)
		if err != nil {
			t.Fatal(err)
		}
		return strings.TrimSuffix(head, ";base64"), b
	}
	s, err := url.PathUnescape(body)
	if err != nil {
		t.Fatal(err)
	}
	return head, []byte(s)
}

type leftover struct {
	Kind refKind
	Href string
}

// rescan collects every reference left in an exported canvas, descending into
// inlined CSS, so a test can prove no local repository path remains.
func rescan(t *testing.T, doc []byte) []leftover {
	t.Helper()
	var out []leftover
	var visitCSS func(string, canvas.Mode)
	record := func(kind refKind, href string) {
		out = append(out, leftover{kind, href})
		if strings.HasPrefix(href, "data:text/css") {
			_, b := decodeData(t, href)
			visitCSS(string(b), canvas.Stylesheet)
		}
	}
	visitCSS = func(text string, mode canvas.Mode) {
		for _, r := range canvas.CSSRefs(text, mode) {
			kind := kindAsset
			if r.Import {
				kind = kindStylesheet
			}
			record(kind, r.Value)
		}
	}
	rewriteHTML(doc, func(kind refKind, href string) (string, bool) {
		record(kind, href)
		return "", false
	}, func(text string, mode canvas.Mode) string {
		visitCSS(text, mode)
		return text
	})
	return out
}

func TestInlineFullCanvas(t *testing.T) {
	root := exporttest.Seed(t)
	res := inlineSeed(t, root, exporttest.Full)
	if len(res.Refused) != 0 {
		t.Fatalf("refused: %+v", res.Refused)
	}
	if want := []string{"//cdn.example.com/bg.png", "//cdn.example.com/lib.js", "https://cdn.example.com/x.css", "https://fonts.example.com/css2?family=Inter"}; !reflect.DeepEqual(res.External, want) {
		t.Errorf("external = %q", res.External)
	}
	if want := []string{"other.html#top", "submit.html"}; !reflect.DeepEqual(res.Links, want) {
		t.Errorf("links = %q", res.Links)
	}
	var paths []string
	for _, a := range res.Assets {
		paths = append(paths, a.Path)
		info, err := os.Stat(filepath.Join(root, a.Path))
		if err != nil || info.Size() != a.Size {
			t.Errorf("asset %s size %d, file %v %v", a.Path, a.Size, info, err)
		}
	}
	wantPaths := []string{
		".doan/assets/fonts/brand.woff2", ".doan/assets/images/dot.svg", ".doan/assets/images/hero.png",
		".doan/assets/images/로고 파일.png", ".doan/assets/scripts/app.js", ".doan/assets/sprite.svg",
		".doan/ds/index.css",
		"styles/a.css", "styles/b.css", "styles/c.css", "styles/cycle-a.css", "styles/cycle-b.css", "styles/tokens.css",
	}
	if !reflect.DeepEqual(paths, wantPaths) {
		t.Errorf("assets = %q", paths)
	}

	allowed := map[string]bool{"missing.css": true, "gone.png": true}
	for _, ref := range rescan(t, res.HTML) {
		h := ref.Href
		switch {
		case ref.Kind == kindLink, ref.Kind == kindFrame && strings.HasPrefix(h, "https:"):
		case strings.HasPrefix(h, "data:"), strings.HasPrefix(h, "https:"), strings.HasPrefix(h, "#"):
		case allowed[h]:
		default:
			t.Errorf("local reference left: %+v", ref)
		}
	}
	html := string(res.HTML)
	for _, want := range []string{
		`<script src="https://cdn.example.com/lib.js"></script>`,
		`<template><img src="../../src/secret.png"></template>`,
		`<a href="other.html#top">Other</a>`,
		`<img src="data:image/png;base64,AAAA" alt="">`,
		`<rect fill="url(#g)"/>`,
		`<link rel="stylesheet" href="https://cdn.example.com/x.css">`,
		`<meta name="doan:width" content="1280">`,
	} {
		if !strings.Contains(html, want) {
			t.Errorf("result lacks %s", want)
		}
	}
	if !strings.Contains(html, `src="`+dataURI("image/png", exporttest.HeroPNG)+`"`) {
		t.Error("hero image is not inlined")
	}
	if !strings.Contains(html, dataURI("image/png", exporttest.LogoPNG)+` 2x"`) {
		t.Error("percent-escaped Hangul srcset candidate is not inlined")
	}
	if !strings.Contains(html, `<use href="`+dataURI("image/svg+xml", []byte(exporttest.SpriteSVG))+`#icon"/>`) {
		t.Error("SVG <use> lost its sprite or fragment")
	}
	if !strings.Contains(html, `<script src="`+dataURI("text/javascript; charset=utf-8", []byte(exporttest.AppJS))+`" defer="">`) {
		t.Error("local script is not inlined")
	}
}

// The diamond a→c, b→c inlines c twice; the cycle cycle-a→cycle-b→cycle-a
// ends in an empty stylesheet. Missing files inside CSS stay as written.
func TestInlineCSSImportGraph(t *testing.T) {
	root := exporttest.Seed(t)
	res := inlineSeed(t, root, exporttest.Full)
	sheets := map[string]string{}
	for _, ref := range rescan(t, res.HTML) {
		if strings.HasPrefix(ref.Href, "data:text/css") {
			_, b := decodeData(t, ref.Href)
			sheets[string(b)] = ref.Href
		}
	}
	read := func(p string) string {
		b, err := os.ReadFile(filepath.Join(root, p))
		if err != nil {
			t.Fatal(err)
		}
		return string(b)
	}
	cBody := strings.Replace(read("styles/c.css"), "url(../.doan/assets/images/dot.svg)", `url("`+dataURI("image/svg+xml", []byte(exporttest.DotSVG))+`")`, 1)
	cURI := dataURI("text/css; charset=utf-8", []byte(cBody))
	aBody := strings.Replace(read("styles/a.css"), `@import "c.css"`, `@import url("`+cURI+`")`, 1)
	bBody := strings.Replace(read("styles/b.css"), `@import 'c.css'`, `@import url("`+cURI+`")`, 1)
	if _, ok := sheets[aBody]; !ok {
		t.Errorf("a.css not inlined as %q", aBody)
	}
	if _, ok := sheets[bBody]; !ok {
		t.Errorf("b.css not inlined as %q", bBody)
	}
	var tokens string
	for s := range sheets {
		if strings.Contains(s, "@font-face") {
			tokens = s
		}
	}
	for _, want := range []string{
		`@import url("` + dataURI("text/css; charset=utf-8", []byte(aBody)) + `");`,
		`@import url("` + dataURI("text/css; charset=utf-8", []byte(bBody)) + `") layer(base) screen;`,
		`@import url("https://fonts.example.com/css2?family=Inter");`,
		`@import "missing.css";`,
		`/* url(commented.png) is not a reference */`,
		`src: url("` + dataURI("font/woff2", exporttest.BrandFont) + `") format("woff2");`,
		`--hero: url("` + dataURI("image/png", exporttest.HeroPNG) + `");`,
		`--gone: url(gone.png);`,
		`--cdn: url("https://cdn.example.com/bg.png");`,
	} {
		if !strings.Contains(tokens, want) {
			t.Errorf("tokens.css lacks %.120s", want)
		}
	}
	empty := dataURI("text/css; charset=utf-8", nil)
	cycleB := strings.Replace(read("styles/cycle-b.css"), `@import "cycle-a.css"`, `@import url("`+empty+`")`, 1)
	cycleA := strings.Replace(read("styles/cycle-a.css"), `@import "cycle-b.css"`, `@import url("`+dataURI("text/css; charset=utf-8", []byte(cycleB))+`")`, 1)
	if _, ok := sheets[cycleA]; !ok {
		t.Errorf("cycle not cut at the repeated ancestor")
	}
}

func TestInlineNestedUnicodeCanvas(t *testing.T) {
	root := exporttest.Seed(t)
	res := inlineSeed(t, root, exporttest.Nested)
	if len(res.Refused) != 0 {
		t.Fatalf("refused: %+v", res.Refused)
	}
	if !bytes.Contains(res.HTML, []byte(dataURI("image/png", exporttest.LogoPNG))) {
		t.Error("Hangul asset is not inlined")
	}
	if !bytes.Contains(res.HTML, []byte(`<link rel="stylesheet" href="data:text/css;charset=utf-8,`)) {
		t.Error("token CSS is not inlined from a subdirectory canvas")
	}
}

func TestInlineWithoutReferencesKeepsTheCanvas(t *testing.T) {
	root := exporttest.Seed(t)
	src, err := ReadFile(root, exporttest.Empty)
	if err != nil {
		t.Fatal(err)
	}
	res := inlineSeed(t, root, exporttest.Empty)
	if !bytes.Equal(res.HTML, src) {
		t.Errorf("HTML changed:\n%s", res.HTML)
	}
	if res.External == nil || res.Links == nil || res.Assets == nil || res.Refused == nil {
		t.Errorf("empty lists must not be nil: %+v", res)
	}
	if len(res.External)+len(res.Links)+len(res.Assets)+len(res.Refused) != 0 {
		t.Errorf("lists not empty: %+v", res)
	}
}

func TestInlineRefusals(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/canvases/refuse-direct-css.html", `<!doctype html><html><head><style>@import "../../styles/none.css"; .a{background:url(../assets/none.png)}</style></head><body><div style="background:url(../assets/none2.png)"></div><img src="../../src/secret.png"><img src=" ../../src/secret.png"></body></html>`)
	cases := map[string][]Refusal{
		exporttest.RefuseParent:   {{exporttest.RefuseParent, "../../../outside.png", ReasonOutside}},
		exporttest.RefuseRoot:     {{exporttest.RefuseRoot, "/logo.png", ReasonOutside}},
		exporttest.RefuseScope:    {{exporttest.RefuseScope, "../../src/secret.png", ReasonNotServed}},
		exporttest.RefuseCSSScope: {{"styles/leak.css", "../src/secret.png", ReasonNotServed}},
		exporttest.RefuseMeta: {
			{exporttest.RefuseMeta, "../config.json", ReasonNotServed},
			{exporttest.RefuseMeta, "../comments/full.jsonl", ReasonNotServed},
		},
		exporttest.RefuseMissing: {{exporttest.RefuseMissing, "../assets/images/none.png", ReasonMissing}},
		exporttest.RefuseFrame:   {{exporttest.RefuseFrame, "full.html", ReasonFrame}},
		exporttest.RefuseLink:    {{exporttest.RefuseLink, "../assets/escape.png", ReasonOutside}},
		".doan/canvases/refuse-direct-css.html": {
			{".doan/canvases/refuse-direct-css.html", "../../styles/none.css", ReasonMissing},
			{".doan/canvases/refuse-direct-css.html", "../assets/none.png", ReasonMissing},
			{".doan/canvases/refuse-direct-css.html", "../assets/none2.png", ReasonMissing},
			{".doan/canvases/refuse-direct-css.html", "../../src/secret.png", ReasonNotServed},
		},
	}
	for p, want := range cases {
		res := inlineSeed(t, root, p)
		if !reflect.DeepEqual(res.Refused, want) {
			t.Errorf("%s: refused = %+v, want %+v", p, res.Refused, want)
		}
	}
}

// POSTMORTEM 2026-10-31 Prevention: check the scope and the export result
// together for a linked default directory.
func TestInlineLinkedDefaultDirectory(t *testing.T) {
	root := exporttest.SeedLinkedAssets(t)
	scope, err := repo.Scope(root, repo.Config{V: 1})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(scope, []string{".doan/canvases"}) {
		t.Fatalf("scope = %q", scope)
	}
	res := inlineWith(t, root, repo.Config{V: 1}, exporttest.Linked)
	if want := []Refusal{{exporttest.Linked, "../assets/logo.png", ReasonNotServed}}; !reflect.DeepEqual(res.Refused, want) {
		t.Fatalf("refused = %+v", res.Refused)
	}
	res = inlineWith(t, root, repo.Config{V: 1, Serve: []string{".doan/assets"}}, exporttest.Linked)
	if len(res.Refused) != 0 || !reflect.DeepEqual(res.Assets, []Asset{{"media/logo.png", int64(len(exporttest.LogoPNG))}}) {
		t.Fatalf("configured: refused %+v, assets %+v", res.Refused, res.Assets)
	}
	if !bytes.Contains(res.HTML, []byte(dataURI("image/png", exporttest.LogoPNG))) {
		t.Error("configured link target is not inlined")
	}
}

func TestInlineSortsAndDeduplicatesLists(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/canvases/dups.html", `<img src="https://b.example/x.png"><img src=" https://a.example/x.png "><img src="https://b.example/x.png"><a href="z.html">z</a><a href="a.html">a</a><a href="z.html">z</a><img src="../assets/images/hero.png"><img src="../assets/images/hero.png">`)
	res := inlineSeed(t, root, ".doan/canvases/dups.html")
	if !reflect.DeepEqual(res.External, []string{"https://a.example/x.png", "https://b.example/x.png"}) || !reflect.DeepEqual(res.Links, []string{"a.html", "z.html"}) || len(res.Assets) != 1 {
		t.Errorf("external %q, links %q, assets %+v", res.External, res.Links, res.Assets)
	}
	if !sort.StringsAreSorted(res.External) {
		t.Error("external not sorted")
	}
}
