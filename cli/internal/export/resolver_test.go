package export

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

// One export reads each directory once, however many references it holds
// (the scope's own one-off resolution is not counted).
func TestInlineReadsEachDirectoryOnce(t *testing.T) {
	root := exporttest.Seed(t)
	const n = 5000
	var canvas strings.Builder
	for i := 0; i < n; i++ {
		exporttest.Put(t, root, fmt.Sprintf(".doan/assets/many/%04d.png", i), "x")
		fmt.Fprintf(&canvas, `<img src="../assets/many/%04d.png">`, i)
	}
	exporttest.Put(t, root, ".doan/canvases/many.html", canvas.String())
	src, err := ReadFile(root, ".doan/canvases/many.html")
	if err != nil {
		t.Fatal(err)
	}
	reads := map[string]int{}
	resolver := repo.NewResolverWith(root, func(dir string) ([]os.DirEntry, error) {
		reads[dir]++
		return os.ReadDir(dir)
	})
	res, _, err := inline(resolver, root, seedConfig(t, root), ".doan/canvases/many.html", src, MaxBytes)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Refused) != 0 || len(res.Assets) != n {
		t.Fatalf("refused %v, %d assets", res.Refused, len(res.Assets))
	}
	many := filepath.Join(root, ".doan/assets/many")
	if reads[many] != 1 {
		t.Fatalf("%s read %d times", many, reads[many])
	}
	for dir, count := range reads {
		if count != 1 {
			t.Errorf("%s read %d times", dir, count)
		}
	}
}
