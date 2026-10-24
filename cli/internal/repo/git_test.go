package repo

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
)

func TestGitInfoLayouts(t *testing.T) {
	for _, monorepo := range []bool{false, true} {
		t.Run(fmt.Sprint(monorepo), func(t *testing.T) {
			base := real(t, t.TempDir())
			main := filepath.Join(base, "main")
			linked := filepath.Join(base, "linked")
			put(t, main, ".git/HEAD", "ref: refs/heads/main\r\n")
			put(t, linked, ".git", "gitdir: ../main/.git/worktrees/topic\n")
			put(t, main, ".git/worktrees/topic/HEAD", strings.Repeat("a", 40)+"\n")
			put(t, main, ".git/worktrees/topic/commondir", "../..\n")
			put(t, main, ".git/worktrees/topic/gitdir", "../../../../linked/.git\n")
			put(t, main, ".git/worktrees/pruned/gitdir", filepath.Join(base, "missing/.git"))
			rel := ""
			if monorepo {
				rel = "apps/design"
				put(t, main, rel+"/keep", "")
				put(t, linked, rel+"/keep", "")
			}
			wantTrees := []string{filepath.Join(linked, rel), filepath.Join(main, rel)}
			for _, root := range wantTrees {
				got := ReadGit(root, "")
				if got == nil || got.Common != filepath.Join(main, ".git") || got.Main != filepath.Join(main, rel) || !reflect.DeepEqual(got.Worktrees, wantTrees) {
					t.Fatalf("%s: %+v", root, got)
				}
				if root == filepath.Join(linked, rel) {
					if got.Detached != strings.Repeat("a", 40) || got.Branch != "" {
						t.Fatal(got)
					}
				} else if got.Branch != "main" {
					t.Fatal(got)
				}
			}
		})
	}
}

func TestGitInfoUnavailable(t *testing.T) {
	for _, kind := range []string{"non-git", "broken", "loop", "not-directory", "empty", "oversized-gitfile", "oversized-head", "oversized-common", "missing-head"} {
		t.Run(kind, func(t *testing.T) {
			root := t.TempDir()
			switch kind {
			case "broken":
				put(t, root, ".git", "gitdir: missing\n")
			case "loop":
				link(t, ".git", filepath.Join(root, ".git"))
			case "not-directory":
				put(t, root, "file", "")
				put(t, root, ".git", "gitdir: file/child")
			case "empty":
				put(t, root, ".git", "")
			case "oversized-gitfile":
				put(t, root, ".git", "gitdir: "+strings.Repeat("x", 4096))
			case "oversized-head":
				put(t, root, ".git/HEAD", strings.Repeat("x", 4097))
			case "oversized-common":
				put(t, root, ".git", "gitdir: meta")
				put(t, root, "meta/HEAD", "ref: refs/heads/main")
				put(t, root, "meta/commondir", strings.Repeat("x", 4097))
			case "missing-head":
				put(t, root, ".git/config", "")
			}
			if got := ReadGit(root, ""); got != nil {
				t.Fatalf("got %+v", got)
			}
		})
	}
}

func TestGitInfoHomeAndNearest(t *testing.T) {
	home := real(t, t.TempDir())
	put(t, home, ".git/HEAD", "ref: refs/heads/dotfiles")
	child := filepath.Join(home, "code/project")
	put(t, child, "keep", "")
	if ReadGit(child, home) != nil || ReadGit(home, home) != nil {
		t.Fatal("home git leaked")
	}
	put(t, child, ".git/HEAD", "ref: refs/heads/project")
	if got := ReadGit(child, home); got == nil || got.Branch != "project" {
		t.Fatal(got)
	}
	inner := filepath.Join(child, "inner")
	put(t, inner, ".git", "broken")
	if got := ReadGit(inner, home); got != nil {
		t.Fatal("fell through broken nearest git", got)
	}
}

