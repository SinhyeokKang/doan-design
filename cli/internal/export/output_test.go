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
		{"full", seed, exporttest.Full, seedConfig(t, seed), "29b17a5838cdfd62bf2af92beedc407c3a38fc0f3dd1a78fdd0a2a1b0818c824"},
		{"empty", seed, exporttest.Empty, seedConfig(t, seed), "6b42e08756539f95a85a148bf0a54d71aac4c448a7a2591ff4f5b882b4f096f6"},
		{"nested", seed, exporttest.Nested, seedConfig(t, seed), "a48db8fe684e7a91fb8d56aec9c656e6e3c53d8aae84f1f252ef91ffab5b9a10"},
		{"linked", linked, exporttest.Linked, repo.Config{V: 1, Serve: []string{".doan/assets"}}, "8c8a010e6c396c66ada8c0f09d91b6298bfc4fbf19056cf9dfe546a5dd9852a7"},
		{"mixed", mixed, mixedCanvas, repo.Config{V: 1, Serve: []string{}}, "96304e79cf4bae2a298fec7f631be657de4fe04faa1b47709900f0bc95b0ce75"},
		{"stylesheet", small, largeCanvas, repo.Config{V: 1, Serve: []string{}}, "396442c082a86f5aed5d64c557d2ed8f4c0e7b9dde2f5f970c97698b1740e240"},
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
		{"bom", "\xef\xbb\xbf<!doctype html><p title='\"&amp;'>{{NAME}}</p>", "00d446eb9a3643851cec83422301e530929f04837cbaa614ff1a127548e83e96"},
		{"bare", "<p>a & \"b\"</p>", "4648c158d5e1631b4878774908692c95fc94ad207ea829098d26428cfdd3aad8"},
		{"empty", "", "f940abd5fd80cf86ab0bed098c8fd0e7dfa6c4b14a2b319f9f9ac16a2df8bc35"},
		{"frames", "<!doctype html><html><head></head><body><div data-doan-frame=\"a\" data-doan-title=\"A &amp; <b>\" data-doan-prototype=\"1x1\"><a data-doan-goto=\"b\"></a></div><div data-doan-frame=\"b\" data-doan-prototype=\"1x1\"></div><div data-doan-frame=\"c\"></div></body></html>", "a6798509020d745ed0a14141b07a04a1cc8ebe38940f44ef9246e28769652e41"},
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
