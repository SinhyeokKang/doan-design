package repo

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/unix"
)

// WriteStorage only edits the marked pair; callers prepare merge attributes before removing it.
func WriteStorage(root, home, storage string) (bool, error) {
	loc, err := gitLocation(root, home)
	if err != nil {
		return false, err
	}
	if strings.ContainsAny(loc.rel, "\r\n") {
		return false, errors.New("Doan root contains a line break; cannot make an exclude pattern")
	}
	path := filepath.Join(loc.common, "info/exclude")
	pattern := StoragePattern(loc.rel)
	data, info, err := readExcludeMode(path)
	if err != nil {
		return false, err
	}
	if storage == "local" {
		next := AddStoragePair(data, pattern)
		if len(next) > excludeLimit {
			return false, errors.New("exclude would exceed 1 MiB")
		}
		if bytes.Equal(next, data) {
			return false, nil
		}
		if !excludeWritable(path, info) {
			return false, errors.New("exclude is not writable")
		}
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			return false, err
		}
		flags := unix.O_WRONLY | unix.O_APPEND | unix.O_NOFOLLOW | unix.O_NONBLOCK
		if info == nil {
			flags |= unix.O_CREAT | unix.O_EXCL
		}
		fd, err := unix.Open(path, flags, 0644)
		if errors.Is(err, unix.EEXIST) {
			return WriteStorage(root, home, storage)
		}
		if err != nil {
			return false, err
		}
		file := os.NewFile(uintptr(fd), path)
		opened, err := file.Stat()
		if err != nil || !opened.Mode().IsRegular() || (info != nil && !os.SameFile(info, opened)) {
			file.Close()
			return false, errors.New("exclude changed while opening")
		}
		_, err = file.Write(next[len(data):])
		closeErr := file.Close()
		if err != nil {
			return false, err
		}
		return true, closeErr
	}
	if storage != "repo" {
		return false, fmt.Errorf("invalid storage: %s", storage)
	}
	next := RemoveStoragePair(data, pattern)
	if bytes.Equal(next, data) {
		return false, nil
	}
	if !excludeWritable(path, info) {
		return false, errors.New("exclude is not writable")
	}
	if err := replaceExclude(path, data, next, info, readExclude); err != nil {
		return false, err
	}
	return true, nil
}

func replaceExclude(path string, data, next []byte, info os.FileInfo, recheck func(string) ([]byte, os.FileInfo, error)) error {
	temp, err := os.CreateTemp(filepath.Dir(path), ".exclude-*")
	if err != nil {
		return err
	}
	defer os.Remove(temp.Name())
	if err := temp.Chmod(info.Mode().Perm()); err != nil {
		temp.Close()
		return err
	}
	if _, err := temp.Write(next); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	current, currentInfo, err := recheck(path)
	if err != nil {
		return err
	}
	if currentInfo == nil || !os.SameFile(info, currentInfo) || !bytes.Equal(current, data) {
		return errors.New("exclude changed before replacement; retry")
	}
	if err := os.Rename(temp.Name(), path); err != nil {
		return err
	}
	return nil
}
