package cli

import (
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
)

// The child runs writeAttributes with a file size limit below the current .gitattributes, so its write fails part way,
// as a full disk or a kill would leave it.
func TestAttributesShortWriteChild(t *testing.T) {
	root := os.Getenv("DOAN_TEST_ATTRIBUTES_ROOT")
	if root == "" {
		return
	}
	signal.Ignore(syscall.SIGXFSZ)
	limit := uint64(16)
	if err := syscall.Setrlimit(syscall.RLIMIT_FSIZE, &syscall.Rlimit{Cur: limit, Max: limit}); err != nil {
		t.Fatal(err)
	}
	if _, err := writeAttributes(root); err == nil {
		t.Fatal("write past the size limit succeeded")
	}
}

func TestAttributesFailedWriteKeepsTheTeamsLines(t *testing.T) {
	root, _ := filepath.EvalSymlinks(t.TempDir())
	const before = "*.txt text\n*.png binary\n*.svg text eol=lf\n"
	putFile(t, root, ".gitattributes", before)
	cmd := exec.Command(os.Args[0], "-test.run=^TestAttributesShortWriteChild$")
	cmd.Env = append(os.Environ(), "DOAN_TEST_ATTRIBUTES_ROOT="+root)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("child: %v\n%s", err, out)
	}
	if got := readFile(t, root, ".gitattributes"); got != before {
		t.Fatalf("team's attributes changed: %q", got)
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() != ".gitattributes" {
			t.Fatalf("left %s behind", entry.Name())
		}
	}
}

// A staged write behaves as a write in place: the file keeps its mode, and a linked .gitattributes stays a link whose
// target gets the line.
func TestAttributesWriteKeepsModeAndLink(t *testing.T) {
	root, _ := filepath.EvalSymlinks(t.TempDir())
	putFile(t, root, ".gitattributes", "*.txt text\n")
	if err := os.Chmod(filepath.Join(root, ".gitattributes"), 0o600); err != nil {
		t.Fatal(err)
	}
	if changed, err := writeAttributes(root); err != nil || !changed {
		t.Fatal(changed, err)
	}
	if info, err := os.Stat(filepath.Join(root, ".gitattributes")); err != nil || info.Mode().Perm() != 0o600 {
		t.Fatal(info, err)
	}
	linked, _ := filepath.EvalSymlinks(t.TempDir())
	putFile(t, linked, "shared-attrs", "*.txt text\n")
	if err := os.Symlink("shared-attrs", filepath.Join(linked, ".gitattributes")); err != nil {
		t.Fatal(err)
	}
	if changed, err := writeAttributes(linked); err != nil || !changed {
		t.Fatal(changed, err)
	}
	if info, err := os.Lstat(filepath.Join(linked, ".gitattributes")); err != nil || info.Mode()&os.ModeSymlink == 0 {
		t.Fatal("link replaced", info, err)
	}
	if !strings.Contains(readFile(t, linked, "shared-attrs"), "linguist-documentation") {
		t.Fatal("link target not written")
	}
}
