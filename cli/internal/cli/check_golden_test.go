package cli

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func scopeCanvas(id, head string) string {
	return fmt.Sprintf(`<head><meta name="doan:canvas" content="%s"><meta name="doan:width" content="800">%s</head><body><div data-doan-frame="main"></div></body>`, id, head)
}

// checkGoldenRepo holds what a scope could drop or misjudge: a shared stylesheet (with an @import chain) whose
// undefined_token goes to the first canvas in path order, a canvas id two files share, an unparsable canvas, a
// file whose .html is in another case, and findings about the config itself.
func checkGoldenRepo(t *testing.T) string {
	t.Helper()
	root := initialized(t)
	putFile(t, root, ".doan/config.json", `{"v":1,"tokenCss":"tokens/missing.css","serve":[".env"]}`)
	putFile(t, root, ".doan/assets/shared.css", `@import "deep.css"; .x{color:var(--brand);background:#123456}`)
	putFile(t, root, ".doan/assets/deep.css", `.y{color:var(--deep)}`)
	shared := `<link rel="stylesheet" href="../assets/shared.css">`
	putFile(t, root, ".doan/canvases/a.html", scopeCanvas("alpha", shared))
	putFile(t, root, ".doan/canvases/b.html", scopeCanvas("beta", shared+`<style>:root{--brand:red;--deep:blue}</style>`))
	putFile(t, root, ".doan/canvases/z.html", scopeCanvas("zeta", shared))
	putFile(t, root, ".doan/canvases/sub/dup.html", scopeCanvas("dup", ""))
	putFile(t, root, ".doan/ds/dup.html", scopeCanvas("dup", ""))
	putFile(t, root, ".doan/canvases/broken.html", strings.Repeat("<div>", 600))
	putFile(t, root, ".doan/canvases/Upper.HTML", scopeCanvas("upper", ""))
	return root
}

func runCheck(root string, args ...string) (int, string, string) {
	var out, errout bytes.Buffer
	code := Run(append(append([]string{"check"}, args...), "--repo", root), strings.NewReader(""), &out, &errout)
	return code, out.String(), errout.String()
}

// The no-argument output is a contract: a scope must not change one byte of it.
func TestCheckWithoutPathsMatchesGolden(t *testing.T) {
	root := checkGoldenRepo(t)
	for _, c := range []struct {
		golden string
		args   []string
	}{
		{"check.json", []string{"--json"}},
		{"check.txt", nil},
	} {
		t.Run(c.golden, func(t *testing.T) {
			code, out, errout := runCheck(root, c.args...)
			if code != 4 || errout != "" {
				t.Fatalf("exit %d stderr %q", code, errout)
			}
			want, e := os.ReadFile(filepath.Join("testdata", "check-golden", c.golden))
			if e != nil {
				t.Fatal(e)
			}
			if out != string(want) {
				t.Fatalf("output differs from %s:\n%s", c.golden, out)
			}
		})
	}
}
