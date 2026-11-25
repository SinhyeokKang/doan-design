package cli

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
)

// ownSocket accepts only a socket this user owns, in a directory no one else can write: the runtime file can outlive the
// app's 0700 directory, and the directory check pins the socket until the dial. A missing socket stays not-exist.
func ownSocket(socket string, uid int) error {
	info, e := os.Lstat(socket)
	if e != nil {
		return e
	}
	if info.Mode().Type() != os.ModeSocket || !ownedBy(info, uid) {
		return errors.New("the app socket does not belong to this user")
	}
	dir, e := os.Lstat(filepath.Dir(socket))
	if e != nil {
		return e
	}
	if !dir.IsDir() || !ownedBy(dir, uid) || dir.Mode().Perm()&0o022 != 0 {
		return errors.New("the app socket's directory does not belong to this user alone")
	}
	return nil
}

func ownedBy(info os.FileInfo, uid int) bool {
	stat, ok := info.Sys().(*syscall.Stat_t)
	return ok && int(stat.Uid) == uid
}
