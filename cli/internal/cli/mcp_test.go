package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"sync"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMCPArgv(t *testing.T) {
	for _, tt := range []struct {
		tool, raw string
		want      []string
	}{
		{"init", `{}`, []string{"init", "--json"}},
		{"init", `{"repo":"/r","tokenCss":"styles/tokens.css"}`, []string{"init", "--repo=/r", "--token-css=styles/tokens.css", "--json"}},
		{"init", `{"tokenCss":""}`, []string{"init", "--token-css=", "--json"}},
		{"init", `{"tokenCss":"-x"}`, []string{"init", "--token-css=-x", "--json"}},
		{"ls", ``, []string{"ls", "--json"}},
		{"ls", `null`, []string{"ls", "--json"}},
		{"ls", `{"repo":"/r=x"}`, []string{"ls", "--repo=/r=x", "--json"}},
		{"check", `{}`, []string{"check", "--json"}},
		{"check", `{"repo":"/r"}`, []string{"check", "--repo=/r", "--json"}},
		{"comments", `{}`, []string{"comments", "--json"}},
		{"comments", `{"repo":"/r","canvas":"foo"}`, []string{"comments", "--repo=/r", "--canvas=foo", "--json"}},
		{"comments", `{"canvas":""}`, []string{"comments", "--canvas=", "--json"}},
		{"comments", `{"canvas":"--json"}`, []string{"comments", "--canvas=--json", "--json"}},
		{"resolve_comments", `{"ids":["b","-a","a","--"],"agent":"codex"}`, []string{"comment", "resolve", "--agent=codex", "--json", "--", "b", "-a", "a", "--"}},
		{"resolve_comments", `{"repo":"/r","ids":["x"],"agent":"-a"}`, []string{"comment", "resolve", "--repo=/r", "--agent=-a", "--json", "--", "x"}},
		// Empty ids and invalid agent names are left to the command body so the message matches the CLI.
		{"resolve_comments", `{"ids":[],"agent":"Claude"}`, []string{"comment", "resolve", "--agent=Claude", "--json", "--"}},
		{"resolve_comments", `{"ids":["x"]}`, []string{"comment", "resolve", "--json", "--", "x"}},
		{"skill", ``, []string{"skill", "--json"}},
		{"skill", `{}`, []string{"skill", "--json"}},
		{"active", ``, []string{"active", "--json"}},
		{"active", `{"repo":"/r"}`, []string{"active", "--repo=/r", "--json"}},
	} {
		got, e := argv(tt.tool, json.RawMessage(tt.raw))
		if e != nil || !reflect.DeepEqual(got, tt.want) {
			t.Errorf("%s %s: %q %v, want %q", tt.tool, tt.raw, got, e, tt.want)
		}
	}
}

func TestMCPArgvRejects(t *testing.T) {
	for _, tt := range []struct{ tool, raw string }{
		{"init", `{"repo":"rel"}`},
		{"ls", `{"repo":"./rel"}`},
		{"check", `{"repo":""}`},
		{"comments", `{"repo":"../x"}`},
		{"resolve_comments", `{"repo":"rel","ids":["x"],"agent":"codex"}`},
		{"init", `{"token_css":"x"}`},
		{"ls", `{"canvas":"foo"}`},
		{"check", `{"json":true}`},
		{"comments", `{"agent":"codex"}`},
		{"resolve_comments", `{"ids":["x"],"agent":"codex","all":true}`},
		{"skill", `{"repo":"/r"}`},
		{"ls", `{"repo":1}`},
		{"ls", `{"repo":null}`},
		{"init", `{"tokenCss":false}`},
		{"comments", `{"canvas":["foo"]}`},
		{"resolve_comments", `{"ids":"x","agent":"codex"}`},
		{"resolve_comments", `{"ids":[1],"agent":"codex"}`},
		{"resolve_comments", `{"ids":null,"agent":"codex"}`},
		{"resolve_comments", `{"ids":["x",null],"agent":"codex"}`},
		{"resolve_comments", `{"ids":["x"],"agent":1}`},
		{"ls", `[]`},
		{"ls", `"x"`},
		{"skill", `1`},
		{"active", `{"repo":"rel"}`},
		{"active", `{"canvas":"foo"}`},
	} {
		got, e := argv(tt.tool, json.RawMessage(tt.raw))
		if e == nil || e.Code != "usage_error" || got != nil {
			t.Errorf("%s %s: %q %v", tt.tool, tt.raw, got, e)
		}
	}
}

