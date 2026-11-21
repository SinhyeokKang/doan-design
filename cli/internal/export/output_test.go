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
		{"full", seed, exporttest.Full, seedConfig(t, seed), "2d21a19792f291f4b9b09686ee3db8105580d5970f0998c05152e7fe7852f3d6"},
		{"empty", seed, exporttest.Empty, seedConfig(t, seed), "853095c1f00b3685cf2f0f2e58ed01a8d4463b42365d8b370ab195a06ee7f376"},
		{"nested", seed, exporttest.Nested, seedConfig(t, seed), "81ec63a39620970e70c03ab00d853035c00ef3d2576ec31df4566fc809fe3db9"},
		{"linked", linked, exporttest.Linked, repo.Config{V: 1, Serve: []string{".doan/assets"}}, "c6ca6898db1e741bb3ad179139133b156ff1a2df6944b00324cb70c83735940f"},
		{"mixed", mixed, mixedCanvas, repo.Config{V: 1, Serve: []string{}}, "00a064d8e1524fc7965ce55451b07dd3150a731ad7b88e0aba0f37a105dde21c"},
		{"stylesheet", small, largeCanvas, repo.Config{V: 1, Serve: []string{}}, "c843a5a9e915e0ad5fbbdee5d0ec8fe7b8344a03de85856be115d51cabff706b"},
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
		{"bom", "\xef\xbb\xbf<!doctype html><p title='\"&amp;'>{{NAME}}</p>", "80f6e9ea4303ecceb60ce31880c20a4e2885b26ea9ef39f7397338cc8dcad4ab"},
		{"bare", "<p>a & \"b\"</p>", "598cf036440422a9a5235aedc05b2f3e8c882c245118dc63b8c1b78aa08e7fba"},
		{"empty", "", "0ba7a85cd10c3efb5211bab3a630c12f074286b821e465157bdc20cf204d674e"},
		{"frames", "<!doctype html><html><head></head><body><div data-doan-frame=\"a\" data-doan-title=\"A &amp; <b>\" data-doan-prototype=\"1x1\"><a data-doan-goto=\"b\"></a></div><div data-doan-frame=\"b\" data-doan-prototype=\"1x1\"></div><div data-doan-frame=\"c\"></div></body></html>", "317778c30a27efa3fec7388fa74c782cf4ecfe1c830d537642cde45cf4931ed3"},
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
