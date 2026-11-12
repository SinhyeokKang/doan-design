package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"syscall"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

// gitInitFolder is a folder in no Git repository, a separate HOME, and a git host whose git is a fake: a run
// records its call and writes what `git init --template=` leaves, unless run says otherwise.
type gitInitFolder struct {
	base, home, root, bin string
	calls                 [][]string
	envs                  [][]string
	run                   func(dir string) error
}

func newGitInitFolder(t *testing.T) *gitInitFolder {
	t.Helper()
	base := realPath(t, t.TempDir())
	g := &gitInitFolder{base: base, home: filepath.Join(base, "home"), root: filepath.Join(base, "work", "project"), bin: filepath.Join(base, "bin")}
	for _, dir := range []string{g.home, g.root, g.bin} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatal(err)
		}
	}
	putFile(t, g.bin, "git", "#!/bin/sh\nexit 1\n")
	os.Chmod(filepath.Join(g.bin, "git"), 0755)
	return g
}

func (g *gitInitFolder) context(t *testing.T) Context {
	host := repo.SystemGitHost([]string{"PATH=" + g.bin, "HOME=" + g.home, "LANG=en_US.UTF-8", "GIT_DIR=" + filepath.Join(g.base, "elsewhere"), "GIT_WORK_TREE=" + g.base})
	host.Run = func(git, dir string, args, env []string) error {
		g.calls = append(g.calls, append([]string{git, dir}, args...))
		g.envs = append(g.envs, env)
		if g.run != nil {
			return g.run(dir)
		}
		putFile(t, dir, ".git/HEAD", "ref: refs/heads/main\n")
		os.MkdirAll(filepath.Join(dir, ".git/objects"), 0755)
		os.MkdirAll(filepath.Join(dir, ".git/refs/heads"), 0755)
		return nil
	}
	return Context{Start: g.base, Home: g.home, Git: host}
}

func gitInitFlags(root string, storage string, gitInit bool) Flags {
	f := Flags{Repo: root, Storage: storage, GitInit: gitInit, JSON: true, Given: map[string]bool{}}
	if storage != "" {
		f.Given["storage"] = true
	}
	if gitInit {
		f.Given["git-init"] = true
	}
	return f
}

func assertAbsent(t *testing.T, root string, paths ...string) {
	t.Helper()
	for _, p := range paths {
		if _, err := os.Lstat(filepath.Join(root, p)); !os.IsNotExist(err) {
			t.Errorf("%s exists: %v", p, err)
		}
	}
}

func excludeHasPair(t *testing.T, gitdir string) bool {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(gitdir, "info/exclude"))
	return err == nil && repo.HasStoragePair(data, "/.doan/")
}

func TestInitGitInitCreatesTheRepositoryFirst(t *testing.T) {
	g := newGitInitFolder(t)
	out, failure := Init(g.context(t), gitInitFlags(g.root, "local", true), nil)
	if failure != nil {
		t.Fatalf("%+v", failure)
	}
	result := out.Result.(map[string]any)
	if want := []string{".doan/canvases/", ".doan/config.json", ".git/", ".git/info/exclude"}; !reflect.DeepEqual(result["created"], want) {
		t.Fatalf("created = %v; want %v", result["created"], want)
	}
	if result["storage"] != "local" || result["initialized"] != true {
		t.Fatal(result)
	}
	if len(g.calls) != 1 || g.calls[0][0] != filepath.Join(g.bin, "git") || g.calls[0][1] != g.root || !reflect.DeepEqual(g.calls[0][2:], repo.GitInitArgs()) {
		t.Fatalf("git runs: %v", g.calls)
	}
	// --template= leaves no info/; the exclude write made it.
	if !excludeHasPair(t, filepath.Join(g.root, ".git")) {
		t.Fatal("exclude pair missing")
	}
	assertAbsent(t, g.root, ".gitattributes")
	// The launching environment's GIT_* never reach git.
	env := g.envs[0]
	if slices.ContainsFunc(env, func(s string) bool { return strings.HasPrefix(s, "GIT_DIR=") || strings.HasPrefix(s, "GIT_WORK_TREE=") }) ||
		!slices.Contains(env, "GIT_TERMINAL_PROMPT=0") || !slices.Contains(env, "PATH="+g.bin) || !slices.Contains(env, "HOME="+g.home) {
		t.Fatalf("git env: %v", env)
	}
	// Setting up the same folder again finds the repository and runs nothing.
	out, failure = Init(g.context(t), gitInitFlags(g.root, "", false), nil)
	if failure != nil || len(g.calls) != 1 || out.Result.(map[string]any)["storage"] != "local" {
		t.Fatalf("%+v %v %v", failure, g.calls, out.Result)
	}
}

