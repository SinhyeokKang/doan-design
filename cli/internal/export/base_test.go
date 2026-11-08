package export

import (
	"reflect"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
)

func TestFirstBaseHref(t *testing.T) {
	for _, c := range []struct {
		name, src, href string
		ok              bool
	}{
		{"none", `<head><meta charset="utf-8"></head>`, "", false},
		{"plain", `<head><base href="a/"></head>`, "a/", true},
		{"empty value", `<base href="">`, "", true},
		{"first of two", `<base href="a/"><base href="b/">`, "a/", true},
		{"inside template ignored", `<template><base href="a/"></template><base href="b/">`, "b/", true},
		{"nested template ignored", `<template><template></template><base href="a/"></template><base href="b/">`, "b/", true},
		// The parser ignores the self-closing flag on <template>: it opens one.
		{"self-closing template opens", `<template/><base href="a/"></template><base href="b/">`, "b/", true},
		{"nested self-closing template opens", `<template><template/></template><base href="a/"></template><base href="b/">`, "b/", true},
		{"inside comment ignored", `<!-- <base href="a/"> --><base href="b/">`, "b/", true},
		{"inside script text ignored", `<script>"<base href='a/'>"</script><base href="b/">`, "b/", true},
		{"target only skipped", `<base target="_top"><base href="b/">`, "b/", true},
		{"target only, no href", `<base target="_top">`, "", false},
		{"upper case", `<BASE HREF="A/">`, "A/", true},
		{"entity decoded", `<base href="a&amp;b/">`, "a&b/", true},
		{"after a reference", `<img src="x.png"><base href="b/">`, "b/", true},
		{"inside inline svg counted", `<svg><base href="b/"></svg>`, "b/", true},
		{"inside inline math counted", `<math><base href="b/"></math>`, "b/", true},
		{"self-closing", `<base href="a/"/>`, "a/", true},
	} {
		t.Run(c.name, func(t *testing.T) {
			href, ok := firstBaseHref([]byte(c.src))
			if href != c.href || ok != c.ok {
				t.Fatalf("firstBaseHref(%q) = %q, %v; want %q, %v", c.src, href, ok, c.href, c.ok)
			}
		})
	}
}

func TestBaseMoves(t *testing.T) {
	stays := []string{"", "#x", "?q", ".", "./", "%2e", "%2E", "x.html", "./x.html", "x.html?q#f", " ./ ", "a%2Fb"}
	moves := []string{"..", ".%2e", "%2E.", "%2e%2e", ".\t.", "a\n/", "../", "a/", `a\b`, "/", "//cdn.example/", "https://cdn.example/", "file:///x/", "data:,", "../canvases/", "./a/", "a:b"}
	for _, h := range stays {
		if baseMoves(h) {
			t.Errorf("baseMoves(%q) = true, want false", h)
		}
	}
	for _, h := range moves {
		if !baseMoves(h) {
			t.Errorf("baseMoves(%q) = false, want true", h)
		}
	}
}

func TestRewriteDropsBaseHref(t *testing.T) {
	none := func(refKind, string) (string, bool) { return "", false }
	same := func(text string, _ canvas.Mode) string { return text }
	for _, c := range []struct{ name, src, want string }{
		{"href only drops the element", `<head><base href="a/"></head>`, `<head></head>`},
		{"self-closing href only", `<head><base href="a/"/></head>`, `<head></head>`},
		{"href and target keeps target", `<base href="a/" target="_top">`, `<base target="_top">`},
		{"upper case", `<BASE HREF="a/" TARGET="x">`, `<base target="x">`},
		{"duplicate href attributes all go", `<base href="a/" href="b/" target="x">`, `<base target="x">`},
		{"target only stays as written", `<BASE  target=_top>`, `<BASE  target=_top>`},
		{"inside template stays", `<template><base href="a/"></template>`, `<template><base href="a/"></template>`},
		{"every base outside template", `<base href="a/"><base href="b/" target="x">`, `<base target="x">`},
	} {
		t.Run(c.name, func(t *testing.T) {
			if got := string(rewriteHTML([]byte(c.src), none, same)); got != c.want {
				t.Fatalf("got %q, want %q", got, c.want)
			}
		})
	}
}

// The reason is one detail of a `- <item>: <detail>` line the app parses.
func TestBaseReasonIsOneDetail(t *testing.T) {
	if strings.Contains(ReasonBase, ": ") || strings.Contains(ReasonBase, "/") {
		t.Fatalf("ReasonBase %q", ReasonBase)
	}
}

const movedCanvas = ".doan/canvases/moved.html"

