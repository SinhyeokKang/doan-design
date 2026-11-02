package export

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

// RA1 🟡1: a decoded "<" written back into <style> text must not end it.
func TestInlineCannotCloseStyleFromCSS(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/canvases/breakout.html", `<style>.a{background:url(//x.example/\3c/style\3e\3cscript\3e alert\28 1\29\3c/script\3e)}
@import "//x.example/\3c/style\3e";</style><p>x</p>`)
	res := inlineSeed(t, root, ".doan/canvases/breakout.html")
	html := string(res.HTML)
	if strings.Count(html, "</style>") != 1 || strings.Contains(html, "<script>") {
		t.Fatalf("style element broken:\n%s", html)
	}
	if !strings.Contains(html, `url("https://x.example/\3c /style>\3c script>alert(1)\3c /script>")`) {
		t.Errorf("url not escaped:\n%s", html)
	}
}

// RA1 ⚪3: one refusal is one message line.
func TestRefusalHrefHasNoControlCharacters(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/canvases/lines.html", "<img src=\"../none&#10;forged&#13;\x01.png\"><style>.a{background:url(\"../gone\\a line.png\")}</style>")
	res := inlineSeed(t, root, ".doan/canvases/lines.html")
	want := []Refusal{
		{".doan/canvases/lines.html", `../none\nforged\r\x01.png`, ReasonMissing},
		{".doan/canvases/lines.html", `../gone\nline.png`, ReasonMissing},
	}
	if !reflect.DeepEqual(res.Refused, want) {
		t.Errorf("refused = %+v", res.Refused)
	}
}

func timed(t *testing.T, f func() Result) Result {
	t.Helper()
	start := time.Now()
	res := f()
	t.Logf("took %v", time.Since(start))
	return res
}

// RA1 🟡2: each level imports the next twice, doubling the output per level.
func TestInlineStopsADiamondLadder(t *testing.T) {
	root := exporttest.Seed(t)
	for i := 0; i < 18; i++ {
		exporttest.Put(t, root, fmt.Sprintf("styles/k%d.css", i), fmt.Sprintf("@import \"k%d.css\";\n@import \"k%d.css\" screen;\n.k%d { color: red; }\n", i+1, i+1, i))
	}
	exporttest.Put(t, root, "styles/k18.css", ".k18 { color: blue; }\n")
	exporttest.Put(t, root, ".doan/canvases/ladder.html", `<link rel="stylesheet" href="../../styles/k0.css">`)
	res := timed(t, func() Result { return inlineSeed(t, root, ".doan/canvases/ladder.html") })
	if !res.TooLarge || res.HTML != nil {
		t.Fatalf("too large %v, html %d bytes", res.TooLarge, len(res.HTML))
	}
	if len(res.Largest) != 5 || !strings.HasPrefix(res.Largest[0].Path, "styles/k") {
		t.Errorf("largest = %+v", res.Largest)
	}
}

// RA1 🟡2: a complete import graph re-expands every simple path below a cut cycle.
func TestInlineStopsMutualImports(t *testing.T) {
	root := exporttest.Seed(t)
	for _, n := range []int{8, 10} {
		dir := fmt.Sprintf("styles/m%d", n)
		for i := 0; i < n; i++ {
			var b strings.Builder
			for j := 0; j < n; j++ {
				if j != i {
					fmt.Fprintf(&b, "@import \"m%d.css\";\n", j)
				}
			}
			fmt.Fprintf(&b, ".m%d { color: red; }\n", i)
			exporttest.Put(t, root, fmt.Sprintf("%s/m%d.css", dir, i), b.String())
		}
		canvasPath := fmt.Sprintf(".doan/canvases/mutual%d.html", n)
		exporttest.Put(t, root, canvasPath, fmt.Sprintf(`<link rel="stylesheet" href="../../%s/m0.css">`, dir))
		// Eight files stay under the 50 MiB cap, so a smaller limit shows the stop.
		limit := int64(1 << 20)
		if n == 10 {
			limit = MaxBytes
		}
		res := timed(t, func() Result {
			src, err := ReadFile(root, canvasPath)
			if err != nil {
				t.Fatal(err)
			}
			res, err := InlineLimit(root, seedConfig(t, root), canvasPath, src, limit)
			if err != nil {
				t.Fatal(err)
			}
			return res
		})
		if !res.TooLarge {
			t.Errorf("%d files: not too large", n)
		}
	}
}

// A file larger than what is left of the limit is refused from its size,
// before its bytes are read.
func TestInlineChecksFileSizeBeforeReading(t *testing.T) {
	root := exporttest.Seed(t)
	big := filepath.Join(root, ".doan/assets/video.mp4")
	f, err := os.Create(big)
	if err != nil {
		t.Fatal(err)
	}
	// Sparse, so the test does not write the bytes it must not read.
	if err := f.Truncate(MaxBytes + 1); err != nil {
		t.Fatal(err)
	}
	f.Close()
	exporttest.Put(t, root, ".doan/canvases/big.html", `<img src="../assets/images/hero.png"><video src="../assets/video.mp4"></video><img src="../assets/images/%EB%A1%9C%EA%B3%A0%20%ED%8C%8C%EC%9D%BC.png">`)
	res := inlineSeed(t, root, ".doan/canvases/big.html")
	if !res.TooLarge || res.HTML != nil {
		t.Fatalf("too large %v", res.TooLarge)
	}
	want := []Asset{
		{".doan/assets/video.mp4", MaxBytes + 1},
		{".doan/assets/images/hero.png", int64(len(exporttest.HeroPNG))},
	}
	if !reflect.DeepEqual(res.Largest, want) {
		t.Errorf("largest = %+v", res.Largest)
	}
	for _, a := range res.Assets {
		if a.Path == ".doan/assets/video.mp4" {
			t.Error("the oversized file was read")
		}
	}
}

// The same file inlined many times grows the output past the limit although
// the distinct files are small.
func TestInlineCountsRepeatedInlining(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/assets/images/mid.png", strings.Repeat("x", 600))
	exporttest.Put(t, root, ".doan/canvases/repeat.html", strings.Repeat(`<img src="../assets/images/mid.png">`, 3))
	src, _ := ReadFile(root, ".doan/canvases/repeat.html")
	res, err := InlineLimit(root, seedConfig(t, root), ".doan/canvases/repeat.html", src, 1500)
	if err != nil || !res.TooLarge || !reflect.DeepEqual(res.Largest, []Asset{{".doan/assets/images/mid.png", 600}}) {
		t.Fatalf("res = %+v, %v", res, err)
	}
	res, err = InlineLimit(root, seedConfig(t, root), ".doan/canvases/repeat.html", src, 5000)
	if err != nil || res.TooLarge || res.Largest == nil || len(res.Largest) != 0 {
		t.Fatalf("under the limit: %+v, %v", res.TooLarge, err)
	}
}

func TestInlineAppliesTheDefaultLimit(t *testing.T) {
	if MaxBytes != 50<<20 {
		t.Fatalf("MaxBytes = %d", MaxBytes)
	}
}

func seedConfig(t *testing.T, root string) repo.Config {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(root, ".doan/config.json"))
	if err != nil {
		t.Fatal(err)
	}
	config, code := repo.ParseConfig(data)
	if code != "" {
		t.Fatalf("config: %s", code)
	}
	return config
}