func TestConfigGitInitCreatesTheRepositoryFirst(t *testing.T) {
	g := newGitInitFolder(t)
	// Include in Git works in a folder in no repository and writes .gitattributes only.
	if _, failure := Init(g.context(t), gitInitFlags(g.root, "repo", false), nil); failure != nil {
		t.Fatalf("%+v", failure)
	}
	assertAbsent(t, g.root, ".git")
	if len(g.calls) != 0 {
		t.Fatal(g.calls)
	}
	out, failure := Config(g.context(t), gitInitFlags(g.root, "local", true), nil)
	if failure != nil {
		t.Fatalf("%+v", failure)
	}
	result := out.Result.(map[string]any)
	if !reflect.DeepEqual(result["written"], []string{".git/", ".git/info/exclude"}) || result["storage"] != "local" || result["changed"] != true {
		t.Fatal(result)
	}
	if len(g.calls) != 1 || !excludeHasPair(t, filepath.Join(g.root, ".git")) {
		t.Fatal(g.calls)
	}
	// Doan's .gitattributes line stays, as in every switch.
	if !strings.Contains(readFile(t, g.root, ".gitattributes"), ".doan/** linguist-documentation") {
		t.Fatal("attributes removed")
	}
	// Back to Include in Git: the repository stays.
	if _, failure := Config(g.context(t), gitInitFlags(g.root, "repo", false), nil); failure != nil {
		t.Fatalf("%+v", failure)
	}
	if _, err := os.Stat(filepath.Join(g.root, ".git/HEAD")); err != nil || len(g.calls) != 1 {
		t.Fatal(err, g.calls)
	}
}

func TestGitInitWithoutTheFlagRefuses(t *testing.T) {
	g := newGitInitFolder(t)
	consent := func(failure *Error) {
		t.Helper()
		if failure == nil || failure.Code != "local_not_git" || ExitCode(failure.Code) != 5 {
			t.Fatalf("%+v", failure)
		}
		if !slices.ContainsFunc(failure.NextSteps, func(s string) bool { return strings.Contains(s, "Ask the user") && strings.Contains(s, "--git-init") }) {
			t.Fatalf("nextSteps: %v", failure.NextSteps)
		}
	}
	_, failure := Init(g.context(t), gitInitFlags(g.root, "local", false), nil)
	consent(failure)
	assertAbsent(t, g.root, ".git", ".doan")
	if _, failure := Init(g.context(t), gitInitFlags(g.root, "repo", false), nil); failure != nil {
		t.Fatal(failure)
	}
	_, failure = Config(g.context(t), gitInitFlags(g.root, "local", false), nil)
	consent(failure)
	assertAbsent(t, g.root, ".git")
	if len(g.calls) != 0 {
		t.Fatal(g.calls)
	}
}

