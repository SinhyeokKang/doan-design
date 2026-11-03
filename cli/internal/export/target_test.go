package export

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
	"golang.org/x/text/unicode/norm"
)

var listedSeed = []string{
	".doan/canvases/full.html",
	".doan/canvases/flows/공백 화면.html",
	".doan/canvases/Board.html",
	".doan/ds/Index.html",
}

func listedRoot(t *testing.T) string {
	t.Helper()
	root, _ := filepath.EvalSymlinks(t.TempDir())
	for _, p := range listedSeed {
		exporttest.Put(t, root, p, "")
	}
	return root
}

func TestMatchListedAcceptsRepoRelativeAndAbsolutePaths(t *testing.T) {
	root := listedRoot(t)
	for name, c := range map[string]struct{ arg, want string }{
		"relative":          {".doan/canvases/full.html", ".doan/canvases/full.html"},
		"dot slash":         {"./.doan/canvases/full.html", ".doan/canvases/full.html"},
		"dotdot inside":     {".doan/ds/../canvases/full.html", ".doan/canvases/full.html"},
		"double slash":      {".doan//canvases/full.html", ".doan/canvases/full.html"},
		"absolute":          {filepath.Join(root, ".doan/canvases/full.html"), ".doan/canvases/full.html"},
		"subdirectory":      {".doan/canvases/flows/공백 화면.html", ".doan/canvases/flows/공백 화면.html"},
		"subdirectory abs":  {filepath.Join(root, ".doan/canvases/flows/공백 화면.html"), ".doan/canvases/flows/공백 화면.html"},
		"design system":     {".doan/ds/Index.html", ".doan/ds/Index.html"},
		"case spelling":     {".doan/canvases/board.html", ".doan/canvases/Board.html"},
		"case in directory": {".DOAN/Canvases/FULL.html", ".doan/canvases/full.html"},
		"decomposed hangul": {".doan/canvases/flows/" + norm.NFD.String("공백 화면") + ".html", ".doan/canvases/flows/공백 화면.html"},
		"case absolute":     {filepath.Join(filepath.Dir(root), upper(filepath.Base(root)), ".doan/ds/index.html"), ".doan/ds/Index.html"},
	} {
		t.Run(name, func(t *testing.T) {
			got, ok := MatchListed(root, listedSeed, c.arg)
			if !ok || got != c.want {
				t.Fatalf("MatchListed(%q) = %q, %v; want %q", c.arg, got, ok, c.want)
			}
		})
	}
}

func upper(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'a' && c <= 'z' {
			b[i] = c - 32
		}
	}
	return string(b)
}

func TestMatchListedRefusesWhatIsNotListed(t *testing.T) {
	root := listedRoot(t)
	for name, arg := range map[string]string{
		"empty":            "",
		"config":           ".doan/config.json",
		"unlisted canvas":  ".doan/canvases/other.html",
		"directory":        ".doan/canvases",
		"trailing slash":   ".doan/canvases/full.html/",
		"outside relative": "../full.html",
		"escapes and back": ".doan/../../x/.doan/canvases/full.html",
		"root":             ".",
		"absolute outside": filepath.Join(filepath.Dir(root), "other", ".doan/canvases/full.html"),
		"root itself":      root,
		"prefix sibling":   root + "-copy/.doan/canvases/full.html",
	} {
		t.Run(name, func(t *testing.T) {
			if got, ok := MatchListed(root, listedSeed, arg); ok {
				t.Fatalf("MatchListed(%q) = %q", arg, got)
			}
		})
	}
}

