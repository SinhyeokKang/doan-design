package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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
	putFile(t, root, "design/a.html", validCanvas+strings.Repeat("<div>", 600))
	putFile(t, root, ".doan/comments/foo.jsonl", createLine(cmt1, "1", validCanvas))
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
	if len(ls) != 3 || len(ls["frames"].([]any)) != 0 || ls["comments"].(map[string]any)["open"] != float64(0) {
		t.Fatal(ls)
	}
	c := result(t, root, 0, "comments")["comments"].([]any)[0].(map[string]any)
	if _, ok := c["canvasPath"]; ok {
		t.Fatal(c)
	}
}
func TestInvalidCanvasIDsStillMatchComments(t *testing.T) {
	for _, html := range []string{strings.Replace(validCanvas, `content="foo"`, `content="FOO"`, 1), strings.Replace(validCanvas, "</head>", `<meta name="doan:canvas" content="other"></head>`, 1)} {
		root := initialized(t)
		putFile(t, root, "design/a.html", html)
		id := "foo"
		if strings.Contains(html, `content="FOO"`) {
			id = "FOO"
		}
		putFile(t, root, ".doan/comments/"+id+".jsonl", createLine(cmt1, "1", html))
		c := result(t, root, 0, "comments", "--canvas", id)["comments"].([]any)[0].(map[string]any)
		if c["canvasPath"] != "design/a.html" || c["outdated"] != false {
			t.Fatal(c)
		}
		ls := result(t, root, 0, "ls")["canvases"].([]any)[0].(map[string]any)
		if _, ok := ls["id"]; ok {
			t.Fatal(ls)
		}
		if ls["comments"].(map[string]any)["open"] != float64(1) {
			t.Fatal(ls)
		}
	}
}
func TestResolveMaximumTimestampErrorsAndUnionOrder(t *testing.T) {
	root := initialized(t)
	path := ".doan/comments/foo.jsonl"
	line := createLine(cmt1, "1", validCanvas)
	invalid := strings.Replace(line, "2090-01-01", "2090-02-30", 1)
	putFile(t, root, path, invalid)
	v := runJSON(t, root, 1, "comment", "resolve", cmt1, "--agent", "codex")
	err := v["error"].(map[string]any)
	if err["code"] != "internal_error" || !strings.Contains(err["message"].(string), path) || readFile(t, root, path) != invalid {
		t.Fatal(v)
	}
	later := strings.Replace(createLine(cmt2, "2", validCanvas), "2090-01-01", "2091-01-01", 1)
	putFile(t, root, path, later+"\n"+line)
	result(t, root, 0, "comment", "resolve", cmt1, "--agent", "codex")
	p := formats.ParseLines(readFile(t, root, path))
	if p.Events[2].Event.At <= "2091-01-01T00:00:00.000Z" {
		t.Fatal(p)
	}
}

type brokenRandom struct{}

func (brokenRandom) Read([]byte) (int, error) { return 0, errors.New("random unavailable") }
func TestResolveRandomFailureDoesNotAppend(t *testing.T) {
	root := initialized(t)
	path := ".doan/comments/foo.jsonl"
	line := createLine(cmt1, "1", validCanvas)
	putFile(t, root, path, line)
	_, e := Resolve(Context{Start: root, Now: time.Now, Random: brokenRandom{}}, Flags{Agent: "codex"}, []string{cmt1})
	if e == nil || e.Code != "internal_error" || readFile(t, root, path) != line {
		t.Fatal(e)
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
func TestDeletedCommentCannotResolve(t *testing.T) {
	root := initialized(t)
	line := createLine(cmt1, "1", validCanvas) + "\n" + `{"v":1,"id":"evt_00000000-0000-4000-8000-000000000002","at":"2090-01-01T00:00:00.001Z","type":"delete","comment":"` + cmt1 + `","by":{"kind":"human","name":"Human"}}`
	putFile(t, root, ".doan/comments/foo.jsonl", line)
	failure(t, root, "comment_not_found", "comment", "resolve", cmt1, "--agent", "codex")
	if readFile(t, root, ".doan/comments/foo.jsonl") != line {
		t.Fatal("rewritten")
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
