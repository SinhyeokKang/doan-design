package cli

import (
	"bytes"
	"encoding/json"
	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNullInputDoesNotPrompt(t *testing.T) {
	f, e := os.Open(os.DevNull)
	if e != nil {
		t.Fatal(e)
	}
	defer f.Close()
	var out, errout bytes.Buffer
	if Run([]string{"init", "--repo", t.TempDir()}, f, &out, &errout) != 0 {
		t.Fatal(&errout)
	}
	if strings.Contains(out.String(), "Token CSS path") {
		t.Fatal("non-terminal input prompted:", out.String())
	}
}
func TestUnparsableCanvasIsFinding(t *testing.T) {
	root := initialized(t)
	putFile(t, root, ".doan/canvases/a.html", validCanvas+strings.Repeat("<div>", 600))
	got := result(t, root, 4, "check")
	found := false
	for _, v := range got["findings"].([]any) {
		if v.(map[string]any)["code"] == "unparsable_canvas" {
			found = true
		}
	}
	if !found {
		t.Fatal(got)
	}
	ls := result(t, root, 0, "ls")["canvases"].([]any)[0].(map[string]any)
	if len(ls) != 2 || len(ls["frames"].([]any)) != 0 {
		t.Fatal(ls)
	}
}
func TestRunRepositoryDiscoveryAndParsing(t *testing.T) {
	root := initialized(t)
	nested := filepath.Join(root, "sub")
	if e := os.Mkdir(nested, 0755); e != nil {
		t.Fatal(e)
	}
	t.Chdir(nested)
	var out, errout bytes.Buffer
	code := Run([]string{"--json", "ls"}, strings.NewReader(""), &out, &errout)
	var env any
	if e := json.Unmarshal(out.Bytes(), &env); e != nil {
		t.Fatal(e)
	}
	if e := formats.ValidateEnvelope(env); e != nil || code != 0 || errout.Len() != 0 {
		t.Fatal(env, e)
	}
	for _, tt := range []struct{ config, code string }{{`{"v":2}`, "unsupported_version"}, {`{"v":1e400}`, "unsupported_version"}, {`{`, "invalid_config"}} {
		putFile(t, nested, ".doan/config.json", tt.config)
		failure(t, nested, tt.code, "ls")
	}
	for _, args := range [][]string{{"--json", "ls", "--unknown"}, {"ls", "--canvas"}, {"--json", "ls", "--", "--json"}} {
		failure(t, root, "usage_error", args...)
	}
}
func TestInitJSONNeverPrompts(t *testing.T) {
	root := t.TempDir()
	calls := 0
	_, e := Init(Context{Start: root, Terminal: true, Prompt: func(string) (string, error) { calls++; return "", nil }}, Flags{JSON: true}, nil)
	if e != nil || calls != 0 {
		t.Fatal(e, calls)
	}
}
func TestInitDoesNotWriteThroughDanglingOutputLinks(t *testing.T) {
	for _, path := range []string{".doan/config.json", ".gitattributes"} {
		t.Run(path, func(t *testing.T) {
			root := t.TempDir()
			outside := filepath.Join(t.TempDir(), "absent")
			if e := os.MkdirAll(filepath.Dir(filepath.Join(root, path)), 0755); e != nil {
				t.Fatal(e)
			}
			if e := os.Symlink(outside, filepath.Join(root, path)); e != nil {
				t.Fatal(e)
			}
			failure(t, root, "usage_error", "init")
			if _, e := os.Stat(outside); !os.IsNotExist(e) {
				t.Fatalf("outside target created: %v", e)
			}
		})
	}
}
