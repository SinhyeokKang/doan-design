package repo

import (
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
)

func TestResolveUnicodeIdentity(t *testing.T) {
	root := real(t, t.TempDir())
	const disk = "한글.css"
	const nfc = "한글.css"
	put(t, root, disk, "")
	original, err := os.Stat(filepath.Join(root, disk))
	if err != nil {
		t.Fatal(err)
	}
	alias, err := os.Stat(filepath.Join(root, nfc))
	wantState, wantPath := Missing, ""
	if err == nil && os.SameFile(original, alias) {
		wantState, wantPath = Inside, disk
	} else if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	state, path, err := Resolve(root, root, nfc)
	if err != nil || state != wantState || path != wantPath {
		t.Fatalf("%s %q %v; want %s %q", state, path, err, wantState, wantPath)
	}
	// Distinct names must keep their own identity on normalization-sensitive filesystems.
	if wantState == Missing {
		put(t, root, nfc, "other")
		state, path, err = Resolve(root, root, nfc)
		if err != nil || state != Inside || path != nfc {
			t.Fatalf("%s %q %v", state, path, err)
		}
	}
	outside := real(t, t.TempDir())
	put(t, outside, disk, "")
	link(t, filepath.Join(outside, disk), filepath.Join(root, "alias.css"))
	state, _, err = Resolve(root, root, "alias.css")
	if err != nil || state != Outside {
		t.Fatalf("outside alias: %s %v", state, err)
	}
}

func TestFindUnusableInputPaths(t *testing.T) {
	root := t.TempDir()
	put(t, root, "file", "")
	link(t, "loop", filepath.Join(root, "loop"))
	for _, p := range []string{"file/child", "bad\x00path", strings.Repeat("x", 300), "loop"} {
		t.Run(p, func(t *testing.T) {
			_, err := Find(root, p)
			expectCode(t, err, "repo_not_found")
			_, err = Find(filepath.Join(root, p), "")
			expectCode(t, err, "repo_not_found")
		})
	}
}

func TestMissingPathKeepsIOErrors(t *testing.T) {
	for _, cause := range []error{syscall.EACCES, syscall.EPERM, syscall.EIO} {
		if missingPath(&os.PathError{Op: "stat", Path: "repo", Err: cause}) {
			t.Fatalf("classified %v as missing", cause)
		}
	}
}