func TestInlineRefusesReferencesUnderAMovingBase(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, movedCanvas, `<!doctype html><html><head><base href="../assets/" target="_top"><meta name="doan:width" content="800">
<link rel="stylesheet" href="../../styles/tokens.css">
<link rel="stylesheet" href="https://cdn.example.com/x.css">
<link rel="icon" href="images/dot.svg">
<style>@import "x.css"; .a{background:url(images/hero.png)} .b{background:url(data:image/png;base64,AAAA)} .c{fill:url(#g)} :root{--used:url(u.png);--unused:url(unused.png)} .d{mask:var(--used)}</style>
<script src="scripts/app.js"></script>
</head><body>
<img src="images/hero.png" srcset="images/hero.png 2x">
<img src="https://example.com/a.png">
<svg><use href="sprite.svg#icon"/><use href="#local"/><rect fill="url(#g)"/></svg>
<div style="background:url(images/none.png)"></div>
<a href="other.html">x</a><form action="submit.html"></form>
<iframe src="inner.html"></iframe>
</body></html>`)
	res := inlineSeed(t, root, movedCanvas)
	want := []Refusal{
		{movedCanvas, "../../styles/tokens.css", ReasonBase},
		{movedCanvas, "images/dot.svg", ReasonBase},
		{movedCanvas, "x.css", ReasonBase},
		{movedCanvas, "images/hero.png", ReasonBase},
		{movedCanvas, "u.png", ReasonBase},
		{movedCanvas, "scripts/app.js", ReasonBase},
		{movedCanvas, "sprite.svg#icon", ReasonBase},
		{movedCanvas, "images/none.png", ReasonBase},
		{movedCanvas, "inner.html", ReasonFrame},
	}
	if !reflect.DeepEqual(res.Refused, want) {
		t.Fatalf("refused\n%+v\nwant\n%+v", res.Refused, want)
	}
	if len(res.Assets) != 0 {
		t.Errorf("assets read under a moving base: %+v", res.Assets)
	}
	if got, want := res.External, []string{"https://cdn.example.com/x.css", "https://example.com/a.png"}; !reflect.DeepEqual(got, want) {
		t.Errorf("external %q, want %q", got, want)
	}
	if got, want := res.Links, []string{"other.html", "submit.html"}; !reflect.DeepEqual(got, want) {
		t.Errorf("links %q, want %q", got, want)
	}
	html := string(res.HTML)
	for _, kept := range []string{"--unused:url(unused.png)", `<base target="_top">`, `url(#g)`, `href="#local"`} {
		if !strings.Contains(html, kept) {
			t.Errorf("output lacks %q", kept)
		}
	}
	if strings.Contains(html, `href="../assets/"`) {
		t.Error("output keeps the base href")
	}
}

func TestInlineMovingBaseWithoutReferencesExports(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, movedCanvas, `<!doctype html><html><head><base href="https://cdn.example/x/"><meta name="doan:width" content="800"></head><body><p>Text</p><a href="#top">Top</a></body></html>`)
	res := inlineSeed(t, root, movedCanvas)
	if len(res.Refused) != 0 {
		t.Fatalf("refused %+v", res.Refused)
	}
	if want := `<!doctype html><html><head><meta name="doan:width" content="800"></head><body><p>Text</p><a href="#top">Top</a></body></html>`; string(res.HTML) != want {
		t.Fatalf("HTML %q", res.HTML)
	}
}

// A canvas whose base leaves the folder where it is exports exactly as the
// same canvas without that base element.
func TestInlineNonMovingBaseMatchesTheCanvasWithoutIt(t *testing.T) {
	root := exporttest.Seed(t)
	src, err := ReadFile(root, exporttest.Full)
	if err != nil {
		t.Fatal(err)
	}
	plain := inlineSeed(t, root, exporttest.Full)
	if len(plain.Refused) != 0 || len(plain.HTML) == 0 {
		t.Fatalf("Full canvas: %+v", plain.Refused)
	}
	for _, href := range []string{"./", "", ".", "full.html", "./other.html?q#f", "%2e", "#top"} {
		t.Run(href, func(t *testing.T) {
			based := strings.Replace(string(src), "<head>\n", "<head>\n<base href=\""+href+"\">", 1)
			exporttest.Put(t, root, ".doan/canvases/based.html", based)
			res := inlineSeed(t, root, ".doan/canvases/based.html")
			if len(res.Refused) != 0 {
				t.Fatalf("refused %+v", res.Refused)
			}
			if string(res.HTML) != string(plain.HTML) {
				t.Fatal("output differs from the canvas without the base element")
			}
		})
	}
}

func TestInlineKeepsABaseTargetAlone(t *testing.T) {
	root := exporttest.Seed(t)
	src, err := ReadFile(root, exporttest.Full)
	if err != nil {
		t.Fatal(err)
	}
	exporttest.Put(t, root, ".doan/canvases/target.html", strings.Replace(string(src), "<head>\n", "<head>\n<base target=\"_top\">", 1))
	res := inlineSeed(t, root, ".doan/canvases/target.html")
	if len(res.Refused) != 0 {
		t.Fatalf("refused %+v", res.Refused)
	}
	if !strings.Contains(string(res.HTML), "<head>\n<base target=\"_top\">") {
		t.Fatal("output lost the base target")
	}
}

func TestInlineRefuseBaseSeed(t *testing.T) {
	root := exporttest.Seed(t)
	res := inlineSeed(t, root, exporttest.RefuseBase)
	if want := []Refusal{{exporttest.RefuseBase, "images/hero.png", ReasonBase}}; !reflect.DeepEqual(res.Refused, want) {
		t.Fatalf("refused %+v, want %+v", res.Refused, want)
	}
}

// A <base> inside a <template/> must not hide the real base after it.
func TestInlineMovingBaseAfterASelfClosingTemplate(t *testing.T) {
	for _, present := range []bool{true, false} {
		root := exporttest.Seed(t)
		if present {
			exporttest.Put(t, root, ".doan/canvases/images/hero.png", "wrong-file")
		}
		exporttest.Put(t, root, movedCanvas, `<!doctype html><html><head><meta name="doan:width" content="800"><template/><base href="./"></template><base href="../assets/"></head><body><img src="images/hero.png"></body></html>`)
		res := inlineSeed(t, root, movedCanvas)
		if want := []Refusal{{movedCanvas, "images/hero.png", ReasonBase}}; !reflect.DeepEqual(res.Refused, want) {
			t.Errorf("file present %v: refused %+v, want %+v", present, res.Refused, want)
		}
		if len(res.Assets) != 0 {
			t.Errorf("file present %v: assets read %+v", present, res.Assets)
		}
	}
}