func TestGitInitNeedsStorageLocal(t *testing.T) {
	g := newGitInitFolder(t)
	for _, storage := range []string{"", "repo"} {
		_, failure := Init(g.context(t), gitInitFlags(g.root, storage, true), nil)
		if failure == nil || failure.Code != "usage_error" {
			t.Fatalf("init --storage %q --git-init: %+v", storage, failure)
		}
		assertAbsent(t, g.root, ".git", ".doan", ".gitattributes")
	}
	if _, failure := Init(g.context(t), gitInitFlags(g.root, "repo", false), nil); failure != nil {
		t.Fatal(failure)
	}
	for _, storage := range []string{"", "repo"} {
		_, failure := Config(g.context(t), gitInitFlags(g.root, storage, true), nil)
		if failure == nil || failure.Code != "usage_error" {
			t.Fatalf("config --storage %q --git-init: %+v", storage, failure)
		}
	}
	if len(g.calls) != 0 {
		t.Fatal(g.calls)
	}
	// The flag parser takes --git-init for init and config only.
	for _, args := range [][]string{{"init", "--git-init"}, {"config", "--git-init"}, {"ls", "--git-init"}} {
		var out, errOut bytes.Buffer
		code := Run(append(args, "--repo", g.root, "--json"), strings.NewReader(""), &out, &errOut)
		var envelope struct {
			Error Error `json:"error"`
		}
		json.Unmarshal(out.Bytes(), &envelope)
		unsupported := strings.Contains(envelope.Error.Message, "not supported")
		if code != 2 || envelope.Error.Code != "usage_error" || unsupported != (args[0] == "ls") {
			t.Fatalf("%v: %d %+v", args, code, envelope.Error)
		}
	}
}

func TestGitInitSkipsAFolderAlreadyInARepository(t *testing.T) {
	t.Run("its own repository", func(t *testing.T) {
		g := newGitInitFolder(t)
		putFile(t, g.root, ".git/HEAD", "ref: refs/heads/main\n")
		out, failure := Init(g.context(t), gitInitFlags(g.root, "local", true), nil)
		if failure != nil || len(g.calls) != 0 {
			t.Fatalf("%+v %v", failure, g.calls)
		}
		if created := out.Result.(map[string]any)["created"].([]string); slices.Contains(created, ".git/") {
			t.Fatal(created)
		}
	})
	t.Run("a parent repository", func(t *testing.T) {
		g := newGitInitFolder(t)
		parent := filepath.Dir(g.root)
		putFile(t, parent, ".git/HEAD", "ref: refs/heads/main\n")
		if _, failure := Init(g.context(t), gitInitFlags(g.root, "local", true), nil); failure != nil || len(g.calls) != 0 {
			t.Fatalf("%+v %v", failure, g.calls)
		}
		assertAbsent(t, g.root, ".git")
		data, _ := os.ReadFile(filepath.Join(parent, ".git/info/exclude"))
		if !repo.HasStoragePair(data, "/project/.doan/") {
			t.Fatalf("parent exclude: %q", data)
		}
	})
	t.Run("a .git file or a dangling .git link", func(t *testing.T) {
		for _, kind := range []string{"file", "dangling"} {
			g := newGitInitFolder(t)
			if kind == "file" {
				putFile(t, g.root, ".git", "gitdir: "+filepath.Join(g.base, "missing")+"\n")
			} else {
				os.Symlink(filepath.Join(g.base, "missing"), filepath.Join(g.root, ".git"))
			}
			_, failure := Init(g.context(t), gitInitFlags(g.root, "local", true), nil)
			if failure == nil || failure.Code != "local_exclude_failed" || len(g.calls) != 0 {
				t.Fatalf("%s: %+v %v", kind, failure, g.calls)
			}
			assertAbsent(t, g.root, ".doan")
		}
	})
}

func assertHomeRefusal(t *testing.T, name string, failure *Error) {
	t.Helper()
	if failure == nil || failure.Code != "local_not_git" || ExitCode(failure.Code) != 5 || !strings.Contains(failure.Message, "doesn’t create a Git repository in your home folder") {
		t.Fatalf("%s: %+v", name, failure)
	}
	// The agent must not be pointed back at the flag HOME refuses.
	if steps := strings.Join(failure.NextSteps, "\n"); len(failure.NextSteps) == 0 || strings.Contains(steps, "--git-init") || !strings.Contains(steps, "Include in Git") {
		t.Fatalf("%s: nextSteps %v", name, failure.NextSteps)
	}
}

