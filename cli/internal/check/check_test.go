package check

import (
	"reflect"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
)

func parse(path, head, body string) canvas.Canvas {
	c, err := canvas.Parse(path, []byte(`<head>`+head+`</head><body>`+body+`</body>`))
	if err != nil {
		panic(err)
	}
	return c
}

const metadata = `<meta name="doan:canvas" content="one"><meta name="doan:width" content="2400">`

func base() Input {
	return Input{Canvases: []canvas.Canvas{parse("design/a.html", metadata, "")}, Reach: map[string][]CSSRef{}, CSS: map[string]canvas.Scan{}, Implements: map[string]State{}, Served: func(string) bool { return true }}
}
func codes(fs []Finding, code string) []Finding {
	out := []Finding{}
	for _, f := range fs {
		if f.Code == code {
			out = append(out, f)
		}
	}
	return out
}
func TestRules(t *testing.T) {
	tests := []struct {
		code   string
		change func(*Input)
	}{
		{"missing_canvas_id", func(i *Input) { i.Canvases[0] = parse("design/a.html", `<meta name="doan:width" content="1">`, "") }},
		{"invalid_canvas_id", func(i *Input) { i.Canvases[0].ID = "Bad" }},
		{"duplicate_canvas_id", func(i *Input) { i.Canvases = append(i.Canvases, parse("design/b.html", metadata, "")) }},
		{"missing_width", func(i *Input) { i.Canvases[0].HasWidth = false }},
		{"invalid_width", func(i *Input) { i.Canvases[0].Width = 0 }},
		{"duplicate_frame_id", func(i *Input) { i.Canvases[0].Frames = []canvas.Frame{{ID: "a"}, {ID: "a"}} }},
		{"empty_frame_id", func(i *Input) { i.Canvases[0].Frames = []canvas.Frame{{ID: ""}} }},
		{"duplicate_doan_id", func(i *Input) { i.Canvases[0].DoanIDs = []string{"a", "a"} }},
		{"empty_doan_id", func(i *Input) { i.Canvases[0].DoanIDs = []string{""} }},
		{"undefined_token", func(i *Input) { i.Canvases[0].Styles = canvas.ScanCSS(`a{color:var(--x,#fff)}`, canvas.Stylesheet) }},
		{"implements_not_found", func(i *Input) { s := ""; i.Canvases[0].Frames = []canvas.Frame{{ID: "a", Implements: &s}} }},
		{"path_outside_repo", func(i *Input) {
			s := "/outside"
			i.Canvases[0].Frames = []canvas.Frame{{ID: "a", Implements: &s}}
			i.Implements[s] = Outside
		}},
		{"local_css_not_found", func(i *Input) {
			i.Reach["design/a.html"] = []CSSRef{{Href: "absent.css", State: Missing, Direct: true}}
		}},
		{"css_not_served", func(i *Input) {
			i.Reach["design/a.html"] = []CSSRef{{Href: "../a.css", RealPath: "a.css", State: In, Direct: true}}
			i.Served = func(string) bool { return false }
		}},
		{"token_css_not_found", func(i *Input) { i.TokenCSS = TokenCSS{Configured: true, Path: "tokens.css", State: Missing} }},
		{"external_url", func(i *Input) { i.Canvases[0].ExternalURLs = []string{"https://cdn/a"} }},
		{"hardcoded_color", func(i *Input) {
			i.TokenCSS = TokenCSS{Configured: true, State: In, RealPath: "tokens.css"}
			i.Canvases[0].Styles = canvas.ScanCSS(`a{--local:#fff}`, canvas.Stylesheet)
		}},
		{"orphan_comment_file", func(i *Input) { i.CommentFileIDs = []string{"absent"} }},
	}
	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			in := base()
			if len(codes(Run(in), tt.code)) != 0 {
				t.Fatal("valid input has finding")
			}
			tt.change(&in)
			fs := codes(Run(in), tt.code)
			want := 1
			if tt.code == "duplicate_canvas_id" {
				want = 2
			}
			if len(fs) != want {
				t.Fatalf("got %+v", Run(in))
			}
			severity := "error"
			if tt.code == "external_url" || tt.code == "hardcoded_color" || tt.code == "orphan_comment_file" {
				severity = "warning"
			}
			for _, f := range fs {
				if f.Severity != severity || f.Path == "" || f.Message == "" {
					t.Fatalf("%+v", f)
				}
			}
		})
	}
	if fs := Run(base()); len(fs) != 0 {
		t.Fatal(fs)
	}
	if fs := Run(Input{}); fs == nil || len(fs) != 0 {
		t.Fatal(fs)
	}
}
func TestIdentityEdges(t *testing.T) {
	for _, head := range []string{`<meta name="doan:width" content="1">`, metadata + `<meta name="doan:canvas" content="one">`} {
		in := base()
		in.Canvases = []canvas.Canvas{parse("a", head, ""), parse("b", head, "")}
		if strings.Contains(head, `content="one"`) && len(codes(Run(in), "invalid_canvas_id")) != 2 {
			t.Fatal(Run(in))
		}
		if len(codes(Run(in), "duplicate_canvas_id")) != 0 {
			t.Fatal(Run(in))
		}
	}
	in := base()
	in.Canvases[0] = parse("a", metadata, `<div data-doan-frame="same" data-doan-id="same"></div>`)
	in.CommentFileIDs = []string{"one"}
	if fs := Run(in); len(fs) != 0 {
		t.Fatal(fs)
	}
	in.Canvases[0] = parse("a", metadata+`<meta name="doan:width" content="4">`, "")
	if len(codes(Run(in), "invalid_width")) != 1 {
		t.Fatal(Run(in))
	}
}
func TestReachAndAttribution(t *testing.T) {
	in := base()
	in.Canvases = append(in.Canvases, parse("design/b.html", `<meta name="doan:canvas" content="two"><meta name="doan:width" content="1">`, ""))
	in.TokenCSS = TokenCSS{Configured: true, Path: "./tokens.css", RealPath: "tokens.css", State: In}
	in.CSS["tokens.css"] = canvas.ScanCSS(`:root{--x:#fff;color:var(--ignored)}`, canvas.Stylesheet)
	for j := range in.Canvases {
		in.Canvases[j].Styles = canvas.ScanCSS(`a{color:var(--x)}`, canvas.Stylesheet)
	}
	if len(codes(Run(in), "undefined_token")) != 2 {
		t.Fatal(Run(in))
	}
	for _, c := range in.Canvases {
		in.Reach[c.Path] = []CSSRef{{From: c.Path, Href: "../tokens.css", RealPath: "tokens.css", State: In, Direct: true}}
	}
	if fs := Run(in); len(fs) != 0 {
		t.Fatal(fs)
	}
	in.CSS["shared.css"] = canvas.ScanCSS(`a{color:var(--missing,#abc);background:url(https://cdn/x)}`, canvas.Stylesheet)
	for _, c := range in.Canvases {
		in.Reach[c.Path] = append(in.Reach[c.Path], CSSRef{From: "tokens.css", Href: "shared.css", RealPath: "shared.css", State: In})
	}
	fs := Run(in)
	if len(fs) != 3 {
		t.Fatal(fs)
	}
	for _, f := range fs {
		if f.Path != "shared.css" {
			t.Fatal(f)
		}
		if f.Code == "undefined_token" && f.Canvas != "one" {
			t.Fatal(f)
		}
	}
	in.Canvases[0], in.Canvases[1] = in.Canvases[1], in.Canvases[0]
	if !reflect.DeepEqual(fs, Run(in)) {
		t.Fatal("input order changed output")
	}
}
func TestPathEdges(t *testing.T) {
	in := base()
	in.TokenCSS = TokenCSS{Configured: true, Path: "tokens.css", State: Missing}
	in.Reach["design/a.html"] = []CSSRef{{Href: "../tokens.css", State: Missing, Direct: true}, {Href: "package-name", State: Missing}, {Href: "/outside", State: Outside, Direct: true}}
	fs := Run(in)
	for _, code := range []string{"token_css_not_found", "local_css_not_found", "path_outside_repo"} {
		if len(codes(fs, code)) != 1 {
			t.Fatal(fs)
		}
	}
	for _, f := range fs {
		if f.Code == "token_css_not_found" {
			if f.Path != ".doan/config.json" || f.Target != "tokens.css" {
				t.Fatal(f)
			}
		} else if f.Path != "design/a.html" {
			t.Fatal(f)
		}
	}
	in = base()
	s := "src/a.go"
	in.Canvases[0].Frames = []canvas.Frame{{ID: "a", Implements: &s}}
	in.Implements[s] = In
	if len(Run(in)) != 0 {
		t.Fatal(Run(in))
	}
	in.Canvases[0].Styles = canvas.ScanCSS(`a{color:#fff}`, canvas.Stylesheet)
	if len(Run(in)) != 0 {
		t.Fatal(Run(in))
	}
	in.TokenCSS = TokenCSS{Configured: true, State: Outside}
	if len(codes(Run(in), "token_css_not_found")) != 1 {
		t.Fatal(Run(in))
	}
}
func TestSortAndSummary(t *testing.T) {
	in := base()
	in.CommentFileIDs = []string{"z", "a"}
	in.Canvases[0].Styles = canvas.ScanCSS(`a{color:var(--z);background:var(--a)}`, canvas.Stylesheet)
	in.Canvases[0].ExternalURLs = []string{"https://z", "https://a"}
	fs := Run(in)
	want := []string{"orphan_comment_file", "orphan_comment_file", "undefined_token", "undefined_token", "external_url", "external_url"}
	got := []string{}
	for _, f := range fs {
		got = append(got, f.Code)
	}
	if !reflect.DeepEqual(got, want) || fs[2].Token != "--a" || fs[4].URL != "https://a" {
		t.Fatal(fs)
	}
	if s := Summarize(fs); s.Errors != 2 || s.Warnings != 4 {
		t.Fatal(s)
	}
}

