package repo

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func put(t *testing.T, root, path, body string) {
	t.Helper()
	p := filepath.Join(root, path)
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(body), 0644); err != nil {
		t.Fatal(err)
	}
}
func real(t *testing.T, p string) string {
	t.Helper()
	r, err := filepath.EvalSymlinks(p)
	if err != nil {
		t.Fatal(err)
	}
	return r
}
func link(t *testing.T, target, path string) {
	t.Helper()
	if err := os.Symlink(target, path); err != nil {
		t.Fatal(err)
	}
}
func TestFind(t *testing.T) {
	root := t.TempDir()
	put(t, root, ".doan/config.json", `{"v":1,"tokenCss":"tokens.css"}`)
	put(t, root, "design/sub/file", "")
	r, err := Find(filepath.Join(root, "design/sub"), "")
	if err != nil || r.Root != real(t, root) || r.Config.TokenCSS != "tokens.css" {
		t.Fatalf("%+v %v", r, err)
	}
	inner := filepath.Join(root, "design")
	if err := os.MkdirAll(filepath.Join(inner, ".doan"), 0755); err != nil {
		t.Fatal(err)
	}
	r, err = Find(inner, "")
	if err != nil || r.Root != real(t, root) {
		t.Fatalf("configless .doan: %+v %v", r, err)
	}
	put(t, inner, ".doan/config.json", `{"v":1}`)
	r, err = Find(filepath.Join(inner, "sub"), "")
	if err != nil || r.Root != real(t, inner) {
		t.Fatalf("nested: %+v %v", r, err)
	}
	put(t, inner, ".doan/config.json", `{`)
	_, err = Find(filepath.Join(inner, "sub"), "")
	expectCode(t, err, "invalid_config")
	put(t, inner, ".doan/config.json", `{"v":2}`)
	_, err = Find(inner, "")
	expectCode(t, err, "unsupported_version")
	if err := os.Remove(filepath.Join(inner, ".doan/config.json")); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(inner, ".doan/config.json"), 0755); err != nil {
		t.Fatal(err)
	}
	_, err = Find(inner, "")
	expectCode(t, err, "invalid_config")
	for _, p := range []string{"absent", "design/sub/file", "design/sub"} {
		_, err = Find(root, p)
		expectCode(t, err, "repo_not_found")
	}
	r, err = Find(root, ".")
	if err != nil || r.Root != real(t, root) {
		t.Fatalf("explicit: %+v %v", r, err)
	}
	alias := filepath.Join(t.TempDir(), "alias")
	link(t, root, alias)
	r, err = Find(filepath.Join(alias, "design/sub"), alias)
	if err != nil || r.Root != real(t, root) {
		t.Fatalf("alias: %+v %v", r, err)
	}
}
func expectCode(t *testing.T, err error, code string) {
	t.Helper()
	var e *Error
	if !errors.As(err, &e) || e.Code != code {
		t.Fatalf("error = %v; want %s", err, code)
	}
}
func TestResolve(t *testing.T) {
	parent := real(t, t.TempDir())
	root := filepath.Join(parent, "repo")
	put(t, root, "design/a.css", "")
	put(t, parent, "repo2/out.css", "")
	link(t, filepath.Join(parent, "repo2"), filepath.Join(root, "outside"))
	link(t, "absent", filepath.Join(root, "broken"))
	link(t, "design/a.css", filepath.Join(root, "alias.css"))
	for _, tt := range []struct {
		base, p string
		state   State
		rel     string
	}{
		{root, "design/a.css", Inside, "design/a.css"}, {filepath.Join(root, "design"), "../alias.css", Inside, "design/a.css"},
		{root, "../x", Outside, ""}, {root, filepath.Join(root, "design/a.css"), Outside, ""}, {root, "outside/out.css", Outside, ""}, {root, "broken", Missing, ""}, {root, "absent", Missing, ""}, {root, "../repo2/out.css", Outside, ""}, {root, "design", Inside, "design"},
	} {
		state, rel, err := Resolve(root, tt.base, tt.p)
		if err != nil || state != tt.state || rel != tt.rel {
			t.Errorf("%s: %s %s %v", tt.p, state, rel, err)
		}
	}
	alias := filepath.Join(parent, "alias")
	link(t, root, alias)
	state, rel, err := Resolve(alias, alias, "design/a.css")
	if err != nil || state != Inside || rel != "design/a.css" {
		t.Fatalf("aliased root: %s %s %v", state, rel, err)
	}
	link(t, "loop", filepath.Join(root, "loop"))
	if _, _, err := Resolve(root, root, "loop"); err == nil {
		t.Fatal("symlink loop error swallowed")
	}
}
func TestCanvases(t *testing.T) {
	root := t.TempDir()
	got, err := Canvases(root)
	if err != nil || !reflect.DeepEqual(got, []string{}) {
		t.Fatalf("empty: %v %v", got, err)
	}
	for _, p := range []string{"design/z.HTML", "design/a/x.html", "design/.hidden.html", "design/.hide/x.html", "design/x.htm", "design/x.css", "outside.html"} {
		put(t, root, p, "")
	}
	link(t, filepath.Join(root, "outside.html"), filepath.Join(root, "design/link.html"))
	link(t, filepath.Join(root, "design/a"), filepath.Join(root, "design/linked"))
	got, err = Canvases(root)
	want := []string{"design/a/x.html", "design/z.HTML"}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("%v %v", got, err)
	}
}
func TestCommentFiles(t *testing.T) {
	root := t.TempDir()
	got, err := CommentFiles(root)
	if err != nil || !reflect.DeepEqual(got, []CommentFile{}) {
		t.Fatalf("empty: %v %v", got, err)
	}
	for _, p := range []string{".doan/comments/z.jsonl", ".doan/comments/FOO.jsonl", ".doan/comments/sub/x.jsonl", ".doan/comments/x.JSONL", ".doan/comments/a.txt"} {
		put(t, root, p, "")
	}
	link(t, filepath.Join(root, ".doan/comments/z.jsonl"), filepath.Join(root, ".doan/comments/link.jsonl"))
	got, err = CommentFiles(root)
	want := []CommentFile{{ID: "FOO", Path: ".doan/comments/FOO.jsonl"}, {ID: "z", Path: ".doan/comments/z.jsonl"}}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("%v %v", got, err)
	}
}
func TestEnumerationSkipsSymlinkRoots(t *testing.T) {
	for _, path := range []string{"design", ".doan/comments"} {
		t.Run(path, func(t *testing.T) {
			root := t.TempDir()
			outside := t.TempDir()
			put(t, outside, "x.html", "")
			put(t, outside, "x.jsonl", "")
			if err := os.MkdirAll(filepath.Dir(filepath.Join(root, path)), 0755); err != nil {
				t.Fatal(err)
			}
			link(t, outside, filepath.Join(root, path))
			if path == "design" {
				got, err := Canvases(root)
				if err != nil || len(got) != 0 {
					t.Fatalf("%v %v", got, err)
				}
			} else {
				got, err := CommentFiles(root)
				if err != nil || len(got) != 0 {
					t.Fatalf("%v %v", got, err)
				}
			}
		})
	}
}
