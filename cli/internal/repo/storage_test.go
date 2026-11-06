package repo

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestStoragePairs(t *testing.T) {
	pattern := StoragePattern(".")
	if pattern != "/.doan/" {
		t.Fatal(pattern)
	}
	if got := StoragePattern("apps/a*?[\\!# "); got != "/apps/a\\*\\?\\[\\\\\\!#\\ /.doan/" {
		t.Fatal(got)
	}
	for _, original := range []string{"", "foreign", "foreign\n", "foreign\r\n", "/.doan/\n# user\n", "# doan: local\n/other/.doan/\n"} {
		added := AddStoragePair([]byte(original), pattern)
		if !HasStoragePair(added, pattern) {
			t.Fatal(string(added))
		}
		if string(AddStoragePair(added, pattern)) != string(added) {
			t.Fatal("duplicate append")
		}
		expected := original
		if original != "" && !strings.HasSuffix(original, "\n") {
			expected += "\n"
		}
		if got := string(RemoveStoragePair(append(append([]byte{}, added...), added...), pattern)); got != expected+expected {
			t.Fatalf("%q != %q", got, expected+expected)
		}
	}
	if got := string(RemoveStoragePair([]byte("# doan: local\r\n/.doan/"), pattern)); got != "" {
		t.Fatal(got)
	}
}

func TestStorageReadBoundaries(t *testing.T) {
	for _, kind := range []string{"non-git", "no-info", "no-exclude", "plain", "local", "duplicate", "broken-git", "oversized", "link", "readonly", "readonly-info", "home"} {
		t.Run(kind, func(t *testing.T) {
			root := real(t, t.TempDir())
			home := ""
			want, reason := "repo", ""
			if kind != "non-git" {
				put(t, root, ".git/HEAD", "ref: refs/heads/main")
			}
			switch kind {
			case "non-git":
				reason = "not_git"
			case "no-exclude":
				os.Mkdir(filepath.Join(root, ".git/info"), 0755)
			case "plain":
				put(t, root, ".git/info/exclude", "/.doan/\n")
			case "local", "duplicate":
				put(t, root, ".git/info/exclude", strings.Repeat("# doan: local\n/.doan/\n", 2))
				want = "local"
			case "broken-git":
				os.RemoveAll(filepath.Join(root, ".git"))
				put(t, root, ".git", "broken")
				want = "unknown"
				reason = "git_unreadable"
			case "oversized":
				put(t, root, ".git/info/exclude", strings.Repeat("x", (1<<20)+1))
				want = "unknown"
				reason = "exclude_unwritable"
			case "link":
				put(t, root, "outside", "keep")
				os.MkdirAll(filepath.Join(root, ".git/info"), 0755)
				link(t, filepath.Join(root, "outside"), filepath.Join(root, ".git/info/exclude"))
				want = "unknown"
				reason = "exclude_unwritable"
			case "readonly":
				put(t, root, ".git/info/exclude", "# doan: local\n/.doan/\n")
				os.Chmod(filepath.Join(root, ".git/info/exclude"), 0444)
				want = "local"
				reason = "exclude_unwritable"
			case "readonly-info":
				os.Mkdir(filepath.Join(root, ".git/info"), 0555)
				defer os.Chmod(filepath.Join(root, ".git/info"), 0755)
				reason = "exclude_unwritable"
			case "home":
				home = root
				reason = "not_git"
			}
			got := ReadStorage(root, home)
			if got.Storage != want || got.Reason != reason {
				t.Fatalf("%+v want %s %s", got, want, reason)
			}
		})
	}
}

func storageGit(t *testing.T) (string, func(...string) string) {
	t.Helper()
	base := real(t, t.TempDir())
	home := filepath.Join(base, "home")
	os.Mkdir(home, 0755)
	run := func(args ...string) string {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + home, "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_SYSTEM=/dev/null", "GIT_CONFIG_COUNT=0"}
		b, e := cmd.CombinedOutput()
		if e != nil {
			t.Fatalf("git %v: %v %s", args, e, b)
		}
		return string(b)
	}
	return base, run
}