func TestGitInitHome(t *testing.T) {
	g := newGitInitFolder(t)
	for _, root := range []string{g.home, g.base} {
		for _, flag := range []bool{true, false} {
			_, failure := Init(g.context(t), gitInitFlags(root, "local", flag), nil)
			assertHomeRefusal(t, fmt.Sprintf("init %s --git-init=%v", root, flag), failure)
			assertAbsent(t, root, ".git", ".doan")
		}
	}
	// config at HOME: set up with repo storage first, which HOME allows.
	if _, failure := Init(g.context(t), gitInitFlags(g.home, "repo", false), nil); failure != nil {
		t.Fatalf("%+v", failure)
	}
	for _, flag := range []bool{true, false} {
		_, failure := Config(g.context(t), gitInitFlags(g.home, "local", flag), nil)
		assertHomeRefusal(t, fmt.Sprintf("config --git-init=%v", flag), failure)
		assertAbsent(t, g.home, ".git")
	}
	if len(g.calls) != 0 {
		t.Fatal(g.calls)
	}
	os.RemoveAll(filepath.Join(g.home, ".doan"))
	os.Remove(filepath.Join(g.home, ".gitattributes"))
	// A dotfiles repository at HOME does not count, so a folder under it gets its own repository.
	putFile(t, g.home, ".git/HEAD", "ref: refs/heads/main\n")
	project := filepath.Join(g.home, "designs")
	os.Mkdir(project, 0755)
	if _, failure := Init(g.context(t), gitInitFlags(project, "local", true), nil); failure != nil {
		t.Fatalf("%+v", failure)
	}
	if len(g.calls) != 1 || g.calls[0][1] != project || !excludeHasPair(t, filepath.Join(project, ".git")) {
		t.Fatal(g.calls)
	}
	if data, _ := os.ReadFile(filepath.Join(g.home, ".git/info/exclude")); len(data) != 0 {
		t.Fatalf("dotfiles exclude written: %q", data)
	}
}

// HOME unset or empty (os.UserHomeDir fails): no folder is provably below HOME, so none gets a repository.
func TestGitInitUnknownHomeRefuses(t *testing.T) {
	g := newGitInitFolder(t)
	ctx := g.context(t)
	ctx.Home = ""
	for _, flag := range []bool{true, false} {
		_, failure := Init(ctx, gitInitFlags(g.root, "local", flag), nil)
		assertHomeRefusal(t, fmt.Sprintf("init --git-init=%v", flag), failure)
		assertAbsent(t, g.root, ".git", ".doan")
	}
	if _, failure := Init(ctx, gitInitFlags(g.root, "repo", false), nil); failure != nil {
		t.Fatalf("%+v", failure)
	}
	for _, flag := range []bool{true, false} {
		_, failure := Config(ctx, gitInitFlags(g.root, "local", flag), nil)
		assertHomeRefusal(t, fmt.Sprintf("config --git-init=%v", flag), failure)
		assertAbsent(t, g.root, ".git")
	}
	if len(g.calls) != 0 {
		t.Fatal(g.calls)
	}
}

