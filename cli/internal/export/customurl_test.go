package export

import (
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
)

// The refusal detail for a custom property url() that names a different
// existing file from each stylesheet that uses it. The app parses refusal
// lines as `- <item>: <detail>`, so the detail must not contain ": ".
const wantAmbiguous = "names different files from the stylesheets that use it"

// customURLCase is one layout of the Electron probe in
// .scratch/export-var-url (Chromium 156, Electron 45): a relative url() in an
// unregistered custom property resolves from the stylesheet whose var()
// puts it into a real property, not from where the property is declared.
// Folders: the canvas is in .doan/canvases/, a linked CSS in styles/, an
// imported CSS in styles/sub/, and a CSS in another folder in .doan/assets/b/.
type customURLCase struct {
	name   string
	files  map[string]string
	canvas string // body of .doan/canvases/c.html
	assets []string
	refuse []Refusal
	left   []string // local references left as written in the output
}

const (
	linkA = `<link rel="stylesheet" href="../../styles/a.css">`
	linkB = `<link rel="stylesheet" href="../assets/b/b.css">`
)

func svg(tag string) string {
	return `<svg xmlns="http://www.w3.org/2000/svg"><title>` + tag + `</title></svg>`
}

func customURLCases() []customURLCase {
	return []customURLCase{
		{
			name:   "inline definition used by a linked stylesheet resolves from that stylesheet",
			files:  map[string]string{"styles/a.css": `.x{mask-image:var(--i)}`, "styles/i.svg": svg("css")},
			canvas: linkA + `<div class="x" style="--i:url(i.svg)"></div>`,
			assets: []string{"styles/i.svg"},
		},
		{
			name:   "inline definition used by the canvas style resolves from the canvas",
			files:  map[string]string{".doan/canvases/i.svg": svg("page")},
			canvas: `<style>.x{mask-image:var(--i)}</style><div class="x" style="--i:url(i.svg)"></div>`,
			assets: []string{".doan/canvases/i.svg"},
		},
		{
			name:   "inline definition used by a stylesheet in another folder resolves from that folder",
			files:  map[string]string{".doan/assets/b/b.css": `.x{mask-image:var(--i)}`, ".doan/assets/b/i.svg": svg("other")},
			canvas: linkB + `<div class="x" style="--i:url(i.svg)"></div>`,
			assets: []string{".doan/assets/b/i.svg"},
		},
		{
			name:   "canvas style definition used by a linked stylesheet resolves from that stylesheet",
			files:  map[string]string{"styles/a.css": `.x{mask-image:var(--i)}`, "styles/i.svg": svg("css")},
			canvas: linkA + `<style>:root{--i:url(i.svg)}</style><div class="x"></div>`,
			assets: []string{"styles/i.svg"},
		},
		{
			name:   "linked definition used by the canvas style resolves from the canvas",
			files:  map[string]string{"styles/a.css": `:root{--i:url(i.svg)}`, ".doan/canvases/i.svg": svg("page")},
			canvas: linkA + `<style>.x{mask-image:var(--i)}</style><div class="x"></div>`,
			assets: []string{".doan/canvases/i.svg"},
		},
		{
			name:   "linked definition used by a stylesheet in another folder resolves from that folder",
			files:  map[string]string{"styles/a.css": `:root{--i:url(i.svg)}`, ".doan/assets/b/b.css": `.x{mask-image:var(--i)}`, ".doan/assets/b/i.svg": svg("other")},
			canvas: linkA + linkB + `<div class="x"></div>`,
			assets: []string{".doan/assets/b/i.svg"},
		},
		{
			name:   "imported definition used by the importing stylesheet resolves from the importer",
			files:  map[string]string{"styles/a.css": `@import "sub/c.css";.x{mask-image:var(--i)}`, "styles/sub/c.css": `:root{--i:url(i.svg)}`, "styles/i.svg": svg("css")},
			canvas: linkA + `<div class="x"></div>`,
			assets: []string{"styles/i.svg"},
		},
		{
			name:   "definition used by an imported stylesheet resolves from the imported one",
			files:  map[string]string{"styles/a.css": `@import "sub/c.css";:root{--i:url(i.svg)}`, "styles/sub/c.css": `.x{mask-image:var(--i)}`, "styles/sub/i.svg": svg("sub")},
			canvas: linkA + `<div class="x"></div>`,
			assets: []string{"styles/sub/i.svg"},
		},
		{
			name:   "a stylesheet imported from the canvas style is a consumer",
			files:  map[string]string{"styles/sub/c.css": `.x{mask-image:var(--i)}`, "styles/sub/i.svg": svg("sub")},
			canvas: `<style>@import "../../styles/sub/c.css";</style><div class="x" style="--i:url(i.svg)"></div>`,
			assets: []string{"styles/sub/i.svg"},
		},
		{
			name:   "a nested var fallback is a consumer and its own url stays relative to its stylesheet",
			files:  map[string]string{"styles/a.css": `.x{mask-image:var(--nope, var(--i, url(fb.svg)))}`, "styles/i.svg": svg("css"), "styles/fb.svg": svg("fb")},
			canvas: linkA + `<div class="x" style="--i:url(i.svg)"></div>`,
			assets: []string{"styles/fb.svg", "styles/i.svg"},
		},
		{
			name:   "a url in a var fallback inside a custom property resolves from the consumer",
			files:  map[string]string{"styles/a.css": `.x{mask-image:var(--j)}`, "styles/i.svg": svg("css")},
			canvas: linkA + `<div class="x" style="--j:var(--nope, url(i.svg))"></div>`,
			assets: []string{"styles/i.svg"},
		},
		{
			name:   "a hop through another custom property resolves from the final consumer",
			files:  map[string]string{".doan/assets/b/b.css": `.x{--j:var(--i)}`, "styles/a.css": `.x{mask-image:var(--j)}`, "styles/i.svg": svg("css")},
			canvas: linkA + linkB + `<div class="x" style="--i:url(i.svg)"></div>`,
			assets: []string{"styles/i.svg"},
		},
		{
			name:   "a hop cycle does not loop",
			files:  map[string]string{"styles/a.css": `.x{--j:var(--k);--k:var(--j, var(--i));mask-image:var(--j)}`, "styles/i.svg": svg("css")},
			canvas: linkA + `<div class="x" style="--i:url(i.svg)"></div>`,
			assets: []string{"styles/i.svg"},
		},
		{
			name:   "a property registered with url syntax in the canvas resolves where it is declared",
			files:  map[string]string{"styles/a.css": `.x{mask-image:var(--i)}`, ".doan/canvases/i.svg": svg("page")},
			canvas: linkA + `<style>@property --i{syntax:"<url>";inherits:true;initial-value:url(i.svg)}</style><div class="x" style="--i:url(i.svg)"></div>`,
			assets: []string{".doan/canvases/i.svg"},
		},
		{
			name:   "a property registered with url syntax in a stylesheet resolves where it is declared",
			files:  map[string]string{"styles/a.css": `@property --i{syntax:'<url> | none';inherits:true;initial-value:none}:root{--i:url(i.svg)}`, "styles/i.svg": svg("css")},
			canvas: linkA + `<style>.x{mask-image:var(--i)}</style><div class="x"></div>`,
			assets: []string{"styles/i.svg"},
		},
		{
			name:   "a property registered without url syntax still resolves from the consumer",
			files:  map[string]string{"styles/a.css": `.x{mask-image:var(--i)}`, "styles/i.svg": svg("css")},
			canvas: linkA + `<style>@property --i{syntax:"*";inherits:true}</style><div class="x" style="--i:url(i.svg)"></div>`,
			assets: []string{"styles/i.svg"},
		},
		{
			name:   "shorthands, image functions and quoted urls are consumers too",
			files:  map[string]string{"styles/a.css": `.x{mask:var(--i) center/contain no-repeat}.y{background-image:image-set(var(--j) 1x)}`, "styles/i.svg": svg("i"), "styles/j.svg": svg("j")},
			canvas: linkA + `<div class="x" style="--i:url(i.svg)"></div><div class="y" style='--j:url("j.svg")'></div>`,
			assets: []string{"styles/i.svg", "styles/j.svg"},
		},
		{
			name:   "the var function name is case-insensitive and the property name is not",
			files:  map[string]string{"styles/a.css": `.x{mask-image:VAR(--i)}.y{mask-image:var(--I)}`, "styles/i.svg": svg("css")},
			canvas: linkA + `<div class="x" style="--i:url(i.svg)"></div>`,
			assets: []string{"styles/i.svg"},
		},
		{
			name:   "two consumers in different folders naming one existing file use it",
			files:  map[string]string{"styles/a.css": `.x{mask-image:var(--i)}`, "styles/i.svg": svg("css")},
			canvas: linkA + `<style>.y{mask-image:var(--i)}</style><div class="x y" style="--i:url(i.svg)"></div>`,
			assets: []string{"styles/i.svg"},
		},
		{
			name:   "two consumers in one folder name the same file",
			files:  map[string]string{"styles/a.css": `.x{mask-image:var(--i)}`, "styles/a2.css": `.y{background-image:var(--i)}`, "styles/i.svg": svg("css")},
			canvas: linkA + `<link rel="stylesheet" href="../../styles/a2.css"><div class="x y" style="--i:url(i.svg)"></div>`,
			assets: []string{"styles/i.svg"},
		},
		{
			name:   "two consumers naming different existing files refuse the export",
			files:  map[string]string{"styles/a.css": `.x{mask-image:var(--i)}`, "styles/i.svg": svg("css"), ".doan/canvases/i.svg": svg("page")},
			canvas: linkA + `<style>.y{mask-image:var(--i)}</style><div class="x y" style="--i:url(i.svg)"></div>`,
			refuse: []Refusal{{".doan/canvases/c.html", "i.svg", wantAmbiguous}},
		},
		{
			name:   "an ambiguous definition in a stylesheet refuses with the stylesheet as its source",
			files:  map[string]string{"styles/a.css": `:root{--i:url(i.svg)}.x{mask-image:var(--i)}`, "styles/i.svg": svg("css"), ".doan/canvases/i.svg": svg("page")},
			canvas: linkA + `<style>.y{mask-image:var(--i)}</style><div class="x y"></div>`,
			refuse: []Refusal{{"styles/a.css", "i.svg", wantAmbiguous}},
		},
		{
			name:   "an unused custom property url is left as written and not refused",
			canvas: `<div style="--i:url(none.svg)"></div>`,
			left:   []string{"none.svg"},
		},
		{
			name:   "a canvas definition whose file is missing from every consumer is refused",
			files:  map[string]string{"styles/a.css": `.x{mask-image:var(--i)}`},
			canvas: linkA + `<style>.y{mask-image:var(--i)}</style><div class="x y" style="--i:url(none.svg)"></div>`,
			refuse: []Refusal{{".doan/canvases/c.html", "none.svg", ReasonMissing}},
		},
		{
			name:   "a stylesheet definition whose file is missing is left as written",
			files:  map[string]string{"styles/a.css": `:root{--i:url(none.svg)}.x{mask-image:var(--i)}`},
			canvas: linkA + `<div class="x"></div>`,
			left:   []string{"none.svg"},
		},
		{
			name:   "a candidate outside the serving scope is refused when no candidate is served",
			files:  map[string]string{"src/i.svg": svg("src"), "styles/a.css": `.x{mask-image:var(--i)}`},
			canvas: linkA + `<div class="x" style="--i:url(../src/i.svg)"></div>`,
			refuse: []Refusal{{".doan/canvases/c.html", "../src/i.svg", ReasonNotServed}},
		},
		{
			name:   "a candidate outside the repository is refused when no candidate is served",
			files:  map[string]string{"styles/a.css": `.x{mask-image:var(--i)}`},
			canvas: linkA + `<div class="x" style="--i:url(../../i.svg)"></div>`,
			refuse: []Refusal{{".doan/canvases/c.html", "../../i.svg", ReasonOutside}},
		},
		{
			name:   "a served candidate wins over one outside the serving scope",
			files:  map[string]string{"src/i.svg": svg("src"), "styles/i.svg": svg("css"), "styles/a.css": `.x{mask-image:var(--i)}`, "styles/sub/c.css": `.y{mask-image:var(--i)}`},
			canvas: linkA + `<link rel="stylesheet" href="../../styles/sub/c.css"><div class="x y" style="--i:url(../i.svg)"></div>`,
			assets: []string{"styles/i.svg"},
		},
		{
			name:   "absolute paths, data and external urls keep their existing handling",
			files:  map[string]string{"styles/a.css": `.x{mask-image:var(--a)}.y{mask-image:var(--d)}.z{mask-image:var(--e)}`},
			canvas: linkA + `<div style="--a:url(/abs.svg);--d:url(data:image/svg+xml,%3Csvg/%3E);--e:url(https://cdn.example.com/e.svg)"></div>`,
			refuse: []Refusal{{".doan/canvases/c.html", "/abs.svg", ReasonOutside}},
		},
		{
			name: "the reported case: a design-system canvas icon drawn by the shared components.css",
			files: map[string]string{
				".doan/assets/sf-ds/components.css":                     `.sf-iconbtn__icon{-webkit-mask:var(--sf-icon,url(assets/icons-mono/emphasis.svg)) center/contain no-repeat;mask:var(--sf-icon,url(assets/icons-mono/emphasis.svg)) center/contain no-repeat}`,
				".doan/assets/sf-ds/assets/icons-mono/emphasis.svg":     svg("emphasis"),
				".doan/assets/sf-ds/assets/icons-mono/bookmark.svg":     svg("bookmark"),
				".doan/assets/sf-ds/assets/icons-mono/clock-filled.svg": svg("clock"),
			},
			canvas: `<link rel="stylesheet" href="../assets/sf-ds/components.css">` +
				`<style>.sa__status .ic{mask:var(--sf-icon,url("../assets/sf-ds/assets/icons-mono/emphasis.svg")) center/contain no-repeat}</style>` +
				`<span class="sf-iconbtn__icon" style="--sf-icon:url(assets/icons-mono/bookmark.svg)"></span>` +
				`<div class="sa__status" style="--sf-icon:url(../assets/sf-ds/assets/icons-mono/clock-filled.svg)"><span class="ic"></span></div>`,
			assets: []string{".doan/assets/sf-ds/assets/icons-mono/bookmark.svg", ".doan/assets/sf-ds/assets/icons-mono/clock-filled.svg", ".doan/assets/sf-ds/assets/icons-mono/emphasis.svg"},
		},
	}
}

