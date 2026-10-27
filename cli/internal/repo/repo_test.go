package repo

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
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
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, path); err != nil {
		t.Fatal(err)
	}
}
func TestFind(t *testing.T) {
	root := t.TempDir()
	put(t, root, ".doan/config.json", `{"v":1,"tokenCss":"tokens.css"}`)
	put(t, root, ".doan/canvases/sub/file", "")
	r, err := Find(filepath.Join(root, ".doan/canvases/sub"), "")
	if err != nil || r.Root != real(t, root) || r.Config.TokenCSS != "tokens.css" {
		t.Fatalf("%+v %v", r, err)
	}
	inner := filepath.Join(root, ".doan/canvases")
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
	for _, p := range []string{"absent", ".doan/canvases/sub/file", ".doan/canvases/sub"} {
		_, err = Find(root, p)
		expectCode(t, err, "repo_not_found")
	}
	r, err = Find(root, ".")
	if err != nil || r.Root != real(t, root) {
		t.Fatalf("explicit: %+v %v", r, err)
	}
	alias := filepath.Join(t.TempDir(), "alias")
	link(t, root, alias)
	r, err = Find(filepath.Join(alias, ".doan/canvases/sub"), alias)
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
	put(t, root, ".doan/canvases/a.css", "")
	put(t, parent, "repo2/out.css", "")
	link(t, filepath.Join(parent, "repo2"), filepath.Join(root, "outside"))
	link(t, "absent", filepath.Join(root, "broken"))
	link(t, ".doan/canvases/a.css", filepath.Join(root, "alias.css"))
	for _, tt := range []struct {
		base, p string
		state   State
		rel     string
	}{
		{root, ".doan/canvases/a.css", Inside, ".doan/canvases/a.css"}, {filepath.Join(root, ".doan/canvases"), "../../alias.css", Inside, ".doan/canvases/a.css"},
		{root, "../x", Outside, ""}, {root, filepath.Join(root, ".doan/canvases/a.css"), Outside, ""}, {root, "outside/out.css", Outside, ""}, {root, "broken", Missing, ""}, {root, "absent", Missing, ""}, {root, "../repo2/out.css", Outside, ""}, {root, ".doan/canvases", Inside, ".doan/canvases"},
	} {
		state, rel, err := Resolve(root, tt.base, tt.p)
		if err != nil || state != tt.state || rel != tt.rel {
			t.Errorf("%s: %s %s %v", tt.p, state, rel, err)
		}
	}
	alias := filepath.Join(parent, "alias")
	link(t, root, alias)
	state, rel, err := Resolve(alias, alias, ".doan/canvases/a.css")
	if err != nil || state != Inside || rel != ".doan/canvases/a.css" {
		t.Fatalf("aliased root: %s %s %v", state, rel, err)
	}
	link(t, "loop", filepath.Join(root, "loop"))
	if state, rel, err := Resolve(root, root, "loop"); err != nil || state != Missing || rel != "" {
		t.Fatalf("loop: %s %q %v", state, rel, err)
	}
}
func TestCanvases(t *testing.T) {
	root := t.TempDir()
	got, err := Canvases(root)
	if err != nil || !reflect.DeepEqual(got, []string{}) {
		t.Fatalf("empty: %v %v", got, err)
	}
	put(t, root, "design/old.html", "")
	for _, p := range []string{".doan/canvases/z.HTML", ".doan/canvases/a/x.html", ".doan/canvases/.hidden.html", ".doan/canvases/.hide/x.html", ".doan/canvases/x.htm", ".doan/canvases/x.css", "outside.html"} {
		put(t, root, p, "")
	}
	link(t, filepath.Join(root, "outside.html"), filepath.Join(root, ".doan/canvases/link.html"))
	link(t, filepath.Join(root, ".doan/canvases/a"), filepath.Join(root, ".doan/canvases/linked"))
	got, err = Canvases(root)
	want := []string{".doan/canvases/a/x.html", ".doan/canvases/z.HTML"}
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
	for _, path := range []string{".doan/canvases", ".doan/comments"} {
		t.Run(path, func(t *testing.T) {
			root := t.TempDir()
			outside := t.TempDir()
			put(t, outside, "x.html", "")
			put(t, outside, "x.jsonl", "")
			if err := os.MkdirAll(filepath.Dir(filepath.Join(root, path)), 0755); err != nil {
				t.Fatal(err)
			}
			link(t, outside, filepath.Join(root, path))
			if path == ".doan/canvases" {
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

func TestResolveUnusablePathsAreMissing(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, "tokens.css", "")
	for _, p := range []string{"tokens.css/x.css", "a\x00.css", strings.Repeat("x", 300)} {
		state, rel, err := Resolve(root, root, p)
		if err != nil || state != Missing || rel != "" {
			t.Errorf("%q: %s %q %v", p, state, rel, err)
		}
	}
}

func TestFindSkipsDoanRegularFile(t *testing.T) {
	root := t.TempDir()
	put(t, root, ".doan/config.json", `{"v":1}`)
	put(t, root, "nested/.doan", "unrelated file")
	put(t, root, "nested/sub/file", "")
	got, err := Find(filepath.Join(root, "nested/sub"), "")
	if err != nil || got.Root != real(t, root) {
		t.Fatalf("%+v %v", got, err)
	}
	_, err = Find(root, "nested")
	expectCode(t, err, "repo_not_found")
}

func TestResolveUsesDiskSpelling(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, ".doan/canvases/a.css", "")
	if _, err := os.Stat(filepath.Join(root, ".DOAN/CANVASES/A.CSS")); os.IsNotExist(err) {
		t.Skip("temporary filesystem is case-sensitive")
	} else if err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{".DOAN/CANVASES/A.CSS", ".doan/canvases/A.css", ".doan/canvases/a.css"} {
		state, rel, err := Resolve(root, root, p)
		if err != nil || state != Inside || rel != ".doan/canvases/a.css" {
			t.Errorf("%s: %s %q %v", p, state, rel, err)
		}
	}
}

func TestCommentFilesSkipsSymlinkedDoan(t *testing.T) {
	root := t.TempDir()
	target := t.TempDir()
	put(t, target, "comments/foo.jsonl", "")
	link(t, target, filepath.Join(root, ".doan"))
	files, err := CommentFiles(root)
	if err != nil || !reflect.DeepEqual(files, []CommentFile{}) {
		t.Fatalf("%v %v", files, err)
	}
}

func TestFindReportsDiskSpelling(t *testing.T) {
	root := filepath.Join(real(t, t.TempDir()), "Repo")
	put(t, root, ".doan/config.json", `{"v":1}`)
	put(t, root, ".doan/canvases/sub/file", "")
	upper := strings.ToUpper(root)
	if _, err := os.Stat(upper); os.IsNotExist(err) {
		t.Skip("temporary filesystem is case-sensitive")
	} else if err != nil {
		t.Fatal(err)
	}
	for _, tt := range []struct{ start, flag string }{{upper, ""}, {filepath.Join(upper, ".DOAN/CANVASES/SUB"), ""}, {"/", upper}, {upper, ".DOAN/CANVASES/../.."}} {
		r, err := Find(tt.start, tt.flag)
		if err != nil || r.Root != root {
			t.Errorf("%+v: %q %v", tt, r.Root, err)
		}
	}
}

func TestFindUnicodeDiskSpelling(t *testing.T) {
	parent := real(t, t.TempDir())
	// APFS opens the NFD directory by its NFC spelling.
	root := filepath.Join(parent, "한")
	put(t, root, ".doan/config.json", `{"v":1}`)
	nfc := filepath.Join(parent, "한")
	if _, err := os.Stat(nfc); os.IsNotExist(err) {
		t.Skip("temporary filesystem does not normalize names")
	} else if err != nil {
		t.Fatal(err)
	}
	r, err := Find(nfc, "")
	if err != nil || r.Root != root {
		t.Fatalf("%q %v", r.Root, err)
	}
}
