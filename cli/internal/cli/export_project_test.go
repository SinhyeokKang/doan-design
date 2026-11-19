package cli

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

func TestExportProjectName(t *testing.T) {
	for _, c := range []struct {
		git  *repo.GitInfo
		want string
	}{
		{&repo.GitInfo{Main: "/projects/store"}, "store"},
		{&repo.GitInfo{}, "checkout"},
		{nil, "checkout"},
	} {
		if got := exportProjectName("/work/checkout", c.git); got != c.want {
			t.Errorf("project name with git %v = %q, want %q", c.git, got, c.want)
		}
	}
}

func TestExportWritesProjectNameFromRepository(t *testing.T) {
	main, git := localGit(t)
	linked := filepath.Join(filepath.Dir(main), "checkout")
	git("-C", main, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "fixture")
	git("-C", main, "worktree", "add", "--detach", linked)

	for _, c := range []struct{ name, root, want string }{
		{"linked worktree", linked, filepath.Base(main)},
		{"non-Git root", filepath.Join(t.TempDir(), "standalone"), "standalone"},
	} {
		t.Run(c.name, func(t *testing.T) {
			const canvas = ".doan/canvases/board.html"
			exporttest.Put(t, c.root, ".doan/config.json", `{"v":1}`)
			exporttest.Put(t, c.root, canvas, `<!doctype html><head><meta name="doan:canvas" content="board"><meta name="doan:width" content="800"></head>`)
			output := exportOutput(t)
			exportRun(t, c.root, 0, canvas, "-o", filepath.Join(output, "viewer.html"))
			page := readFile(t, output, "viewer.html")
			_, rest, ok := strings.Cut(page, "<header ")
			header, _, closed := strings.Cut(rest, "</header>")
			if !ok || !closed || !strings.Contains(header, `<span class="doan-canvas-project-name">`+c.want+`</span>`) {
				t.Errorf("viewer header does not show project %q", c.want)
			}
		})
	}
}
