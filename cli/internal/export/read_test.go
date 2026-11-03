package export

import (
	"path/filepath"
	"syscall"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
)

func TestReadFileReadsARegularFile(t *testing.T) {
	root := exporttest.Seed(t)
	got, err := ReadFile(root, ".doan/assets/images/hero.png")
	if err != nil || string(got) != string(exporttest.HeroPNG) {
		t.Fatalf("ReadFile = %q, %v", got, err)
	}
}

// A segment replaced by a link after resolution must not lead the read
// elsewhere, whichever segment it is.
func TestReadFileRefusesLinkedSegments(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Link(t, "styles", filepath.Join(root, "alias"))
	exporttest.Link(t, "tokens.css", filepath.Join(root, "styles/alias.css"))
	for _, p := range []string{"alias/tokens.css", "styles/alias.css", "../outside.png", "styles/../styles/a.css", "", "styles//a.css"} {
		if _, err := ReadFile(root, p); err == nil {
			t.Errorf("ReadFile(%q) succeeded", p)
		}
	}
}

func TestReadFileRefusesNonRegularFiles(t *testing.T) {
	root := exporttest.Seed(t)
	if err := syscall.Mkfifo(filepath.Join(root, "styles/pipe.css"), 0o644); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{"styles", "styles/pipe.css"} {
		if _, err := ReadFile(root, p); err == nil {
			t.Errorf("ReadFile(%q) succeeded", p)
		}
	}
}
