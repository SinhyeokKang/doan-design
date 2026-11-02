package export

import (
	"fmt"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
)

func inlineInternal(t *testing.T, root, canvasPath string, limit int64) (Result, *inliner) {
	t.Helper()
	src, err := ReadFile(root, canvasPath)
	if err != nil {
		t.Fatal(err)
	}
	res, in, err := inline(root, seedConfig(t, root), canvasPath, src, limit)
	if err != nil {
		t.Fatal(err)
	}
	return res, in
}

// RA1-fix1 ⚪3: the stop happens while building, not after. Without the
// growth check the ladder builds about 131 MB of data URIs before the final
// length check.
func TestInlineStopsBeforeBuildingTheLadder(t *testing.T) {
	root := exporttest.Seed(t)
	for i := 0; i < 18; i++ {
		exporttest.Put(t, root, fmt.Sprintf("styles/k%d.css", i), fmt.Sprintf("@import \"k%d.css\";\n@import \"k%d.css\" screen;\n.k%d { color: red; }\n", i+1, i+1, i))
	}
	exporttest.Put(t, root, "styles/k18.css", ".k18 { color: blue; }\n")
	exporttest.Put(t, root, ".doan/canvases/ladder.html", `<link rel="stylesheet" href="../../styles/k0.css">`)
	const limit = 1 << 20
	res, in := inlineInternal(t, root, ".doan/canvases/ladder.html", limit)
	if !res.TooLarge || in.built > 8*limit {
		t.Fatalf("too large %v after building %d bytes", res.TooLarge, in.built)
	}
}

func TestInlineStopsBeforeTheLastRepeat(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/assets/images/mid.png", strings.Repeat("x", 600))
	exporttest.Put(t, root, ".doan/canvases/repeat.html", strings.Repeat(`<img src="../assets/images/mid.png">`, 3))
	res, in := inlineInternal(t, root, ".doan/canvases/repeat.html", 1500)
	one := int64(len(dataURI("image/png", []byte(strings.Repeat("x", 600)))))
	if !res.TooLarge || in.built >= 3*one {
		t.Fatalf("too large %v after building %d bytes (one URI %d)", res.TooLarge, in.built, one)
	}
}

// RA1-fix1 ⚪1: a sprite's own references go through the same resolution,
// with the sprite file's directory as base.
func TestInlineSpriteResolvesItsReferences(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/assets/icons/set.svg", `<svg xmlns="http://www.w3.org/2000/svg"><symbol id="set"><image href="../images/hero.png"/><rect style="fill:url(../images/dot.svg)"/><use href="../sprite.svg#icon"/><use href="#set-inner"/><a href="page.html"><image href="https://cdn.example.com/x.png"/></a><g id="set-inner"/></symbol></svg>`)
	exporttest.Put(t, root, ".doan/canvases/set.html", `<svg><use href="../assets/icons/set.svg#set"/></svg></body>`)
	res := inlineSeed(t, root, ".doan/canvases/set.html")
	if len(res.Refused) != 0 {
		t.Fatalf("refused %+v", res.Refused)
	}
	set := `<svg xmlns="http://www.w3.org/2000/svg"><symbol id="set"><image href="` + dataURI("image/png", exporttest.HeroPNG) + `"/><rect style="fill:url(&quot;` + dataURI("image/svg+xml", []byte(exporttest.DotSVG)) + `&quot;)"/><use href="#icon"/><use href="#set-inner"/><a href="page.html"><image href="https://cdn.example.com/x.png"/></a><g id="set-inner"/></symbol></svg>`
	if want := `<svg><use href="#set"/></svg>` + spriteContainer + exporttest.SpriteSVG + set + `</svg></body>`; string(res.HTML) != want {
		t.Errorf("html =\n%s\nwant\n%s", res.HTML, want)
	}
	if strings.Join(res.Links, ",") != "page.html" || strings.Join(res.External, ",") != "https://cdn.example.com/x.png" {
		t.Errorf("links %q, external %q", res.Links, res.External)
	}
}