func TestGitInitFailuresWriteNothing(t *testing.T) {
	t.Run("git missing", func(t *testing.T) {
		g := newGitInitFolder(t)
		os.Remove(filepath.Join(g.bin, "git"))
		_, failure := Init(g.context(t), gitInitFlags(g.root, "local", true), nil)
		if failure == nil || failure.Code != "git_missing" || ExitCode(failure.Code) != 5 || len(g.calls) != 0 {
			t.Fatalf("%+v %v", failure, g.calls)
		}
		assertAbsent(t, g.root, ".git", ".doan")
	})
	t.Run("git init failed", func(t *testing.T) {
		g := newGitInitFolder(t)
		g.run = func(dir string) error {
			putFile(t, dir, ".git/HEAD", "partial")
			return errors.New("exit status 128")
		}
		_, failure := Init(g.context(t), gitInitFlags(g.root, "local", true), nil)
		if failure == nil || failure.Code != "git_init_failed" || ExitCode(failure.Code) != 2 {
			t.Fatalf("%+v", failure)
		}
		assertAbsent(t, g.root, ".git", ".doan")
		if _, failure := Init(g.context(t), gitInitFlags(g.root, "repo", false), nil); failure != nil {
			t.Fatal(failure)
		}
		_, failure = Config(g.context(t), gitInitFlags(g.root, "local", true), nil)
		if failure == nil || failure.Code != "git_init_failed" {
			t.Fatalf("%+v", failure)
		}
		assertAbsent(t, g.root, ".git")
	})
	t.Run("a .git made by another process during init stays", func(t *testing.T) {
		g := newGitInitFolder(t)
		g.run = func(dir string) error {
			os.RemoveAll(filepath.Join(dir, ".git"))
			putFile(t, dir, ".git/HEAD", "ref: refs/heads/theirs\n")
			return errors.New("exit status 128")
		}
		_, failure := Init(g.context(t), gitInitFlags(g.root, "local", true), nil)
		if failure == nil || failure.Code != "git_init_failed" {
			t.Fatalf("%+v", failure)
		}
		if readFile(t, g.root, ".git/HEAD") != "ref: refs/heads/theirs\n" {
			t.Fatal("another process's .git changed")
		}
	})
	t.Run("a .git that appears before the claim", func(t *testing.T) {
		g := newGitInitFolder(t)
		os.Mkdir(filepath.Join(g.root, ".git"), 0755)
		_, failure := initGit(g.context(t), g.root)
		if failure == nil || failure.Code != "git_init_failed" || ExitCode(failure.Code) != 2 || len(g.calls) != 0 {
			t.Fatalf("%+v %v", failure, g.calls)
		}
		if steps := strings.Join(failure.NextSteps, "\n"); !strings.Contains(steps, "appeared") || !strings.Contains(steps, "doan ls") || strings.Contains(steps, "writable") {
			t.Fatalf("nextSteps: %v", failure.NextSteps)
		}
		if entries, _ := os.ReadDir(filepath.Join(g.root, ".git")); len(entries) != 0 {
			t.Fatal("the existing .git changed")
		}
	})
	t.Run("a .git that cannot be removed", func(t *testing.T) {
		g := newGitInitFolder(t)
		locked := filepath.Join(g.root, ".git/locked")
		t.Cleanup(func() { os.Chmod(locked, 0755) })
		g.run = func(dir string) error {
			putFile(t, dir, ".git/locked/file", "x")
			os.Chmod(locked, 0555)
			return errors.New("exit status 128")
		}
		_, failure := Init(g.context(t), gitInitFlags(g.root, "local", true), nil)
		gitdir := filepath.Join(g.root, ".git")
		if failure == nil || failure.Code != "cleanup_failed" || ExitCode(failure.Code) != 5 || !strings.Contains(failure.Message, gitdir) {
			t.Fatalf("%+v", failure)
		}
		if !slices.ContainsFunc(failure.NextSteps, func(s string) bool { return strings.Contains(s, gitdir) }) {
			t.Fatalf("nextSteps: %v", failure.NextSteps)
		}
		assertAbsent(t, g.root, ".doan")
	})
}

