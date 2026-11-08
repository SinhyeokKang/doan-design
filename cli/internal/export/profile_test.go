package export

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"runtime/metrics"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

// profileEnv opts into TestProfileLargeStylesheet. It writes 24 MiB and
// allocates gigabytes, so it does not run in the gate.
const profileEnv = "DOAN_EXPORT_PROFILE"

// Digests of the large-stylesheet repository: sha256 over the sorted
// "<sha256(file)>  <path>\n" lines (the `shasum -a 256` format), and of the
// stylesheet alone. They pin the generation rule, so measurements taken from
// this test and from the CLI on a generated copy describe the same bytes.
const (
	largeRepoDigest = "2a3cfcf21069ac06c0aecac9d04b5bd444ab5addf8f6a63beb39959eb877a741"
	largeCSSDigest  = "b85ec1ecd2db1e6ca0be71f006695b177039a6d4d875fa20308a53bfec4e3857"
	// largePageDigest is the page `doan export` wrote for this repository
	// before the export copies were cut; the page must stay byte for byte.
	largePageDigest = "d2106e691515825b1dc4d45cfb7a7494af22c1f030cab8e3c0a3c0c426ea733e"
)

const largeCanvas = ".doan/canvases/big-css.html"

// largeStylesheetRepo returns the files of a canvas that links one minified
// stylesheet of exactly 24 MiB with 1,000 url()s to ten 1,024-byte SVGs. Its
// bytes need no percent-encoding in a data: URI, so the export stays near
// 24 MiB, under MaxBytes.
func largeStylesheetRepo() map[string]string {
	return stylesheetRepo(24<<20, 1000, 600)
}

// stylesheetRepo is the large-stylesheet rule at another size: a stylesheet
// of exactly cssBytes whose rule i is `.r<7 digits>{color:rgb(1,2,3);padding:1px}`
// or, every stride-th rule until urlCount, `.r<7 digits>{background:url(../big/i<2 digits>.svg)}`;
// one /*xxx…*/ comment fills the rest.
func stylesheetRepo(cssBytes, urlCount, stride int) map[string]string {
	const assets = 10
	files := map[string]string{".doan/config.json": "{\"v\":1}\n"}
	for i := range assets {
		files[fmt.Sprintf(".doan/assets/big/i%02d.svg", i)] = profileSVG(i)
	}
	var css strings.Builder
	css.Grow(cssBytes)
	urls := 0
	for i := 0; ; i++ {
		rule := fmt.Sprintf(".r%07d{color:rgb(1,2,3);padding:1px}", i)
		if i%stride == 0 && urls < urlCount {
			rule = fmt.Sprintf(".r%07d{background:url(../big/i%02d.svg)}", i, urls%assets)
		}
		if css.Len()+len(rule) > cssBytes-4 {
			break
		}
		if strings.Contains(rule, "url(") {
			urls++
		}
		css.WriteString(rule)
	}
	css.WriteString("/*" + strings.Repeat("x", cssBytes-css.Len()-4) + "*/")
	files[".doan/assets/css/big.css"] = css.String()
	files[largeCanvas] = "<!doctype html>\n<html><head>\n<meta charset=\"utf-8\">\n<meta name=\"doan:canvas\" content=\"big-css\">\n<meta name=\"doan:width\" content=\"1280\">\n" +
		"<link rel=\"stylesheet\" href=\"../assets/css/big.css\">\n</head><body>\n" +
		"<section data-doan-frame=\"big\" data-doan-title=\"Big stylesheet\"><div class=\"r0000001\">Big stylesheet</div></section>\n</body></html>\n"
	return files
}

// profileSVG is exactly 1,024 bytes: a coloured square padded by a comment.
func profileSVG(n int) string {
	head := fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="rgb(%d,%d,0)"/><!--`, n%256, (n>>8)%256)
	tail := "--></svg>\n"
	return head + strings.Repeat("x", 1024-len(head)-len(tail)) + tail
}

func sha256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func repoDigest(files map[string]string) string {
	paths := make([]string, 0, len(files))
	for p := range files {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	var lines strings.Builder
	for _, p := range paths {
		lines.WriteString(sha256Hex(files[p]) + "  " + p + "\n")
	}
	return sha256Hex(lines.String())
}

// TestProfileLargeStylesheet runs Inline and Assemble on the large-stylesheet
// canvas so `-memprofile` shows where an export of a big stylesheet allocates.
// It logs the allocation total, GC count and sampled peak live heap of those
// two calls only.
func TestProfileLargeStylesheet(t *testing.T) {
	if os.Getenv(profileEnv) == "" {
		t.Skip("set " + profileEnv + "=1 to profile a 24 MiB stylesheet export")
	}
	files := largeStylesheetRepo()
	if got := sha256Hex(files[".doan/assets/css/big.css"]); got != largeCSSDigest {
		t.Fatalf("stylesheet sha256 = %s, want %s", got, largeCSSDigest)
	}
	if got := repoDigest(files); got != largeRepoDigest {
		t.Fatalf("repository digest = %s, want %s", got, largeRepoDigest)
	}
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	var input int64
	for p, body := range files {
		full := filepath.Join(root, filepath.FromSlash(p))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
		input += int64(len(body))
	}
	src := []byte(files[largeCanvas])
	files = nil
	model, err := canvas.Parse(largeCanvas, src)
	if err != nil {
		t.Fatal(err)
	}

	runtime.GC()
	var before runtime.MemStats
	runtime.ReadMemStats(&before)
	stop, peak := samplePeakHeap()
	res, err := Inline(root, repo.Config{V: 1, Serve: []string{}}, largeCanvas, src)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Refused) > 0 || res.TooLarge {
		t.Fatalf("refused %v, too large %v", res.Refused, res.TooLarge)
	}
	page, err := Assemble(Meta{Name: "big-css", Width: model.Width}, res.HTML)
	if err != nil {
		t.Fatal(err)
	}
	stop()
	var after runtime.MemStats
	runtime.ReadMemStats(&after)
	if got := pageDigest(page); got != largePageDigest {
		t.Errorf("page sha256 = %s, want %s", got, largePageDigest)
	}
	t.Logf("input %d bytes (stylesheet %d), inlined %d bytes, page %d bytes", input, 24<<20, len(res.HTML), len(page))
	t.Logf("TotalAlloc +%d bytes, Mallocs +%d, NumGC +%d, peak live heap %d bytes, Sys %d bytes",
		after.TotalAlloc-before.TotalAlloc, after.Mallocs-before.Mallocs, after.NumGC-before.NumGC, *peak, after.Sys)
}

// samplePeakHeap polls the live heap every millisecond until stop is called.
func samplePeakHeap() (stop func(), peak *uint64) {
	peak = new(uint64)
	done := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		s := []metrics.Sample{{Name: "/memory/classes/heap/objects:bytes"}}
		tick := time.NewTicker(time.Millisecond)
		defer tick.Stop()
		for {
			metrics.Read(s)
			if v := s[0].Value.Uint64(); v > *peak {
				*peak = v
			}
			select {
			case <-done:
				return
			case <-tick.C:
			}
		}
	}()
	return func() { close(done); wg.Wait() }, peak
}
