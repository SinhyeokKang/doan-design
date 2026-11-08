package repo

import (
	"path/filepath"
	"strings"
)

func InsideRelative(root, abs string) (State, string, error) {
	if !filepath.IsAbs(abs) {
		return Outside, "", nil
	}
	realRoot, err := filepath.Abs(root)
	if err != nil {
		return "", "", err
	}
	// The lexical check comes first, so a missing path above the root is outside, not missing.
	rel, err := filepath.Rel(realRoot, abs)
	if err != nil {
		return "", "", err
	}
	if outside(rel) {
		state, err := throughRootAlias(realRoot, abs)
		if err != nil || state != Inside {
			return state, "", err
		}
	}
	paths := []string{realRoot, abs}
	for i, p := range paths {
		paths[i], err = canonical(p)
		if err != nil {
			if IsMissingPath(err) {
				return Missing, "", nil
			}
			return "", "", err
		}
	}
	rel, err = filepath.Rel(paths[0], paths[1])
	if err != nil {
		return "", "", err
	}
	if outside(rel) {
		return Outside, "", nil
	}
	return Inside, filepath.ToSlash(rel), nil
}

// throughRootAlias decides a path that is lexically outside this spelling of the root. It is still inside when
// it reaches the root through another spelling (a linked ancestor, or the root itself named through a link), so
// the part of it that exists is resolved and the missing rest compared lexically.
func throughRootAlias(root, abs string) (State, error) {
	realRoot, err := canonical(root)
	if err != nil {
		if IsMissingPath(err) {
			return Missing, nil
		}
		return "", err
	}
	existing, rest := filepath.Clean(abs), ""
	for {
		resolved, err := canonical(existing)
		if err == nil {
			rel, err := filepath.Rel(realRoot, filepath.Join(resolved, rest))
			if err != nil {
				return "", err
			}
			if outside(rel) {
				return Outside, nil
			}
			return Inside, nil
		}
		if !IsMissingPath(err) {
			return "", err
		}
		parent := filepath.Dir(existing)
		if parent == existing {
			return Outside, nil
		}
		rest = filepath.Join(filepath.Base(existing), rest)
		existing = parent
	}
}

// canonical resolves links in p and spells each name as the disk does.
func canonical(p string) (string, error) {
	resolved, err := filepath.EvalSymlinks(p)
	if err != nil {
		return "", err
	}
	// EvalSymlinks preserves input case; normalize before comparing.
	volumeRoot := filepath.VolumeName(resolved) + string(filepath.Separator)
	rel, err := diskSpelling(volumeRoot, filepath.Clean(strings.TrimPrefix(resolved, volumeRoot)))
	if err != nil {
		return "", err
	}
	return filepath.Join(volumeRoot, rel), nil
}
