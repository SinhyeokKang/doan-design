package cli

import (
	"bufio"
	"errors"
	"io/fs"
	"net"
	"os"
	"path/filepath"
	"testing"
)

// The runtime file can outlive the app's socket directory (ARCHITECTURE §4), so the CLI connects only to a socket this user
// owns in a private directory. listenAt answers with an empty selection, so a refusal can only be the CLI's own check.
func listenAt(t *testing.T) (dir, socket string) {
	t.Helper()
	dir = shortTempDir(t)
	socket = filepath.Join(dir, "app.sock")
	l, e := net.Listen("unix", socket)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { l.Close() })
	go func() {
		for {
			c, e := l.Accept()
			if e != nil {
				return
			}
			bufio.NewReader(c).ReadBytes('\n')
			c.Write([]byte(`{"v":1,"ok":true,"result":{}}` + "\n"))
			c.Close()
		}
	}()
	return dir, socket
}

func TestOwnSocketAcceptsThisUsersSocketInAPrivateDirectory(t *testing.T) {
	_, socket := listenAt(t)
	if e := ownSocket(socket, os.Geteuid()); e != nil {
		t.Fatal(e)
	}
}

func TestOwnSocketRefusesAnotherOwner(t *testing.T) {
	_, socket := listenAt(t)
	if e := ownSocket(socket, os.Geteuid()+1); e == nil {
		t.Fatal("accepted a socket another user owns")
	}
}

func TestOwnSocketRefusesADirectoryOthersCanWrite(t *testing.T) {
	for _, mode := range []os.FileMode{0o777, 0o730, 0o703} {
		dir, socket := listenAt(t)
		if e := os.Chmod(dir, mode); e != nil {
			t.Fatal(e)
		}
		if e := ownSocket(socket, os.Geteuid()); e == nil {
			t.Fatalf("accepted a socket in a %o directory", mode)
		}
	}
}

func TestOwnSocketRefusesALinkAndAFile(t *testing.T) {
	dir, socket := listenAt(t)
	link := filepath.Join(dir, "link.sock")
	if e := os.Symlink(socket, link); e != nil {
		t.Fatal(e)
	}
	if e := ownSocket(link, os.Geteuid()); e == nil {
		t.Fatal("accepted a link to a socket")
	}
	file := filepath.Join(dir, "file.sock")
	if e := os.WriteFile(file, nil, 0o600); e != nil {
		t.Fatal(e)
	}
	if e := ownSocket(file, os.Geteuid()); e == nil {
		t.Fatal("accepted a regular file")
	}
}

// A missing socket keeps reading as "no app listening", which is what lets `doan onboarding start` open the app.
func TestOwnSocketReportsAMissingSocketAsNotExist(t *testing.T) {
	e := ownSocket(filepath.Join(shortTempDir(t), "app.sock"), os.Geteuid())
	if !errors.Is(e, fs.ErrNotExist) {
		t.Fatal(e)
	}
}

func TestRunRefusesASocketInADirectoryOthersCanWrite(t *testing.T) {
	root := realPath(t, initialized(t))
	dir, socket := listenAt(t)
	putFile(t, dir, "runtime.json", runtimeJSON(socket))
	t.Setenv("DOAN_RUNTIME", filepath.Join(dir, "runtime.json"))
	// The same app answers while its directory is private.
	result(t, root, 0, "active")
	if e := os.Chmod(dir, 0o777); e != nil {
		t.Fatal(e)
	}
	failure(t, root, "app_not_running", "active")
}
