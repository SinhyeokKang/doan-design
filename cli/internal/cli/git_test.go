package cli

import (
	"path/filepath"
	"reflect"
	"testing"
)

func TestListGitAndMCPParity(t *testing.T) {
	root := t.TempDir()
	putFile(t, root, ".doan/config.json", `{"v":1}`)
	putFile(t, root, ".git/HEAD", "ref: refs/heads/main\n")
	t.Setenv("HOME", t.TempDir())
	got := cliEnvelope(t, "ls", "--repo", root)
	if got["ok"] != true {
		t.Fatal(got)
	}
	result := got["result"].(map[string]any)
	git, ok := result["git"].(map[string]any)
	if !ok || git["branch"] != "main" || git["main"] != result["root"] || git["common"] != filepath.Join(result["root"].(string), ".git") {
		t.Fatal(got)
	}
	if !reflect.DeepEqual(git["worktrees"], []any{result["root"]}) {
		t.Fatal("unexpected worktrees", git)
	}
	if _, ok := git["detached"]; ok {
		t.Fatal("unexpected detached", git)
	}
	if mcp := callTool(t, mcpClient(t), "ls", map[string]any{"repo": root}); !reflect.DeepEqual(got, mcp) {
		t.Fatal(got, mcp)
	}
	t.Setenv("HOME", root)
	hidden := cliEnvelope(t, "ls", "--repo", root)
	if _, ok := hidden["result"].(map[string]any)["git"]; ok {
		t.Fatal("Run did not supply home", hidden)
	}
}

func TestListOmitsBrokenGit(t *testing.T) {
	root := t.TempDir()
	putFile(t, root, ".doan/config.json", `{"v":1}`)
	putFile(t, root, ".git", "gitdir: missing")
	got := cliEnvelope(t, "ls", "--repo", root)
	if got["ok"] != true {
		t.Fatal(got)
	}
	if _, ok := got["result"].(map[string]any)["git"]; ok {
		t.Fatal(got)
	}
}
