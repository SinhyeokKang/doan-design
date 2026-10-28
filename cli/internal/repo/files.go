package repo

import (
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type CommentFile struct {
	ID   string
	Path string
}

func Canvases(root string) ([]string, error) {
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
	start := filepath.Join(root, ".doan/canvases")
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
		if entry.Type().IsRegular() && strings.EqualFold(filepath.Ext(path), ".html") {
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
	sort.Strings(paths)
	return paths, nil
}

func CommentFiles(root string) ([]CommentFile, error) {
	files := []CommentFile{}
	for _, p := range []string{".doan", ".doan/comments"} {
		info, err := os.Lstat(filepath.Join(root, p))
		if err != nil {
			if os.IsNotExist(err) {
				return files, nil
			}
			return nil, err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return files, nil
		}
	}
	entries, err := os.ReadDir(filepath.Join(root, ".doan/comments"))
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if entry.Type().IsRegular() && strings.HasSuffix(entry.Name(), ".jsonl") {
			files = append(files, CommentFile{ID: strings.TrimSuffix(entry.Name(), ".jsonl"), Path: ".doan/comments/" + entry.Name()})
		}
	}
	return files, nil
}
