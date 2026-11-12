package repo

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
)

func TestLocateGitFollowsCloneRules(t *testing.T) {
	executable := func(set ...string) func(string) bool {
		return func(path string) bool { return slices.Contains(set, path) }
	}
	identity := func(path string) (string, bool) { return path, true }
	shimAt := func(link string) func(string) (string, bool) {
		return func(path string) (string, bool) {
			if path == link {
				return "/usr/bin/git", true
			}
			return path, true
		}
	}
	const developer = "/Applications/Xcode.app/Contents/Developer"
	for _, c := range []struct {
		name, path string
		executable func(string) bool
		realpath   func(string) (string, bool)
		want       string
	}{
		{"first on PATH", "/opt/homebrew/bin:/usr/bin", executable("/opt/homebrew/bin/git", "/usr/bin/git"), identity, "/opt/homebrew/bin/git"},
		{"trailing slash", "/opt/git/bin/", executable("/opt/git/bin/git"), identity, "/opt/git/bin/git"},
		{"skips a directory without git", "/nowhere:/opt/homebrew/bin", executable("/opt/homebrew/bin/git"), identity, "/opt/homebrew/bin/git"},
		{"shim with developer git", "/usr/bin", executable("/usr/bin/git", developer+"/usr/bin/git"), identity, "/usr/bin/git"},
		{"shim without developer git", "/usr/bin", executable("/usr/bin/git"), identity, ""},
		{"a link to the shim is the shim", "/links", executable("/links/git"), shimAt("/links/git"), ""},
		{"a link to the shim with developer git", "/links", executable("/links/git", developer+"/usr/bin/git"), shimAt("/links/git"), "/links/git"},
		{"skips a relative entry", "bin:/opt/homebrew/bin", executable("bin/git", "/opt/homebrew/bin/git"), identity, "/opt/homebrew/bin/git"},
		{"empty PATH", "", executable("/usr/bin/git", developer+"/usr/bin/git"), identity, ""},
		{"no git", "/bin:/usr/sbin", executable(), identity, ""},
	} {
		t.Run(c.name, func(t *testing.T) {
			if got := LocateGit(c.path, developer, c.executable, c.realpath); got != c.want {
				t.Fatalf("LocateGit(%q) = %q; want %q", c.path, got, c.want)
			}
		})
	}
}

func TestActiveDeveloperDirNeverRunsXcodeSelect(t *testing.T) {
	link := func(target string, err error) func(string) (string, error) {
		return func(path string) (string, error) {
			if path != "/var/db/xcode_select_link" {
				t.Fatalf("readlink %s", path)
			}
			return target, err
		}
	}
	if got := ActiveDeveloperDir("/Custom/Developer", link("/Applications/Xcode.app/Contents/Developer", nil)); got != "/Custom/Developer" {
		t.Fatal(got)
	}
	if got := ActiveDeveloperDir("", link("/Applications/Xcode.app/Contents/Developer", nil)); got != "/Applications/Xcode.app/Contents/Developer" {
		t.Fatal(got)
	}
	if got := ActiveDeveloperDir("", link("", os.ErrNotExist)); got != "/Library/Developer/CommandLineTools" {
		t.Fatal(got)
	}
}

func TestGitEnvIsAnAllowList(t *testing.T) {
	base := []string{
		"HOME=/Users/sam", "PATH=/opt/homebrew/bin:/usr/bin", "DEVELOPER_DIR=/Custom/Developer", "LANG=ko_KR.UTF-8",
		"GIT_DIR=/elsewhere/.git", "GIT_WORK_TREE=/elsewhere", "GIT_INDEX_FILE=/elsewhere/index", "GIT_CONFIG_COUNT=1",
		"GIT_CONFIG_KEY_0=init.templateDir", "GIT_CONFIG_VALUE_0=/tmp/hooks", "GIT_CONFIG_PARAMETERS='core.bare'=true",
		"GIT_OBJECT_DIRECTORY=/elsewhere/objects", "GIT_TERMINAL_PROMPT=1", "SSH_AUTH_SOCK=/tmp/agent", "TERM=xterm",
	}
	got := GitEnv(base)
	slices.Sort(got)
	want := []string{"DEVELOPER_DIR=/Custom/Developer", "GIT_TERMINAL_PROMPT=0", "HOME=/Users/sam", "LANG=ko_KR.UTF-8", "PATH=/opt/homebrew/bin:/usr/bin"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("GitEnv = %v; want %v", got, want)
	}
	// Absent variables stay absent rather than empty.
	got = GitEnv([]string{"PATH=/usr/bin"})
	slices.Sort(got)
	if want := []string{"GIT_TERMINAL_PROMPT=0", "PATH=/usr/bin"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("GitEnv = %v; want %v", got, want)
	}
}

func TestGitInitArgsCopyNoTemplate(t *testing.T) {
	if got := GitInitArgs(); !reflect.DeepEqual(got, []string{"init", "--quiet", "--template="}) {
		t.Fatal(got)
	}
}

