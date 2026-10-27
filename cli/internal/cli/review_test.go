package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCommentsSortByCanvasPreservingFoldOrder(t *testing.T) {
	root := initialized(t)
	for _, id := range []string{"foo", "foo-bar"} {
		putFile(t, root, "doan/"+id+".html", strings.Replace(validCanvas, `content="foo"`, `content="`+id+`"`, 1))
		putFile(t, root, ".doan/comments/"+id+".jsonl", createLine(cmt2, "2", validCanvas)+"\n"+createLine(cmt1, "1", validCanvas)+"\nbroken")
	}
	got := result(t, root, 0, "comments")
	items := got["comments"].([]any)
	if len(items) != 4 {
		t.Fatal(got)
	}
	for i, want := range []string{"foo", "foo", "foo-bar", "foo-bar"} {
		item := items[i].(map[string]any)
		if item["canvas"] != want || item["comment"] != []string{cmt1, cmt2}[i%2] {
			t.Fatal(items)
		}
	}
	warnings := got["warnings"].([]any)
	if len(warnings) != 2 || warnings[0].(map[string]any)["file"] != ".doan/comments/foo-bar.jsonl" || warnings[1].(map[string]any)["file"] != ".doan/comments/foo.jsonl" {
		t.Fatal(warnings)
	}
}
func TestResolvePreparesAllFilesBeforeAppending(t *testing.T) {
	root := initialized(t)
	a := createLine(cmt1, "1", validCanvas)
	b := strings.Replace(createLine(cmt2, "2", validCanvas), "2090-01-01", "2090-02-30", 1)
	putFile(t, root, ".doan/comments/a.jsonl", a)
	putFile(t, root, ".doan/comments/b.jsonl", b)
	got := runJSON(t, root, 1, "comment", "resolve", cmt1, cmt2, "--agent", "codex")
	if got["error"].(map[string]any)["code"] != "internal_error" {
		t.Fatal(got)
	}
	if readFile(t, root, ".doan/comments/a.jsonl") != a || readFile(t, root, ".doan/comments/b.jsonl") != b {
		t.Fatal("preparation failure changed comment files")
	}
}
func TestInitReportsConflictingPathsWithoutWrites(t *testing.T) {
	for _, path := range []string{".doan", ".gitattributes"} {
		t.Run(path, func(t *testing.T) {
			root := t.TempDir()
			if path == ".doan" {
				putFile(t, root, path, "existing")
			} else if e := os.Mkdir(filepath.Join(root, path), 0755); e != nil {
				t.Fatal(e)
			}
			got := runJSON(t, root, 2, "init")
			failure := got["error"].(map[string]any)
			if failure["code"] != "usage_error" || !strings.Contains(failure["message"].(string), path) {
				t.Fatal(got)
			}
			steps := failure["nextSteps"].([]any)
			if len(steps) == 0 || !strings.Contains(strings.ToLower(steps[0].(string)), "remove or rename") || !strings.Contains(steps[0].(string), path) {
				t.Fatal(got)
			}
			entries, e := os.ReadDir(root)
			if e != nil {
				t.Fatal(e)
			}
			if len(entries) != 1 || entries[0].Name() != path {
				t.Fatal(entries)
			}
			if path == ".doan" && readFile(t, root, path) != "existing" {
				t.Fatal("changed conflicting file")
			}
		})
	}
}
func TestInitStoresTokenCSSDiskSpelling(t *testing.T) {
	root := t.TempDir()
	putFile(t, root, "T.css", "")
	if _, e := os.Stat(filepath.Join(root, "t.css")); os.IsNotExist(e) {
		t.Skip("temporary filesystem is case-sensitive")
	} else if e != nil {
		t.Fatal(e)
	}
	got := result(t, root, 0, "init", "--token-css", "t.css")
	var config map[string]any
	if e := json.Unmarshal([]byte(readFile(t, root, ".doan/config.json")), &config); e != nil {
		t.Fatal(e)
	}
	if got["tokenCss"] != "T.css" || config["tokenCss"] != "T.css" {
		t.Fatal(got, config)
	}
}
func TestInvalidUTF8ReachesOutputFields(t *testing.T) {
	root := initialized(t)
	html := strings.ReplaceAll(validCanvas, "foo", "foo\xff")
	html = strings.Replace(html, "Example", "Example\xff", 1)
	html = strings.Replace(html, `data-doan-frame="main"`, `data-doan-frame="main`+"\xff"+`"`, 1)
	putFile(t, root, "doan/a.html", html)
	ls := result(t, root, 0, "ls")["canvases"].([]any)[0].(map[string]any)
	if ls["title"] != "Example\ufffd" || ls["frames"].([]any)[0].(map[string]any)["id"] != "main\ufffd" {
		t.Fatal(ls)
	}
	findings := result(t, root, 4, "check")["findings"].([]any)
	found := false
	for _, v := range findings {
		f := v.(map[string]any)
		if f["code"] == "invalid_canvas_id" && f["canvas"] == "foo\ufffd" {
			found = true
		}
	}
	if !found {
		t.Fatal(findings)
	}
}
