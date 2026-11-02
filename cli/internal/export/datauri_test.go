package export

import (
	"bytes"
	"encoding/base64"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"golang.org/x/net/html"
)

func TestDataURIText(t *testing.T) {
	cases := []struct {
		mime, body, want string
	}{
		{"text/css; charset=utf-8", "a{b:url(\"x\")} /* 100% #1 */\n", `data:text/css;charset=utf-8,a{b:url(%22x%22)}%20/*%20100%25%20%231%20*/%0A`},
		{"text/css; charset=utf-8", "", `data:text/css;charset=utf-8,`},
		{"text/css; charset=utf-8", "a&b\\c'd\te\r\x7f", `data:text/css;charset=utf-8,a%26b%5Cc'd%09e%0D%7F`},
		{"text/css; charset=utf-8", "a,b,", `data:text/css;charset=utf-8,a,b%2C`},
		{"text/css; charset=utf-8", "/* 한글 */", `data:text/css;charset=utf-8,/*%20한글%20*/`},
		{"image/svg+xml", `<svg><style>.s{}</style></svg>`, `data:image/svg+xml,%3Csvg>%3Cstyle>.s{}%3C/style>%3C/svg>`},
		{"text/javascript; charset=utf-8", "x = \"100%\";", `data:text/javascript;charset=utf-8,x%20=%20%22100%25%22;`},
		{"application/json; charset=utf-8", `{"a":1}`, `data:application/json;charset=utf-8,{%22a%22:1}`},
	}
	for _, c := range cases {
		if got := dataURI(c.mime, []byte(c.body)); got != c.want {
			t.Errorf("dataURI(%q, %q) =\n%s\nwant\n%s", c.mime, c.body, got, c.want)
		}
	}
}

func TestDataURIBinary(t *testing.T) {
	png := []byte("\x89PNG\r\n\x1a\nbody")
	if got, want := dataURI("image/png", png), "data:image/png;base64,"+base64.StdEncoding.EncodeToString(png); got != want {
		t.Errorf("png = %s", got)
	}
	latin1 := []byte("a{content:\"\xe9\"}")
	if got, want := dataURI("text/css; charset=utf-8", latin1), "data:text/css;charset=utf-8;base64,"+base64.StdEncoding.EncodeToString(latin1); got != want {
		t.Errorf("invalid UTF-8 text = %s", got)
	}
	if got := dataURI("application/octet-stream", []byte("x")); got != "data:application/octet-stream;base64,eA==" {
		t.Errorf("octet-stream = %s", got)
	}
}

// Every byte value goes through each context the URI is written into and
// comes back unchanged: a srcset candidate, CSS url("…"), an HTML attribute.
func TestDataURIContexts(t *testing.T) {
	var all []byte
	for i := 0; i < 256; i++ {
		all = append(all, byte(i))
	}
	texts := [][]byte{
		[]byte(`a "q" 'q' \ , # % & < > ( ) ` + "\t\n\r\f\x00\x7f 한글,"),
		[]byte(""),
		[]byte(","),
		all,
	}
	for _, body := range texts {
		for _, mime := range []string{"text/css; charset=utf-8", "image/svg+xml", "image/png"} {
			uri := dataURI(mime, body)
			if strings.ContainsAny(uri, " \t\n\r\f\"\\<") {
				t.Errorf("%s: unsafe byte in %q", mime, uri)
			}
			if len(body) > 0 && strings.HasSuffix(uri, ",") {
				t.Errorf("%s: trailing comma in %q", mime, uri)
			}
			// srcset
			set := rewriteSrcset("x 2x, b.png 1x", func(u string) (string, bool) { return uri, u == "x" })
			want := uri
			if len(body) == 0 {
				want += "#"
			}
			if got := srcsetURLs(set); len(got) != 2 || got[0] != want {
				t.Errorf("%s: srcset URLs %q", mime, got)
			}
			// CSS url("…")
			css := rewriteCSS("a{b:url(x)}", canvas.Stylesheet, func(string, refKind) (string, bool) { return uri, true })
			if refs := canvas.CSSRefs(css, canvas.Stylesheet); len(refs) != 1 || refs[0].Value != uri {
				t.Errorf("%s: CSS refs %+v", mime, refs)
			}
			// HTML attribute
			out := rewriteHTML([]byte(`<img src="x">`), func(refKind, string) (string, bool) { return uri, true }, keepCSS)
			z := html.NewTokenizer(bytes.NewReader(out))
			z.Next()
			if tok := z.Token(); len(tok.Attr) != 1 || tok.Attr[0].Val != uri {
				t.Errorf("%s: attribute %+v", mime, tok.Attr)
			}
		}
	}
}

func srcsetURLs(s string) []string {
	var out []string
	for _, span := range srcsetSpans(s) {
		out = append(out, s[span[0]:span[1]])
	}
	return out
}
