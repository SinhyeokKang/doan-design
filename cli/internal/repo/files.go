package repo

import (
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Canvases lists the canvas files: only a lower-case .html is a canvas, because every path grammar that names one
// (work, open, handoff, prototype, deep links and the app socket schemas) is lower-case.
func Canvases(root string) ([]string, error) {
	return canvasWalk(root, func(ext string) bool { return ext == ".html" })
}

// MiscasedCanvases lists the files the same walk would take as canvases if their .html were lower-case, so check
// can say why they are missing from the list.
func MiscasedCanvases(root string) ([]string, error) {
	return canvasWalk(root, func(ext string) bool { return ext != ".html" && strings.EqualFold(ext, ".html") })
}

func canvasWalk(root string, takes func(ext string) bool) ([]string, error) {
	paths := []string{}
	parent, err := os.Lstat(filepath.Join(root, ".doan"))
	if err != nil {
		if os.IsNotExist(err) {
			return paths, nil
		}
		return nil, err
	}
	if parent.Mode()&os.ModeSymlink != 0 {
		return paths, nil
	}
	// Design-system canvases (.doan/ds/) are ordinary canvases; the directory
	// is their only marker, so both walks share every rule.
	for _, dir := range []string{".doan/canvases", ".doan/ds"} {
		found, err := canvasesIn(root, dir, takes)
		if err != nil {
			return nil, err
		}
		paths = append(paths, found...)
	}
	sort.Strings(paths)
	return paths, nil
}

func canvasesIn(root, dir string, takes func(ext string) bool) ([]string, error) {
	paths := []string{}
	start := filepath.Join(root, dir)
	info, err := os.Lstat(start)
	if err != nil {
		if os.IsNotExist(err) {
			return paths, nil
		}
		return nil, err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return paths, nil
	}
	err = filepath.WalkDir(start, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if strings.HasPrefix(entry.Name(), ".") {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.Type().IsRegular() && takes(filepath.Ext(path)) {
			rel, err := filepath.Rel(root, path)
			if err != nil {
				return err
			}
			paths = append(paths, filepath.ToSlash(rel))
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return paths, nil
}
