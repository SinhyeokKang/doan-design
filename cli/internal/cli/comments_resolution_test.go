package cli

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestCommentsExposeLastResolution(t *testing.T) {
	root := initialized(t)
	input, err := os.ReadFile(filepath.Join("..", "..", "..", "schema", "fixtures", "fold", "basic-lifecycle", "events.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	putFile(t, root, "design/foo.html", validCanvas)
	putFile(t, root, ".doan/comments/foo.jsonl", string(input)+createLine(cmt2, "5", validCanvas)+"\n")
	want := map[string]any{
		"by":         map[string]any{"kind": "agent", "name": "codex"},
		"at":         "2026-10-21T10:00:03.000Z",
		"reopenedBy": map[string]any{"kind": "human", "name": "Sam", "email": "sam@example.com"},
		"reopenedAt": "2026-10-21T10:00:04.000Z",
	}
	cs := mcpClient(t)
	for _, name := range []string{"CLI", "MCP"} {
		t.Run(name, func(t *testing.T) {
			var got map[string]any
			if name == "CLI" {
				got = result(t, root, 0, "comments")
			} else {
				envelope := callTool(t, cs, "comments", map[string]any{"repo": root})
				if envelope["ok"] != true {
					t.Fatal(envelope)
				}
				got = envelope["result"].(map[string]any)
			}
			items := got["comments"].([]any)
			if len(items) != 2 || len(got["warnings"].([]any)) != 0 {
				t.Fatal(got)
			}
			reopened := items[0].(map[string]any)
			if reopened["comment"] != cmt1 || reopened["status"] != "open" || !reflect.DeepEqual(reopened["lastResolution"], want) {
				t.Fatal(reopened)
			}
			for _, key := range []string{"resolvedBy", "resolvedAt"} {
				if _, exists := reopened[key]; exists {
					t.Fatalf("reopened comment includes %s: %v", key, reopened)
				}
			}
			fresh := items[1].(map[string]any)
			if _, exists := fresh["lastResolution"]; exists {
				t.Fatalf("fresh comment must omit lastResolution: %v", fresh)
			}
		})
	}
}
