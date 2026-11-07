package cli

import (
	"bufio"
	"bytes"
	"context"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

func TestExportSignalChild(t *testing.T) {
	output := os.Getenv("DOAN_TEST_EXPORT_SIGNAL_OUTPUT")
	if output == "" {
		return
	}
	failure := writeExportWith(Context{Random: bytes.NewReader(make([]byte, 6))}, output, false, []byte("partial page"), func(file *os.File, data []byte) (int, error) {
		n, err := file.Write(data)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := os.Stdout.WriteString("ready\n"); err != nil {
			t.Fatal(err)
		}
		var release [1]byte
		if _, err := io.ReadFull(os.Stdin, release[:]); err != nil {
			t.Fatal(err)
		}
		return n, nil
	})
	t.Fatalf("held export returned: %v", failure)
}

func TestExportSignalsRemoveOnlyOwnedTemporaryFile(t *testing.T) {
	for _, sig := range []syscall.Signal{syscall.SIGINT, syscall.SIGTERM} {
		t.Run(sig.String(), func(t *testing.T) {
			dir := t.TempDir()
			output := filepath.Join(dir, "page.html")
			own := filepath.Join(dir, ".page.html.doan-000000000000")
			other := filepath.Join(dir, ".page.html.doan-111111111111")
			if err := os.WriteFile(other, []byte("another export"), 0o600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestExportSignalChild$")
			cmd.Env = append(os.Environ(), "DOAN_TEST_EXPORT_SIGNAL_OUTPUT="+output)
			stdout, err := cmd.StdoutPipe()
			if err != nil {
				t.Fatal(err)
			}
			stdin, err := cmd.StdinPipe()
			if err != nil {
				t.Fatal(err)
			}
			defer stdin.Close()
			var stderr bytes.Buffer
			cmd.Stderr = &stderr
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
			if err != nil || line != "ready\n" {
				t.Fatalf("export never reached held write: %q, %v", line, err)
			}
			if data, err := os.ReadFile(own); err != nil || string(data) != "partial page" {
				t.Fatalf("temporary write not observed: %q, %v", data, err)
			}
			if err := cmd.Process.Signal(sig); err != nil {
				t.Fatal(err)
			}
			err = cmd.Wait()
			if ctx.Err() != nil {
				t.Fatalf("export did not exit on %v: %v", sig, ctx.Err())
			}
			if err == nil {
				t.Fatal("interrupted export exited successfully")
			}
			if _, err := os.Lstat(own); !os.IsNotExist(err) {
				t.Errorf("owned temporary file survived %v: %v", sig, err)
			}
			if data, err := os.ReadFile(other); err != nil || string(data) != "another export" {
				t.Errorf("another export's temporary file changed: %q, %v", data, err)
			}
			if _, err := os.Lstat(output); !os.IsNotExist(err) {
				t.Errorf("interrupted export published output: %v", err)
			}
		})
	}
}

func TestExportTemporaryCollisionPreservesOtherWriter(t *testing.T) {
	dir := t.TempDir()
	output := filepath.Join(dir, "page.html")
	temp := filepath.Join(dir, ".page.html.doan-000000000000")
	if err := os.WriteFile(temp, []byte("another export"), 0o600); err != nil {
		t.Fatal(err)
	}
	failure := writeExport(Context{Random: bytes.NewReader(make([]byte, 6))}, output, false, []byte("new page"))
	if failure == nil || failure.Code != "internal_error" {
		t.Fatalf("temporary collision was accepted: %v", failure)
	}
	if data, err := os.ReadFile(temp); err != nil || string(data) != "another export" {
		t.Fatalf("colliding temporary file changed: %q, %v", data, err)
	}
}
