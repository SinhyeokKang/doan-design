package cli

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

// unreadable removes every permission bit from rel until the test ends.
func unreadable(t *testing.T, root, rel string) {
	t.Helper()
	if os.Geteuid() == 0 {
		t.Skip("root ignores permission bits")
	}
	p := filepath.Join(root, rel)
	info, e := os.Stat(p)
	if e != nil {
		t.Fatal(e)
	}
	if e := os.Chmod(p, 0); e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { os.Chmod(p, info.Mode().Perm()) })
}
func jsonValue(t *testing.T, s string) any {
	t.Helper()
	var v any
	if e := json.Unmarshal([]byte(s), &v); e != nil {
		t.Fatal(e, s)
	}
	return v
}
func expectJSON(t *testing.T, name string, got any, want string) {
	t.Helper()
	if w := jsonValue(t, want); !reflect.DeepEqual(got, w) {
		b, _ := json.Marshal(got)
		t.Fatalf("%s:\n got %s\nwant %s", name, b, want)
	}
}

// Commands that read the unreadable file keep failing as a whole.
func expectWholeFailures(t *testing.T, root string, commands ...[]string) {
	t.Helper()
	for _, args := range commands {
		failure(t, root, "internal_error", args...)
	}
}

var checkCommand = []string{"check"}

func TestListUnreadableCanvas(t *testing.T) {
	root := initialized(t)
	putFile(t, root, ".doan/canvases/a.html", validCanvas)
	bee := strings.Replace(validCanvas, `content="foo"`, `content="bee"`, 1)
	putFile(t, root, ".doan/canvases/b.html", bee)
	unreadable(t, root, ".doan/canvases/a.html")
	got := result(t, root, 0, "ls")
	expectJSON(t, "canvases", got["canvases"], `[
		{"path":".doan/canvases/a.html","frames":[],"error":{"code":"unreadable_canvas","message":"Cannot read .doan/canvases/a.html: permission denied"}},
		{"path":".doan/canvases/b.html","id":"bee","width":800,"title":"Example","frames":[{"id":"main","title":"Main"}]}]`)
	expectWholeFailures(t, root, checkCommand)
}
func TestListEnumerationFailuresStayWhole(t *testing.T) {
	root := initialized(t)
	putFile(t, root, ".doan/canvases/a.html", validCanvas)
	putFile(t, root, ".doan/canvases/sub/x.html", validCanvas)
	unreadable(t, root, ".doan/canvases/sub")
	failure(t, root, "internal_error", "ls")
	// The config file is not at fault, so the failure names none.
	expectNoConfig(t, runJSON(t, root, 1, "ls"))
}

// An id doan check rejects is not listed: agents would build chips and --frame targets from it.
func TestListOmitsInvalidCanvasIDs(t *testing.T) {
	for _, tt := range []struct{ name, html string }{
		{"uppercase", strings.Replace(validCanvas, `content="foo"`, `content="FOO"`, 1)},
		{"duplicate metas", strings.Replace(validCanvas, "</head>", `<meta name="doan:canvas" content="foo"></head>`, 1)},
	} {
		t.Run(tt.name, func(t *testing.T) {
			root := initialized(t)
			putFile(t, root, ".doan/canvases/a.html", tt.html)
			expectJSON(t, "canvases", result(t, root, 0, "ls")["canvases"], `[{"path":".doan/canvases/a.html","width":800,"title":"Example","frames":[{"id":"main","title":"Main"}]}]`)
		})
	}
}

// failedRun runs args with --json from the current directory and returns the
// failure's error object after checking the exit code and the envelope schema.
func failedRun(t *testing.T, want int, args ...string) map[string]any {
	t.Helper()
	var out, errout bytes.Buffer
	args = append(args, "--json")
	if code := Run(args, strings.NewReader(""), &out, &errout); code != want || errout.Len() != 0 {
		t.Fatalf("%v: exit %d want %d, stdout %s stderr %s", args, code, want, &out, &errout)
	}
	var v map[string]any
	if e := json.Unmarshal(out.Bytes(), &v); e != nil {
		t.Fatal(e, out.String())
	}
	if e := formats.ValidateEnvelope(v); e != nil {
		t.Fatal(e)
	}
	if v["ok"] != false {
		t.Fatal(v)
	}
	return v["error"].(map[string]any)
}

