package canvas

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var updateCSSGolden = flag.Bool("update-css-golden", false, "rewrite testdata/css_scan_golden.json from the current scanners")

const cssGoldenPath = "testdata/css_scan_golden.json"

// cssScanResult is everything check and export read from one style text.
type cssScanResult struct {
	Scan Scan
	Refs []CSSRef
	Uses CustomUse
}

// largeRule builds a stylesheet with the rule of the export memory profile
// (cli/internal/export/profile_test.go) at a small size: every stride-th rule
// holds a url(), the others a colour and a padding.
func largeRule(rules, stride int, minified bool) string {
	var b strings.Builder
	for i := range rules {
		sel := fmt.Sprintf(".r%07d", i)
		switch {
		case i%stride == 0 && minified:
			fmt.Fprintf(&b, "%s{background:url(../big/i%02d.svg)}", sel, i%10)
		case i%stride == 0:
			fmt.Fprintf(&b, "%s {\n  background: url(\"../big/i%02d.svg\");\n}\n", sel, i%10)
		case minified:
			fmt.Fprintf(&b, "%s{color:rgb(1,2,3);padding:1px}", sel)
		default:
			fmt.Fprintf(&b, "%s {\n  color: rgb(1, 2, 3);\n  padding: 1px;\n}\n", sel)
		}
	}
	return b.String()
}

// cssScanInputs covers what the scanners distinguish. Each input is read in
// both modes, so a declaration list and a stylesheet see the same bytes.
func cssScanInputs() [][2]string {
	return [][2]string{
		{"large-minified", largeRule(40, 6, true)},
		{"large-pretty", largeRule(40, 6, false)},
		{"comments", "/* url(a.png) @import \"b.css\"; */.a{color:red/* ; } */;b:url(c.png)}/*x*/.d{e:f}/* unterminated url(g.png)"},
		{"strings", `.a{content:"x;}{";b:'y\'z';c:"line` + "\n" + `break";d:"\6b \"q";e:'\` + "\n" + `cont';f:"end`},
		{"url-forms", `.a{a:url(a.png);b:url( "b c.png" );c:URL(C.png);d:url('d.png' ) ;e:url(e\).png);f:url(  f.png  );g:url("g" x);h:uRl(h.png)}.z{i:url(i.png`},
		{"escapes", `.\31 a{\63olor:red;--\78:url(\61.png);b:\@x}.c\{d{e:f}\`},
		{"custom-properties", `:root{--a:url(x.png);--b:var(--a);--c:var(--b,var(--d));--url:url("y.png") center}.x{background:var(--b, red);mask:var( --c);color:VAR(--e)}@property --reg{syntax:"<url>";inherits:false;initial-value:url(i.png)}@property --num{syntax:'<number>'}@property --bad x{syntax:"<url>"}.n{&:hover{color:red}--icon:url(n.svg)}`},
		{"imports", `@import "a.css";@import url(b.css) layer(x) screen;@import'c.css';@IMPORT "d.css";@ import "e.css";@/**/import "f.css";@"import" "g.css";@import h.css;@media print{@import "n.css";}.x{y:url(z.png)}@import "late.css"`},
		{"viewport-units", `.a{height:100vh;min-height:100DVH;max-height:calc(100svh - 1px);h:1.5lvh;x:1e2vb;y:100v\68;z:#100vh;w:"100vh";q:url(100vh);p:-.5dvb;r:+3SVB;s:100vhx;t:100 vh;u:.5e-1lvb;v:1.vh}`},
		{"colors", `.a{c:#abc;d:#abcd;e:#aabbcc;f:#aabbccdd;g:#ggg;h:#abcde;i:rgb(1,2,3);j:RGBA(1,2,3,.5);k:rgb(calc(1 + 2),2,3);l:rgb (1,2,3);m:rgb(1,2;n:# abc}`},
		{"braces-and-parens", `.a{.b{color:red}}}}}{x:y}.c{background:url(x.png);content:fn(a;b);k:fn(a;var(--p));color:red}.d{e:f(g{h)}i:j}.k{l:m`},
		{"declarations", `color: red; background: url(a.png); --x: url(b.png); height: 100vh; margin: var(--x, 1px)`},
		{"non-ascii", `.한글{색:#fff;--변수:url(그림.png);width:var(--변수)}`},
		{"empty", ``},
		{"tokens-seed", `@import "a.css";
@import url(b.css) layer(base) screen;
@import url("https://fonts.example.com/css2?family=Inter");
@import "missing.css";
/* url(commented.png) is not a reference */
@font-face { font-family: Brand; src: url("../.doan/assets/fonts/brand.woff2") format("woff2"); }
:root { --brand: #3366ff; --hero: url(../.doan/assets/images/hero.png); --gone: url(gone.png); --cdn: url(//cdn.example.com/bg.png); }
`},
	}
}

func cssScanAll() map[string]map[string]cssScanResult {
	out := map[string]map[string]cssScanResult{}
	for _, in := range cssScanInputs() {
		out[in[0]] = map[string]cssScanResult{}
		for name, mode := range map[string]Mode{"stylesheet": Stylesheet, "declarations": Declarations} {
			out[in[0]][name] = cssScanResult{ScanCSS(in[1], mode), CSSRefs(in[1], mode), CustomUses(in[1], mode)}
		}
	}
	return out
}

// TestCSSScannersMatchGolden pins what ScanCSS, CSSRefs and CustomUses
// report, so a change to the tokenizer cannot silently change what check
// warns about or what export rewrites.
func TestCSSScannersMatchGolden(t *testing.T) {
	got := cssScanAll()
	if *updateCSSGolden {
		b, err := json.MarshalIndent(got, "", " ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll(filepath.Dir(cssGoldenPath), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(cssGoldenPath, append(b, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	data, err := os.ReadFile(cssGoldenPath)
	if err != nil {
		t.Fatal(err)
	}
	var want map[string]map[string]json.RawMessage
	if err := json.Unmarshal(data, &want); err != nil {
		t.Fatal(err)
	}
	if len(want) != len(got) {
		t.Fatalf("golden has %d inputs, test has %d", len(want), len(got))
	}
	for name, modes := range got {
		for mode, res := range modes {
			have, err := json.Marshal(res)
			if err != nil {
				t.Fatal(err)
			}
			var exp bytes.Buffer
			if err := json.Compact(&exp, want[name][mode]); err != nil {
				t.Fatalf("%s/%s: golden missing or invalid: %v", name, mode, err)
			}
			if !bytes.Equal(have, exp.Bytes()) {
				t.Errorf("%s/%s:\n got %s\nwant %s", name, mode, have, exp.Bytes())
			}
		}
	}
}