func TestMatchListedPrefersTheExactSpellingAndRefusesAnAmbiguousOne(t *testing.T) {
	root, _ := filepath.EvalSymlinks(t.TempDir())
	both := []string{".doan/canvases/a.html", ".doan/canvases/A.html"}
	if got, ok := MatchListed(root, both, ".doan/canvases/A.html"); !ok || got != ".doan/canvases/A.html" {
		t.Fatalf("exact spelling: %q %v", got, ok)
	}
	if got, ok := MatchListed(root, both, ".doan/canvases/a.html"); !ok || got != ".doan/canvases/a.html" {
		t.Fatalf("exact spelling: %q %v", got, ok)
	}
	if got, ok := MatchListed(root, both, ".doan/canvases/A.HTML"); ok {
		t.Fatalf("ambiguous spelling matched %q", got)
	}
}

func TestMatchListedFollowsASymbolicLinkToTheRootOnlyInTheDirectory(t *testing.T) {
	root := listedRoot(t)
	alias := filepath.Join(t.TempDir(), "alias")
	if err := os.Symlink(root, alias); err != nil {
		t.Fatal(err)
	}
	if got, ok := MatchListed(root, listedSeed, filepath.Join(alias, ".doan/canvases/full.html")); !ok || got != ".doan/canvases/full.html" {
		t.Fatalf("alias of the root: %q %v", got, ok)
	}
	// A link in the canvas's own place is not a listed canvas.
	exporttest.Link(t, "full.html", filepath.Join(root, ".doan/canvases/link.html"))
	if got, ok := MatchListed(root, listedSeed, ".doan/canvases/link.html"); ok {
		t.Fatalf("link matched %q", got)
	}
}

func TestUnderDoan(t *testing.T) {
	dir, _ := filepath.EvalSymlinks(t.TempDir())
	exporttest.Put(t, dir, "project/.doan/canvases/x.html", "")
	exporttest.Put(t, dir, "plain/x.txt", "")
	exporttest.Link(t, filepath.Join(dir, "project/.doan/canvases"), filepath.Join(dir, "plain/via-link"))
	for name, c := range map[string]struct {
		out  string
		want bool
	}{
		"in .doan":               {filepath.Join(dir, "project/.doan/x.html"), true},
		"below .doan":            {filepath.Join(dir, "project/.doan/canvases/x.html"), true},
		"dotdot into .doan":      {filepath.Join(dir, "plain/../project/.doan/x.html"), true},
		"missing below .doan":    {filepath.Join(dir, "project/.doan/new/dir/x.html"), true},
		"other case":             {filepath.Join(dir, "project/.DOAN/x.html"), true},
		"through a link":         {filepath.Join(dir, "plain/via-link/x.html"), true},
		"outside":                {filepath.Join(dir, "plain/x.html"), false},
		"project root":           {filepath.Join(dir, "project/x.html"), false},
		"named like it":          {filepath.Join(dir, "project/.doan-copy/x.html"), false},
		"a file named .doan":     {filepath.Join(dir, "project/.doan"), false},
		"missing directory":      {filepath.Join(dir, "plain/missing/x.html"), false},
		"relative to the cwd":    {"", false},
		"missing then dotdot":    {filepath.Join(dir, "plain/missing/../x.html"), false},
		"under a .doan ancestor": {filepath.Join(dir, "project/.doan/../x.html"), false},
	} {
		t.Run(name, func(t *testing.T) {
			if c.out == "" {
				c.out = "x.html"
			}
			got, err := UnderDoan(c.out)
			if err != nil || got != c.want {
				t.Fatalf("UnderDoan(%q) = %v, %v; want %v", c.out, got, err, c.want)
			}
		})
	}
}

func TestUnderDoanReadsARelativeOutputFromTheCurrentDirectory(t *testing.T) {
	dir, _ := filepath.EvalSymlinks(t.TempDir())
	exporttest.Put(t, dir, ".doan/canvases/x.html", "")
	t.Chdir(filepath.Join(dir, ".doan/canvases"))
	if got, err := UnderDoan("out.html"); err != nil || !got {
		t.Fatalf("UnderDoan(out.html) = %v, %v", got, err)
	}
	if got, err := UnderDoan("../../out.html"); err != nil || got {
		t.Fatalf("UnderDoan(../../out.html) = %v, %v", got, err)
	}
}
