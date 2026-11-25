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
		{"full", seed, exporttest.Full, seedConfig(t, seed), "3a41020e739bdc9bb6a9c61cbd5a3487aeff1d15608c2167c4b760438b706bcf"},
		{"empty", seed, exporttest.Empty, seedConfig(t, seed), "23003cf81f2b3f15a3dce771ef40ce5b9eabbf3ae29032a0e858c1b8ccc11290"},
		{"nested", seed, exporttest.Nested, seedConfig(t, seed), "81aa58a897dfcd70eb824f663475c9919a7e450dcff1c5bc6d9b5d2fa2700196"},
		{"linked", linked, exporttest.Linked, repo.Config{V: 1, Serve: []string{".doan/assets"}}, "ac066bbb37b6092ae5e5a3f0f5e7fc37db4d0645bf20b0a821c25091992db8ef"},
		{"mixed", mixed, mixedCanvas, repo.Config{V: 1, Serve: []string{}}, "bf4d4218a2468b7522846c76f781994f9a82b8e80370099ea131281288c9152a"},
		{"stylesheet", small, largeCanvas, repo.Config{V: 1, Serve: []string{}}, "b6332f39f5cfef216c25b1e000abdb4562089120a247336f6b3a1f657ee53a09"},
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
		{"bom", "\xef\xbb\xbf<!doctype html><p title='\"&amp;'>{{NAME}}</p>", "25915217efc08b8229011ccb04bd95db18e053e3621b42ff68080ad027fb955c"},
		{"bare", "<p>a & \"b\"</p>", "533edc8c53fd4456b5b971374acc6b1c20759c88aaf3807ccaa819614045e1b6"},
		{"empty", "", "6b593c246fac96dd06694bf81c9ebefe6e71b7fb527213854c45b461b6ee4b00"},
		{"frames", "<!doctype html><html><head></head><body><div data-doan-frame=\"a\" data-doan-title=\"A &amp; <b>\" data-doan-prototype=\"1x1\"><a data-doan-goto=\"b\"></a></div><div data-doan-frame=\"b\" data-doan-prototype=\"1x1\"></div><div data-doan-frame=\"c\"></div></body></html>", "f9dd5983a38b258337f0e47141802c960ff4c2531b7095a2d00dc18ecdcfc8a0"},
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
