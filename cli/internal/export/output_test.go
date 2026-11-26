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

// The page bytes are part of the contract: change a digest only when the output is meant to change.
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
		{"full", seed, exporttest.Full, seedConfig(t, seed), "79d1a2f7424934344afb891ec5188818eedbdd895f10b99a5fa02b49854bfe8c"},
		{"empty", seed, exporttest.Empty, seedConfig(t, seed), "c3d0fb33bbd4caefce5376021f151e0157aac307acb3510e6eb9e6f3fa7e1c39"},
		{"nested", seed, exporttest.Nested, seedConfig(t, seed), "c1ec74252e72b09fb0c6662cc9c860349b9833f71ef898d46cd6956254521549"},
		{"linked", linked, exporttest.Linked, repo.Config{V: 1, Serve: []string{".doan/assets"}}, "911f2a26e8bbd9eb6eba49e083247edbada4365e05fd392d480adeee097d8efe"},
		{"mixed", mixed, mixedCanvas, repo.Config{V: 1, Serve: []string{}}, "8677eef5dfc39666e8ddb41f78f5a6cc0d01c0609ddd92b4b2341f5a4a1de2cb"},
		{"stylesheet", small, largeCanvas, repo.Config{V: 1, Serve: []string{}}, "60a03645034ef120803467880ac8a053c79bf503b3d537cab4de7b675b166b8b"},
	} {
		if got := pageDigest(exportPage(t, c.root, c.config, c.canvas)); got != c.want {
			t.Errorf("%s: page sha256 = %s, want %s", c.name, got, c.want)
		}
	}
}

const mixedCanvas = ".doan/canvases/mixed.html"

// mixedRepo reaches what the large stylesheet does not: srcdoc-escaped text, a non-moving base, percent-encoded and empty
// files, an identifier before an @import, url()s in a style attribute and a custom property, and cssEscape's characters.
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
		{"bom", "\xef\xbb\xbf<!doctype html><p title='\"&amp;'>{{NAME}}</p>", "61aa4cde6f5c55d08e0bfa6a158e5b7a665b83343c1a0c2810908020d594ad7e"},
		{"bare", "<p>a & \"b\"</p>", "3743a5e54f47b0d0730ba03354fe17f5a6323a64d3d0d73da0ab54bc5c17096f"},
		{"empty", "", "dcb705118b67a72426884beb0b8b000091475a5c2b7dd4e821201705074ef601"},
		{"frames", "<!doctype html><html><head></head><body><div data-doan-frame=\"a\" data-doan-title=\"A &amp; <b>\" data-doan-prototype=\"1x1\"><a data-doan-goto=\"b\"></a></div><div data-doan-frame=\"b\" data-doan-prototype=\"1x1\"></div><div data-doan-frame=\"c\"></div></body></html>", "18b473c92c79fa7427977a227674dd742fa83da7dec81d7a7da4f36e00aa5bd5"},
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
