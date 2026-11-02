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
