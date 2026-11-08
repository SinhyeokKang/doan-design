package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/check"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

// One check reads each directory once across all canvases, their stylesheets
// and their implements paths (tokenCss and the scope are one-off and not counted).
func TestCheckInputReadsEachDirectoryOnce(t *testing.T) {
	root := initialized(t)
	head := `<head><meta name="doan:canvas" content="%s"><meta name="doan:width" content="800">`
	links := ""
	for _, name := range []string{"a", "b", "c", "d"} {
		putFile(t, root, ".doan/assets/css/"+name+".css", `@import "shared.css";`)
		links += `<link rel="stylesheet" href="../assets/css/` + name + `.css">`
	}
	putFile(t, root, ".doan/assets/css/shared.css", "")
	putFile(t, root, "src/Button.tsx", "")
	for _, id := range []string{"one", "two"} {
		putFile(t, root, ".doan/canvases/"+id+".html", fmt.Sprintf(head, id)+links+`</head><body><div data-doan-frame="main" data-doan-implements="src/Button.tsx"></div></body>`)
	}
	r, e := repo.Find(root, "")
	if e != nil {
		t.Fatal(e)
	}
	reads := map[string]int{}
	resolver := repo.NewResolverWith(r.Root, func(dir string) ([]os.DirEntry, error) {
		reads[dir]++
		return os.ReadDir(dir)
	})
	in, e := checkInput(r, resolver, nil)
	if e != nil {
		t.Fatal(e)
	}
	for _, c := range []string{".doan/canvases/one.html", ".doan/canvases/two.html"} {
		if len(in.Reach[c]) != 8 {
			t.Fatalf("%s reach %+v", c, in.Reach[c])
		}
		for _, ref := range in.Reach[c] {
			if ref.State != check.In {
				t.Fatalf("%s: %+v", c, ref)
			}
		}
	}
	if in.Implements["src/Button.tsx"] != check.In {
		t.Fatalf("implements %v", in.Implements)
	}
	css := filepath.Join(r.Root, ".doan/assets/css")
	if reads[css] != 1 {
		t.Fatalf("%s read %d times: %v", css, reads[css], reads)
	}
	for dir, count := range reads {
		if count != 1 {
			t.Errorf("%s read %d times", dir, count)
		}
	}
}
