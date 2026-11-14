package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

func putFile(t *testing.T, root, path, body string) {
	t.Helper()
	p := filepath.Join(root, path)
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(body), 0644); err != nil {
		t.Fatal(err)
	}
}
func readFile(t *testing.T, root, path string) string {
	t.Helper()
	b, e := os.ReadFile(filepath.Join(root, path))
	if e != nil {
		t.Fatal(e)
	}
	return string(b)
}
func runJSON(t *testing.T, root string, want int, args ...string) map[string]any {
	t.Helper()
	var out, errout bytes.Buffer
	args = append(args, "--repo", root, "--json")
	code := Run(args, strings.NewReader(""), &out, &errout)
	if code != want || errout.Len() != 0 {
		t.Fatalf("%v: exit %d want %d, stdout %s stderr %s", args, code, want, &out, &errout)
	}
	var v map[string]any
	if e := json.Unmarshal(out.Bytes(), &v); e != nil {
		t.Fatal(e, out.String())
	}
	if e := formats.ValidateEnvelope(v); e != nil {
		t.Fatal(e)
	}
	return v
}
func cliEnvelope(t *testing.T, args ...string) map[string]any {
	t.Helper()
	var out, errout bytes.Buffer
	Run(append(args, "--json"), strings.NewReader(""), &out, &errout)
	var v map[string]any
	if e := json.Unmarshal(out.Bytes(), &v); e != nil || errout.Len() != 0 {
		t.Fatal(args, e, out.String(), errout.String())
	}
	return v
}
func result(t *testing.T, root string, want int, args ...string) map[string]any {
	t.Helper()
	return runJSON(t, root, want, args...)["result"].(map[string]any)
}
func failure(t *testing.T, root, code string, args ...string) {
	t.Helper()
	got := runJSON(t, root, ExitCode(code), args...)
	if got["error"].(map[string]any)["code"] != code {
		t.Fatal(got)
	}
}
func initialized(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	result(t, root, 0, "init")
	return root
}

const validCanvas = `<head><meta name="doan:canvas" content="foo"><meta name="doan:width" content="800"><title>Example</title></head><body><div data-doan-frame="main" data-doan-title="Main"></div></body>`
const linguistLine = ".doan/** linguist-documentation"

func TestInitFreshRepoWritesTheAttributeLine(t *testing.T) {
	r := t.TempDir()
	got := result(t, r, 0, "init")
	if readFile(t, r, ".gitattributes") != linguistLine+"\n" || !reflect.DeepEqual(got["created"], []any{".doan/canvases/", ".doan/config.json", ".gitattributes"}) {
		t.Fatal(got, readFile(t, r, ".gitattributes"))
	}
}