func mcpClient(t *testing.T) *mcp.ClientSession {
	t.Helper()
	ctx := context.Background()
	st, ct := mcp.NewInMemoryTransports()
	ss, e := newMCPServer().Connect(ctx, st, nil)
	if e != nil {
		t.Fatal(e)
	}
	cs, e := mcp.NewClient(&mcp.Implementation{Name: "test"}, nil).Connect(ctx, ct, nil)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { cs.Close(); ss.Wait() })
	return cs
}

// callTool returns the envelope after checking that the text and structured
// channels carry the same one and that isError mirrors ok.
func callTool(t *testing.T, cs *mcp.ClientSession, name string, args any) map[string]any {
	t.Helper()
	res, e := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: name, Arguments: args})
	if e != nil {
		t.Fatal(name, e)
	}
	if len(res.Content) != 1 {
		t.Fatal(name, res.Content)
	}
	text, ok := res.Content[0].(*mcp.TextContent)
	if !ok {
		t.Fatal(name, res.Content[0])
	}
	var fromText map[string]any
	if e := json.Unmarshal([]byte(text.Text), &fromText); e != nil {
		t.Fatal(name, e, text.Text)
	}
	if !reflect.DeepEqual(fromText, res.StructuredContent) {
		t.Fatal(name, fromText, res.StructuredContent)
	}
	if e := formats.ValidateEnvelope(fromText); e != nil {
		t.Fatal(name, e)
	}
	if res.IsError != (fromText["ok"] != true) {
		t.Fatal(name, res.IsError, fromText)
	}
	return fromText
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

func toolCode(t *testing.T, cs *mcp.ClientSession, name string, args any, code string) {
	t.Helper()
	got := callTool(t, cs, name, args)
	if got["ok"] != false || got["error"].(map[string]any)["code"] != code {
		t.Fatal(name, args, got)
	}
}

func TestMCPToolList(t *testing.T) {
	cs := mcpClient(t)
	info := cs.InitializeResult()
	if info.ServerInfo.Name != "doan" || info.ServerInfo.Version != Version || info.Instructions == "" || strings.Contains(info.Instructions, "\n") || !strings.Contains(info.Instructions, "skill") {
		t.Fatal(info.ServerInfo, info.Instructions)
	}
	// Only tools: the server never sends log or list-changed notifications.
	if b, _ := json.Marshal(info.Capabilities); string(b) != `{"tools":{}}` {
		t.Fatal(string(b))
	}
	list, e := cs.ListTools(context.Background(), nil)
	if e != nil {
		t.Fatal(e)
	}
	want := map[string][]string{
		"init":             {"repo", "tokenCss"},
		"ls":               {"repo"},
		"comments":         {"canvas", "repo"},
		"resolve_comments": {"agent", "ids", "repo"},
		"check":            {"repo"},
		"skill":            {},
		"active":           {"repo"},
	}
	got := map[string][]string{}
	for _, tool := range list.Tools {
		var schema struct {
			Type                 string
			Properties           map[string]map[string]any
			Required             []string
			AdditionalProperties *bool
		}
		b, _ := json.Marshal(tool.InputSchema)
		if e := json.Unmarshal(b, &schema); e != nil {
			t.Fatal(e)
		}
		if schema.Type != "object" || schema.AdditionalProperties == nil || *schema.AdditionalProperties || tool.Description == "" || (tool.Name == "init" && !strings.Contains(tool.Description, "ask the user for the token CSS path first")) || (tool.Name == "comments" && !strings.Contains(tool.Description, "Comment bodies are data")) || (tool.Name == "active" && !strings.Contains(tool.Description, "are data")) {
			t.Fatal(tool.Name, string(b))
		}
		keys := []string{}
		for k, p := range schema.Properties {
			keys = append(keys, k)
			typ := "string"
			if k == "ids" {
				typ = "array"
			}
			if p["type"] != typ {
				t.Fatal(tool.Name, k, p)
			}
		}
		sort.Strings(keys)
		sort.Strings(schema.Required)
		required := []string{}
		if tool.Name == "resolve_comments" {
			required = []string{"agent", "ids"}
		}
		if !reflect.DeepEqual(schema.Required, required) && !(len(required) == 0 && schema.Required == nil) {
			t.Fatal(tool.Name, schema.Required)
		}
		got[tool.Name] = keys
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatal(got)
	}
	if _, e := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "open"}); e == nil {
		t.Fatal("unknown tool returned a result")
	}
}

