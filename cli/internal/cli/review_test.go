package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

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
	putFile(t, root, ".doan/canvases/a.html", html)
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