func TestInitAndEmptyCommands(t *testing.T) {
	root := initialized(t)
	config := readFile(t, root, ".doan/config.json")
	attrs := readFile(t, root, ".gitattributes")
	got := result(t, root, 0, "init", "--token-css", "missing")
	if got["initialized"] != false || len(got["created"].([]any)) != 0 || readFile(t, root, ".doan/config.json") != config || readFile(t, root, ".gitattributes") != attrs {
		t.Fatal(got)
	}
	for _, cmd := range []string{"ls", "check"} {
		got := result(t, root, 0, cmd)
		key := map[string]string{"ls": "canvases", "check": "findings"}[cmd]
		want := 0
		if cmd == "check" {
			want = 1
		}
		if len(got[key].([]any)) != want {
			t.Fatal(got)
		}
	}
	for _, p := range []string{"missing", ".doan/canvases", "/abs", "../x"} {
		r := t.TempDir()
		putFile(t, r, ".doan/canvases/file", "")
		failure(t, r, "usage_error", "init", "--token-css", p)
		if _, e := os.Stat(filepath.Join(r, ".doan/config.json")); !os.IsNotExist(e) {
			t.Fatal(e)
		}
	}
	r := t.TempDir()
	putFile(t, r, ".doan/config.json", "{")
	failure(t, r, "invalid_config", "init")
	if readFile(t, r, ".doan/config.json") != "{" {
		t.Fatal("overwritten")
	}
	missingRepo := filepath.Join(t.TempDir(), "missing")
	failure(t, missingRepo, "usage_error", "init")
	if _, e := os.Stat(missingRepo); !os.IsNotExist(e) {
		t.Fatal("missing repo created", e)
	}
	// An older Doan also wrote this line; init leaves it in place.
	const unionLine = ".doan/comments/*.jsonl merge=union"
	for _, tt := range []struct {
		before, after string
		changed       bool
	}{
		{"x", "x\n" + linguistLine + "\n", true},
		{"x\r\n", "x\r\n" + linguistLine + "\r\n", true},
		{unionLine + "\r\n", unionLine + "\r\n" + linguistLine + "\r\n", true},
		{linguistLine + "\n", linguistLine + "\n", false},
		{unionLine + "\r\n" + linguistLine + "\r\n", unionLine + "\r\n" + linguistLine + "\r\n", false},
	} {
		r := t.TempDir()
		putFile(t, r, ".gitattributes", tt.before)
		got := result(t, r, 0, "init")
		if readFile(t, r, ".gitattributes") != tt.after {
			t.Fatal(got)
		}
		found := false
		for _, p := range got["created"].([]any) {
			if p == ".gitattributes" {
				found = true
			}
		}
		if found != tt.changed {
			t.Fatal(got)
		}
	}
	nested := filepath.Join(root, "nested")
	if e := os.Mkdir(nested, 0755); e != nil {
		t.Fatal(e)
	}
	result(t, nested, 0, "init")
}
func TestInitPromptAndToken(t *testing.T) {
	root := t.TempDir()
	putFile(t, root, "tokens.css", ":root{--x:red}")
	calls := 0
	ctx := Context{Start: root, Terminal: true, Prompt: func(string) (string, error) { calls++; return "./tokens.css", nil }}
	o, e := Init(ctx, Flags{}, nil)
	if e != nil || o.Exit != 0 || calls != 1 {
		t.Fatalf("%+v %v %d", o, e, calls)
	}
	if !strings.Contains(readFile(t, root, ".doan/config.json"), `"tokenCss": "tokens.css"`) {
		t.Fatal("token path")
	}
	outside := t.TempDir()
	putFile(t, outside, "x.css", "")
	r := t.TempDir()
	if e := os.Symlink(filepath.Join(outside, "x.css"), filepath.Join(r, "link.css")); e != nil {
		t.Fatal(e)
	}
	failure(t, r, "usage_error", "init", "--token-css", "link.css")
	if _, e := os.Stat(filepath.Join(r, ".doan/config.json")); !os.IsNotExist(e) {
		t.Fatal("outside token wrote config", e)
	}
}
func TestCheckReachAndMetadata(t *testing.T) {
	root := initialized(t)
	putFile(t, root, ".doan/canvases/a.html", `<head><meta name="doan:canvas" content="foo"><meta name="doan:width" content="800"><link rel="stylesheet" href="a.css"><style>@import "a.css"; p{color:var(--x)}</style></head>`)
	putFile(t, root, ".doan/canvases/a.css", `@import "../../assets/b.css"; @import "missing.css";`)
	putFile(t, root, "assets/b.css", `@import "../.doan/canvases/a.css"; :root{--x:red}`)
	got := result(t, root, 4, "check")
	if got["summary"].(map[string]any)["errors"] != float64(1) {
		t.Fatal(got)
	}
	f := got["findings"].([]any)[0].(map[string]any)
	if f["code"] != "css_not_served" || f["path"] != ".doan/canvases/a.css" {
		t.Fatal(f)
	}
	putFile(t, root, ".doan/config.json", `{"v":1,"serve":["assets"]}`)
	result(t, root, 0, "check")
	putFile(t, root, ".doan/canvases/z.html", "\xff<div>none</div>")
	got = result(t, root, 4, "check")
	ls := result(t, root, 0, "ls")["canvases"].([]any)[1].(map[string]any)
	if _, ok := ls["id"]; ok {
		t.Fatal(ls)
	}
	if _, ok := ls["width"]; ok {
		t.Fatal(ls)
	}
}
func TestHelpUsageAndHumanError(t *testing.T) {
	root := t.TempDir()
	for _, args := range [][]string{{"help"}, {"--help"}, {"-h"}, {"ls", "--help"}} {
		if result(t, root, 0, args...)["usage"] == nil {
			t.Fatal(args)
		}
	}
	failure(t, root, "usage_error", "unknown")
	failure(t, root, "usage_error", "ls", "--agent", "codex")
	failure(t, root, "repo_not_found", "ls")
	var out, errout bytes.Buffer
	if Run([]string{"ls", "--repo", root}, strings.NewReader(""), &out, &errout) != 2 || !strings.HasPrefix(errout.String(), "error:") {
		t.Fatal(&out, &errout)
	}
}

