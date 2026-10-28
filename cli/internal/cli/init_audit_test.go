package cli

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestInitAttributesFailureDoesNotPublishConfig(t *testing.T) {
	root := t.TempDir()
	const before = "*.txt text\r\n"
	putFile(t, root, ".gitattributes", before)
	attrs := filepath.Join(root, ".gitattributes")
	if err := os.Chmod(attrs, 0444); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.Chmod(attrs, 0644) })
	if f, err := os.OpenFile(attrs, os.O_WRONLY, 0); err == nil {
		f.Close()
		t.Skip("filesystem permits writes to read-only files")
	} else if !os.IsPermission(err) {
		t.Fatal(err)
	}
	failure(t, root, "internal_error", "init")
	if _, err := os.Lstat(filepath.Join(root, ".doan/config.json")); !os.IsNotExist(err) {
		t.Fatalf("failed init published config: %v", err)
	}
	if readFile(t, root, ".gitattributes") != before {
		t.Fatal("foreign attributes changed")
	}
	entries, err := os.ReadDir(filepath.Join(root, ".doan"))
	if err != nil || len(entries) != 1 || entries[0].Name() != "canvases" {
		t.Fatalf("staged config leaked: %v %v", entries, err)
	}
	if err := os.Chmod(attrs, 0644); err != nil {
		t.Fatal(err)
	}
	got := result(t, root, 0, "init")
	if got["initialized"] != true || !reflect.DeepEqual(got["created"], []any{".doan/config.json", ".gitattributes"}) {
		t.Fatal(got)
	}
	if readFile(t, root, ".gitattributes") != before+".doan/comments/*.jsonl merge=union\r\n" {
		t.Fatal("retry attributes")
	}
	if result(t, root, 0, "init")["initialized"] != false {
		t.Fatal("retry not idempotent")
	}
}

func TestRepositoryInputErrorsCLIAndMCP(t *testing.T) {
	root := t.TempDir()
	putFile(t, root, "file", "")
	if err := os.Symlink("loop", filepath.Join(root, "loop")); err != nil {
		t.Fatal(err)
	}
	cs := mcpClient(t)
	for name, path := range map[string]string{
		"not directory": filepath.Join(root, "file/child"),
		"nul":           filepath.Join(root, "bad\x00path"),
		"long":          filepath.Join(root, strings.Repeat("x", 300)),
		"loop":          filepath.Join(root, "loop"),
	} {
		for _, cmd := range []string{"ls", "init"} {
			t.Run(name+"/"+cmd, func(t *testing.T) {
				code := "repo_not_found"
				if cmd == "init" {
					code = "usage_error"
				}
				t.Run("cli", func(t *testing.T) { failure(t, path, code, cmd) })
				t.Run("mcp", func(t *testing.T) { toolCode(t, cs, cmd, map[string]any{"repo": path}, code) })
			})
		}
	}
}

func TestRepositoryPermissionErrorsRemainInternal(t *testing.T) {
	root := t.TempDir()
	putFile(t, root, "blocked/child/.doan/config.json", `{"v":1}`)
	blocked := filepath.Join(root, "blocked")
	if err := os.Chmod(blocked, 0); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.Chmod(blocked, 0755) })
	path := filepath.Join(blocked, "child")
	if _, err := os.Stat(path); !os.IsPermission(err) {
		t.Skip("filesystem does not enforce directory permissions")
	}
	cs := mcpClient(t)
	for _, cmd := range []string{"ls", "init"} {
		failure(t, path, "internal_error", cmd)
		toolCode(t, cs, cmd, map[string]any{"repo": path}, "internal_error")
	}
}

func TestInitUnicodeTokenDiskSpelling(t *testing.T) {
	for _, absolute := range []bool{false, true} {
		t.Run(map[bool]string{false: "relative", true: "absolute"}[absolute], func(t *testing.T) {
			root := t.TempDir()
			const disk = "한글.css"
			putFile(t, root, disk, ":root{--x:red}")
			token := "한글.css"
			if _, err := os.Stat(filepath.Join(root, token)); os.IsNotExist(err) {
				t.Skip("filesystem distinguishes canonical Unicode names")
			} else if err != nil {
				t.Fatal(err)
			}
			if absolute {
				token = filepath.Join(root, token)
			}
			got := result(t, root, 0, "init", "--token-css", token)
			if got["tokenCss"] != disk || !strings.Contains(readFile(t, root, ".doan/config.json"), disk) {
				t.Fatal(got)
			}
		})
	}
}