func TestGitInitRollsBackWhenALaterStepFails(t *testing.T) {
	g := newGitInitFolder(t)
	injected := &os.LinkError{Op: "rename", Err: syscall.EIO}
	_, failure := initWithRename(g.context(t), gitInitFlags(g.root, "local", true), nil, func(string, string) error { return injected })
	if failure == nil || failure.Code != "internal_error" || len(g.calls) != 1 {
		t.Fatalf("%+v %v", failure, g.calls)
	}
	assertAbsent(t, g.root, ".git", ".doan/config.json")
	// Only .git is rolled back; the canvases folder stays as for any failed publication.
	if _, err := os.Stat(filepath.Join(g.root, ".doan/canvases")); err != nil {
		t.Fatal(err)
	}
	// A retry with the flag starts over.
	if _, failure := Init(g.context(t), gitInitFlags(g.root, "local", true), nil); failure != nil || len(g.calls) != 2 {
		t.Fatalf("%+v %v", failure, g.calls)
	}

	// config: the exclude write fails after the repository exists.
	g = newGitInitFolder(t)
	if _, failure := Init(g.context(t), gitInitFlags(g.root, "repo", false), nil); failure != nil {
		t.Fatal(failure)
	}
	g.run = func(dir string) error {
		putFile(t, dir, ".git/HEAD", "ref: refs/heads/main\n")
		// A directory where the exclude file goes makes the exclude write fail.
		return os.MkdirAll(filepath.Join(dir, ".git/info/exclude"), 0755)
	}
	_, failure = Config(g.context(t), gitInitFlags(g.root, "local", true), nil)
	if failure == nil || failure.Code != "local_exclude_failed" {
		t.Fatalf("%+v", failure)
	}
	assertAbsent(t, g.root, ".git")
}

func TestGitInitLaterFailureAndUnremovableGitIsCleanupFailed(t *testing.T) {
	g := newGitInitFolder(t)
	locked := filepath.Join(g.root, ".git/locked")
	t.Cleanup(func() { os.Chmod(locked, 0755) })
	g.run = func(dir string) error {
		putFile(t, dir, ".git/HEAD", "ref: refs/heads/main\n")
		os.MkdirAll(filepath.Join(dir, ".git/objects"), 0755)
		os.MkdirAll(filepath.Join(dir, ".git/refs/heads"), 0755)
		putFile(t, dir, ".git/locked/file", "x")
		return os.Chmod(locked, 0555)
	}
	_, failure := initWithRename(g.context(t), gitInitFlags(g.root, "local", true), nil, func(string, string) error {
		return &os.LinkError{Op: "rename", Err: syscall.EIO}
	})
	gitdir := filepath.Join(g.root, ".git")
	if failure == nil || failure.Code != "cleanup_failed" || ExitCode(failure.Code) != 5 || !strings.Contains(failure.Message, gitdir) {
		t.Fatalf("%+v", failure)
	}
	if !slices.ContainsFunc(failure.NextSteps, func(s string) bool { return strings.Contains(s, gitdir) }) {
		t.Fatalf("nextSteps: %v", failure.NextSteps)
	}
}

func TestGitInitPathWithSpacesAndDecomposedUnicode(t *testing.T) {
	g := newGitInitFolder(t)
	root := filepath.Join(g.base, "my designs", "café")
	os.MkdirAll(root, 0755)
	if _, failure := Init(g.context(t), gitInitFlags(root, "local", true), nil); failure != nil {
		t.Fatalf("%+v", failure)
	}
	if len(g.calls) != 1 || g.calls[0][1] != root || !excludeHasPair(t, filepath.Join(root, ".git")) {
		t.Fatal(g.calls)
	}
}