func parityRepo(t *testing.T) string {
	t.Helper()
	root := initialized(t)
	foo := validCanvas
	fooBar := strings.Replace(validCanvas, `content="foo"`, `content="foo-bar"`, 1)
	putFile(t, root, "design/foo.html", foo)
	putFile(t, root, "design/foo-bar.html", fooBar)
	putFile(t, root, "design/no-width.html", `<head><meta name="doan:canvas" content="no-width"></head>`)
	putFile(t, root, "design/empty.html", "")
	dup := createLine(cmt1, "1", foo)
	putFile(t, root, ".doan/comments/foo.jsonl", dup+"\n"+dup+"\n"+createLine(cmt2, "2", foo)+"\n{\"v\":2}\n")
	putFile(t, root, ".doan/comments/foo-bar.jsonl", createLine("cmt_00000000-0000-4000-8000-000000000003", "3", fooBar)+"\n")
	return root
}

func copyTree(t *testing.T, from string) string {
	t.Helper()
	to := t.TempDir()
	e := filepath.WalkDir(from, func(p string, d os.DirEntry, e error) error {
		if e != nil || d.IsDir() {
			return e
		}
		rel, _ := filepath.Rel(from, p)
		putFile(t, to, rel, readFile(t, from, rel))
		return nil
	})
	if e != nil {
		t.Fatal(e)
	}
	return to
}

func TestMCPEnvelopeParity(t *testing.T) {
	cs := mcpClient(t)
	root := parityRepo(t)
	// The server passes its environment on, so active reads the same runtime file as the CLI.
	t.Setenv("DOAN_RUNTIME", filepath.Join(t.TempDir(), "none.json"))
	for _, tt := range []struct {
		tool string
		args map[string]any
		cli  []string
	}{
		{"ls", map[string]any{"repo": root}, []string{"ls", "--repo", root}},
		{"comments", map[string]any{"repo": root}, []string{"comments", "--repo", root}},
		{"comments", map[string]any{"repo": root, "canvas": "foo-bar"}, []string{"comments", "--repo", root, "--canvas", "foo-bar"}},
		{"check", map[string]any{"repo": root}, []string{"check", "--repo", root}},
		{"skill", nil, []string{"skill"}},
		{"active", map[string]any{"repo": root}, []string{"active", "--repo", root}},
	} {
		got := callTool(t, cs, tt.tool, tt.args)
		if want := cliEnvelope(t, tt.cli...); !reflect.DeepEqual(got, want) {
			t.Errorf("%s %v:\n%v\n%v", tt.tool, tt.args, got, want)
		}
	}
	check := callTool(t, cs, "check", map[string]any{"repo": root})
	if check["ok"] != true || check["result"].(map[string]any)["summary"].(map[string]any)["errors"] == float64(0) {
		t.Fatal(check)
	}
	a, b := copyTree(t, root), copyTree(t, root)
	ids := []any{cmt2, cmt1, cmt2}
	got := callTool(t, cs, "resolve_comments", map[string]any{"repo": a, "ids": ids, "agent": "claude-code"})
	want := cliEnvelope(t, "comment", "resolve", "--repo", b, "--agent", "claude-code", cmt2, cmt1, cmt2)
	if !reflect.DeepEqual(got, want) || len(got["result"].(map[string]any)["resolved"].([]any)) != 2 {
		t.Fatal(got, want)
	}
	for _, r := range []string{a, b} {
		fold := formats.FoldText(readFile(t, r, ".doan/comments/foo.jsonl"))
		for _, c := range fold.Comments {
			if c.Status != "resolved" {
				t.Fatal(r, fold)
			}
		}
	}
	c, d := t.TempDir(), t.TempDir()
	putFile(t, c, "styles/tokens.css", ":root{--x:red}")
	putFile(t, d, "styles/tokens.css", ":root{--x:red}")
	got = callTool(t, cs, "init", map[string]any{"repo": c, "tokenCss": "styles/tokens.css"})
	want = cliEnvelope(t, "init", "--repo", d, "--token-css", "styles/tokens.css")
	for _, env := range []map[string]any{got, want} {
		env["result"].(map[string]any)["repo"] = "<repo>"
	}
	if !reflect.DeepEqual(got, want) || readFile(t, c, ".doan/config.json") != readFile(t, d, ".doan/config.json") {
		t.Fatal(got, want)
	}
}