func TestInlineSpriteReferenceRefusals(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/assets/leaky.svg", `<svg><symbol id="leak"><image href="../../src/secret.png"/><image href="none.png"/><use href="leaky.svg#leak"/></symbol></svg>`)
	exporttest.Put(t, root, ".doan/canvases/leaky.html", `<svg><use href="../assets/leaky.svg#leak"/></svg>`)
	res := inlineSeed(t, root, ".doan/canvases/leaky.html")
	want := []Refusal{
		{".doan/assets/leaky.svg", "../../src/secret.png", ReasonNotServed},
		{".doan/assets/leaky.svg", "none.png", ReasonMissing},
	}
	if fmt.Sprint(res.Refused) != fmt.Sprint(want) {
		t.Errorf("refused = %+v", res.Refused)
	}
}

// RA1-fix1 ⚪1: a sprite stylesheet would apply to the whole canvas.
func TestInlineRefusesSpriteStyle(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/assets/styled.svg", `<svg><style>.cls-1{fill:#fff}</style><symbol id="a" style="fill:red"/></svg>`)
	exporttest.Put(t, root, ".doan/assets/empty-style.svg", `<svg><style/><symbol id="b"/></svg>`)
	exporttest.Put(t, root, ".doan/assets/attr.svg", `<svg><symbol id="c" style="fill:red"/></svg>`)
	exporttest.Put(t, root, ".doan/canvases/styled.html", `<svg><use href="../assets/styled.svg#a"/><use href="../assets/empty-style.svg#b"/><use href="../assets/attr.svg#c"/></svg>`)
	res := inlineSeed(t, root, ".doan/canvases/styled.html")
	from := ".doan/canvases/styled.html"
	want := []Refusal{{from, "../assets/styled.svg#a", ReasonUseStyle}, {from, "../assets/empty-style.svg#b", ReasonUseStyle}}
	if fmt.Sprint(res.Refused) != fmt.Sprint(want) {
		t.Errorf("refused = %+v", res.Refused)
	}
	if strings.Contains(ReasonUseStyle, ": ") {
		t.Error("reason contains \": \"")
	}
}

// RA1-fix1 ⚪2: the fragment is compared after percent-decoding, and ids in
// <template> are not in the document <use> searches.
func TestInlineSpriteFragmentAndTemplateIDs(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/assets/k.svg", `<svg><symbol id="한 글"/></svg>`)
	exporttest.Put(t, root, ".doan/assets/t.svg", `<svg><symbol id="tpl"/></svg>`)
	exporttest.Put(t, root, ".doan/canvases/frag.html", `<template><p id="tpl"></p></template><svg><use href="../assets/k.svg#%ED%95%9C%20%EA%B8%80"/><use href="../assets/t.svg#tpl"/></svg>`)
	res := inlineSeed(t, root, ".doan/canvases/frag.html")
	if len(res.Refused) != 0 {
		t.Fatalf("refused %+v", res.Refused)
	}
	if !strings.Contains(string(res.HTML), `<use href="#%ED%95%9C%20%EA%B8%80"/><use href="#tpl"/>`) {
		t.Errorf("html = %s", res.HTML)
	}
}

// RA1-fix1 ⚪7: inside the SVG container <title/>, <script/> and <title>
// are foreign content, not raw text, so the elements after them count.
func TestInlineSpriteScanIsForeignContent(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/assets/raw.svg", `<svg><title/><symbol id="after-title"><image href="images/hero.png"/></symbol><script/><symbol id="after-script"/><title>t</title><symbol id="after-text"/></svg>`)
	exporttest.Put(t, root, ".doan/canvases/raw.html", `<svg><use href="../assets/raw.svg#after-title"/><use href="../assets/raw.svg#after-script"/><use href="../assets/raw.svg#after-text"/></svg>`)
	res := inlineSeed(t, root, ".doan/canvases/raw.html")
	if len(res.Refused) != 0 {
		t.Fatalf("refused %+v", res.Refused)
	}
	if !strings.Contains(string(res.HTML), `<image href="`+dataURI("image/png", exporttest.HeroPNG)+`"/>`) {
		t.Errorf("reference after <title/> not rewritten:\n%s", res.HTML)
	}
}