// One run against the real git, when this machine has one Doan would use: the launching shell's GIT_DIR must not
// redirect the repository.
func TestGitInitWithRealGitIgnoresGitDir(t *testing.T) {
	host := repo.SystemGitHost(os.Environ())
	developer := repo.ActiveDeveloperDir(os.Getenv("DEVELOPER_DIR"), os.Readlink)
	if repo.LocateGit(os.Getenv("PATH"), developer, host.Executable, host.Realpath) == "" {
		t.Skip("no git Doan would run")
	}
	g := newGitInitFolder(t)
	elsewhere := filepath.Join(g.base, "elsewhere")
	os.Mkdir(elsewhere, 0755)
	t.Setenv("GIT_DIR", elsewhere)
	t.Setenv("GIT_WORK_TREE", g.base)
	// --template= would mask init.templateDir, so the leak check uses the branch name, which only the allow-list stops.
	t.Setenv("GIT_CONFIG_PARAMETERS", "'init.defaultBranch'='leaked'")
	t.Setenv("HOME", g.home)
	ctx := Context{Start: g.base, Home: g.home, Git: repo.SystemGitHost(os.Environ())}
	out, failure := Init(ctx, gitInitFlags(g.root, "local", true), nil)
	if failure != nil {
		t.Fatalf("%+v", failure)
	}
	if created := out.Result.(map[string]any)["created"].([]string); !slices.Contains(created, ".git/") {
		t.Fatal(created)
	}
	if entries, _ := os.ReadDir(elsewhere); len(entries) != 0 {
		t.Fatalf("GIT_DIR was used: %v", entries)
	}
	assertAbsent(t, g.root, ".git/hooks")
	if head := readFile(t, g.root, ".git/HEAD"); strings.Contains(head, "leaked") {
		t.Fatalf("GIT_CONFIG_PARAMETERS was used: %q", head)
	}
	cmd := exec.Command("git", "-C", g.root, "status", "--porcelain", "--untracked-files=all")
	cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + g.home}
	if status, err := cmd.Output(); err != nil || len(status) != 0 {
		t.Fatalf("git status: %q %v", status, err)
	}
}

func TestListRepoNotFoundCarriesStorageReason(t *testing.T) {
	g := newGitInitFolder(t)
	list := func(root, home string) *Error {
		_, failure := List(Context{Start: g.base, Home: home}, Flags{Repo: root}, nil)
		return failure
	}
	failure := list(g.root, g.home)
	if failure == nil || failure.Code != "repo_not_found" || failure.StorageReason != "not_git" {
		t.Fatalf("%+v", failure)
	}
	// HOME itself is not_git too; init refuses it later.
	if failure := list(g.home, g.home); failure == nil || failure.StorageReason != "not_git" {
		t.Fatalf("%+v", failure)
	}
	putFile(t, g.base, "file.txt", "x")
	inRepo := filepath.Join(g.base, "repo", "sub")
	os.MkdirAll(inRepo, 0755)
	putFile(t, filepath.Join(g.base, "repo"), ".git/HEAD", "ref: refs/heads/main\n")
	for name, root := range map[string]string{"missing": filepath.Join(g.base, "missing"), "file": filepath.Join(g.base, "file.txt"), "in a repository": inRepo} {
		if failure := list(root, g.home); failure == nil || failure.Code != "repo_not_found" || failure.StorageReason != "" {
			t.Errorf("%s: %+v", name, failure)
		}
	}
	// Without --repo, the search starts at the working directory (the shell's re-read and the onboarding inspection).
	_, failure = List(Context{Start: g.root, Home: g.home}, Flags{}, nil)
	if failure == nil || failure.Code != "repo_not_found" || failure.StorageReason != "not_git" {
		t.Fatalf("cwd: %+v", failure)
	}
	if _, failure := List(Context{Start: inRepo, Home: g.home}, Flags{}, nil); failure == nil || failure.Code != "repo_not_found" || failure.StorageReason != "" {
		t.Fatalf("cwd in a repository: %+v", failure)
	}
	// Other commands' repo_not_found never carries it.
	if _, failure := Config(Context{Start: g.base, Home: g.home}, Flags{Repo: g.root, Given: map[string]bool{}}, nil); failure == nil || failure.Code != "repo_not_found" || failure.StorageReason != "" {
		t.Fatalf("%+v", failure)
	}
	// The envelope has the shared fixture's shape (schema/fixtures/cli-envelope/valid/repo-not-found-not-git.json).
	b, _ := json.Marshal(Envelope(nil, list(g.root, g.home)))
	if !strings.Contains(string(b), `"storageReason":"not_git"`) {
		t.Fatal(string(b))
	}
}

