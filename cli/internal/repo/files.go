package repo

import (
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Canvases lists the canvas files: only a lower-case .html, as every path grammar naming a canvas is lower-case. An
// unreadable folder fails the list, because then the set of canvases is unknown.
func Canvases(root string) ([]string, error) {
	return whole(CanvasListing(root))
}

// UnreadableFolder is a folder under a canvas directory whose entries could not be read; Path is repo-relative.
type UnreadableFolder struct {
	Path string
	Err  error
}

// CanvasListing is Canvases for ls, which lists what it can: each folder it cannot read is reported instead of
// failing the list.
func CanvasListing(root string) ([]string, []UnreadableFolder, error) {
	return canvasWalk(root, func(ext string) bool { return ext == ".html" })
}

// MiscasedCanvases lists the files the same walk would take as canvases if their .html were lower-case, so check
// can say why they are missing from the list.
func MiscasedCanvases(root string) ([]string, error) {
	return whole(canvasWalk(root, func(ext string) bool { return ext != ".html" && strings.EqualFold(ext, ".html") }))
}

func whole(paths []string, folders []UnreadableFolder, err error) ([]string, error) {
	if err != nil {
		return nil, err
	}
	if len(folders) > 0 {
		return nil, folders[0].Err
	}
	return paths, nil
}

func canvasWalk(root string, takes func(ext string) bool) ([]string, []UnreadableFolder, error) {
	paths := []string{}
	folders := []UnreadableFolder{}
	parent, err := os.Lstat(filepath.Join(root, ".doan"))
	if err != nil {
		if os.IsNotExist(err) {
			return paths, folders, nil
		}
		return nil, nil, err
	}
	if parent.Mode()&os.ModeSymlink != 0 {
		return paths, folders, nil
	}
	// Design-system canvases (.doan/ds/) are ordinary canvases; the directory
	// is their only marker, so both walks share every rule.
	for _, dir := range []string{".doan/canvases", ".doan/ds"} {
		found, unread, err := canvasesIn(root, dir, takes)
		if err != nil {
			return nil, nil, err
		}
		paths = append(paths, found...)
		folders = append(folders, unread...)
	}
	sort.Strings(paths)
	return paths, folders, nil
}

func canvasesIn(root, dir string, takes func(ext string) bool) ([]string, []UnreadableFolder, error) {
	paths := []string{}
	folders := []UnreadableFolder{}
	start := filepath.Join(root, dir)
	info, err := os.Lstat(start)
	if err != nil {
		if os.IsNotExist(err) {
			return paths, folders, nil
		}
		return nil, nil, err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return paths, folders, nil
	}
	err = filepath.WalkDir(start, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			// WalkDir reports a directory it could not read with its entry; without one the start itself failed.
			if entry == nil || !entry.IsDir() {
				return walkErr
			}
			rel, err := filepath.Rel(root, path)
			if err != nil {
				return err
			}
			folders = append(folders, UnreadableFolder{Path: filepath.ToSlash(rel), Err: walkErr})
			return filepath.SkipDir
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
		return nil, nil, err
	}
	return paths, folders, nil
}
