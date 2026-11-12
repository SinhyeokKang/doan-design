package export

import (
	"reflect"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
)

// The app draws a <use> only when it names a fragment of the canvas, so every
// other <use> is refused before its path is resolved: a missing, unserved or
// CDN target gets the same reason, and nothing is copied into the canvas.
func TestInlineRefusesUseOfAnotherFile(t *testing.T) {
	root := exporttest.Seed(t)
	const from = ".doan/canvases/use.html"
	exporttest.Put(t, root, from, `<!doctype html><html><body>
<svg style="display:none"><symbol id="icon"><path d="M0 0h10v10z"/></symbol></svg>
<svg>
<use href="../assets/sprite.svg#icon"/>
<use xlink:href="../assets/sprite.svg#xlink"></use>
<use href=" ../assets/sprite.svg "/>
<use href="https://cdn.example.com/icons.svg#a"/>
<use href="//cdn.example.com/icons.svg#b"/>
<use href="data:image/svg+xml,%3Csvg/%3E#d"/>
<use href="../assets/none.svg#a"/>
<use href="../../src/secret.png#a"/>
<use href="../../../outside.svg#a"/>
<use href="#icon"/><use href=" #icon "/><use href="#missing"/><use href=""/>
<use href="#icon" xlink:href="../assets/loser.svg#a"/>
<image href="../assets/images/dot.svg"/>
</svg>
<use href="../assets/html-namespace.svg#a"></use>
<template><svg><use href="../assets/inert.svg#a"/></svg></template>
<template/><svg><use href="../assets/inert-top.svg#a"/></svg></template>
<template><template/></template><svg><use href="../assets/inert-nested.svg#a"/></svg></template>
</body></html>`)
	res := inlineSeed(t, root, from)
	want := []Refusal{
		{from, "../assets/sprite.svg#icon", ReasonUseExternal},
		{from, "../assets/sprite.svg#xlink", ReasonUseExternal},
		{from, "../assets/sprite.svg", ReasonUseExternal},
		{from, "https://cdn.example.com/icons.svg#a", ReasonUseExternal},
		{from, "//cdn.example.com/icons.svg#b", ReasonUseExternal},
		{from, "data:image/svg+xml,%3Csvg/%3E#d", ReasonUseExternal},
		{from, "../assets/none.svg#a", ReasonUseExternal},
		{from, "../../src/secret.png#a", ReasonUseExternal},
		{from, "../../../outside.svg#a", ReasonUseExternal},
	}
	if !reflect.DeepEqual(res.Refused, want) {
		t.Fatalf("refused\n%+v\nwant\n%+v", res.Refused, want)
	}
	// A refused CDN <use> is not also listed as an external link.
	if len(res.External) != 0 {
		t.Errorf("external %q", res.External)
	}
	for _, a := range res.Assets {
		if strings.HasSuffix(a.Path, "sprite.svg") {
			t.Errorf("sprite read: %s", a.Path)
		}
	}
}

// An inline sprite, its <style> included, stays as written: the export copies
// nothing and adds no container.
func TestInlineKeepsAnInlineSprite(t *testing.T) {
	root := exporttest.Seed(t)
	src := `<!doctype html><html><body>
<svg style="display:none"><style>.icon-fill{fill:red}</style><symbol id="icon"><circle class="icon-fill" cx="5" cy="5" r="5"/></symbol></svg>
<svg><use href="#icon"/><use xlink:href="#icon"></use></svg>
</body></html>`
	exporttest.Put(t, root, ".doan/canvases/inline.html", src)
	res := inlineSeed(t, root, ".doan/canvases/inline.html")
	if len(res.Refused) != 0 {
		t.Fatalf("refused %+v", res.Refused)
	}
	if string(res.HTML) != src {
		t.Errorf("html =\n%s\nwant\n%s", res.HTML, src)
	}
}

// The app parses refusal lines as `- <item>: <detail>`, so a detail must not
// contain ": ".
func TestRefusalReasonsAreOneDetail(t *testing.T) {
	for _, r := range []string{ReasonOutside, ReasonNotServed, ReasonMissing, ReasonFrame, ReasonUseExternal, ReasonAmbiguous, ReasonBase} {
		if strings.Contains(r, ": ") {
			t.Errorf("reason %q contains \": \"", r)
		}
	}
}
