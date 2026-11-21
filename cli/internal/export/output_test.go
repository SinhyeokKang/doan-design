package export

import (
	"crypto/sha256"
	"encoding/hex"
	"path/filepath"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

// exportPage runs Inline and Assemble as `doan export` does and returns the
// page it would write.
func exportPage(t *testing.T, root string, config repo.Config, canvasPath string) []byte {
	t.Helper()
	src, err := ReadFile(root, canvasPath)
	if err != nil {
		t.Fatal(err)
	}
	model, err := canvas.Parse(canvasPath, src)
	if err != nil {
		t.Fatal(err)
	}
	res, err := Inline(root, config, canvasPath, src)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Refused) > 0 || res.TooLarge {
		t.Fatalf("%s: refused %v, too large %v", canvasPath, res.Refused, res.TooLarge)
	}
	page, err := Assemble(Meta{Project: "Store", Name: "pinned", Width: model.Width}, model, res.HTML)
	if err != nil {
		t.Fatal(err)
	}
	return page
}

func putFiles(t *testing.T, files map[string]string) string {
	t.Helper()
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	for p, body := range files {
		exporttest.Put(t, root, p, body)
	}
	return root
}

func pageDigest(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// The page bytes are part of the contract: cutting copies out of Inline and
// Assemble must not change a byte. These digests were taken before that work;
// change one only when the output is meant to change.
func TestExportOutputIsPinned(t *testing.T) {
	seed := exporttest.Seed(t)
	linked := exporttest.SeedLinkedAssets(t)
	small := putFiles(t, stylesheetRepo(256<<10, 40, 150))
	mixed := putFiles(t, mixedRepo)
	for _, c := range []struct {
		name, root, canvas string
		config             repo.Config
		want               string
	}{
		{"full", seed, exporttest.Full, seedConfig(t, seed), "3e21f0c21816999e1cab7e5ca9871e95952ff5b718b0f84b0db3d478de7cdaaa"},
		{"empty", seed, exporttest.Empty, seedConfig(t, seed), "69ef29d26efa3c03306738ac5047263b8d49903f8cffa8c267f081719b7979f2"},
		{"nested", seed, exporttest.Nested, seedConfig(t, seed), "1d3258745a6ceb2b6427196a7b3622ef7c3219ef141aa00eb2d05a31f7ea7894"},
		{"linked", linked, exporttest.Linked, repo.Config{V: 1, Serve: []string{".doan/assets"}}, "21d8b6d8a6cd5050aa3e8a467b7c3a562ed8869ad088825e58a8ea86d922784e"},
		{"mixed", mixed, mixedCanvas, repo.Config{V: 1, Serve: []string{}}, "c66aaa8a108b2571491e7d90b43e4cd2e282198884e45174dfe4c7d36406e2b6"},
		{"stylesheet", small, largeCanvas, repo.Config{V: 1, Serve: []string{}}, "b78ead1195218006d72730bde14953cad1fac1076e6998b7eaeddc396411f5ea"},
	} {
		if got := pageDigest(exportPage(t, c.root, c.config, c.canvas)); got != c.want {
			t.Errorf("%s: page sha256 = %s, want %s", c.name, got, c.want)
		}
	}
}

const mixedCanvas = ".doan/canvases/mixed.html"

// mixedRepo reaches what the large stylesheet does not: text the srcdoc
// escapes, a base that does not move, percent-encoded and
// empty files, an identifier before an @import, url()s in a style attribute
// and in a custom property, and characters cssEscape rewrites.
var mixedRepo = map[string]string{
	".doan/config.json":       "{\"v\":1}\n",
	".doan/assets/a.css":      "@import\"b.css\";.a{background:url(\"q\\\"uote.svg\")}:root{--i:url(e.png)}",
	".doan/assets/b.css":      ".b{background:url(e.png)}",
	`.doan/assets/q"uote.svg`: `<svg xmlns="http://www.w3.org/2000/svg"><text>a & b < c # 100% "q"</text></svg>`,
	".doan/assets/e.png":      "",
	".doan/assets/한글 이름.svg":  "<svg xmlns=\"http://www.w3.org/2000/svg\">\n\t<title>한글</title>\n</svg>",
	mixedCanvas: "<!doctype html>\n<html><head><base href=\"./\"><meta name=\"doan:width\" content=\"640\">" +
		"<link rel=\"stylesheet\" href=\"../assets/a.css\"><style>.c{background:var(--i)}</style></head><body>" +
		"<p title=\"&quot;{{SRCDOC}}&amp;\">a &amp; b</p><img srcset=\"../assets/e.png 1x, ../assets/%ED%95%9C%EA%B8%80%20%EC%9D%B4%EB%A6%84.svg 2x\">" +
		"<div style=\"background:url(../assets/e.png)\"></div></body></html>\n",
}

// Assemble alone, for what a canvas Parse accepts cannot hold: a byte order
// mark, and no <head> or <html> to place the measure script after.
func TestAssembleOutputIsPinned(t *testing.T) {
	for _, c := range []struct{ name, canvas, want string }{
		{"bom", "\xef\xbb\xbf<!doctype html><p title='\"&amp;'>{{NAME}}</p>", "054273a314ff4cd1ea603e987e854118249e7ecefabc49cb5705af4fc6e73b29"},
		{"bare", "<p>a & \"b\"</p>", "2c0f373c03b02d37b99c8c5a927068217a036e6e1a223a8c1a558250bc116b69"},
		{"empty", "", "218a656e4f71e0fa7e02dc59046185d4f57abad65c7ab3aa3771f42c24d9c44a"},
		{"frames", "<!doctype html><html><head></head><body><div data-doan-frame=\"a\" data-doan-title=\"A &amp; <b>\" data-doan-prototype=\"1x1\"><a data-doan-goto=\"b\"></a></div><div data-doan-frame=\"b\" data-doan-prototype=\"1x1\"></div><div data-doan-frame=\"c\"></div></body></html>", "3cd79c1d0a9b343b00c2c38b4769a60c2fede6cc9028aa80d95ac28e024ed462"},
	} {
		model, err := canvas.Parse(".doan/canvases/pinned.html", []byte(c.canvas))
		if err != nil {
			t.Fatal(err)
		}
		page, err := Assemble(Meta{Project: "Store", Name: `a "&" <b>`, Width: 320}, model, []byte(c.canvas))
		if err != nil {
			t.Fatal(err)
		}
		if got := pageDigest(page); got != c.want {
			t.Errorf("%s: page sha256 = %s, want %s", c.name, got, c.want)
		}
	}
}