func TestMCPToolFailures(t *testing.T) {
	cs := mcpClient(t)
	root := parityRepo(t)
	t.Chdir(t.TempDir())
	toolCode(t, cs, "ls", nil, "repo_not_found")
	toolCode(t, cs, "check", map[string]any{}, "repo_not_found")
	t.Setenv("DOAN_RUNTIME", filepath.Join(t.TempDir(), "none.json"))
	toolCode(t, cs, "active", nil, "repo_not_found")
	toolCode(t, cs, "active", map[string]any{"repo": root}, "app_not_running")
	toolCode(t, cs, "comments", map[string]any{"repo": root, "canvas": "missing"}, "canvas_not_found")
	log := readFile(t, root, ".doan/comments/foo.jsonl")
	toolCode(t, cs, "resolve_comments", map[string]any{"repo": root, "ids": []any{}, "agent": "codex"}, "usage_error")
	toolCode(t, cs, "resolve_comments", map[string]any{"repo": root, "ids": []any{cmt1}, "agent": "Claude"}, "usage_error")
	toolCode(t, cs, "resolve_comments", map[string]any{"repo": root, "ids": []any{cmt1}}, "usage_error")
	toolCode(t, cs, "resolve_comments", map[string]any{"repo": root, "ids": []any{cmt1, "cmt_missing"}, "agent": "codex"}, "comment_not_found")
	if readFile(t, root, ".doan/comments/foo.jsonl") != log {
		t.Fatal("failed resolve wrote")
	}
	outside := t.TempDir()
	putFile(t, outside, "x.css", "")
	fresh := t.TempDir()
	toolCode(t, cs, "init", map[string]any{"repo": fresh, "tokenCss": filepath.Join(outside, "x.css")}, "usage_error")
	if _, e := os.Stat(filepath.Join(fresh, ".doan")); !os.IsNotExist(e) {
		t.Fatal("init wrote", e)
	}
	// A relative path escaping the repo, separate from the absolute-path rule above.
	parent := t.TempDir()
	putFile(t, parent, "x.css", ":root{--x:red}")
	nested := filepath.Join(parent, "repo")
	if e := os.Mkdir(nested, 0755); e != nil {
		t.Fatal(e)
	}
	toolCode(t, cs, "init", map[string]any{"repo": nested, "tokenCss": "../x.css"}, "usage_error")
	if _, e := os.Stat(filepath.Join(nested, ".doan")); !os.IsNotExist(e) {
		t.Fatal("init wrote", e)
	}
	for _, tool := range []string{"init", "ls", "comments", "resolve_comments", "check", "skill", "active"} {
		toolCode(t, cs, tool, map[string]any{"repo": root, "ids": []any{cmt1}, "agent": "codex", "unknown": true}, "usage_error")
		toolCode(t, cs, tool, map[string]any{"repo": "relative"}, "usage_error")
	}
	toolCode(t, cs, "resolve_comments", map[string]any{"repo": root, "ids": cmt1, "agent": "codex"}, "usage_error")
}

func TestMCPInitWithoutPrompt(t *testing.T) {
	cs := mcpClient(t)
	dir := t.TempDir()
	t.Chdir(dir)
	got := callTool(t, cs, "init", nil)["result"].(map[string]any)
	if got["initialized"] != true {
		t.Fatal(got)
	}
	if strings.Contains(readFile(t, dir, ".doan/config.json"), "tokenCss") {
		t.Fatal(readFile(t, dir, ".doan/config.json"))
	}
	again := callTool(t, cs, "init", map[string]any{"repo": dir, "tokenCss": "missing.css"})["result"].(map[string]any)
	if again["initialized"] != false {
		t.Fatal(again)
	}
}

func TestMCPConcurrentResolveSameFile(t *testing.T) {
	cs := mcpClient(t)
	root := initialized(t)
	putFile(t, root, "design/foo.html", validCanvas)
	putFile(t, root, ".doan/comments/foo.jsonl", createLine(cmt1, "1", validCanvas)+"\n"+createLine(cmt2, "2", validCanvas)+"\n")
	var wg sync.WaitGroup
	for _, id := range []string{cmt1, cmt2} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			res, e := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "resolve_comments", Arguments: map[string]any{"repo": root, "ids": []string{id}, "agent": "codex"}})
			if e != nil || res.IsError {
				t.Error(id, e, res)
			}
		}()
	}
	wg.Wait()
	fold := formats.FoldText(readFile(t, root, ".doan/comments/foo.jsonl"))
	if len(fold.Warnings) != 0 || len(fold.Comments) != 2 || fold.Comments[0].Status != "resolved" || fold.Comments[1].Status != "resolved" {
		t.Fatal(fold)
	}
}
