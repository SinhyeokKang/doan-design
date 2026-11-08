package export

import (
	"crypto/sha256"
	"encoding/hex"
	"path/filepath"
	"runtime"
	"strings"
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
		{"full", seed, exporttest.Full, seedConfig(t, seed), "92f67d6d7f4fadf5f846e2b0fc00cf2b5ac62738b41c8cf7f7cf9fcd2a6a08c4"},
		{"empty", seed, exporttest.Empty, seedConfig(t, seed), "397f97810c489db6e207a86f12f3365272a268cf0cea45734225972d13eb4f91"},
		{"nested", seed, exporttest.Nested, seedConfig(t, seed), "14880a35a42a85a608d04d9e63aa52979951f1b466a3aa2f3f5ad7ee430a4c06"},
		{"linked", linked, exporttest.Linked, repo.Config{V: 1, Serve: []string{".doan/assets"}}, "b2432c71f62a5a616ade16a5a502458b219b315324c8dc76f375b72b0894764a"},
		{"mixed", mixed, mixedCanvas, repo.Config{V: 1, Serve: []string{}}, "d930a0266b049f184257adeacda9f04aa77135afb682f343614c22f74e9f90ad"},
		{"stylesheet", small, largeCanvas, repo.Config{V: 1, Serve: []string{}}, "23a7bbf6347897d87bd1a884937337af22cf3da80911d904d25f17641222e241"},
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
		{"bom", "\xef\xbb\xbf<!doctype html><p title='\"&amp;'>{{NAME}}</p>", "3a022b49326e185dcc2a3bc26c9894e0928173181a9a0787bb1cef88a49d62d0"},
		{"bare", "<p>a & \"b\"</p>", "d71228951641ab1e3d024af02a29f7bf242b9f1ec14fb546f489516e74864204"},
		{"empty", "", "2c6a7d6d8b37f1cd641527ef465d4eabb911d410b02ff479715c06835dedcf93"},
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

// allocCSSBytes is the stylesheet size of the allocation test: large enough
// that the full-size copies of the stylesheet and the page outweigh the fixed
// cost of the viewer files, small enough to keep `go test` fast.
const allocCSSBytes = 4 << 20

// allocLimit caps what one export of that stylesheet allocates: about 40 MB
// (9.5 times the stylesheet) when it was set, with 10% headroom. Each
// full-size copy of the stylesheet or the page that comes back adds about one
// stylesheet and crosses it. TotalAlloc bounds the peak heap from above and
// moves less with GC timing than the peak does; the process's RSS is measured
// on the 24 MiB input instead.
const allocLimit = 21 * allocCSSBytes / 2

// No t.Parallel: TotalAlloc counts every goroutine's allocations.
func TestExportAllocationIsBounded(t *testing.T) {
	files := stylesheetRepo(allocCSSBytes, 1000, 100)
	// A body after the inlined <link>, so the output buffer must make room
	// for more than the tag.
	files[largeCanvas] = strings.Replace(files[largeCanvas], "</body>", strings.Repeat("<p>body text</p>", 8000)+"</body>", 1)
	root := putFiles(t, files)
	src, err := ReadFile(root, largeCanvas)
	if err != nil {
		t.Fatal(err)
	}
	runtime.GC()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	res, err := Inline(root, repo.Config{V: 1, Serve: []string{}}, largeCanvas, src)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Refused) > 0 || res.TooLarge {
		t.Fatalf("refused %v, too large %v", res.Refused, res.TooLarge)
	}
	page, err := Assemble(Meta{Name: "big-css", Width: 1280}, res.HTML)
	if err != nil {
		t.Fatal(err)
	}
	runtime.ReadMemStats(&after)
	got := after.TotalAlloc - before.TotalAlloc
	t.Logf("page %d bytes, TotalAlloc +%d bytes (%.2f× the stylesheet)", len(page), got, float64(got)/allocCSSBytes)
	if got > allocLimit {
		t.Errorf("an export of a %d-byte stylesheet allocated %d bytes, over %d", allocCSSBytes, got, allocLimit)
	}
}
