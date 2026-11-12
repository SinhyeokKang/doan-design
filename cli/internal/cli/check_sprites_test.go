package cli

import (
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/check"
	"github.com/SinhyeokKang/doan-design/cli/internal/export"
	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

const agreeCanvas = ".doan/canvases/agree.html"

func agreePage(head, body string) string {
	return `<!doctype html><html><head><meta name="doan:canvas" content="agree"><meta name="doan:width" content="800">` + head + `</head><body><section data-doan-frame="a">` + body + `</section></body></html>`
}

func trimmedSet(items []string) []string {
	set := map[string]bool{}
	for _, s := range items {
		set[strings.TrimFunc(s, func(r rune) bool { return r <= 32 })] = true
	}
	out := []string{}
	for s := range set {
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}

// checkAndExport runs the real check input and rules and the real export on
// one canvas of the export seed. It returns the svg_use_not_inline targets
// and the ambiguous_custom_url "path value" pairs check reports for that
// canvas and the files it reaches, and the matching export refusals.
func checkAndExport(t *testing.T, root, canvasPath string) (checkUses, exportUses, checkAmbiguous, exportAmbiguous []string) {
	t.Helper()
	r, e := repo.Find(root, "")
	if e != nil {
		t.Fatal(e)
	}
	in, err := checkInput(r, repo.NewResolver(r.Root), nil)
	if err != nil {
		t.Fatal(err)
	}
	var uses, ambiguous []string
	for _, f := range check.Run(in) {
		switch f.Code {
		case "svg_use_not_inline":
			if f.Path == canvasPath {
				uses = append(uses, f.Target)
			}
		case "ambiguous_custom_url":
			if f.Path == canvasPath || f.Canvas == "" {
				ambiguous = append(ambiguous, f.Path+" "+f.Value)
			}
		}
	}
	src, err := export.ReadFile(r.Root, canvasPath)
	if err != nil {
		t.Fatal(err)
	}
	res, err := export.Inline(r.Root, r.Config, canvasPath, src)
	if err != nil {
		t.Fatal(err)
	}
	var refusedUses, refusedAmbiguous []string
	for _, ref := range res.Refused {
		switch ref.Reason {
		case export.ReasonUseExternal:
			refusedUses = append(refusedUses, ref.Href)
		case export.ReasonAmbiguous:
			refusedAmbiguous = append(refusedAmbiguous, ref.From+" "+ref.Href)
		}
	}
	return trimmedSet(uses), trimmedSet(refusedUses), trimmedSet(ambiguous), trimmedSet(refusedAmbiguous)
}

// check and export judge <use> references and custom property url()s with the
// same canvas functions. check reaches every stylesheet export reads, so a
// canvas check is quiet about is never refused for these reasons; where their
// reach is the same, they agree exactly.
func TestCheckAndExportAgreeOnSpritesAndCustomURLs(t *testing.T) {
	for _, tt := range []struct {
		name       string
		files      map[string]string
		head, body string
		uses       []string
		check      []string // ambiguous_custom_url findings as "path value"
		export     []string // ReasonAmbiguous refusals as "from href"
	}{
		{
			name: "use references of every kind",
			body: `<svg><use href="../assets/sprite.svg#icon"/><use xlink:href=" ../assets/sprite.svg#x "></use><use href="https://cdn.example.com/i.svg#a"/><use href="data:image/svg+xml,%3Csvg/%3E#d"/><use href="#local"/><use href="#missing"/><use href=""/></svg>` +
				`<svg><use href="#local" xlink:href="../assets/loser.svg#b"/></svg><use href="../assets/html.svg#a"></use>` +
				`<template><svg><use href="inert.svg#a"/></svg></template><template/><svg><use href="inert-top.svg#a"/></svg></template>` +
				`<template><template/></template><svg><use href="inert-nested.svg#a"/></svg></template>`,
			uses: []string{"../assets/sprite.svg#icon", "../assets/sprite.svg#x", "data:image/svg+xml,%3Csvg/%3E#d", "https://cdn.example.com/i.svg#a"},
		},
		{
			name:   "a canvas declaration used from the canvas style and a linked stylesheet in another folder",
			files:  map[string]string{".doan/ds/user.css": `.x{mask:var(--i)}`, ".doan/canvases/i.svg": "<svg/>"},
			head:   `<link rel="stylesheet" href="../ds/user.css"><style>.y{mask:var(--i)}</style>`,
			body:   `<div class="x y" style="--i:url(i.svg)"></div>`,
			check:  []string{agreeCanvas + " i.svg"},
			export: []string{agreeCanvas + " i.svg"},
		},
		{
			name:   "a stylesheet declaration used through @import from the canvas style",
			files:  map[string]string{".doan/ds/user.css": `:root{--i:url(i.svg)}.x{mask:var(--i)}`},
			head:   `<style>@import "../ds/user.css";.y{mask:var(--i)}</style>`,
			check:  []string{".doan/ds/user.css i.svg"},
			export: []string{".doan/ds/user.css i.svg"},
		},
		{
			name:  "the design-system pattern: one shared stylesheet uses the canvas declaration",
			files: map[string]string{".doan/assets/sf-ds/components.css": `.icon{mask:var(--sf-icon)}`, ".doan/assets/sf-ds/icons/b.svg": "<svg/>"},
			head:  `<link rel="stylesheet" href="../assets/sf-ds/components.css">`,
			body:  `<span class="icon" style="--sf-icon:url(icons/b.svg)"></span>`,
		},
		{
			name:  ".doan/canvases and .doan/ds resolving to the same path",
			files: map[string]string{".doan/ds/user.css": `.x{mask:var(--i)}`, ".doan/assets/x.svg": "<svg/>"},
			head:  `<link rel="stylesheet" href="../ds/user.css"><style>.y{mask:var(--i)}</style>`,
			body:  `<div class="x y" style="--i:url(../assets/x.svg)"></div>`,
		},
		{
			// export refuses the stylesheet as not served and never reads it.
			name:  "a user stylesheet outside the serving scope",
			files: map[string]string{"src/user.css": `.x{mask:var(--i)}`, ".doan/canvases/i.svg": "<svg/>"},
			head:  `<link rel="stylesheet" href="../../src/user.css"><style>.y{mask:var(--i)}</style>`,
			body:  `<div class="x y" style="--i:url(i.svg)"></div>`,
			check: []string{agreeCanvas + " i.svg"},
		},
		{
			name:  "a stylesheet linked inside a template is not a user",
			files: map[string]string{".doan/ds/user.css": `.x{mask:var(--i)}`, ".doan/canvases/i.svg": "<svg/>"},
			head:  `<template><link rel="stylesheet" href="../ds/user.css"></template><template/><link rel="stylesheet" href="../ds/user.css"></template><style>.y{mask:var(--i)}</style>`,
			body:  `<div class="x y" style="--i:url(i.svg)"></div>`,
		},
		{
			name:   "a base element that keeps the canvas folder",
			files:  map[string]string{".doan/ds/user.css": `.x{mask:var(--i)}`, ".doan/canvases/i.svg": "<svg/>"},
			head:   `<base href="./"><link rel="stylesheet" href="../ds/user.css"><style>.y{mask:var(--i)}</style>`,
			body:   `<div class="x y" style="--i:url(i.svg)"></div>`,
			check:  []string{agreeCanvas + " i.svg"},
			export: []string{agreeCanvas + " i.svg"},
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			root := exporttest.Seed(t)
			for p, body := range tt.files {
				exporttest.Put(t, root, p, body)
			}
			exporttest.Put(t, root, agreeCanvas, agreePage(tt.head, tt.body))
			checkUses, exportUses, checkAmbiguous, exportAmbiguous := checkAndExport(t, root, agreeCanvas)
			if !reflect.DeepEqual(checkUses, exportUses) || !reflect.DeepEqual(checkUses, trimmedSet(tt.uses)) {
				t.Errorf("uses: check %q, export %q, want %q", checkUses, exportUses, tt.uses)
			}
			if !reflect.DeepEqual(checkAmbiguous, trimmedSet(tt.check)) {
				t.Errorf("check ambiguous %q, want %q", checkAmbiguous, tt.check)
			}
			if !reflect.DeepEqual(exportAmbiguous, trimmedSet(tt.export)) {
				t.Errorf("export ambiguous %q, want %q", exportAmbiguous, tt.export)
			}
			for _, refused := range exportAmbiguous {
				if !contains(checkAmbiguous, refused) {
					t.Errorf("export refused %q, which check did not report", refused)
				}
			}
		})
	}
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// checkInput reads what every reached stylesheet, linked or imported, does
// with custom properties, and Parse reads the canvas's own style text.
func TestCheckInputReadsCustomPropertyUses(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/ds/linked.css", `@import "sub/imported.css";.l{mask:var(--l)}`)
	exporttest.Put(t, root, ".doan/ds/sub/imported.css", `:root{--m:url(m.svg)}.m{mask:var(--m)}`)
	exporttest.Put(t, root, agreeCanvas, agreePage(`<link rel="stylesheet" href="../ds/linked.css"><style>.c{mask:var(--c)}</style>`, `<div style="--c:url(c.svg)"></div>`))
	r, e := repo.Find(root, "")
	if e != nil {
		t.Fatal(e)
	}
	in, err := checkInput(r, repo.NewResolver(r.Root), nil)
	if err != nil {
		t.Fatal(err)
	}
	if !in.CustomCSS[".doan/ds/linked.css"].Uses.Used["--l"] || !in.CustomCSS[".doan/ds/sub/imported.css"].Uses.Used["--m"] {
		t.Fatalf("custom CSS %+v", in.CustomCSS)
	}
	if urls := in.CustomCSS[".doan/ds/sub/imported.css"].URLs; len(urls) != 1 || urls[0].Custom != "--m" || urls[0].Value != "m.svg" {
		t.Fatalf("imported URLs %+v", urls)
	}
	for _, c := range in.Canvases {
		if c.Path != agreeCanvas {
			continue
		}
		if !c.Custom.Uses.Used["--c"] || len(c.Custom.URLs) != 1 || c.Custom.URLs[0].Value != "c.svg" {
			t.Fatalf("canvas custom %+v", c.Custom)
		}
		return
	}
	t.Fatal("canvas not checked")
}