func TestGitInitDecision(t *testing.T) {
	home := "/Users/sam"
	notGit := repo.StorageInfo{Storage: "repo", Reason: "not_git"}
	local := gitInitFlags("", "local", true)
	for _, c := range []struct {
		name    string
		storage repo.StorageInfo
		root    string
		flags   Flags
		create  bool
		code    string
	}{
		{"creates", notGit, "/Users/sam/code/app", local, true, ""},
		{"creates outside home", notGit, "/Volumes/work/app", local, true, ""},
		{"no flag", notGit, "/Users/sam/code/app", gitInitFlags("", "local", false), false, ""},
		{"already a repository", repo.StorageInfo{Storage: "repo"}, "/Users/sam/code/app", local, false, ""},
		{"git unreadable", repo.StorageInfo{Storage: "unknown", Reason: "git_unreadable"}, "/Users/sam/code/app", local, false, ""},
		{"home", notGit, "/Users/sam", local, false, "local_not_git"},
		{"home without the flag", notGit, "/Users/sam", gitInitFlags("", "local", false), false, "local_not_git"},
		{"repo storage at home", notGit, "/Users/sam", gitInitFlags("", "repo", false), false, ""},
		{"repository at home", repo.StorageInfo{Storage: "repo"}, "/Users/sam", gitInitFlags("", "local", false), false, ""},
		{"above home", notGit, "/Users", local, false, "local_not_git"},
		{"repo storage", notGit, "/Users/sam/code/app", gitInitFlags("", "repo", true), false, "usage_error"},
		{"flag alone", notGit, "/Users/sam/code/app", gitInitFlags("", "", true), false, "usage_error"},
		{"repo storage on a repository", repo.StorageInfo{Storage: "repo"}, "/Users/sam/code/app", gitInitFlags("", "repo", true), false, "usage_error"},
	} {
		t.Run(c.name, func(t *testing.T) {
			create, failure := gitInitDecision(c.storage, c.root, home, c.flags)
			code := ""
			if failure != nil {
				code = failure.Code
			}
			if create != c.create || code != c.code {
				t.Fatalf("got %v %q; want %v %q", create, code, c.create, c.code)
			}
		})
	}
}

func TestGitInitDecisionUnknownHome(t *testing.T) {
	notGit := repo.StorageInfo{Storage: "repo", Reason: "not_git"}
	for _, flag := range []bool{true, false} {
		if create, failure := gitInitDecision(notGit, "/Volumes/work/app", "", gitInitFlags("", "local", flag)); create || failure == nil || failure.Code != "local_not_git" {
			t.Fatalf("--git-init=%v: %v %+v", flag, create, failure)
		}
	}
}

func TestNotFoundStorageReason(t *testing.T) {
	notGit := repo.StorageInfo{Storage: "repo", Reason: "not_git"}
	for _, c := range []struct {
		searched string
		storage  repo.StorageInfo
		want     string
	}{
		{"/Users/sam/new", notGit, "not_git"},
		{"", notGit, ""},
		{"/Users/sam/repo", repo.StorageInfo{Storage: "repo"}, ""},
		{"/Users/sam/broken", repo.StorageInfo{Storage: "unknown", Reason: "git_unreadable"}, ""},
	} {
		if got := notFoundStorageReason(c.searched, c.storage); got != c.want {
			t.Errorf("%q %+v: %q; want %q", c.searched, c.storage, got, c.want)
		}
	}
}

func TestOnboardingStepsForGitInitFailures(t *testing.T) {
	// The table knows only the code, and clone needs Git whatever the storage, so --storage repo is advice for
	// selecting a folder only.
	if steps := strings.Join(onboardingFailure("git_missing", "m").NextSteps, "\n"); strings.Contains(steps, "or use --storage repo") || !strings.Contains(steps, "when selecting a folder") {
		t.Errorf("git_missing: %s", steps)
	}
	for code, want := range map[string]string{"git_missing": "xcode-select --install", "cleanup_failed": "remove it or keep it"} {
		if steps := onboardingFailure(code, "m").NextSteps; !strings.Contains(strings.Join(steps, "\n"), want) {
			t.Errorf("%s: %v", code, steps)
		}
	}
}
