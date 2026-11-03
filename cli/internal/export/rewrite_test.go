package export

import (
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
)

func keepCSS(text string, _ canvas.Mode) string { return text }

type seenRef struct {
	Kind refKind
	Href string
}

func TestRewriteCSS(t *testing.T) {
	text := `@import "a.css";
@import url(b.css) layer(base) screen;
@import"tight.css";
/* url(comment.png) */
.x { background: url(c.png); mask: url('d.svg#m'); src: url("e f.woff2") format("woff2"); }
.y { b: url(  "g\"h.png"  ); c: url(i\ j.png); d: url(keep.png); }
`
	var seen []seenRef
	got := rewriteCSS(text, canvas.Stylesheet, func(ref string, kind refKind) (string, bool) {
		seen = append(seen, seenRef{kind, ref})
		if ref == "keep.png" {
			return "", false
		}
		return "N[" + ref + "]", true
	})
	want := `@import url("N[a.css]");
@import url("N[b.css]") layer(base) screen;
@import url("N[tight.css]");
/* url(comment.png) */
.x { background: url("N[c.png]"); mask: url("N[d.svg#m]"); src: url("N[e f.woff2]") format("woff2"); }
.y { b: url("N[g\"h.png]"); c: url("N[i j.png]"); d: url(keep.png); }
`
	if got != want {
		t.Errorf("rewriteCSS =\n%s\nwant\n%s", got, want)
	}
	wantSeen := []seenRef{
		{kindStylesheet, "a.css"}, {kindStylesheet, "b.css"}, {kindStylesheet, "tight.css"},
		{kindAsset, "c.png"}, {kindAsset, "d.svg#m"}, {kindAsset, "e f.woff2"},
		{kindAsset, `g"h.png`}, {kindAsset, "i j.png"}, {kindAsset, "keep.png"},
	}
	if !reflect.DeepEqual(seen, wantSeen) {
		t.Errorf("seen = %v", seen)
	}
}

func TestRewriteCSSEscapesReplacement(t *testing.T) {
	got := rewriteCSS("a{b:url(x)}", canvas.Stylesheet, func(string, refKind) (string, bool) { return "https://x/\"q\"\\\n</style>", true })
	if want := `a{b:url("https://x/\"q\"\\\a \3c /style>")}`; got != want {
		t.Errorf("got %s, want %s", got, want)
	}
}

func TestRewriteCSSDeclarationsHaveNoImports(t *testing.T) {
	var seen []seenRef
	got := rewriteCSS(`background: url(a.png); @import "b.css"`, canvas.Declarations, func(ref string, kind refKind) (string, bool) {
		seen = append(seen, seenRef{kind, ref})
		return "N", true
	})
	if got != `background: url("N"); @import "b.css"` || !reflect.DeepEqual(seen, []seenRef{{kindAsset, "a.png"}}) {
		t.Errorf("got %s, seen %v", got, seen)
	}
}

func TestRewriteCSSWithoutReferencesIsUnchanged(t *testing.T) {
	for _, text := range []string{"", ".a{color:red}", "/* unterminated url(x)", `.a{content:"url(x)"}`} {
		got := rewriteCSS(text, canvas.Stylesheet, func(string, refKind) (string, bool) { return "N", true })
		if got != text {
			t.Errorf("rewriteCSS(%q) = %q", text, got)
		}
	}
}

// Bytes outside rewritten tags are copied as they are, including markup a
// parse-and-render round trip would change.
func TestRewriteHTMLPreservesUnchangedBytes(t *testing.T) {
	docs := []string{
		"<!DOCTYPE html>\n<HTML><Head><meta charset=utf-8><TITLE>a &amp; b</TITLE></Head>\n<body><p>unclosed<b><i>misnested</b></i>\n<!-- <img src=x.png> -->\n<script>if (a</b) document.write('<img src=y.png>')</script>\n<textarea><img src=z.png></textarea>\n<svg><![CDATA[ x ]]></svg>\n<table><tr><td>cell</table>\n&nbsp;&#x41;\n",
		"",
		"plain text",
		"<img src='a.png'",
		"<p a=1 a=2>",
	}
	for _, doc := range docs {
		got := rewriteHTML([]byte(doc), func(refKind, string) (string, bool) { return "", false }, keepCSS)
		if string(got) != doc {
			t.Errorf("unchanged doc =\n%q\nwant\n%q", got, doc)
		}
	}
}

