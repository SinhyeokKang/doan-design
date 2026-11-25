package canvas

import (
	"reflect"
	"testing"
)

func TestCSSRefsGivesDecodedValuesAndSpans(t *testing.T) {
	text := `@import "a.css";
@import url(b.css) layer(x) screen;
/* url(c.png) @import "d.css"; */
.x { background: url( 'e f.png' ) ; mask: url("g\"h.svg#m"); }
.y { b: url(i\ j.png); c: url("\6b .png"); d: URL(L.png); }
@media print { @import "nested.css"; }
`
	got := CSSRefs(text, Stylesheet)
	type ref struct {
		Value  string
		Import bool
		Raw    string
	}
	var have []ref
	for _, r := range got {
		have = append(have, ref{r.Value, r.Import, text[r.Start:r.End]})
	}
	want := []ref{
		{"a.css", true, `"a.css"`},
		{"b.css", true, `url(b.css)`},
		{"e f.png", false, `url( 'e f.png' )`},
		{`g"h.svg#m`, false, `url("g\"h.svg#m")`},
		{"i j.png", false, `url(i\ j.png)`},
		{"k.png", false, `url("\6b .png")`},
		{"L.png", false, `URL(L.png)`},
	}
	if !reflect.DeepEqual(have, want) {
		t.Fatalf("CSSRefs =\n%+v\nwant\n%+v", have, want)
	}
}

func TestCSSRefsInDeclarationsHasNoImports(t *testing.T) {
	text := `@import "a.css"; background: url(b.png)`
	got := CSSRefs(text, Declarations)
	if len(got) != 1 || got[0].Value != "b.png" || got[0].Import {
		t.Fatalf("CSSRefs = %+v", got)
	}
}

// CSSRefs reports the same references ScanCSS does, so rewriting and checking
// cannot disagree about what a stylesheet reaches.
func TestCSSRefsMatchesScanCSS(t *testing.T) {
	for _, text := range []string{
		`@import "a.css"; @import url(b.css); .x{background:url(c.png)}`,
		`@import url("d.css") supports(display:grid); .y{src:url(e.woff2) format("woff2"), url('f.woff')}`,
		`.z{background:url(g.png)} @import "late.css";`,
	} {
		scan := ScanCSS(text, Stylesheet)
		var imports, urls []string
		for _, r := range CSSRefs(text, Stylesheet) {
			if r.Import {
				imports = append(imports, r.Value)
			}
		}
		for _, r := range CSSRefs(text, Stylesheet) {
			if r.Import && text[r.Start] != 'u' && text[r.Start] != 'U' {
				continue
			}
			urls = append(urls, r.Value)
		}
		if !reflect.DeepEqual(imports, scan.Imports) || !reflect.DeepEqual(urls, scan.URLs) {
			t.Errorf("%s: refs imports %q urls %q; scan imports %q urls %q", text, imports, urls, scan.Imports, scan.URLs)
		}
	}
}

// A string argument of image-set() is a <url> (CSS Images 4), so it is a reference like url().
func TestImageSetStringsAreReferences(t *testing.T) {
	text := `.a { background-image: image-set("a.png" 1x, 'b.png' 2x); }
.b { background: -WEBKIT-Image-Set("c.png" 1x, url(d.png) 2x), linear-gradient(red, blue); }
.c { content: "e.png"; mask: image-set("f.avif" type("image/avif")); --i: image-set("g.png" 1x); }
.d { background: image-set(linear-gradient(red, blue) 1x, "h.png" 2x); x: image-set ("i.png"); }
`
	type ref struct{ Value, Custom, Raw string }
	var have []ref
	for _, r := range CSSRefs(text, Stylesheet) {
		have = append(have, ref{r.Value, r.Custom, text[r.Start:r.End]})
	}
	want := []ref{
		{"a.png", "", `"a.png"`},
		{"b.png", "", `'b.png'`},
		{"c.png", "", `"c.png"`},
		{"d.png", "", `url(d.png)`},
		{"f.avif", "", `"f.avif"`},
		{"g.png", "--i", `"g.png"`},
		{"h.png", "", `"h.png"`},
	}
	if !reflect.DeepEqual(have, want) {
		t.Fatalf("CSSRefs =\n%+v\nwant\n%+v", have, want)
	}
	if urls := ScanCSS(text, Stylesheet).URLs; !reflect.DeepEqual(urls, []string{"a.png", "b.png", "c.png", "d.png", "f.avif", "g.png", "h.png"}) {
		t.Fatalf("ScanCSS URLs = %q", urls)
	}
	// A block boundary ends an unclosed call, so the next rule's strings stay strings.
	if urls := ScanCSS(`a{b:image-set("a.png" 1x} c{content:"x"}`, Stylesheet).URLs; !reflect.DeepEqual(urls, []string{"a.png"}) {
		t.Fatalf("after an unclosed call: %q", urls)
	}
}

func TestImageSetExternalURL(t *testing.T) {
	c := mustParse(t, "x", []byte(`<style>a{background:image-set("https://cdn/x.png" 1x)}</style><div style="background:-webkit-image-set('//cdn/y.png' 1x)"></div>`))
	if !reflect.DeepEqual(c.ExternalURLs, []string{"//cdn/y.png", "https://cdn/x.png"}) {
		t.Fatal(c.ExternalURLs)
	}
}
