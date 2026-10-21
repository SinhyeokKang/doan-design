package canvas

import (
	"reflect"
	"strings"
	"testing"
)

func TestScanCSS(t *testing.T) {
	tests := []struct {
		name, css             string
		mode                  Mode
		defs                  []string
		refs                  []Reference
		colors, imports, urls []string
	}{
		{name: "comments and strings", css: `/*var(--x)*/ a{content:"#fff"; color:red} /* unfinished var(--z)`},
		{name: "unterminated string", css: "a{content:'#fff\n;color:#abc}", colors: []string{"#abc"}},
		{name: "selectors and media", css: `.x:not(#abc){color:red} a:hover #add {} @media(max-width:600px){a{color:#ABC}}`, colors: []string{"#ABC"}},
		{name: "url values", css: `a{fill:url(#fade);background:url(data:image/png;base64,xyz);color:#abc}`, colors: []string{"#abc"}, urls: []string{"#fade", "data:image/png;base64,xyz"}},
		{name: "colors", css: `a{a:#ABC;b:#abcd;c:#aabbcc;d:#aabbccdd;e:#abcde;f:#abcdeff;g:RGB(1,2,3);h:rgba(1,2,3,.5);i:red;j:hsl(1,2,3);k:oklch(1);l:#abcxyz}`, colors: []string{"#ABC", "#abcd", "#aabbcc", "#aabbccdd", "RGB(1,2,3)", "rgba(1,2,3,.5)"}},
		{name: "tokens", css: `a{--x:1px;--Foo:#fff;color:var(--x,var(--y));x:var( --foo );y:VAR(--Foo)}`, defs: []string{"--x", "--Foo"}, refs: []Reference{{"--x", true}, {"--y", false}, {"--foo", false}, {"--Foo", false}}, colors: []string{"#fff"}},
		{name: "fallback color", css: `a{color:var(--x,#fff)}`, refs: []Reference{{"--x", true}}, colors: []string{"#fff"}},
		{name: "imports", css: `@import "a.css"; @import url(b.css); a{background:url(https://cdn/x)}`, imports: []string{"a.css", "b.css"}, urls: []string{"b.css", "https://cdn/x"}},
		{name: "declaration list", css: `color:#fff;--a:1`, mode: Declarations, defs: []string{"--a"}, colors: []string{"#fff"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := ScanCSS(tt.css, tt.mode)
			for _, d := range tt.defs {
				if !s.Defs[d] {
					t.Errorf("missing definition %s", d)
				}
			}
			if len(s.Defs) != len(tt.defs) {
				t.Errorf("defs %v", s.Defs)
			}
			equal := func(name string, a, b any) {
				t.Helper()
				if !reflect.DeepEqual(a, b) {
					t.Errorf("%s: got %#v want %#v", name, a, b)
				}
			}
			equal("refs", s.Refs, tt.refs)
			equal("colors", s.Colors, tt.colors)
			equal("imports", s.Imports, tt.imports)
			equal("urls", s.URLs, tt.urls)
		})
	}
}