func TestUnparsableCanvas(t *testing.T) {
	in := base()
	in.Unparsable = map[string]string{
		"design/z.html": "parse design/z.html: open stack exceeds 512 nodes",
		"design/b.html": "parse design/b.html: parser failure",
	}
	in.CommentFileIDs = []string{"one", "unknown"}
	fs := Run(in)
	if len(fs) != 3 {
		t.Fatalf("expected only two parse findings and one orphan: %+v", fs)
	}
	if fs[0].Code != "orphan_comment_file" || fs[0].Canvas != "unknown" {
		t.Fatalf("orphan: %+v", fs[0])
	}
	for j, path := range []string{"design/b.html", "design/z.html"} {
		f := fs[j+1]
		if f.Path != path || f.Code != "unparsable_canvas" || f.Severity != "error" || f.Canvas != "" || !strings.Contains(f.Message, in.Unparsable[path]) {
			t.Fatalf("parse finding: %+v", f)
		}
	}
	if s := Summarize(fs); s.Errors != 2 || s.Warnings != 1 {
		t.Fatalf("summary: %+v", s)
	}
	in.Unparsable = map[string]string{}
	if got := codes(Run(in), "unparsable_canvas"); len(got) != 0 {
		t.Fatal(got)
	}
}

func TestIndirectImportDefinesToken(t *testing.T) {
	in := base()
	in.Canvases[0].Styles = canvas.ScanCSS(`a{color:var(--x)}`, canvas.Stylesheet)
	in.CSS["design/m.css"] = canvas.ScanCSS(`@import "t.css";`, canvas.Stylesheet)
	in.CSS["design/t.css"] = canvas.ScanCSS(`:root{--x:1}`, canvas.Stylesheet)
	in.Reach["design/a.html"] = []CSSRef{
		{From: "design/a.html", Href: "m.css", RealPath: "design/m.css", State: In, Direct: true},
		{From: "design/m.css", Href: "t.css", RealPath: "design/t.css", State: In},
	}
	if fs := Run(in); len(fs) != 0 {
		t.Fatal(fs)
	}
}
func TestInvalidCanvasIDsStillOwnComments(t *testing.T) {
	for _, tt := range []struct{ name, head, id string }{
		{"uppercase", `<meta name="doan:canvas" content="Foo">`, "Foo"},
		{"duplicate metas", `<meta name="doan:canvas" content="a"><meta name="doan:canvas" content="a">`, "a"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			in := base()
			in.Canvases[0] = parse("design/a.html", tt.head+`<meta name="doan:width" content="1">`, "")
			in.CommentFileIDs = []string{tt.id}
			fs := Run(in)
			if len(codes(fs, "invalid_canvas_id")) != 1 {
				t.Fatalf("missing invalid id: %+v", fs)
			}
			if len(codes(fs, "orphan_comment_file")) != 0 {
				t.Fatalf("false orphan: %+v", fs)
			}
			if len(codes(fs, "duplicate_canvas_id")) != 0 {
				t.Fatalf("false duplicate: %+v", fs)
			}
		})
	}
}
func TestIndirectCSSPathFindingsBelongToImporter(t *testing.T) {
	for _, tt := range []struct {
		state State
		code  string
	}{{Outside, "path_outside_repo"}, {In, "css_not_served"}} {
		t.Run(tt.code, func(t *testing.T) {
			in := base()
			in.Canvases = append(in.Canvases, parse("design/b.html", strings.Replace(metadata, "one", "two", 1), ""))
			in.Served = func(p string) bool { return p == "design/shared.css" }
			for _, c := range in.Canvases {
				in.Reach[c.Path] = []CSSRef{
					{From: c.Path, Href: "shared.css", RealPath: "design/shared.css", State: In, Direct: true},
					{From: "design/shared.css", Href: "../../out.css", RealPath: "out.css", State: tt.state},
				}
			}
			fs := Run(in)
			if len(fs) != 1 || fs[0].Code != tt.code || fs[0].Path != "design/shared.css" || fs[0].Target != "../../out.css" || fs[0].Canvas != "" {
				t.Fatalf("indirect: %+v", fs)
			}
			for _, c := range in.Canvases {
				in.Reach[c.Path] = []CSSRef{{From: c.Path, Href: "../../out.css", RealPath: "out.css", State: tt.state, Direct: true}}
			}
			fs = Run(in)
			if len(fs) != 2 {
				t.Fatal(fs)
			}
			for j, f := range fs {
				if f.Path != in.Canvases[j].Path || f.Canvas != in.Canvases[j].ID || f.Code != tt.code {
					t.Fatalf("direct: %+v", f)
				}
			}
		})
	}
}

func TestNoCanvasesWarning(t *testing.T) {
	for _, tt := range []struct {
		name string
		in   Input
		want int
	}{
		{"empty", Input{}, 1},
		{"present", base(), 0},
		{"unparsable", Input{Unparsable: map[string]string{"design/deep.html": "too deep"}}, 0},
	} {
		t.Run(tt.name, func(t *testing.T) {
			fs := codes(Run(tt.in), "no_canvases")
			if len(fs) != tt.want {
				t.Fatalf("findings: %+v", fs)
			}
			if len(fs) > 0 && (fs[0].Severity != "warning" || fs[0].Path != "design/" || fs[0].Message != "No canvases found under design/. Write a canvas, then run doan check again.") {
				t.Fatal(fs)
			}
		})
	}
}
