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
	paths := []string{realRoot, abs}
	for i, p := range paths {
		resolved, err := filepath.EvalSymlinks(p)
		if err != nil {
			if IsMissingPath(err) {
				return Missing, "", nil
			}
			return "", "", err
		}
		// EvalSymlinks preserves input case; normalize both paths before comparing.
		volumeRoot := filepath.VolumeName(resolved) + string(filepath.Separator)
		rel, err := diskSpelling(volumeRoot, filepath.Clean(strings.TrimPrefix(resolved, volumeRoot)))
		if err != nil {
			if IsMissingPath(err) {
				return Missing, "", nil
			}
			return "", "", err
		}
		paths[i] = filepath.Join(volumeRoot, rel)
	}
	rel, err := filepath.Rel(paths[0], paths[1])
	if err != nil {
		return "", "", err
	}
	if outside(rel) {
		return Outside, "", nil
	}
	return Inside, filepath.ToSlash(rel), nil
}
