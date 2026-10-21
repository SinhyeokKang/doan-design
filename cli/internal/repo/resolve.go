package repo

import (
	"os"
	"path/filepath"
	"strings"
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
		if os.IsNotExist(err) {
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
	return Inside, filepath.ToSlash(rel), nil
}