func TestInlineCustomPropertyURLsResolveFromTheirConsumer(t *testing.T) {
	for _, tc := range customURLCases() {
		t.Run(tc.name, func(t *testing.T) {
			root := exporttest.Seed(t)
			for p, body := range tc.files {
				exporttest.Put(t, root, p, body)
			}
			exporttest.Put(t, root, ".doan/canvases/c.html", tc.canvas)
			res := inlineSeed(t, root, ".doan/canvases/c.html")
			refused := res.Refused
			if tc.refuse == nil {
				tc.refuse = []Refusal{}
			}
			if !reflect.DeepEqual(refused, tc.refuse) {
				t.Fatalf("refused %+v, want %+v", refused, tc.refuse)
			}
			if len(tc.refuse) > 0 {
				return
			}
			var svgs []string
			for _, a := range res.Assets {
				if strings.HasSuffix(a.Path, ".svg") {
					svgs = append(svgs, a.Path)
				}
			}
			sort.Strings(svgs)
			if !reflect.DeepEqual(svgs, tc.assets) {
				t.Fatalf("inlined %v, want %v", svgs, tc.assets)
			}
			var left []string
			for _, l := range rescan(t, res.HTML) {
				if !strings.HasPrefix(l.Href, "data:") && !strings.Contains(l.Href, "://") {
					left = append(left, l.Href)
				}
			}
			if !reflect.DeepEqual(left, tc.left) {
				t.Fatalf("left %q, want %q", left, tc.left)
			}
		})
	}
}

// The refusal detail is parsed by the app; it must not contain ": ".
func TestAmbiguousReasonIsOneDetail(t *testing.T) {
	if strings.Contains(wantAmbiguous, ": ") {
		t.Fatal("detail contains \": \"")
	}
}
