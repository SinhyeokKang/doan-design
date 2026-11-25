//go:build !race

package export

import (
	"runtime"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

// The race detector turns off the compiler's zero-copy string and []byte
// conversions, which the cap below relies on, so this file is not built with -race.

// allocCSSBytes is large enough that full-size copies of the stylesheet and page outweigh the viewer files' fixed cost,
// and small enough to keep `go test` fast.
const allocCSSBytes = 4 << 20

// allocLimit is about 9.5 times the stylesheet plus 10% headroom: each full-size copy of the stylesheet or page that comes
// back adds about one stylesheet and crosses it. TotalAlloc moves less with GC timing than the peak heap does.
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
	page, err := Assemble(Meta{Name: "big-css", Width: 1280}, noFrames, res.HTML)
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
