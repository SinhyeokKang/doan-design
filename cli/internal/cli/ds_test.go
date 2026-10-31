package cli

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

// Design-system canvases live in .doan/ds/ and follow every canvas rule of
// .doan/canvases/; only the directory differs.

func dsCanvas(id string) string {
	return `<head><meta name="doan:canvas" content="` + id + `"><meta name="doan:width" content="800"><link rel="stylesheet" href="x.css"></head><body><div data-doan-frame="main"></div></body>`
}

func findingCodes(t *testing.T, root, path string) []string {
	t.Helper()
	codes := []string{}
	for _, f := range result(t, root, 4, "check")["findings"].([]any) {
		f := f.(map[string]any)
		if path == "" || f["path"] == path {
			codes = append(codes, f["code"].(string))
		}
	}
	sort.Strings(codes)
	return codes
}

func checkResult(t *testing.T, root string) map[string]any {
	t.Helper()
	return runJSON(t, root, 0, "check")["result"].(map[string]any)
}

func TestDesignSystemOnlyRepo(t *testing.T) {
	t.Setenv("DOAN_RUNTIME", filepath.Join(t.TempDir(), "runtime.json"))
	root := initialized(t)
	putFile(t, root, ".doan/ds/button.html", dsCanvas("button"))
	putFile(t, root, ".doan/ds/x.css", "a{}")
	putFile(t, root, ".doan/comments/button.jsonl", "")

	got := result(t, root, 0, "ls")
	paths := []string{}
	for _, c := range got["canvases"].([]any) {
		paths = append(paths, c.(map[string]any)["path"].(string))
	}
	if !reflect.DeepEqual(paths, []string{".doan/ds/button.html"}) {
		t.Fatalf("canvases: %v", paths)
	}
	if !reflect.DeepEqual(got["scope"], []any{".doan/canvases", ".doan/ds"}) {
		t.Fatalf("scope: %v", got["scope"])
	}
	if orphans := got["orphans"].([]any); len(orphans) != 0 {
		t.Fatalf("orphans: %v", orphans)
	}
	if findings := checkResult(t, root)["findings"].([]any); len(findings) != 0 {
		t.Fatalf("findings: %v", findings)
	}
}

func TestDesignSystemOnlyRepoWithoutCanvasesDirectory(t *testing.T) {
	t.Setenv("DOAN_RUNTIME", filepath.Join(t.TempDir(), "runtime.json"))
	root := initialized(t)
	if err := os.Remove(filepath.Join(root, ".doan/canvases")); err != nil {
		t.Fatal(err)
	}
	putFile(t, root, ".doan/ds/button.html", dsCanvas("button"))
	putFile(t, root, ".doan/ds/x.css", "a{}")
	if !reflect.DeepEqual(result(t, root, 0, "ls")["scope"], []any{".doan/ds"}) {
		t.Fatal("scope")
	}
	if findings := checkResult(t, root)["findings"].([]any); len(findings) != 0 {
		t.Fatalf("findings: %v", findings)
	}
}

func TestDesignSystemRulesMatchCanvases(t *testing.T) {
	t.Setenv("DOAN_RUNTIME", filepath.Join(t.TempDir(), "runtime.json"))
	for name, body := range map[string]string{
		"empty":         "",
		"missing width": `<head><meta name="doan:canvas" content="a"></head>`,
		"missing id":    `<head><meta name="doan:width" content="800"></head>`,
	} {
		t.Run(name, func(t *testing.T) {
			want := []string{}
			for _, dir := range []string{".doan/canvases", ".doan/ds"} {
				root := initialized(t)
				path := dir + "/a.html"
				putFile(t, root, path, body)
				got := findingCodes(t, root, path)
				if len(got) == 0 {
					t.Fatalf("%s: no findings", path)
				}
				if dir == ".doan/canvases" {
					want = got
				} else if !reflect.DeepEqual(got, want) {
					t.Fatalf("%s: %v, want %v", path, got, want)
				}
			}
		})
	}
}

func TestDuplicateCanvasIDAcrossDirectories(t *testing.T) {
	t.Setenv("DOAN_RUNTIME", filepath.Join(t.TempDir(), "runtime.json"))
	root := initialized(t)
	putFile(t, root, ".doan/canvases/button.html", validCanvas)
	putFile(t, root, ".doan/ds/button.html", validCanvas)
	paths := []string{}
	for _, f := range result(t, root, 4, "check")["findings"].([]any) {
		if f := f.(map[string]any); f["code"] == "duplicate_canvas_id" {
			paths = append(paths, f["path"].(string))
		}
	}
	sort.Strings(paths)
	if !reflect.DeepEqual(paths, []string{".doan/canvases/button.html", ".doan/ds/button.html"}) {
		t.Fatalf("duplicate_canvas_id paths: %v", paths)
	}
}

func TestSymlinkedDesignSystemDirectoryIsSkipped(t *testing.T) {
	t.Setenv("DOAN_RUNTIME", filepath.Join(t.TempDir(), "runtime.json"))
	root := initialized(t)
	putFile(t, root, "elsewhere/button.html", dsCanvas("button"))
	if err := os.Symlink("../elsewhere", filepath.Join(root, ".doan/ds")); err != nil {
		t.Fatal(err)
	}
	got := result(t, root, 0, "ls")
	if canvases := got["canvases"].([]any); len(canvases) != 0 {
		t.Fatalf("canvases: %v", canvases)
	}
	// The link target is unconfigured repository content, so it is not served.
	if !reflect.DeepEqual(got["scope"], []any{}) {
		t.Fatalf("scope: %v", got["scope"])
	}
}

func TestConfigAddServeDesignSystem(t *testing.T) {
	root := initialized(t)
	putFile(t, root, ".doan/ds/button.html", "")
	got := result(t, root, 0, "config", "--add-serve", filepath.Join(root, ".doan/ds"))
	if !reflect.DeepEqual(got["serve"], []any{".doan/ds"}) {
		t.Fatal(got)
	}
}
