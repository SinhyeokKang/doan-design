package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

func sessionFixture(t *testing.T) (string, string) {
	t.Helper()
	home := t.TempDir()
	for _, key := range []string{"CLAUDE_CODE_SESSION_ID", "CODEX_THREAD_ID", "CODEX_SESSION_ID", "CLAUDE_CONFIG_DIR", "CODEX_HOME"} {
		t.Setenv(key, "")
	}
	t.Setenv("HOME", home)
	for _, p := range []string{".claude", ".codex", "userData"} {
		if e := os.Mkdir(filepath.Join(home, p), 0700); e != nil {
			t.Fatal(e)
		}
	}
	log := filepath.Join(home, "userData", "sessions.jsonl")
	t.Setenv("DOAN_RUNTIME", filepath.Join(home, "userData", "runtime.json"))
	root := initialized(t)
	t.Chdir(root)
	putFile(t, root, "design/a.html", validCanvas)
	return root, log
}
func sessionRows(t *testing.T, path string) []map[string]any {
	t.Helper()
	b, e := os.ReadFile(path)
	if os.IsNotExist(e) {
		return nil
	}
	if e != nil {
		t.Fatal(e)
	}
	rows := []map[string]any{}
	for _, line := range bytes.Split(bytes.TrimSpace(b), []byte{'\n'}) {
		if len(line) == 0 {
			continue
		}
		var row map[string]any
		if e := json.Unmarshal(line, &row); e != nil {
			t.Fatal(e)
		}
		if e := formats.ValidateSessionRecord(row); e != nil {
			t.Fatal(e)
		}
		rows = append(rows, row)
	}
	return rows
}
func checkOutput(root string, jsonMode bool) (int, string, string) {
	var out, err bytes.Buffer
	args := []string{"check", "--repo", root}
	if jsonMode {
		args = append(args, "--json")
	}
	code := Run(args, strings.NewReader(""), &out, &err)
	return code, out.String(), err.String()
}
func TestSessionRecordingOutputAndChangedHashes(t *testing.T) {
	for _, bad := range []bool{false, true} {
		for _, jsonMode := range []bool{false, true} {
			t.Run(fmt.Sprint(bad, jsonMode), func(t *testing.T) {
				root, log := sessionFixture(t)
				if bad {
					putFile(t, root, "design/a.html", "<html>no metadata</html>")
				}
				code, out, err := checkOutput(root, jsonMode)
				t.Setenv("CLAUDE_CODE_SESSION_ID", "session literal $(no-shell)\nsecond-line")
				c, o, e := checkOutput(root, jsonMode)
				if c != code || o != out || e != err {
					t.Fatal("recording changed output")
				}
				rows := sessionRows(t, log)
				if len(rows) != 1 {
					t.Fatalf("want one record, got %d", len(rows))
				}
				if rows[0]["sessionId"] != os.Getenv("CLAUDE_CODE_SESSION_ID") {
					t.Fatal(rows)
				}
				t.Setenv("CLAUDE_CODE_SESSION_ID", "other-session")
				checkOutput(root, jsonMode)
				if len(sessionRows(t, log)) != 1 {
					t.Fatal("unchanged canvas reassigned")
				}
				putFile(t, root, "design/a.html", validCanvas+"<!-- changed -->")
				checkOutput(root, jsonMode)
				if len(sessionRows(t, log)) != 2 {
					t.Fatal("changed hash missing")
				}
				if bad {
					if code != 4 {
						t.Fatal(code)
					}
				} else if code != 0 {
					t.Fatal(code)
				}
			})
		}
	}
}
func TestSessionEnvironmentAndMissingDirectory(t *testing.T) {
	cases := []struct {
		name        string
		env         map[string]string
		count       int
		runtime, id string
	}{
		{"absent", nil, 0, "", ""},
		{"claude", map[string]string{"CLAUDE_CODE_SESSION_ID": "c"}, 1, "claude", "c"},
		{"thread", map[string]string{"CODEX_THREAD_ID": "t"}, 1, "codex", "t"},
		{"legacy", map[string]string{"CODEX_SESSION_ID": "s"}, 1, "codex", "s"},
		{"equal", map[string]string{"CODEX_THREAD_ID": "t", "CODEX_SESSION_ID": "t"}, 1, "codex", "t"},
		{"conflict", map[string]string{"CODEX_THREAD_ID": "t", "CODEX_SESSION_ID": "s"}, 0, "", ""},
		{"both", map[string]string{"CLAUDE_CODE_SESSION_ID": "c", "CODEX_THREAD_ID": "t"}, 0, "", ""},
		{"both legacy", map[string]string{"CLAUDE_CODE_SESSION_ID": "c", "CODEX_SESSION_ID": "s"}, 0, "", ""},
		{"invalid id", map[string]string{"CLAUDE_CODE_SESSION_ID": "-option"}, 0, "", ""},
		{"relative runtime", map[string]string{"CLAUDE_CODE_SESSION_ID": "c", "DOAN_RUNTIME": "relative/runtime.json"}, 0, "", ""},
		{"relative config", map[string]string{"CLAUDE_CODE_SESSION_ID": "c", "CLAUDE_CONFIG_DIR": "relative"}, 0, "", ""},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			root, log := sessionFixture(t)
			for k, v := range tt.env {
				t.Setenv(k, v)
			}
			checkOutput(root, true)
			rows := sessionRows(t, log)
			if len(rows) != tt.count {
				t.Fatalf("rows=%v", rows)
			}
			if len(rows) > 0 {
				if rows[0]["runtime"] != tt.runtime || rows[0]["sessionId"] != tt.id {
					t.Fatal(rows)
				}
				want, _ := filepath.EvalSymlinks(filepath.Join(os.Getenv("HOME"), "."+tt.runtime))
				if rows[0]["configDir"] != want {
					t.Fatal(rows)
				}
			}
		})
	}
	for _, kind := range []string{"missing userData", "missing config", "file config", "write failure", "default path"} {
		t.Run(kind, func(t *testing.T) {
			root, log := sessionFixture(t)
			code, out, err := checkOutput(root, true)
			t.Setenv("CLAUDE_CODE_SESSION_ID", "c")
			switch kind {
			case "missing userData":
				if e := os.Remove(filepath.Dir(log)); e != nil {
					t.Fatal(e)
				}
			case "missing config":
				t.Setenv("CLAUDE_CONFIG_DIR", filepath.Join(os.Getenv("HOME"), "absent"))
			case "file config":
				putFile(t, os.Getenv("HOME"), "file", "x")
				t.Setenv("CLAUDE_CONFIG_DIR", filepath.Join(os.Getenv("HOME"), "file"))
			case "write failure":
				if e := os.Mkdir(log, 0700); e != nil {
					t.Fatal(e)
				}
			case "default path":
				t.Setenv("DOAN_RUNTIME", "")
				log = filepath.Join(os.Getenv("HOME"), "Library", "Application Support", "doan", "sessions.jsonl")
			}
			c, o, e := checkOutput(root, true)
			if c != code || o != out || e != err {
				t.Fatal("failure changed output")
			}
			if kind != "write failure" {
				if _, e := os.Stat(log); !os.IsNotExist(e) {
					t.Fatal("unexpected log", e)
				}
			}
		})
	}
}
func TestSessionMCPNeverRecordsInheritedIdentity(t *testing.T) {
	root, log := sessionFixture(t)
	t.Setenv("CLAUDE_CODE_SESSION_ID", "c")
	cs := mcpClient(t)
	callTool(t, cs, "check", map[string]any{"repo": root})
	if len(sessionRows(t, log)) != 0 {
		t.Fatal("MCP recorded")
	}
	checkOutput(root, true)
	if len(sessionRows(t, log)) != 1 {
		t.Fatal("shell did not record")
	}
}
func TestSessionPriorMalformedAndLargeLines(t *testing.T) {
	root, log := sessionFixture(t)
	t.Setenv("CLAUDE_CODE_SESSION_ID", "c")
	checkOutput(root, true)
	original := readFile(t, filepath.Dir(log), filepath.Base(log))
	for _, noise := range []string{"{bad}\n", `{"v":2}` + "\n", strings.Repeat("x", 2<<20) + "\n"} {
		putFile(t, filepath.Dir(log), filepath.Base(log), noise+original+noise+`{"v":`)
		checkOutput(root, true)
		if got := readFile(t, filepath.Dir(log), filepath.Base(log)); got != noise+original+noise+`{"v":` {
			t.Fatal("invalid prior lines hid valid hash")
		}
	}
	// A torn last line must not absorb the next complete record.
	putFile(t, root, "design/a.html", validCanvas+"<!--new-->")
	checkOutput(root, true)
	b := readFile(t, filepath.Dir(log), filepath.Base(log))
	lines := strings.Split(strings.TrimSuffix(b, "\n"), "\n")
	var row map[string]any
	if e := json.Unmarshal([]byte(lines[len(lines)-1]), &row); e != nil {
		t.Fatal(e)
	}
	if e := formats.ValidateSessionRecord(row); e != nil {
		t.Fatal(e)
	}
}
func TestSessionCanonicalPathsAndMovedCanvas(t *testing.T) {
	root, log := sessionFixture(t)
	t.Setenv("CLAUDE_CODE_SESSION_ID", "c")
	alias := filepath.Join(os.Getenv("HOME"), "profile-link")
	if e := os.Symlink(filepath.Join(os.Getenv("HOME"), ".claude"), alias); e != nil {
		t.Fatal(e)
	}
	t.Setenv("CLAUDE_CONFIG_DIR", alias)
	checkOutput(root, true)
	rows := sessionRows(t, log)
	if len(rows) != 1 {
		t.Fatal(rows)
	}
	real, _ := filepath.EvalSymlinks(root)
	if rows[0]["root"] != real || rows[0]["cwd"] != real || rows[0]["configDir"] == alias {
		t.Fatal(rows)
	}
	if e := os.Rename(filepath.Join(root, "design/a.html"), filepath.Join(root, "design/a\\..\\b.html")); e != nil {
		t.Fatal(e)
	}
	checkOutput(root, true)
	if len(sessionRows(t, log)) != 1 {
		t.Fatal("move reassigned unchanged ID")
	}
	putFile(t, root, "design/a\\..\\b.html", validCanvas+"<!--changed-->")
	checkOutput(root, true)
	rows = sessionRows(t, log)
	if len(rows) != 2 || rows[1]["canvas"].(map[string]any)["path"] != "design/a\\..\\b.html" {
		t.Fatal(rows)
	}
}
func TestSessionConcurrentProcessHelper(t *testing.T) {
	if os.Getenv("DOAN_SESSION_TEST_CHILD") != "1" {
		return
	}
	code, _, _ := checkOutput(os.Getenv("DOAN_SESSION_TEST_ROOT"), true)
	if code != 0 {
		t.Fatal(code)
	}
}
func TestSessionConcurrentProcesses(t *testing.T) {
	root, log := sessionFixture(t)
	t.Setenv("CLAUDE_CODE_SESSION_ID", "c")
	commands := []*exec.Cmd{}
	for i := 0; i < 8; i++ {
		cmd := exec.Command(os.Args[0], "-test.run=^TestSessionConcurrentProcessHelper$")
		cmd.Dir = root
		cmd.Env = append(os.Environ(), "DOAN_SESSION_TEST_CHILD=1", "DOAN_SESSION_TEST_ROOT="+root)
		if e := cmd.Start(); e != nil {
			t.Fatal(e)
		}
		commands = append(commands, cmd)
	}
	for _, cmd := range commands {
		if e := cmd.Wait(); e != nil {
			t.Fatal(e)
		}
	}
	rows := sessionRows(t, log)
	if len(rows) < 1 || len(rows) > 8 {
		t.Fatal(len(rows))
	}
}
