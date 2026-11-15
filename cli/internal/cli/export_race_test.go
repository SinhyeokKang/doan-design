package cli

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

// A file that appears at the output after the existence check (another export, an editor) is still not replaced
// without --force; with --force it is.
func TestExportDoesNotReplaceAFileThatAppearedAfterTheCheck(t *testing.T) {
	for _, force := range []bool{false, true} {
		dir := t.TempDir()
		output := filepath.Join(dir, "page.html")
		failure := writeExportWith(Context{Random: bytes.NewReader(make([]byte, 6))}, output, force, []byte("export"), func(file *os.File, data []byte) (int, error) {
			if err := os.WriteFile(output, []byte("someone else's"), 0o644); err != nil {
				t.Fatal(err)
			}
			return file.Write(data)
		})
		want := "someone else's"
		if force {
			want = "export"
			if failure != nil {
				t.Fatal(failure)
			}
		} else if failure == nil || failure.Code != "destination_exists" {
			t.Fatalf("got %+v", failure)
		}
		if data, err := os.ReadFile(output); err != nil || string(data) != want {
			t.Fatalf("force=%v: output %q, %v", force, data, err)
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			t.Fatal(err)
		}
		if len(entries) != 1 {
			t.Fatalf("force=%v: temporary file left: %v", force, entries)
		}
	}
}
