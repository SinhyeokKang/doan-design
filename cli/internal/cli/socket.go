package cli

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
)

// ownSocket refuses a socket this user did not create. The app listens in a fresh 0700 directory of its own, but a
// runtime file can outlive that directory (a crash, then a cleaned temp directory); in a temp directory other users
// share, another user could then create a socket at the same path and answer the CLI. Checking the directory too keeps
// the socket from being swapped between this check and the dial. A missing socket keeps its not-exist error, which
// callers read as "no app listening".
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