func TestStorageRealGitLayouts(t *testing.T) {
	base, git := storageGit(t)
	main := filepath.Join(base, "main")
	linked := filepath.Join(base, "linked")
	git("init", "--template=", main)
	git("-C", main, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "fixture")
	git("-C", main, "worktree", "add", "-b", "topic", linked)
	put(t, main, ".git/info/exclude", string(AddStoragePair(nil, StoragePattern("."))))
	for _, root := range []string{main, linked} {
		put(t, root, ".doan/file", "x")
		s := ReadStorage(root, "")
		if s.Storage != "local" {
			t.Fatal(s)
		}
		if got := git("-C", root, "status", "--porcelain"); got != "" {
			t.Fatal(got)
		}
	}
	put(t, main, ".git/info/exclude", string(AddStoragePair(nil, StoragePattern("sub"))))
	put(t, main, "sub/.doan/file", "x")
	if ReadStorage(filepath.Join(main, "sub"), "").Storage != "local" || ReadStorage(main, "").Storage != "repo" {
		t.Fatal("root scope")
	}
	if got := git("-C", main, "status", "--porcelain"); got != "?? .doan/\n" {
		t.Fatal(got)
	}
	source := filepath.Join(base, "source")
	git("init", source)
	git("-C", source, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "fixture")
	git("-C", main, "-c", "protocol.file.allow=always", "submodule", "add", source, "module")
	sub := filepath.Join(main, "module")
	loc, err := gitLocation(sub, "")
	if err != nil || loc.common != filepath.Join(main, ".git/modules/module") {
		t.Fatalf("%+v %v", loc, err)
	}
	alias := filepath.Join(base, "alias")
	link(t, main, alias)
	loc, err = gitLocation(filepath.Join(alias, "sub"), "")
	if err != nil || loc.rel != "sub" {
		t.Fatalf("%+v %v", loc, err)
	}
}

func TestStorageWritesPreserveForeignBytesAndPermissions(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, ".git/info/exclude", "foreign\r\n# doan: local\r\n/.doan/\r\n# doan: local\r\n/.doan/\r\nlast")
	path := filepath.Join(root, ".git/info/exclude")
	os.Chmod(path, 0600)
	if changed, err := WriteStorage(root, "", "repo"); err != nil || !changed {
		t.Fatal(changed, err)
	}
	data, _ := os.ReadFile(path)
	if string(data) != "foreign\r\nlast" {
		t.Fatal(string(data))
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0600 {
		t.Fatal(info.Mode())
	}
	if _, err := WriteStorage(root, "", "local"); err != nil {
		t.Fatal(err)
	}
	matches, _ := filepath.Glob(filepath.Join(root, ".git/info/.exclude-*"))
	if len(matches) > 0 {
		t.Fatal(matches)
	}
}
func TestStorageConcurrentCreate(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, ".git/HEAD", "ref: refs/heads/main")
	done := make(chan error, 2)
	for i := 0; i < 2; i++ {
		go func() { _, err := WriteStorage(root, "", "local"); done <- err }()
	}
	for i := 0; i < 2; i++ {
		if err := <-done; err != nil {
			t.Fatal(err)
		}
	}
	data, _ := os.ReadFile(filepath.Join(root, ".git/info/exclude"))
	if !HasStoragePair(data, "/.doan/") {
		t.Fatal(string(data))
	}
}
func TestStorageWriteLinks(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, ".git/HEAD", "ref: refs/heads/main")
	dir := real(t, t.TempDir())
	link(t, dir, filepath.Join(root, ".git/info"))
	if _, err := WriteStorage(root, "", "local"); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "exclude")
	os.Remove(path)
	outside := filepath.Join(root, "sentinel")
	put(t, root, "sentinel", "unchanged")
	link(t, outside, path)
	if _, err := WriteStorage(root, "", "local"); err == nil {
		t.Fatal("followed final link")
	}
	data, _ := os.ReadFile(outside)
	if string(data) != "unchanged" {
		t.Fatal(string(data))
	}
}
