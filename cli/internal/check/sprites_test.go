package check

import (
	"reflect"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
)

const canvasA = ".doan/canvases/a.html"

func TestSVGUseNotInline(t *testing.T) {
	in := base()
	in.Canvases[0] = parse(canvasA, metadata, `<svg>
<use href=" ../assets/sprite.svg#icon"/>
<use xlink:href="data:image/svg+xml,%3Csvg/%3E#d"/>
<use href="https://cdn.example.com/icons.svg#a"/>
<use href="//cdn.example.com/icons.svg#b"/>
<use href="#icon"/>
<use href="#missing"/>
<use href=" ../assets/sprite.svg#icon"/>
</svg><use href="html.svg#x"></use><template><svg><use href="inert.svg#x"/></svg></template>`)
	fs := Run(in)
	got := codes(fs, "svg_use_not_inline")
	var targets []string
	for _, f := range got {
		targets = append(targets, f.Target)
		if f.Severity != "error" || f.Path != canvasA || f.Canvas != "one" || f.Frame != "" || f.URL != "" {
			t.Errorf("finding %+v", f)
		}
		if !strings.Contains(f.Message, `"`+f.Target+`"`) || !strings.Contains(f.Message, `copy the symbol into the canvas and use href="#id"`) {
			t.Errorf("message %q", f.Message)
		}
	}
	want := []string{" ../assets/sprite.svg#icon", "//cdn.example.com/icons.svg#b", "data:image/svg+xml,%3Csvg/%3E#d", "https://cdn.example.com/icons.svg#a"}
	if !reflect.DeepEqual(targets, want) {
		t.Fatalf("targets %q, want %q", targets, want)
	}
	// The CDN <use> is an error the app cannot draw, not an external resource.
	if ext := codes(fs, "external_url"); len(ext) != 0 {
		t.Fatalf("external_url %+v", ext)
	}
	if s := Summarize(fs, 1); s.Errors != 4 || s.Warnings != 0 {
		t.Fatalf("summary %+v", s)
	}
}

// customInput builds a check of canvasA whose body is body and which reaches
// each stylesheet in sheets (real path → text) in that order; a path whose
// text starts with "<" is reached through an @import of the sheet before it.
type customSheet struct{ path, text string }

func customInput(body string, sheets ...customSheet) Input {
	in := base()
	in.Canvases[0] = parse(canvasA, metadata, body)
	in.CustomCSS = map[string]canvas.CustomText{}
	from := canvasA
	for _, s := range sheets {
		direct := !strings.HasPrefix(s.text, "<")
		text := strings.TrimPrefix(s.text, "<")
		if direct {
			from = canvasA
		}
		in.Reach[canvasA] = append(in.Reach[canvasA], CSSRef{From: from, Href: s.path, RealPath: s.path, State: In, Direct: direct})
		in.CSS[s.path] = canvas.ScanCSS(text, canvas.Stylesheet)
		in.CustomCSS[s.path] = canvas.ScanCustom(text, canvas.Stylesheet)
		from = s.path
	}
	return in
}

