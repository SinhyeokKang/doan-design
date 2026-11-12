package repo

import (
	"errors"
	"os"
)

// GitHost is how the CLI finds and runs git. Run fills it from the process; tests use fakes.
type GitHost struct {
	// Environ is the CLI's environment; PATH, DEVELOPER_DIR, HOME and LANG are read from it.
	Environ    []string
	Executable func(path string) bool
	Realpath   func(path string) (string, bool)
	Readlink   func(path string) (string, error)
	Run        func(git, dir string, args, env []string) error
}

func SystemGitHost(environ []string) GitHost { return GitHost{Environ: environ} }

func LocateGit(path, developerDir string, executable func(string) bool, realpath func(string) (string, bool)) string {
	return ""
}

func ActiveDeveloperDir(env string, readlink func(string) (string, error)) string { return "" }

func GitEnv(base []string) []string { return nil }

func GitInitArgs() []string { return nil }

func AtOrAboveHome(root, home string) bool { return false }

var ErrGitExists = errors.New(".git already exists")

type ClaimedGit struct {
	Path     string
	dev, ino uint64
}

func ClaimGitDir(root string) (ClaimedGit, error) { return ClaimedGit{}, nil }

func (c ClaimedGit) Owns(info os.FileInfo) bool { return false }

func RollbackGit(c ClaimedGit) (bool, error) { return false, nil }

type GitInitError struct {
	Code string
	Path string
	Err  error
}

func (e *GitInitError) Error() string { return e.Code }
func (e *GitInitError) Unwrap() error { return e.Err }

func InitGit(root, home string, host GitHost) (ClaimedGit, error) { return ClaimedGit{}, nil }