// doan remove is in help only, with the line that says when an agent may run it; the guide and stub do not name it.
func TestHelpListsRemoveForTheUserOnly(t *testing.T) {
	usage := result(t, t.TempDir(), 0, "help")["usage"].(string)
	if !strings.Contains(usage, "\n  remove\n      (removes this project from Doan's list; files stay. Only when the user asks)\n") {
		t.Fatal(usage)
	}
}
func TestRemovedMCPCommandIsUnknown(t *testing.T) {
	if strings.Contains(result(t, t.TempDir(), 0, "help")["usage"].(string), "mcp") {
		t.Fatal("usage lists mcp")
	}
	failure(t, t.TempDir(), "usage_error", "mcp")
	// stdin stays open, so the command must fail without reading it.
	stdin, _ := io.Pipe()
	done := make(chan int, 1)
	var out, errout bytes.Buffer
	go func() { done <- Run([]string{"mcp"}, stdin, &out, &errout) }()
	select {
	case code := <-done:
		if code != 2 || out.Len() != 0 || errout.String() != "error: Unknown command: mcp\nRun `doan help`\n" {
			t.Fatal(code, &out, &errout)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("doan mcp waited on stdin")
	}
}

// nextSteps, help and messages come from these sources; none may point agents to MCP.
func TestCLISourcesNameNoMCP(t *testing.T) {
	sources, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range sources {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		if strings.Contains(strings.ToLower(readFile(t, ".", file)), "mcp") {
			t.Errorf("%s mentions MCP", file)
		}
	}
	for _, code := range []string{"app_not_running", "app_protocol_mismatch", "project_not_open"} {
		if strings.Contains(strings.Join(appError(code, "m").NextSteps, "\n"), "MCP") {
			t.Errorf("active %s nextSteps mention MCP", code)
		}
	}
	for _, code := range []string{"app_not_running", "app_launch_failed"} {
		if strings.Contains(strings.Join(onboardingFailure(code, "m").NextSteps, "\n"), "MCP") {
			t.Errorf("onboarding %s nextSteps mention MCP", code)
		}
	}
}

func TestCheckCanvasCount(t *testing.T) {
	for _, tt := range []struct {
		name, body  string
		count, exit int
	}{
		{"empty", "", 0, 0},
		{"valid", validCanvas, 1, 0},
		{"invalid", "<html></html>", 1, 4},
		{"unparsable", strings.Repeat("<div>", 600), 1, 4},
	} {
		t.Run(tt.name, func(t *testing.T) {
			root := initialized(t)
			if tt.body != "" {
				putFile(t, root, ".doan/canvases/a.html", tt.body)
			}
			got := result(t, root, tt.exit, "check")
			summary := got["summary"].(map[string]any)
			if summary["canvases"] != float64(tt.count) {
				t.Errorf("summary: %v", summary)
			}
			if tt.count == 0 && (summary["errors"] != float64(0) || summary["warnings"] != float64(1)) {
				t.Error(summary)
			}
			var out, errout bytes.Buffer
			exit := Run([]string{"check", "--repo", root}, strings.NewReader(""), &out, &errout)
			if exit != tt.exit || errout.Len() != 0 || !strings.Contains(out.String(), fmt.Sprintf("%d canvases checked", tt.count)) {
				t.Fatalf("exit %d stdout %s stderr %s", exit, &out, &errout)
			}
		})
	}
}
