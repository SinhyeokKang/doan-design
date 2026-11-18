package cli

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
)

// ownSocket accepts only a socket this user owns, in a directory this user owns that no one else can write. The app
// listens in a fresh 0700 directory of its own, but the runtime file can outlive that directory, so the file alone
// does not show whose socket it names. The directory check also keeps the socket from changing between this check and
// the dial. A missing socket keeps its not-exist error, which callers read as "no app listening".
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
