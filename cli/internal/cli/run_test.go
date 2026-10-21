package cli

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
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
const cmt1 = "cmt_00000000-0000-4000-8000-000000000001"
const cmt2 = "cmt_00000000-0000-4000-8000-000000000002"

func createLine(id, n, html string) string {
	hash := fmt.Sprintf("sha256:%x", sha256.Sum256([]byte(html)))
	return fmt.Sprintf(`{"v":1,"id":"evt_00000000-0000-4000-8000-%012s","at":"2090-01-01T00:00:00.000Z","type":"create","comment":%q,"by":{"kind":"human","name":"Human"},"body":"change this","canvasHash":%q,"target":{}}`, n, id, hash)
}
func TestInitAndEmptyCommands(t *testing.T) {
	root := initialized(t)
	config := readFile(t, root, ".doan/config.json")
	attrs := readFile(t, root, ".gitattributes")
	got := result(t, root, 0, "init", "--token-css", "missing")
	if got["initialized"] != false || len(got["created"].([]any)) != 0 || readFile(t, root, ".doan/config.json") != config || readFile(t, root, ".gitattributes") != attrs {
		t.Fatal(got)
	}
	for _, cmd := range []string{"ls", "comments", "check"} {
		got := result(t, root, 0, cmd)
		key := map[string]string{"ls": "canvases", "comments": "comments", "check": "findings"}[cmd]
		if len(got[key].([]any)) != 0 {
			t.Fatal(got)
		}
	}
	failure(t, root, "comment_not_found", "comment", "resolve", cmt1, "--agent", "codex")
	for _, p := range []string{"missing", "design", "/abs", "../x"} {
		r := t.TempDir()
		putFile(t, r, "design/file", "")
		failure(t, r, "usage_error", "init", "--token-css", p)
		if _, e := os.Stat(filepath.Join(r, ".doan")); !os.IsNotExist(e) {
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
	for _, tt := range []struct {
		before, after string
		changed       bool
	}{{"x", "x\n.doan/comments/*.jsonl merge=union\n", true}, {"x\r\n", "x\r\n.doan/comments/*.jsonl merge=union\r\n", true}, {".doan/comments/*.jsonl merge=union\r\n", ".doan/comments/*.jsonl merge=union\r\n", false}} {
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
	if _, e := os.Stat(filepath.Join(r, ".doan")); !os.IsNotExist(e) {
		t.Fatal("outside token wrote config", e)
	}
}
func TestCommentsAndResolve(t *testing.T) {
	root := initialized(t)
	putFile(t, root, "design/a.html", validCanvas)
	log := createLine(cmt1, "1", validCanvas) + "\n" + createLine(cmt2, "2", validCanvas)
	putFile(t, root, ".doan/comments/foo.jsonl", log)
	got := result(t, root, 0, "comments")
	cs := got["comments"].([]any)
	if len(cs) != 2 || cs[0].(map[string]any)["outdated"] != false {
		t.Fatal(got)
	}
	ls := result(t, root, 0, "ls")["canvases"].([]any)[0].(map[string]any)
	if ls["id"] != "foo" || ls["comments"].(map[string]any)["open"] != float64(2) {
		t.Fatal(ls)
	}
	putFile(t, root, "design/a.html", validCanvas+"changed")
	if result(t, root, 0, "comments")["comments"].([]any)[0].(map[string]any)["outdated"] != true {
		t.Fatal("not outdated")
	}
	putFile(t, root, "design/b.html", validCanvas)
	for _, c := range result(t, root, 0, "comments")["comments"].([]any) {
		if _, ok := c.(map[string]any)["canvasPath"]; ok {
			t.Fatal(c)
		}
	}
	missing := runJSON(t, root, 2, "comment", "resolve", cmt1, "missing-a", "missing-b", "--agent", "codex")["error"].(map[string]any)
	if missing["code"] != "comment_not_found" || !strings.Contains(missing["message"].(string), "missing-a") || !strings.Contains(missing["message"].(string), "missing-b") {
		t.Fatal(missing)
	}
	if readFile(t, root, ".doan/comments/foo.jsonl") != log {
		t.Fatal("partial write")
	}
	for _, args := range [][]string{{"comment", "resolve", "--agent", "codex"}, {"comment", "resolve", cmt1}, {"comment", "resolve", cmt1, "--agent", "Claude"}, {"comment", "resolve", cmt1, "--agent", ""}} {
		failure(t, root, "usage_error", args...)
		if readFile(t, root, ".doan/comments/foo.jsonl") != log {
			t.Fatal("invalid agent or missing ids changed log")
		}
	}
	got = result(t, root, 0, "comment", "resolve", cmt1, cmt2, cmt1, "--agent", "codex")
	if len(got["resolved"].([]any)) != 2 {
		t.Fatal(got)
	}
	text := readFile(t, root, ".doan/comments/foo.jsonl")
	fold := formats.FoldText(text)
	if len(fold.Warnings) != 0 || fold.Comments[0].Status != "resolved" {
		t.Fatal(fold)
	}
	parsed := formats.ParseLines(text)
	if len(parsed.Events) != 4 {
		t.Fatal(parsed)
	}
	a, _ := time.Parse(time.RFC3339Nano, parsed.Events[2].Event.At)
	b, _ := time.Parse(time.RFC3339Nano, parsed.Events[3].Event.At)
	if b.Sub(a) < time.Millisecond || parsed.Events[2].Event.At <= "2090-01-01T00:00:00.000Z" {
		t.Fatal(parsed)
	}
	got = result(t, root, 0, "comment", "resolve", cmt1, "--agent", "codex")
	if len(got["alreadyResolved"].([]any)) != 1 || text != readFile(t, root, ".doan/comments/foo.jsonl") {
		t.Fatal(got)
	}
}
func TestCommentMatchingAndWarnings(t *testing.T) {
	root := initialized(t)
	putFile(t, root, "design/a.html", validCanvas)
	if got := result(t, root, 0, "comments", "--canvas", "foo"); len(got["comments"].([]any)) != 0 {
		t.Fatal(got)
	}
	for _, id := range []string{"../x", "Foo"} {
		failure(t, root, "canvas_not_found", "comments", "--canvas", id)
	}
	putFile(t, root, ".doan/comments/FOO.jsonl", createLine(cmt1, "1", validCanvas)+"\nbroken\n{\"v\":2}\n")
	got := result(t, root, 0, "comments")
	if len(got["warnings"].([]any)) != 2 {
		t.Fatal(got)
	}
	c := got["comments"].([]any)[0].(map[string]any)
	if _, ok := c["canvasPath"]; ok {
		t.Fatal(c)
	}
	for _, w := range got["warnings"].([]any) {
		if w.(map[string]any)["file"] != ".doan/comments/FOO.jsonl" {
			t.Fatal(w)
		}
	}
	check := result(t, root, 0, "check")
	if check["summary"].(map[string]any)["warnings"] != float64(1) || check["findings"].([]any)[0].(map[string]any)["code"] != "orphan_comment_file" {
		t.Fatal(check)
	}
	putFile(t, root, ".doan/comments/other.jsonl", createLine(cmt1, "1", validCanvas))
	result(t, root, 0, "comment", "resolve", cmt1, "--agent", "codex")
	for _, p := range []string{"FOO", "other"} {
		if formats.FoldText(readFile(t, root, ".doan/comments/"+p+".jsonl")).Comments[0].Status != "resolved" {
			t.Fatal(p)
		}
	}
}
func TestCheckReachAndMetadata(t *testing.T) {
	root := initialized(t)
	putFile(t, root, "design/a.html", `<head><meta name="doan:canvas" content="foo"><meta name="doan:width" content="800"><link rel="stylesheet" href="a.css"><style>@import "a.css"; p{color:var(--x)}</style></head>`)
	putFile(t, root, "design/a.css", `@import "../assets/b.css"; @import "missing.css";`)
	putFile(t, root, "assets/b.css", `@import "../design/a.css"; :root{--x:red}`)
	got := result(t, root, 4, "check")
	if got["summary"].(map[string]any)["errors"] != float64(1) {
		t.Fatal(got)
	}
	f := got["findings"].([]any)[0].(map[string]any)
	if f["code"] != "css_not_served" || f["path"] != "design/a.css" {
		t.Fatal(f)
	}
	putFile(t, root, ".doan/config.json", `{"v":1,"serve":["assets"]}`)
	result(t, root, 0, "check")
	putFile(t, root, "design/z.html", "\xff<div>none</div>")
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
func TestMCPCommandRejectsFlagsAndArgs(t *testing.T) {
	if !strings.Contains(result(t, t.TempDir(), 0, "help")["usage"].(string), "\n  mcp\n") {
		t.Fatal("usage lacks mcp")
	}
	for _, args := range [][]string{{"mcp", "--foo"}, {"mcp", "--json"}, {"--json", "mcp"}, {"mcp", "--repo", "x"}, {"mcp", "x"}, {"mcp", "--canvas=foo"}} {
		var out, errout bytes.Buffer
		code := Run(append(args, "--json"), strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"ping"}`+"\n"), &out, &errout)
		var v map[string]any
		if code != 2 || errout.Len() != 0 || json.Unmarshal(out.Bytes(), &v) != nil || v["error"].(map[string]any)["code"] != "usage_error" {
			t.Fatal(args, code, &out, &errout)
		}
	}
	var out, errout bytes.Buffer
	if code := Run([]string{"mcp", "x"}, strings.NewReader(""), &out, &errout); code != 2 || out.Len() != 0 || !strings.HasPrefix(errout.String(), "error:") {
		t.Fatal(code, &out, &errout)
	}
}
func TestMCPStdioExit(t *testing.T) {
	var out, errout bytes.Buffer
	if code := Run([]string{"mcp"}, strings.NewReader(""), &out, &errout); code != 0 || out.Len() != 0 || errout.Len() != 0 {
		t.Fatal(code, &out, &errout)
	}
	if code := Run([]string{"mcp"}, strings.NewReader("not json\n"), &out, &errout); code != 1 || out.Len() != 0 || !strings.HasPrefix(errout.String(), "error: ") {
		t.Fatal(code, &out, &errout)
	}
}
func TestMCPOverStdioPipes(t *testing.T) {
	inR, inW := io.Pipe()
	outR, outW := io.Pipe()
	var errout bytes.Buffer
	done := make(chan int, 1)
	go func() {
		code := Run([]string{"mcp"}, inR, outW, &errout)
		outW.Close()
		done <- code
	}()
	lines := bufio.NewScanner(outR)
	lines.Buffer(nil, 1<<20)
	send := func(s string) {
		if _, e := io.WriteString(inW, s+"\n"); e != nil {
			t.Fatal(e)
		}
	}
	type message struct {
		JSONRPC string          `json:"jsonrpc"`
		ID      *int            `json:"id"`
		Result  json.RawMessage `json:"result"`
		Error   any             `json:"error"`
	}
	next := func() message {
		t.Helper()
		if !lines.Scan() {
			t.Fatal("stdout closed", lines.Err(), &errout)
		}
		var m message
		if e := json.Unmarshal(lines.Bytes(), &m); e != nil || m.JSONRPC != "2.0" {
			t.Fatal(e, lines.Text())
		}
		return m
	}
	// Close stdin only after the expected responses arrive: on EOF the SDK drops
	// responses that are not yet written.
	send(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}`)
	if m := next(); *m.ID != 1 || m.Error != nil {
		t.Fatal(m)
	}
	send(`{"jsonrpc":"2.0","method":"notifications/initialized"}`)
	send(`{"jsonrpc":"2.0","id":2,"method":"tools/list"}`)
	m := next()
	var list struct{ Tools []struct{ Name string } }
	if *m.ID != 2 || json.Unmarshal(m.Result, &list) != nil || len(list.Tools) != 6 {
		t.Fatal(string(m.Result))
	}
	dir := t.TempDir()
	send(`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"init","arguments":{"repo":` + fmt.Sprintf("%q", dir) + `}}}`)
	m = next()
	var call struct{ IsError bool }
	if *m.ID != 3 || json.Unmarshal(m.Result, &call) != nil || call.IsError {
		t.Fatal(string(m.Result))
	}
	if strings.Contains(readFile(t, dir, ".doan/config.json"), "tokenCss") {
		t.Fatal("token prompt answered")
	}
	inW.Close()
	for lines.Scan() {
		var m message
		if e := json.Unmarshal(lines.Bytes(), &m); e != nil || m.JSONRPC != "2.0" {
			t.Fatal(e, lines.Text())
		}
	}
	if code := <-done; code != 0 || errout.Len() != 0 {
		t.Fatal(code, &errout)
	}
}