func TestAmbiguousCustomURL(t *testing.T) {
	type found struct{ path, canvas, token, value string }
	for _, tt := range []struct {
		name   string
		body   string
		sheets []customSheet
		want   []found
	}{
		{
			name:   "token CSS outside .doan used by .doan/ds and the canvas style",
			body:   `<style>.c{mask:var(--icon)}</style>`,
			sheets: []customSheet{{"styles/tokens.css", `:root{--icon:url(icons/x.svg)}`}, {".doan/ds/ds.css", `.d{mask:var(--icon)}`}},
			want:   []found{{"styles/tokens.css", "", "--icon", "icons/x.svg"}},
		},
		{
			name:   "a chain and a cycle of custom properties reach both folders",
			body:   `<style>:root{--a:url(x.svg)}.w{mask:var(--a)}</style>`,
			sheets: []customSheet{{".doan/ds/c.css", `.x{--b:var(--a)}.y{--c:var(--b);--b:var(--c)}.z{mask:var(--c)}`}},
			want:   []found{{canvasA, "one", "--a", "x.svg"}},
		},
		{
			name:   "a property registered with url syntax resolves where it is declared",
			body:   `<style>@property --i{syntax:"<url>";inherits:true}:root{--i:url(i.svg)}.c{mask:var(--i)}</style>`,
			sheets: []customSheet{{".doan/ds/d.css", `.d{mask:var(--i)}`}},
		},
		{
			name:   "a property registered with universal syntax still resolves from its users",
			body:   `<style>@property --i{syntax:"*";inherits:true}:root{--i:url(i.svg)}.c{mask:var(--i)}</style>`,
			sheets: []customSheet{{".doan/ds/d.css", `.d{mask:var(--i)}`}},
			want:   []found{{canvasA, "one", "--i", "i.svg"}},
		},
		{
			name:   "absolute, data and external urls are not candidates",
			body:   `<style>:root{--a:url(/abs.svg);--d:url(data:image/svg+xml,%3Csvg/%3E);--e:url(https://cdn.example.com/e.svg);--f:url(//cdn.example.com/f.svg)}.c{mask:var(--a) var(--d) var(--e) var(--f)}</style>`,
			sheets: []customSheet{{".doan/ds/d.css", `.d{mask:var(--a) var(--d) var(--e) var(--f)}`}},
		},
		{
			name:   "a stylesheet reached through @import is a user",
			body:   `<div style="--i:url(i.svg)"></div><style>.c{mask:var(--i)}</style>`,
			sheets: []customSheet{{".doan/ds/a.css", `@import "sub/b.css";`}, {".doan/ds/sub/b.css", `<.b{mask:var(--i)}`}},
			want:   []found{{canvasA, "one", "--i", "i.svg"}},
		},
		{
			name:   "a style attribute is a user",
			body:   `<div style="mask:var(--i)"></div>`,
			sheets: []customSheet{{".doan/ds/d.css", `:root{--i:url(i.svg)}.d{mask:var(--i)}`}},
			want:   []found{{".doan/ds/d.css", "", "--i", "i.svg"}},
		},
		{
			name:   ".doan/canvases and .doan/ds resolving to the same path",
			body:   `<style>.c{mask:var(--i)}</style>`,
			sheets: []customSheet{{".doan/ds/d.css", `:root{--i:url(../assets/x.svg)}.d{mask:var(--i)}`}},
		},
		{
			name:   "the design-system pattern: the canvas declares and one shared stylesheet uses",
			body:   `<span class="sf-iconbtn__icon" style="--sf-icon:url(assets/icons-mono/bookmark.svg)"></span>`,
			sheets: []customSheet{{".doan/assets/sf-ds/components.css", `.sf-iconbtn__icon{mask:var(--sf-icon,url(assets/icons-mono/emphasis.svg)) center/contain no-repeat}`}},
		},
		{
			name: "a declaration nobody uses",
			body: `<div style="--i:url(i.svg)"></div>`,
		},
		{
			name:   "one finding per file and url, whatever property holds it",
			body:   `<style>.c{mask:var(--i) var(--j)}</style>`,
			sheets: []customSheet{{".doan/ds/d.css", `:root{--i:url(i.svg);--j:url(i.svg)}.d{mask:var(--i) var(--j)}`}},
			want:   []found{{".doan/ds/d.css", "", "--i", "i.svg"}},
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			fs := Run(customInput(tt.body, tt.sheets...))
			var got []found
			for _, f := range codes(fs, "ambiguous_custom_url") {
				got = append(got, found{f.Path, f.Canvas, f.Token, f.Value})
				if f.Severity != "warning" || !strings.Contains(f.Message, "use the property from stylesheets in one folder only") || !strings.Contains(f.Message, f.Token) {
					t.Errorf("finding %+v", f)
				}
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("findings %+v, want %+v (all %+v)", got, tt.want, fs)
			}
			if s := Summarize(fs, 1); s.Errors != 0 {
				t.Fatalf("errors %+v", fs)
			}
		})
	}
}

// A stylesheet two canvases share reports its ambiguous url() once, without a
// canvas; each canvas's own declaration is reported with that canvas.
func TestAmbiguousCustomURLAttribution(t *testing.T) {
	in := customInput(`<style>.c{mask:var(--i)}</style><div style="--own:url(own.svg)"></div><style>.o{mask:var(--own)}</style>`,
		customSheet{".doan/ds/d.css", `:root{--i:url(i.svg)}.d{mask:var(--i) var(--own)}`})
	b := parse(".doan/canvases/b.html", strings.Replace(metadata, "one", "two", 1), `<style>.c{mask:var(--i)}</style><div style="--own:url(own.svg)"></div><style>.o{mask:var(--own)}</style>`)
	in.Canvases = append(in.Canvases, b)
	in.Reach[b.Path] = in.Reach[canvasA]
	type found struct{ path, canvas, token, value string }
	var got []found
	for _, f := range codes(Run(in), "ambiguous_custom_url") {
		got = append(got, found{f.Path, f.Canvas, f.Token, f.Value})
	}
	want := []found{{".doan/canvases/a.html", "one", "--own", "own.svg"}, {".doan/canvases/b.html", "two", "--own", "own.svg"}, {".doan/ds/d.css", "", "--i", "i.svg"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("findings %+v, want %+v", got, want)
	}
}
