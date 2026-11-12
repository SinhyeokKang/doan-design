package repo

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"

	"golang.org/x/sys/unix"
)

// GitHost is how the CLI finds and runs git. Run fills it from the process; tests use fakes.
type GitHost struct {
	// Environ is the CLI's environment; PATH, DEVELOPER_DIR, HOME and LANG are read from it. The app passes the
	// login shell's PATH and the DEVELOPER_DIR clone uses, so this finds the git clone would.
	Environ    []string
	Executable func(path string) bool
	Realpath   func(path string) (string, bool)
	Readlink   func(path string) (string, error)
	Run        func(git, dir string, args, env []string) error
}

func SystemGitHost(environ []string) GitHost {
	return GitHost{
		Environ: environ,
		Executable: func(path string) bool {
			info, err := os.Stat(path)
			return err == nil && info.Mode().IsRegular() && unix.Access(path, unix.X_OK) == nil
		},
		Realpath: func(path string) (string, bool) {
			resolved, err := filepath.EvalSymlinks(path)
			return resolved, err == nil
		},
		Readlink: os.Readlink,
		// stdin, stdout and stderr stay unconnected: nothing can prompt, and git's words never reach the result.
		Run: func(git, dir string, args, env []string) error {
			cmd := exec.Command(git, args...)
			cmd.Dir = dir
			cmd.Env = env
			return cmd.Run()
		},
	}
}

func lookupEnv(environ []string, name string) (string, bool) {
	for i := len(environ) - 1; i >= 0; i-- {
		if value, ok := strings.CutPrefix(environ[i], name+"="); ok {
			return value, true
		}
	}
	return "", false
}

// LocateGit applies clone's rule (app onboarding locateGit): the first git on PATH, except that macOS's
// /usr/bin/git shim counts only when the active developer directory has git. Otherwise the shim would open the
// Command Line Tools installer.
func LocateGit(path, developerDir string, executable func(string) bool, realpath func(string) (string, bool)) string {
	if path == "" {
		return ""
	}
	for _, dir := range strings.Split(path, ":") {
		// Like the app's findOnPath: a relative entry would depend on the working directory.
		if !filepath.IsAbs(dir) || strings.ContainsRune(dir, 0) {
			continue
		}
		candidate := strings.TrimRight(dir, "/") + "/git"
		if !executable(candidate) {
			continue
		}
		if resolved, ok := realpath(candidate); !ok || resolved != "/usr/bin/git" {
			return candidate
		}
		if executable(filepath.Join(developerDir, "usr/bin/git")) {
			return candidate
		}
		return ""
	}
	return ""
}

// ActiveDeveloperDir reads what xcode-select would use without running it, so no installer window opens.
func ActiveDeveloperDir(env string, readlink func(string) (string, error)) string {
	if env != "" {
		return env
	}
	if target, err := readlink("/var/db/xcode_select_link"); err == nil && target != "" {
		return target
	}
	return "/Library/Developer/CommandLineTools"
}

// GitEnv starts from nothing: GIT_DIR, GIT_WORK_TREE, GIT_CONFIG_* and the rest of the launching shell's GIT_*
// could point init at another repository or change what it writes.
func GitEnv(base []string) []string {
	env := []string{}
	for _, name := range []string{"HOME", "PATH", "DEVELOPER_DIR", "LANG"} {
		if value, ok := lookupEnv(base, name); ok {
			env = append(env, name+"="+value)
		}
	}
	return append(env, "GIT_TERMINAL_PROMPT=0")
}

// GitInitArgs copies no template, so no hook samples; the user's init.defaultBranch and object format still apply.
func GitInitArgs() []string { return []string{"init", "--quiet", "--template="} }