func TestParseMetadata(t *testing.T) {
	c := mustParse(t, "design/a.html", []byte(`<head><meta Name="DOAN:CANVAS" content=" foo"><meta name="doan:canvas" content="bar"><meta name="doan:width" content="2400"><meta name="doan:width" content="5"><title> \t A
 B `+"\uFEFF"+` </title><title>ignored</title></head>`))
	if c.Path != "design/a.html" || c.ID != " foo" || !c.HasID || !c.IDDup || c.Width != 2400 || !c.WidthDup || c.Title != "\\t A B \uFEFF" {
		t.Fatalf("%+v", c)
	}
	for _, raw := range []string{"0", "012", "1.5", " 375", "375px", "+1", "99999999999999999999", ""} {
		t.Run(raw, func(t *testing.T) {
			c := mustParse(t, "x", []byte(`<meta name="doan:width" content="`+raw+`">`))
			if c.Width != 0 || !c.HasWidth || c.WidthRaw != raw {
				t.Fatalf("%+v", c)
			}
		})
	}
	c = mustParse(t, "x", []byte(`<p>body</p><meta name="doan:canvas" content="a"><meta name="doan:width" content="1">`))
	if c.HasID || c.HasWidth || !c.BodyMeta["doan:canvas"] || !c.BodyMeta["doan:width"] {
		t.Fatalf("%+v", c)
	}
	c = mustParse(t, "x", nil)
	if c.HasID || c.HasWidth || len(c.Frames) != 0 {
		t.Fatalf("%+v", c)
	}
}
func TestParseElements(t *testing.T) {
	c := mustParse(t, "x", []byte(`<div data-doan-frame data-doan-frame="second" data-doan-title=" title " data-doan-implements="" data-doan-id="x" style="color:#fff"></div><div data-doan-frame=" "></div><template><div data-doan-frame="hidden" data-doan-id="hidden"></div><style>a{color:#abc}</style></template><link rel="preload stylesheet" href="a.css"><link rel="STYLESHEET" href="b.css"><link rel="icon" href="c.css"><style>a{--x:1}</style>`))
	if len(c.Frames) != 2 || c.Frames[0].ID != "" || c.Frames[1].ID != " " || c.Frames[0].Title == nil || *c.Frames[0].Title != " title " || c.Frames[0].Implements == nil || *c.Frames[0].Implements != "" {
		t.Fatalf("frames %+v", c.Frames)
	}
	if !reflect.DeepEqual(c.Links, []string{"a.css", "b.css"}) || !reflect.DeepEqual(c.DoanIDs, []string{"x"}) || !reflect.DeepEqual(c.Styles.Colors, []string{"#fff"}) || !c.Styles.Defs["--x"] {
		t.Fatalf("%+v", c)
	}
}
func TestURL(t *testing.T) {
	for _, tt := range []struct {
		href, path      string
		local, external bool
	}{{" ./a.css ", "./a.css", true, false}, {"a.css?v=1#x", "a.css", true, false}, {"a%20b.css", "a b.css", true, false}, {"/abs.css", "/abs.css", true, false}, {"HTTPS://cdn/x.css", "", false, true}, {"//cdn/x.css", "", false, true}, {"data:x", "", false, false}, {"file:x", "", false, false}, {"a%xx.css", "", false, false}} {
		p, ok := LocalPath(tt.href)
		if p != tt.path || ok != tt.local || IsExternal(tt.href) != tt.external {
			t.Errorf("%q: %q %v", tt.href, p, ok)
		}
	}
}
func TestExternalURLs(t *testing.T) {
	tags := []string{`script src`, `link href`, `img src`, `iframe src`, `video src`, `audio src`, `source src`, `embed src`, `track src`, `video poster`, `object data`, `svg><use href`, `svg><image xlink:href`}
	for _, tag := range tags {
		i := 0
		for tag[i] != ' ' {
			i++
		}
		c := mustParse(t, "x", []byte("<"+tag[:i]+" "+tag[i+1:]+`="https://cdn/x"></`+tag[:i]+"><style>a{background:url(https://cdn/x)}</style>"))
		if !reflect.DeepEqual(c.ExternalURLs, []string{"https://cdn/x"}) {
			t.Errorf("%s: %v", tag, c.ExternalURLs)
		}
	}
	c := mustParse(t, "x", []byte(`<img srcset="https://cdn/b 1x, https://cdn/a 2x"><source srcset="https://cdn/b 3x"><style>@import "//cdn/c";</style>`))
	if !reflect.DeepEqual(c.ExternalURLs, []string{"//cdn/c", "https://cdn/a", "https://cdn/b"}) {
		t.Fatal(c.ExternalURLs)
	}
}

func TestTitleASCIIWhitespace(t *testing.T) {
	c := mustParse(t, "x", []byte("<title>\t\n\f\r A\t\nB\u00a0\u0085\uFEFF \r</title>"))
	if c.Title != "A B\u00a0\u0085\uFEFF" {
		t.Fatalf("title %q", c.Title)
	}
}

func mustParse(t *testing.T, path string, data []byte) Canvas {
	t.Helper()
	c, err := Parse(path, data)
	if err != nil {
		t.Fatal(err)
	}
	return c
}
func TestParseReportsDepthLimit(t *testing.T) {
	_, err := Parse("design/deep.html", []byte(strings.Repeat("<div>", 600)))
	if err == nil || !strings.Contains(err.Error(), "design/deep.html") {
		t.Fatalf("expected parser error with path, got %v", err)
	}
}