func expectNoConfig(t *testing.T, envelope map[string]any) {
	t.Helper()
	if _, ok := envelope["error"].(map[string]any)["config"]; ok {
		t.Fatal("unexpected error.config", envelope)
	}
}

// A failure caused by a config file names its absolute path in error.config,
// whether the repo came from an absolute --repo or from discovery.
func TestRepoCommandsNameTheConfigTheyFailedOn(t *testing.T) {
	for _, tt := range []struct {
		name, code string
		setup      func(t *testing.T, root string)
	}{
		{"broken", "invalid_config", func(t *testing.T, root string) { putFile(t, root, ".doan/config.json", `{`) }},
		{"unsupported version", "unsupported_version", func(t *testing.T, root string) { putFile(t, root, ".doan/config.json", `{"v":2}`) }},
		{"directory", "invalid_config", func(t *testing.T, root string) {
			if e := os.Remove(filepath.Join(root, ".doan/config.json")); e != nil {
				t.Fatal(e)
			}
			if e := os.Mkdir(filepath.Join(root, ".doan/config.json"), 0755); e != nil {
				t.Fatal(e)
			}
		}},
		{"unreadable", "internal_error", func(t *testing.T, root string) { unreadable(t, root, ".doan/config.json") }},
		{"unsearchable .doan", "internal_error", func(t *testing.T, root string) { unreadable(t, root, ".doan") }},
	} {
		t.Run(tt.name, func(t *testing.T) {
			root := initialized(t)
			if e := os.Mkdir(filepath.Join(root, "sub"), 0755); e != nil {
				t.Fatal(e)
			}
			tt.setup(t, root)
			want := filepath.Join(realPath(t, root), ".doan", "config.json")
			expect := func(got map[string]any) {
				t.Helper()
				if got["code"] != tt.code || got["config"] != want {
					t.Fatalf("got %v; want %s with config %s", got, tt.code, want)
				}
			}
			exit := ExitCode(tt.code)
			t.Chdir(t.TempDir())
			expect(failedRun(t, exit, "ls", "--repo", root))
			expect(failedRun(t, exit, "check", "--repo", root))
			expect(failedRun(t, exit, "config", "--repo", root))
			t.Chdir(root)
			expect(failedRun(t, exit, "ls"))
			// A configless subfolder stops at its parent's config and names it.
			t.Chdir(filepath.Join(root, "sub"))
			expect(failedRun(t, exit, "ls"))
			expect(failedRun(t, exit, "check"))
		})
	}
}

func TestRepoCommandFailuresOutsideTheConfigNameNone(t *testing.T) {
	root := initialized(t)
	putFile(t, root, "file", "")
	putFile(t, root, "assets/in/a.css", "")
	t.Chdir(t.TempDir())
	for _, args := range [][]string{
		{"ls", "--repo", filepath.Join(root, "absent")},
		{"ls", "--repo", filepath.Join(root, "file")},
		{"ls"},
	} {
		got := failedRun(t, 2, args...)
		if got["code"] != "repo_not_found" {
			t.Fatal(args, got)
		}
		if _, ok := got["config"]; ok {
			t.Fatal(args, got)
		}
	}
	// A value doan config rejects is not a fault of the config file.
	got := failedRun(t, 2, "config", "--repo", root, "--add-serve", "../outside")
	if _, ok := got["config"]; got["code"] != "usage_error" || ok {
		t.Fatal(got)
	}
	result(t, root, 0, "config", "--add-serve", "assets/in")
	// Serving-scope I/O: the scope cannot be resolved under an unsearchable folder.
	unreadable(t, root, "assets")
	got = failedRun(t, 1, "ls", "--repo", root)
	if _, ok := got["config"]; got["code"] != "internal_error" || ok {
		t.Fatal(got)
	}
	// The start path itself cannot be resolved.
	locked := filepath.Join(t.TempDir(), "locked")
	putFile(t, locked, "sub/x", "")
	unreadable(t, filepath.Dir(locked), "locked")
	got = failedRun(t, 1, "ls", "--repo", filepath.Join(locked, "sub"))
	if _, ok := got["config"]; got["code"] != "internal_error" || ok {
		t.Fatal(got)
	}
}