// AtOrAboveHome mirrors ReadStorage ignoring a .git at or above HOME: Doan never makes a repository there either.
// An unknown HOME (unset or empty) counts every folder as HOME, so a repository is never made at a HOME Doan
// could not see.
func AtOrAboveHome(root, home string) bool {
	if home == "" {
		return true
	}
	if canonical, ok := gitDirectory(home); ok {
		home = canonical
	} else {
		home = filepath.Clean(home)
	}
	if canonical, ok := gitDirectory(root); ok {
		root = canonical
	}
	return ignoreAtOrAboveHome(root, home)
}

var ErrGitExists = errors.New(".git already exists")

// ClaimedGit is the .git directory this run created, by identity, so a rollback never removes one another process
// put in its place.
type ClaimedGit struct {
	Path     string
	dev, ino uint64
}

func ClaimGitDir(root string) (ClaimedGit, error) {
	path := filepath.Join(root, ".git")
	// Mkdir neither follows nor replaces anything at the path, a dangling link included.
	if err := os.Mkdir(path, 0755); err != nil {
		if errors.Is(err, os.ErrExist) {
			return ClaimedGit{}, ErrGitExists
		}
		return ClaimedGit{}, err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return ClaimedGit{}, err
	}
	claimed := ClaimedGit{Path: path}
	if st, ok := info.Sys().(*syscall.Stat_t); ok {
		claimed.dev, claimed.ino = uint64(st.Dev), uint64(st.Ino)
	}
	if !claimed.Owns(info) {
		return ClaimedGit{}, errors.New(".git changed while claiming it")
	}
	return claimed, nil
}

func (c ClaimedGit) Owns(info os.FileInfo) bool {
	if c.Path == "" || info == nil || !info.IsDir() {
		return false
	}
	st, ok := info.Sys().(*syscall.Stat_t)
	return ok && uint64(st.Dev) == c.dev && uint64(st.Ino) == c.ino
}

// RollbackGit removes the claimed .git only while it is still the one this run created.
func RollbackGit(c ClaimedGit) (bool, error) {
	if c.Path == "" {
		return false, nil
	}
	info, err := os.Lstat(c.Path)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !c.Owns(info) {
		return false, nil
	}
	if err := os.RemoveAll(c.Path); err != nil {
		return false, err
	}
	return true, nil
}

// GitInitError codes: git_missing and git_init_failed write nothing (a failed init is rolled back); cleanup_failed
// leaves the .git at Path.
type GitInitError struct {
	Code string
	Path string
	Err  error
}

func (e *GitInitError) Error() string {
	if e.Err != nil {
		return e.Code + ": " + e.Err.Error()
	}
	return e.Code
}
func (e *GitInitError) Unwrap() error { return e.Err }

// InitGit makes root a Git repository: claim .git exclusively, run git init in it, and check ReadGit reads it.
// The caller rolls the returned claim back when a later step fails.
func InitGit(root, home string, host GitHost) (ClaimedGit, error) {
	path, _ := lookupEnv(host.Environ, "PATH")
	developerDir, _ := lookupEnv(host.Environ, "DEVELOPER_DIR")
	git := LocateGit(path, ActiveDeveloperDir(developerDir, host.Readlink), host.Executable, host.Realpath)
	if git == "" {
		return ClaimedGit{}, &GitInitError{Code: "git_missing"}
	}
	claimed, err := ClaimGitDir(root)
	if err != nil {
		return ClaimedGit{}, &GitInitError{Code: "git_init_failed", Err: err}
	}
	failed := host.Run(git, root, GitInitArgs(), GitEnv(host.Environ))
	if failed == nil && (ReadGit(root, home) == nil || ReadStorage(root, home).Reason == "not_git") {
		failed = errors.New("git init left no readable repository")
	}
	if failed == nil {
		return claimed, nil
	}
	if _, err := RollbackGit(claimed); err != nil {
		return ClaimedGit{}, &GitInitError{Code: "cleanup_failed", Path: claimed.Path, Err: err}
	}
	return ClaimedGit{}, &GitInitError{Code: "git_init_failed", Err: failed}
}
