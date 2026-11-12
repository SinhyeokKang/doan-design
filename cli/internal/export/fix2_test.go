package export

import (
	"fmt"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

func inlineInternal(t *testing.T, root, canvasPath string, limit int64) (Result, *inliner) {
	t.Helper()
	src, err := ReadFile(root, canvasPath)
	if err != nil {
		t.Fatal(err)
	}
	res, in, err := inline(repo.NewResolver(root), root, seedConfig(t, root), canvasPath, src, limit)
	if err != nil {
		t.Fatal(err)
	}
	return res, in
}

// the stop happens while building, not after. Without the
// growth check the ladder builds about 131 MB of data URIs before the final
// length check.
func TestInlineStopsBeforeBuildingTheLadder(t *testing.T) {
	root := exporttest.Seed(t)
	for i := 0; i < 18; i++ {
		exporttest.Put(t, root, fmt.Sprintf("styles/k%d.css", i), fmt.Sprintf("@import \"k%d.css\";\n@import \"k%d.css\" screen;\n.k%d { color: red; }\n", i+1, i+1, i))
	}
	exporttest.Put(t, root, "styles/k18.css", ".k18 { color: blue; }\n")
	exporttest.Put(t, root, ".doan/canvases/ladder.html", `<link rel="stylesheet" href="../../styles/k0.css">`)
	const limit = 1 << 20
	res, in := inlineInternal(t, root, ".doan/canvases/ladder.html", limit)
	if !res.TooLarge || in.built > 8*limit {
		t.Fatalf("too large %v after building %d bytes", res.TooLarge, in.built)
	}
}

func TestInlineStopsBeforeTheLastRepeat(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/assets/images/mid.png", strings.Repeat("x", 600))
	exporttest.Put(t, root, ".doan/canvases/repeat.html", strings.Repeat(`<img src="../assets/images/mid.png">`, 3))
	res, in := inlineInternal(t, root, ".doan/canvases/repeat.html", 1500)
	one := int64(len(dataURI("image/png", []byte(strings.Repeat("x", 600)))))
	if !res.TooLarge || in.built >= 3*one {
		t.Fatalf("too large %v after building %d bytes (one URI %d)", res.TooLarge, in.built, one)
	}
}
