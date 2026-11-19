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
	page, err := Assemble(Meta{Project: "Store", Name: "pinned", Width: model.Width}, res.HTML)
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
		{"full", seed, exporttest.Full, seedConfig(t, seed), "dfc697e8a0bbcb402ed9ce5077698fa39f9a974aee610f707a570387180f211a"},
		{"empty", seed, exporttest.Empty, seedConfig(t, seed), "1bbced206777e5fdb5cfdb69c97bca438086d9a6affe71dd66ec62d8915c530a"},
		{"nested", seed, exporttest.Nested, seedConfig(t, seed), "ec2e0805ae478a6fa38d9aadba6c4bee1555f6839bff21fd37854f3e3f57dfc6"},
		{"linked", linked, exporttest.Linked, repo.Config{V: 1, Serve: []string{".doan/assets"}}, "9b37eaccdff0d4e4914a928fd8840175389eb2c5b0ceab11bf9d7d199d5abe3e"},
		{"mixed", mixed, mixedCanvas, repo.Config{V: 1, Serve: []string{}}, "ecab02bd3881c9d135d184a41626ed62b20aba63a3ac3c2fb5fa7e42b41ed107"},
		{"stylesheet", small, largeCanvas, repo.Config{V: 1, Serve: []string{}}, "2468673a5ca269ffee41d6e27711a54a53a31db8b0b4d0f77a57f07a69133323"},
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
		{"bom", "\xef\xbb\xbf<!doctype html><p title='\"&amp;'>{{NAME}}</p>", "bf82d227a6f237fec278e32e1cb52f04d7cf8eb3d08cafb0d3c9c3227516fdf4"},
		{"bare", "<p>a & \"b\"</p>", "7306f0ca0c07ef4fdfa52ded3146dc55866560ae876cfe85a336e2c59a2a1077"},
		{"empty", "", "5e122e621d086fdada9ddec26d6bed848cd4c06acfcff451f6421e558117a4f7"},
	} {
		page, err := Assemble(Meta{Project: "Store", Name: `a "&" <b>`, Width: 320}, []byte(c.canvas))
		if err != nil {
			t.Fatal(err)
		}
		if got := pageDigest(page); got != c.want {
			t.Errorf("%s: page sha256 = %s, want %s", c.name, got, c.want)
		}
	}
}