func TestAtOrAboveHome(t *testing.T) {
	base := real(t, t.TempDir())
	home := filepath.Join(base, "home")
	os.MkdirAll(filepath.Join(home, "code"), 0755)
	for root, want := range map[string]bool{home: true, base: true, "/": true, filepath.Join(home, "code"): false, filepath.Join(base, "other"): false} {
		if got := AtOrAboveHome(root, home); got != want {
			t.Errorf("AtOrAboveHome(%s) = %v; want %v", root, got, want)
		}
	}
	// A home spelled through a link is the same home.
	link := filepath.Join(base, "home-link")
	os.Symlink(home, link)
	if !AtOrAboveHome(home, link) {
		t.Fatal("home through a link")
	}
	if AtOrAboveHome(home, "") {
		t.Fatal("an unknown home refuses nothing")
	}
}

func TestClaimGitDirIsExclusiveAndRollsBackOnlyItsOwn(t *testing.T) {
	root := real(t, t.TempDir())
	claimed, err := ClaimGitDir(root)
	if err != nil || claimed.Path != filepath.Join(root, ".git") {
		t.Fatalf("claim: %+v %v", claimed, err)
	}
	info, err := os.Lstat(claimed.Path)
	if err != nil || !info.IsDir() || !claimed.Owns(info) {
		t.Fatalf("claimed .git: %v %v", info, err)
	}
	// Another claim on the same folder finds the .git already there and leaves it.
	put(t, root, ".git/HEAD", "ref: refs/heads/main\n")
	if _, err := ClaimGitDir(root); !errors.Is(err, ErrGitExists) {
		t.Fatalf("second claim: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, ".git/HEAD")); err != nil {
		t.Fatal("the existing .git was touched", err)
	}
	// A .git another process put in place of the claimed one is not ours to remove.
	os.RemoveAll(claimed.Path)
	os.Mkdir(claimed.Path, 0755)
	put(t, root, ".git/HEAD", "ref: refs/heads/main\n")
	replaced, _ := os.Lstat(claimed.Path)
	if claimed.Owns(replaced) {
		t.Fatal("a replaced .git counts as claimed")
	}
	if removed, err := RollbackGit(claimed); removed || err != nil {
		t.Fatalf("rollback of a replaced .git: %v %v", removed, err)
	}
	if _, err := os.Stat(filepath.Join(root, ".git/HEAD")); err != nil {
		t.Fatal("rollback removed a .git it did not create", err)
	}
	// Its own .git, filled in by git init, goes entirely.
	other := real(t, t.TempDir())
	mine, err := ClaimGitDir(other)
	if err != nil {
		t.Fatal(err)
	}
	put(t, other, ".git/objects/info/packs", "")
	if removed, err := RollbackGit(mine); !removed || err != nil {
		t.Fatalf("rollback: %v %v", removed, err)
	}
	if _, err := os.Lstat(mine.Path); !os.IsNotExist(err) {
		t.Fatal("claimed .git left behind", err)
	}
	// Nothing claimed, nothing removed.
	if removed, err := RollbackGit(ClaimedGit{}); removed || err != nil {
		t.Fatal(removed, err)
	}
}

func TestClaimGitDirRefusesALinkOrFile(t *testing.T) {
	for _, kind := range []string{"file", "dangling"} {
		root := real(t, t.TempDir())
		if kind == "file" {
			put(t, root, ".git", "gitdir: /elsewhere\n")
		} else {
			os.Symlink(filepath.Join(root, "missing"), filepath.Join(root, ".git"))
		}
		if _, err := ClaimGitDir(root); !errors.Is(err, ErrGitExists) {
			t.Fatalf("%s: %v", kind, err)
		}
		if _, err := os.Stat(filepath.Join(root, "missing")); !os.IsNotExist(err) {
			t.Fatalf("%s: the claim followed the link", kind)
		}
	}
}

// fakeHost runs no real git: a successful run writes what git init leaves with --template=.
func fakeHost(t *testing.T, run func(dir string) error) (GitHost, *[][]string) {
	bin := real(t, t.TempDir())
	put(t, bin, "git", "#!/bin/sh\nexit 1\n")
	os.Chmod(filepath.Join(bin, "git"), 0755)
	calls := &[][]string{}
	host := SystemGitHost([]string{"PATH=" + bin, "HOME=/nonexistent"})
	host.Run = func(git, dir string, args, env []string) error {
		*calls = append(*calls, append([]string{git, dir}, args...))
		if run != nil {
			return run(dir)
		}
		put(t, dir, ".git/HEAD", "ref: refs/heads/main\n")
		os.MkdirAll(filepath.Join(dir, ".git/objects"), 0755)
		os.MkdirAll(filepath.Join(dir, ".git/refs/heads"), 0755)
		return nil
	}
	return host, calls
}

func TestInitGitCreatesARepositoryReadStorageSees(t *testing.T) {
	root := real(t, t.TempDir())
	host, calls := fakeHost(t, nil)
	claimed, err := InitGit(root, "", host)
	if err != nil || claimed.Path != filepath.Join(root, ".git") {
		t.Fatalf("InitGit: %+v %v", claimed, err)
	}
	if len(*calls) != 1 || (*calls)[0][1] != root || !reflect.DeepEqual((*calls)[0][2:], GitInitArgs()) {
		t.Fatalf("git runs: %v", *calls)
	}
	if s := ReadStorage(root, ""); s.Reason == "not_git" || s.Storage == "unknown" {
		t.Fatalf("storage after init: %+v", s)
	}
	// --template= leaves no info/; the exclude write makes it.
	if _, err := os.Stat(filepath.Join(root, ".git/info")); !os.IsNotExist(err) {
		t.Fatal(err)
	}
	if changed, err := WriteStorage(root, "", "local"); !changed || err != nil {
		t.Fatal(changed, err)
	}
	if s := ReadStorage(root, ""); s.Storage != "local" {
		t.Fatalf("storage: %+v", s)
	}
}

func TestInitGitFailures(t *testing.T) {
	gitError := func(err error) string {
		var failure *GitInitError
		if !errors.As(err, &failure) {
			t.Fatalf("not a GitInitError: %v", err)
		}
		return failure.Code
	}
	t.Run("no git writes nothing", func(t *testing.T) {
		root := real(t, t.TempDir())
		host, calls := fakeHost(t, nil)
		host.Environ = []string{"PATH=" + real(t, t.TempDir())}
		if _, err := InitGit(root, "", host); gitError(err) != "git_missing" || len(*calls) != 0 {
			t.Fatal(err, *calls)
		}
		if _, err := os.Lstat(filepath.Join(root, ".git")); !os.IsNotExist(err) {
			t.Fatal(".git written without git", err)
		}
	})
	t.Run("a failed git init leaves no .git", func(t *testing.T) {
		root := real(t, t.TempDir())
		host, _ := fakeHost(t, func(dir string) error {
			put(t, dir, ".git/HEAD", "partial")
			return errors.New("exit status 128")
		})
		if _, err := InitGit(root, "", host); gitError(err) != "git_init_failed" {
			t.Fatal(err)
		}
		if _, err := os.Lstat(filepath.Join(root, ".git")); !os.IsNotExist(err) {
			t.Fatal(".git left after a failed init", err)
		}
	})
	t.Run("an init git reports but ReadGit cannot read fails", func(t *testing.T) {
		root := real(t, t.TempDir())
		host, _ := fakeHost(t, func(string) error { return nil })
		if _, err := InitGit(root, "", host); gitError(err) != "git_init_failed" {
			t.Fatal(err)
		}
		if _, err := os.Lstat(filepath.Join(root, ".git")); !os.IsNotExist(err) {
			t.Fatal(".git left after an unreadable init", err)
		}
	})
	t.Run("a .git that appeared first is left alone", func(t *testing.T) {
		root := real(t, t.TempDir())
		put(t, root, ".git/HEAD", "ref: refs/heads/theirs\n")
		host, calls := fakeHost(t, nil)
		if _, err := InitGit(root, "", host); gitError(err) != "git_init_failed" || len(*calls) != 0 {
			t.Fatal(err, *calls)
		}
		if data, _ := os.ReadFile(filepath.Join(root, ".git/HEAD")); string(data) != "ref: refs/heads/theirs\n" {
			t.Fatal(string(data))
		}
	})
	t.Run("a .git replaced during init is not removed", func(t *testing.T) {
		root := real(t, t.TempDir())
		host, _ := fakeHost(t, func(dir string) error {
			os.RemoveAll(filepath.Join(dir, ".git"))
			put(t, dir, ".git/HEAD", "ref: refs/heads/theirs\n")
			return errors.New("exit status 128")
		})
		if _, err := InitGit(root, "", host); gitError(err) != "git_init_failed" {
			t.Fatal(err)
		}
		if _, err := os.Stat(filepath.Join(root, ".git/HEAD")); err != nil {
			t.Fatal("removed a .git another process made", err)
		}
	})
	t.Run("a .git that cannot be removed is cleanup_failed with its path", func(t *testing.T) {
		root := real(t, t.TempDir())
		locked := filepath.Join(root, ".git/locked")
		t.Cleanup(func() { os.Chmod(locked, 0755) })
		host, _ := fakeHost(t, func(dir string) error {
			put(t, dir, ".git/locked/file", "x")
			os.Chmod(locked, 0555)
			return errors.New("exit status 128")
		})
		_, err := InitGit(root, "", host)
		var failure *GitInitError
		if !errors.As(err, &failure) || failure.Code != "cleanup_failed" || failure.Path != filepath.Join(root, ".git") {
			t.Fatalf("%+v", err)
		}
	})
	t.Run("a path with spaces and decomposed Unicode", func(t *testing.T) {
		root := filepath.Join(real(t, t.TempDir()), "my designs", "café")
		os.MkdirAll(root, 0755)
		host, calls := fakeHost(t, nil)
		if _, err := InitGit(root, "", host); err != nil {
			t.Fatal(err)
		}
		if (*calls)[0][1] != root || !strings.HasSuffix(root, "café") {
			t.Fatalf("ran in %q", (*calls)[0][1])
		}
		if _, err := os.Stat(filepath.Join(root, ".git/HEAD")); err != nil {
			t.Fatal(err)
		}
	})
}