func TestGitInfoNonMainAndUnsupportedHead(t *testing.T) {
	for _, metadata := range []string{"bare.git", "parent/.git/modules/sub", "separate-storage"} {
		t.Run(metadata, func(t *testing.T) {
			base := real(t, t.TempDir())
			root := filepath.Join(base, "work")
			meta := filepath.Join(base, metadata)
			put(t, root, ".git", "gitdir: "+meta)
			put(t, meta, "HEAD", "ref: refs/heads/.invalid")
			got := ReadGit(root, "")
			if got == nil || got.Main != "" || got.Common != meta || got.Branch != "" || !reflect.DeepEqual(got.Worktrees, []string{root}) {
				t.Fatalf("%+v", got)
			}
		})
	}
}

func TestGitInfoCanonicalAndMissingMapping(t *testing.T) {
	base := real(t, t.TempDir())
	main := filepath.Join(base, "Main")
	root := filepath.Join(base, "linked")
	put(t, main, ".git/HEAD", "ref: refs/heads/main")
	put(t, root, ".git", "gitdir: ../Main/.git/worktrees/topic")
	put(t, main, ".git/worktrees/topic/HEAD", "ref: refs/heads/topic")
	put(t, main, ".git/worktrees/topic/commondir", "../..")
	put(t, main, ".git/worktrees/topic/gitdir", filepath.Join(root, ".git"))
	put(t, root, "app/keep", "")
	alias := filepath.Join(base, "alias")
	link(t, root, alias)
	got := ReadGit(filepath.Join(alias, "app"), "")
	if got == nil || got.Main != "" || !reflect.DeepEqual(got.Worktrees, []string{filepath.Join(root, "app")}) {
		t.Fatal(got)
	}
	if _, err := os.Stat(filepath.Join(base, "MAIN")); err == nil {
		got = ReadGit(filepath.Join(base, "MAIN"), "")
		if got == nil || got.Main != main || got.Common != filepath.Join(main, ".git") {
			t.Fatalf("case normalization: %+v", got)
		}
	}
}

func TestGitInfoLimitsAndInvalidEntries(t *testing.T) {
	base := real(t, t.TempDir())
	main := filepath.Join(base, "main")
	put(t, main, ".git/HEAD", "ref: refs/heads/main")
	for i := 0; i < 205; i++ {
		root := filepath.Join(base, fmt.Sprintf("tree%03d", i))
		put(t, root, ".git", "placeholder")
		put(t, main, fmt.Sprintf(".git/worktrees/%03d/gitdir", i), filepath.Join(root, ".git"))
	}
	got := ReadGit(main, "")
	if got == nil || len(got.Worktrees) != 200 || !sort.StringsAreSorted(got.Worktrees) {
		t.Fatal(got)
	}
	found := false
	for _, root := range got.Worktrees {
		if root == main {
			found = true
		}
	}
	if !found {
		t.Fatal("self missing")
	}
	root := real(t, t.TempDir())
	put(t, root, ".git/HEAD", "ref: refs/heads/main")
	put(t, root, ".git/worktrees/oversized/gitdir", strings.Repeat("x", 4097))
	put(t, root, ".git/worktrees/broken/gitdir", "/missing/.git")
	got = ReadGit(root, "")
	if got == nil || !reflect.DeepEqual(got.Worktrees, []string{root}) {
		t.Fatal(got)
	}
}

func TestGitInfoRealGit(t *testing.T) {
	git, err := exec.LookPath("git")
	if err != nil {
		t.Skip("git is unavailable")
	}
	base := real(t, t.TempDir())
	home := filepath.Join(base, "home")
	if err := os.Mkdir(home, 0755); err != nil {
		t.Fatal(err)
	}
	main := filepath.Join(base, "main")
	linked := filepath.Join(base, "linked")
	run := func(args ...string) {
		t.Helper()
		cmd := exec.Command(git, args...)
		cmd.Env = []string{"HOME=" + home, "PATH=" + os.Getenv("PATH"), "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=" + filepath.Join(home, ".gitconfig")}
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v: %s", args, err, out)
		}
	}
	run("init", "-b", "main", main)
	run("-C", main, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "fixture")
	run("-C", main, "worktree", "add", "-b", "topic", linked)
	got := ReadGit(linked, home)
	want := []string{linked, main}
	sort.Strings(want)
	if got == nil || got.Branch != "topic" || got.Main != main || !reflect.DeepEqual(got.Worktrees, want) {
		t.Fatal(got)
	}
}
