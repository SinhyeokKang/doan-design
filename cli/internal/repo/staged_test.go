package repo

import (
	"bufio"
	"context"
	"errors"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestWriteStagedSignalChild(t *testing.T) {
	dir := os.Getenv("DOAN_TEST_STAGED_SIGNAL_DIR")
	if dir == "" {
		return
	}
	err := writeStagedWith(dir, ".config-*", 0o644, []byte("partial"), func(file *os.File, data []byte) (int, error) {
		n, err := file.Write(data)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := os.Stdout.WriteString(file.Name() + "\n"); err != nil {
			t.Fatal(err)
		}
		var release [1]byte
		if _, err := io.ReadFull(os.Stdin, release[:]); err != nil {
			t.Fatal(err)
		}
		return n, nil
	}, func(temp string) error {
		return os.Rename(temp, filepath.Join(dir, "config.json"))
	})
	t.Fatalf("held write returned: %v", err)
}

func TestWriteStagedSignalsRemoveOnlyOwnedTemporaryFile(t *testing.T) {
	for _, sig := range []syscall.Signal{syscall.SIGINT, syscall.SIGTERM} {
		t.Run(sig.String(), func(t *testing.T) {
			dir := t.TempDir()
			other := filepath.Join(dir, ".config-other")
			if err := os.WriteFile(other, []byte("another writer"), 0o600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestWriteStagedSignalChild$")
			cmd.Env = append(os.Environ(), "DOAN_TEST_STAGED_SIGNAL_DIR="+dir)
			stdout, err := cmd.StdoutPipe()
			if err != nil {
				t.Fatal(err)
			}
			stdin, err := cmd.StdinPipe()
			if err != nil {
				t.Fatal(err)
			}
			defer stdin.Close()
			if err := cmd.Start(); err != nil {
				t.Fatal(err)
			}
			defer func() {
				if cmd.ProcessState == nil {
					cmd.Process.Kill()
					cmd.Wait()
				}
			}()
			line, err := bufio.NewReader(stdout).ReadString('\n')
			own := strings.TrimSuffix(line, "\n")
			if err != nil || filepath.Dir(own) != dir || !strings.HasPrefix(filepath.Base(own), ".config-") {
				t.Fatalf("write never reached the held point: %q, %v", line, err)
			}
			if data, err := os.ReadFile(own); err != nil || string(data) != "partial" {
				t.Fatalf("temporary write not observed: %q, %v", data, err)
			}
			if err := cmd.Process.Signal(sig); err != nil {
				t.Fatal(err)
			}
			err = cmd.Wait()
			if ctx.Err() != nil {
				t.Fatalf("writer did not exit on %v: %v", sig, ctx.Err())
			}
			if err == nil {
				t.Fatal("interrupted write exited successfully")
			}
			if _, err := os.Lstat(own); !os.IsNotExist(err) {
				t.Errorf("owned temporary file survived %v: %v", sig, err)
			}
			if data, err := os.ReadFile(other); err != nil || string(data) != "another writer" {
				t.Errorf("another writer's temporary file changed: %q, %v", data, err)
			}
			if _, err := os.Lstat(filepath.Join(dir, "config.json")); !os.IsNotExist(err) {
				t.Errorf("interrupted write published: %v", err)
			}
		})
	}
}

func TestWriteStagedPublishesWithMode(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "config.json")
	var staged string
	err := WriteStaged(dir, ".config-*", 0o640, []byte("data"), func(temp string) error {
		staged = temp
		if filepath.Dir(temp) != dir || !strings.HasPrefix(filepath.Base(temp), ".config-") {
			t.Fatalf("temporary file not a sibling: %s", temp)
		}
		return os.Rename(temp, target)
	})
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(target)
	if err != nil || info.Mode().Perm() != 0o640 {
		t.Fatalf("published mode: %v, %v", info, err)
	}
	if data, _ := os.ReadFile(target); string(data) != "data" {
		t.Fatalf("published data: %q", data)
	}
	if _, err := os.Lstat(staged); !os.IsNotExist(err) {
		t.Fatalf("temporary name left behind: %v", err)
	}
}

// After publication the temporary name belongs to nobody, so another writer may create it; cleanup must not
// remove that file.
func TestWriteStagedLeavesTheNameAfterPublication(t *testing.T) {
	dir := t.TempDir()
	var staged string
	err := WriteStaged(dir, ".config-*", 0o644, []byte("data"), func(temp string) error {
		staged = temp
		if err := os.Rename(temp, filepath.Join(dir, "config.json")); err != nil {
			return err
		}
		return os.WriteFile(temp, []byte("another writer"), 0o600)
	})
	if err != nil {
		t.Fatal(err)
	}
	if data, err := os.ReadFile(staged); err != nil || string(data) != "another writer" {
		t.Fatalf("another writer's file at the published name was removed: %q, %v", data, err)
	}
}

func TestWriteStagedFailedPublicationRemovesTemporaryFile(t *testing.T) {
	dir := t.TempDir()
	refused := errors.New("refused")
	var staged string
	err := WriteStaged(dir, ".config-*", 0o644, []byte("data"), func(temp string) error {
		staged = temp
		return refused
	})
	if !errors.Is(err, refused) {
		t.Fatalf("publication error lost: %v", err)
	}
	if _, err := os.Lstat(staged); !os.IsNotExist(err) {
		t.Fatalf("temporary file survived a failed publication: %v", err)
	}
}

// Every staged write in the CLI goes through WriteStaged so the signal and ownership cleanup is not written
// again per caller (export keeps its own, since it names its temporary file itself).
func TestCreateTempOnlyInWriteStaged(t *testing.T) {
	root := filepath.Join("..", "..")
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if strings.Contains(string(data), "os.CreateTemp(") && filepath.Base(path) != "staged.go" {
			t.Errorf("%s creates a temporary file outside WriteStaged", path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
