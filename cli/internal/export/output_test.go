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
	page, err := Assemble(Meta{Name: "pinned", Width: model.Width}, res.HTML)
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
		{"full", seed, exporttest.Full, seedConfig(t, seed), "1d14d07d321f106f53e1dd7b7a05a71346b7330c9404dfb32e1aa363e9a18d29"},
		{"empty", seed, exporttest.Empty, seedConfig(t, seed), "1923aa7c613abbbdfa33b54b72c4c3d36be59998e432fe7d4a73f998dec77110"},
		{"nested", seed, exporttest.Nested, seedConfig(t, seed), "f35cfbf5ba94bca9b29a9f7a8c0c01f1cc2b4f92b7374a5ee453727342223032"},
		{"linked", linked, exporttest.Linked, repo.Config{V: 1, Serve: []string{".doan/assets"}}, "0515beafbb315ffd1395104340879e842ba9b359e7354676f63657421e3f70fa"},
		{"mixed", mixed, mixedCanvas, repo.Config{V: 1, Serve: []string{}}, "906c02ea1e354454f1ea929720b769248c6ea3e74910ba3fdc8f7b459c57c403"},
		{"stylesheet", small, largeCanvas, repo.Config{V: 1, Serve: []string{}}, "08b7f9bfa773a9027a529517777d2c99407a394a9ec4ba958aea3ae167525fcb"},
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
		{"bom", "\xef\xbb\xbf<!doctype html><p title='\"&amp;'>{{NAME}}</p>", "73b2f324f466f75716f6f4241c57246b22b75588feac284e56728616c403e1a5"},
		{"bare", "<p>a & \"b\"</p>", "b81687c2d6885b40fab223ebd449ae83ffc7a63b0bfea5c71c94323643453c6d"},
		{"empty", "", "8cb466064281c6235ddb7bd98f5bfcdedccf9d94d421e78d02fe56f21bb37723"},
	} {
		page, err := Assemble(Meta{Name: `a "&" <b>`, Width: 320}, []byte(c.canvas))
		if err != nil {
			t.Fatal(err)
		}
		if got := pageDigest(page); got != c.want {
			t.Errorf("%s: page sha256 = %s, want %s", c.name, got, c.want)
		}
	}
}