func TestRewriteHTMLAttributes(t *testing.T) {
	src := `<head><LINK REL="Alternate StyleSheet" href="s.css"><link rel="icon" href="i.svg"><link rel="modulepreload" href="m.js"><link rel="canonical" href="c.html">
<script type="module" src="app.js" async></script></head>
<body><IMG Alt="x &amp; y" SRC='a.png' data-x=1 src="dup.png" srcset="b.png 1x, data:image/png;base64,AA 2x , c.png 3x" />
<picture><source srcset="d.png"></picture><video poster="p.png" src="v.mp4"><track src="t.vtt"></video><audio src="au.mp3"></audio>
<input type="IMAGE" src="btn.png"><input type="text" src="no.png">
<svg><use href="sp.svg#i"/><image xlink:href="im.png"/><feImage href="fe.png"/><a xlink:href="svg-link.html">l</a></svg>
<iframe src="f.html"></iframe><frame src="fr.html"><object data="o.html"></object><embed src="e.html">
<a href="page.html">p</a><area href="ar.html"><form action="go.html"></form>
<template><img src="hidden.png"><template><img src="deeper.png"></template><img src="hidden2.png"></template><img src="after.png">
</body>`
	var seen []seenRef
	got := string(rewriteHTML([]byte(src), func(kind refKind, href string) (string, bool) {
		seen = append(seen, seenRef{kind, href})
		if kind == kindLink || kind == kindFrame || strings.HasPrefix(href, "data:") {
			return "", false
		}
		return "N[" + href + "]", true
	}, keepCSS))
	want := `<head><link rel="Alternate StyleSheet" href="N[s.css]"><link rel="icon" href="N[i.svg]"><link rel="modulepreload" href="N[m.js]"><link rel="canonical" href="c.html">
<script type="module" src="N[app.js]" async=""></script></head>
<body><img alt="x &amp; y" src="N[a.png]" data-x="1" srcset="N[b.png] 1x, data:image/png;base64,AA 2x , N[c.png] 3x"/>
<picture><source srcset="N[d.png]"></picture><video poster="N[p.png]" src="N[v.mp4]"><track src="N[t.vtt]"></video><audio src="N[au.mp3]"></audio>
<input type="IMAGE" src="N[btn.png]"><input type="text" src="no.png">
<svg><use href="N[sp.svg#i]"/><image xlink:href="N[im.png]"/><feimage href="N[fe.png]"/><a xlink:href="svg-link.html">l</a></svg>
<iframe src="f.html"></iframe><frame src="fr.html"><object data="o.html"></object><embed src="e.html">
<a href="page.html">p</a><area href="ar.html"><form action="go.html"></form>
<template><img src="hidden.png"><template><img src="deeper.png"></template><img src="hidden2.png"></template><img src="N[after.png]">
</body>`
	if got != want {
		t.Errorf("rewriteHTML =\n%s\nwant\n%s", got, want)
	}
	wantSeen := []seenRef{
		{kindStylesheet, "s.css"}, {kindAsset, "i.svg"}, {kindAsset, "m.js"}, {kindLink, "c.html"},
		{kindAsset, "app.js"},
		{kindAsset, "a.png"}, {kindAsset, "b.png"}, {kindAsset, "data:image/png;base64,AA"}, {kindAsset, "c.png"},
		{kindAsset, "d.png"}, {kindAsset, "p.png"}, {kindAsset, "v.mp4"}, {kindAsset, "t.vtt"}, {kindAsset, "au.mp3"},
		{kindAsset, "btn.png"},
		{kindUse, "sp.svg#i"}, {kindAsset, "im.png"}, {kindAsset, "fe.png"}, {kindLink, "svg-link.html"},
		{kindFrame, "f.html"}, {kindFrame, "fr.html"}, {kindFrame, "o.html"}, {kindFrame, "e.html"},
		{kindLink, "page.html"}, {kindLink, "ar.html"}, {kindLink, "go.html"},
		{kindAsset, "after.png"},
	}
	if !reflect.DeepEqual(seen, wantSeen) {
		t.Errorf("seen =\n%v\nwant\n%v", seen, wantSeen)
	}
}

func TestRewriteHTMLStyles(t *testing.T) {
	src := `<style>@import "a.css";</style><style></style><div style="background:url(b.png)">x</div><template><style>@import "t.css";</style><p style="x"></p></template><svg><style>.s{fill:url(c.svg)}</style></svg>`
	var seen []string
	got := string(rewriteHTML([]byte(src), func(refKind, string) (string, bool) { return "", false }, func(text string, mode canvas.Mode) string {
		seen = append(seen, fmt.Sprintf("%d:%s", mode, text))
		return "<" + text + ">"
	}))
	want := `<style><@import "a.css";></style><style></style><div style="<background:url(b.png)>">x</div><template><style>@import "t.css";</style><p style="x"></p></template><svg><style><.s{fill:url(c.svg)}></style></svg>`
	if got != want {
		t.Errorf("rewriteHTML =\n%s\nwant\n%s", got, want)
	}
	wantSeen := []string{`0:@import "a.css";`, `1:background:url(b.png)`, `0:.s{fill:url(c.svg)}`}
	if !reflect.DeepEqual(seen, wantSeen) {
		t.Errorf("seen = %q", seen)
	}
}

func TestRewriteSrcset(t *testing.T) {
	cases := map[string]string{
		"a.png":                         "N[a.png]",
		"a.png 1x,b.png 2x":             "N[a.png] 1x,N[b.png] 2x",
		"  a.png  100w ,  b.png 200w  ": "  N[a.png]  100w ,  N[b.png] 200w  ",
		"a.png, b.png":                  "N[a.png], N[b.png]",
		"a,b.png 1x":                    "N[a,b.png] 1x",
		"a.png (x, y) 1x, b.png":        "N[a.png] (x, y) 1x, N[b.png]",
		"":                              "",
	}
	for in, want := range cases {
		if got := rewriteSrcset(in, func(u string) (string, bool) { return "N[" + u + "]", true }); got != want {
			t.Errorf("rewriteSrcset(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestRewriteSrcsetKeepsAnEmptyDataURIWhole(t *testing.T) {
	uri := dataURI("image/png", nil)
	got := rewriteSrcset("a.png 1x, b.png 2x", func(u string) (string, bool) { return uri, u == "a.png" })
	if want := uri + "# 1x, b.png 2x"; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

// <style/> is still a raw-text start tag for the parser.
func TestRewriteHTMLSelfClosingStyle(t *testing.T) {
	var seen []string
	rewriteHTML([]byte(`<style/>.a{background:url(x.png)}</style>`), func(refKind, string) (string, bool) { return "", false }, func(text string, mode canvas.Mode) string {
		seen = append(seen, text)
		return text
	})
	if !reflect.DeepEqual(seen, []string{".a{background:url(x.png)}"}) {
		t.Errorf("seen = %q", seen)
	}
}
