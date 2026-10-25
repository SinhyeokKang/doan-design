package repo

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

type Error struct {
	Code    string
	Message string
	Cause   error
}

func (e *Error) Error() string { return e.Message }
func (e *Error) Unwrap() error { return e.Cause }

type Repository struct {
	Root   string
	Config Config
}

func Find(start, repoFlag string) (Repository, error) {
	dir := start
	if repoFlag != "" {
		dir = repoFlag
		if !filepath.IsAbs(dir) {
			dir = filepath.Join(start, dir)
		}
	}
	absolute, err := filepath.Abs(dir)
	if err != nil {
		return Repository{}, &Error{Code: "internal_error", Message: err.Error(), Cause: err}
	}
	dir, err = filepath.EvalSymlinks(absolute)
	if err != nil {
		code := "internal_error"
		if IsMissingPath(err) {
			code = "repo_not_found"
		}
		return Repository{}, &Error{Code: code, Message: err.Error(), Cause: err}
	}
	// EvalSymlinks keeps caller case and Unicode normalization, so one repo
	// would get several roots. An unlistable ancestor keeps this best effort
	// lookup from replacing the already resolved path.
	if rel, err := diskSpelling(string(filepath.Separator), strings.TrimPrefix(dir, string(filepath.Separator))); err == nil {
		dir = filepath.Join(string(filepath.Separator), rel)
	}
	info, err := os.Stat(dir)
	if err != nil {
		code := "internal_error"
		if IsMissingPath(err) {
			code = "repo_not_found"
		}
		return Repository{}, &Error{Code: code, Message: err.Error(), Cause: err}
	}
	if !info.IsDir() {
		return Repository{}, &Error{Code: "repo_not_found", Message: "Repository path is not a directory"}
	}
	for {
		path := filepath.Join(dir, ".doan", "config.json")
		info, err := os.Stat(path)
		if err == nil {
			if !info.Mode().IsRegular() {
				return Repository{}, &Error{Code: "invalid_config", Message: "Config is not a regular file: " + path}
			}
			data, err := os.ReadFile(path)
			if err != nil {
				return Repository{}, &Error{Code: "internal_error", Message: err.Error(), Cause: err}
			}
			config, code := ParseConfig(data)
			if code != "" {
				return Repository{}, &Error{Code: code, Message: fmt.Sprintf("Cannot read config: %s", path)}
			}
			return Repository{Root: dir, Config: config}, nil
		}
		if !os.IsNotExist(err) && !errors.Is(err, syscall.ENOTDIR) {
			return Repository{}, &Error{Code: "internal_error", Message: err.Error(), Cause: err}
		}
		parent := filepath.Dir(dir)
		if repoFlag != "" || parent == dir {
			break
		}
		dir = parent
	}
	return Repository{}, &Error{Code: "repo_not_found", Message: "No .doan/config.json found"}
}
