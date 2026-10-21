package repo

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

type State string

const (
	Inside  State = "inside"
	Missing State = "missing"
	Outside State = "outside"
)

func outside(rel string) bool {
	return rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// Unexpected filesystem errors stay distinct from missing paths.
func Resolve(root, base, p string) (State, string, error) {
	if filepath.IsAbs(p) {
		return Outside, "", nil
	}
	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		return "", "", err
	}
	if !filepath.IsAbs(base) {
		base = filepath.Join(absoluteRoot, base)
	}
	candidate := filepath.Join(base, p)
	rel, err := filepath.Rel(absoluteRoot, candidate)
	if err != nil {
		return "", "", err
	}
	if outside(rel) {
		return Outside, "", nil
	}
	resolved, err := filepath.EvalSymlinks(candidate)
	if err != nil {
		if missingPath(err) {
			return Missing, "", nil
		}
		return "", "", err
	}
	realRoot, err := filepath.EvalSymlinks(absoluteRoot)
	if err != nil {
		return "", "", err
	}
	rel, err = filepath.Rel(realRoot, resolved)
	if err != nil {
		return "", "", err
	}
	if outside(rel) {
		return Outside, "", nil
	}
	rel, err = diskSpelling(realRoot, rel)
	if err != nil {
		if missingPath(err) {
			return Missing, "", nil
		}
		return "", "", err
	}
	return Inside, filepath.ToSlash(rel), nil
}

func missingPath(err error) bool {
	if os.IsNotExist(err) {
		return true
	}
	for _, code := range []error{syscall.ENOENT, syscall.ENOTDIR, syscall.EINVAL, syscall.ENAMETOOLONG, syscall.ELOOP} {
		if errors.Is(err, code) {
			return true
		}
	}
	// filepath.EvalSymlinks reports its own traversal limit without wrapping ELOOP.
	return err.Error() == "EvalSymlinks: too many links"
}

func diskSpelling(root, rel string) (string, error) {
	if rel == "." {
		return rel, nil
	}
	parts := strings.Split(rel, string(filepath.Separator))
	dir := root
	for i, part := range parts {
		entries, err := os.ReadDir(dir)
		if err != nil {
			return "", err
		}
		name := ""
		for _, entry := range entries {
			if entry.Name() == part {
				name = entry.Name()
				break
			}
		}
		if name == "" {
			for _, entry := range entries {
				if strings.EqualFold(entry.Name(), part) {
					name = entry.Name()
					break
				}
			}
		}
		if name == "" {
			return "", &os.PathError{Op: "readdir", Path: filepath.Join(dir, part), Err: os.ErrNotExist}
		}
		parts[i] = name
		dir = filepath.Join(dir, name)
	}
	return filepath.Join(parts...), nil
}
