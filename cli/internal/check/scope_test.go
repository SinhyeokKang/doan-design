package check

import (
	"reflect"
	"sort"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
)

const (
	shared = ".doan/assets/shared.css"
	deep   = ".doan/assets/deep.css"
)

// scopeInput has three canvases linking one stylesheet that imports another: alpha and zeta define no token, beta
// defines both, so with no scope alpha (first in path order) takes the shared undefined_token findings.
func scopeInput() Input {
	meta := func(id string) string {
		return `<meta name="doan:canvas" content="` + id + `"><meta name="doan:width" content="800">`
	}
	in := Input{
		Canvases: []canvas.Canvas{
			parse(".doan/canvases/a.html", meta("alpha"), ""),
			parse(".doan/canvases/b.html", meta("beta")+`<style>:root{--brand:red;--deep:blue}</style>`, ""),
			parse(".doan/canvases/z.html", meta("zeta"), ""),
			parse(".doan/canvases/bad.html", `<meta name="doan:canvas" content="bad">`, ""),
		},
		Unparsable: map[string]string{},
		Reach:      map[string][]CSSRef{},
		CSS: map[string]canvas.Scan{
			shared: canvas.ScanCSS(`@import "deep.css"; .x{color:var(--brand);background:#123456}`, canvas.Stylesheet),
			deep:   canvas.ScanCSS(`.y{color:var(--deep)}`, canvas.Stylesheet),
		},
		Implements:       map[string]State{},
		Served:           func(string) bool { return true },
		TokenCSS:         TokenCSS{Configured: true, Path: "tokens/missing.css", State: Missing},
		WithheldServe:    []string{".env"},
		MiscasedCanvases: []string{".doan/canvases/Upper.HTML"},
	}
	for _, c := range []string{".doan/canvases/a.html", ".doan/canvases/b.html", ".doan/canvases/z.html"} {
		in.Reach[c] = []CSSRef{
			{From: c, Href: "../assets/shared.css", RealPath: shared, State: In, Direct: true},
			{From: shared, Href: "deep.css", RealPath: deep, State: In},
		}
	}
	return in
}

func scoped(paths ...string) map[string]bool {
	s := map[string]bool{}
	for _, p := range paths {
		s[p] = true
	}
	return s
}

// findingKeys names each finding by what a scope can change: where, what, and for which canvas.
func findingKeys(fs []Finding) []string {
	out := []string{}
	for _, f := range fs {
		out = append(out, f.Path+" "+f.Code+" "+f.Canvas+" "+f.Token)
	}
	sort.Strings(out)
	return out
}

var configKeys = []string{".doan/config.json serve_withheld  ", ".doan/config.json token_css_not_found  "}

func withConfig(keys ...string) []string {
	out := append(append([]string{}, keys...), configKeys...)
	sort.Strings(out)
	return out
}

func TestRunScope(t *testing.T) {
	dupCanvas := func(path string) canvas.Canvas {
		return parse(path, `<meta name="doan:canvas" content="dup"><meta name="doan:width" content="800">`, "")
	}
	tests := []struct {
		name   string
		change func(*Input)
		scope  map[string]bool
		want   []string
	}{
		{
			name:  "no scope keeps the whole-repo findings, shared ones on the first canvas",
			scope: nil,
			want: withConfig(
				deep+" undefined_token alpha --deep",
				shared+" undefined_token alpha --brand",
				shared+" hardcoded_color  ",
				".doan/canvases/Upper.HTML canvas_extension_case  ",
				".doan/canvases/bad.html missing_width bad ",
			),
		},
		{
			name:  "errors of canvases outside the scope are left out",
			scope: scoped(".doan/canvases/b.html"),
			want:  withConfig(shared + " hardcoded_color  "),
		},
		{
			name:  "a shared undefined_token is not lost to an earlier canvas outside the scope, through the import chain too",
			scope: scoped(".doan/canvases/z.html"),
			want: withConfig(
				deep+" undefined_token zeta --deep",
				shared+" undefined_token zeta --brand",
				shared+" hardcoded_color  ",
			),
		},
		{
			name:  "a shared finding comes once for the canvases in scope",
			scope: scoped(".doan/canvases/a.html", ".doan/canvases/z.html"),
			want: withConfig(
				deep+" undefined_token alpha --deep",
				shared+" undefined_token alpha --brand",
				shared+" hardcoded_color  ",
			),
		},
		{
			name:  "a stylesheet only canvases outside the scope reach reports nothing",
			scope: scoped(".doan/canvases/bad.html"),
			want:  withConfig(".doan/canvases/bad.html missing_width bad "),
		},
		{
			name: "every file sharing an id with a canvas in scope gets duplicate_canvas_id",
			change: func(i *Input) {
				i.Canvases = append(i.Canvases, dupCanvas(".doan/canvases/d1.html"), dupCanvas(".doan/canvases/sub/d2.html"), dupCanvas(".doan/ds/d3.html"))
			},
			scope: scoped(".doan/canvases/sub/d2.html"),
			want: withConfig(
				".doan/canvases/d1.html duplicate_canvas_id dup ",
				".doan/canvases/sub/d2.html duplicate_canvas_id dup ",
				".doan/ds/d3.html duplicate_canvas_id dup ",
			),
		},
		{
			name: "two canvases in scope sharing an id get one finding each",
			change: func(i *Input) {
				i.Canvases = append(i.Canvases, dupCanvas(".doan/canvases/d1.html"), dupCanvas(".doan/ds/d3.html"))
			},
			scope: scoped(".doan/canvases/d1.html", ".doan/ds/d3.html"),
			want: withConfig(
				".doan/canvases/d1.html duplicate_canvas_id dup ",
				".doan/ds/d3.html duplicate_canvas_id dup ",
			),
		},
		{
			name: "an unparsable canvas in scope is reported, one outside is not",
			change: func(i *Input) {
				i.Unparsable[".doan/canvases/broken.html"] = "x"
				i.Unparsable[".doan/canvases/other.html"] = "y"
			},
			scope: scoped(".doan/canvases/broken.html"),
			want:  withConfig(".doan/canvases/broken.html unparsable_canvas  "),
		},
		{
			name: "a scope reports neither no_canvases nor canvas_extension_case",
			change: func(i *Input) {
				i.Canvases = nil
				i.Reach = map[string][]CSSRef{}
			},
			scope: scoped(),
			want:  withConfig(),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := scopeInput()
			if tt.change != nil {
				tt.change(&in)
			}
			in.Scope = tt.scope
			if got := findingKeys(Run(in)); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("got\n%q\nwant\n%q", got, tt.want)
			}
		})
	}
}
