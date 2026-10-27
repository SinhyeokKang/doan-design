package cli

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

func realPath(t *testing.T, p string) string {
	t.Helper()
	r, e := filepath.EvalSymlinks(p)
	if e != nil {
		t.Fatal(e)
	}
	return r
}

func TestCheckServedAgreesWithScope(t *testing.T) {
	root := initialized(t)
	putFile(t, root, ".doan/config.json", `{"v":1,"tokenCss":"tokens.css","serve":["assets","extra.css"]}`)
	putFile(t, root, "tokens.css", ":root{--x:red}")
	putFile(t, root, "extra.css", "")
	putFile(t, root, "assets/a.css", "")
	putFile(t, root, "assets2/a.css", "")
	putFile(t, root, "other.css", "")
	putFile(t, root, ".doan/canvases/a.html", `<head><meta name="doan:canvas" content="foo"><meta name="doan:width" content="800"><link rel="stylesheet" href="../../tokens.css"><link rel="stylesheet" href="../../extra.css"><link rel="stylesheet" href="../../assets/a.css"><link rel="stylesheet" href="../../assets2/a.css"><link rel="stylesheet" href="../../other.css"><link rel="stylesheet" href="b.css"></head>`)
	putFile(t, root, ".doan/canvases/b.css", "")
	r, e := repo.Find(root, "")
	if e != nil {
		t.Fatal(e)
	}
	scope, e := repo.Scope(r.Root, r.Config)
	if e != nil {
		t.Fatal(e)
	}
	in, e := CheckInput(r)
	if e != nil {
		t.Fatal(e)
	}
	for _, p := range []string{"tokens.css", "extra.css", "assets", "assets/a.css", "assets2/a.css", "other.css", ".doan/canvases/b.css", ".doan/canvases", "designx/a.css", "tokens.css/x"} {
		want := false
		for _, s := range scope {
			if p == s || strings.HasPrefix(p, s+"/") {
				want = true
			}
		}
		if in.Served(p) != want {
			t.Errorf("%s: served %v, scope %v", p, in.Served(p), scope)
		}
	}
	got := []string{}
	for _, f := range result(t, root, 4, "check")["findings"].([]any) {
		f := f.(map[string]any)
		if f["code"] == "css_not_served" {
			got = append(got, f["target"].(string))
		}
	}
	if !reflect.DeepEqual(got, []string{"../../assets2/a.css", "../../other.css"}) {
		t.Fatal(got)
	}
}

func TestCheckRepoRootScopeStillNotServed(t *testing.T) {
	root := initialized(t)
	putFile(t, root, "root.css", "")
	if e := os.Symlink(".", filepath.Join(root, "assets")); e != nil {
		t.Fatal(e)
	}
	putFile(t, root, ".doan/config.json", `{"v":1,"serve":["assets"]}`)
	putFile(t, root, ".doan/canvases/a.html", `<head><meta name="doan:canvas" content="foo"><meta name="doan:width" content="800"><link rel="stylesheet" href="../../root.css"></head>`)
	f := result(t, root, 4, "check")["findings"].([]any)[0].(map[string]any)
	if f["code"] != "css_not_served" || f["target"] != "../../root.css" {
		t.Fatal(f)
	}
	r := t.TempDir()
	putFile(t, r, ".doan/config.json", `{"v":1}`)
	putFile(t, r, "root.css", "")
	if e := os.Symlink("../..", filepath.Join(r, ".doan/canvases")); e != nil {
		t.Fatal(e)
	}
	found, e := repo.Find(r, "")
	if e != nil {
		t.Fatal(e)
	}
	in, e := CheckInput(found)
	if e != nil {
		t.Fatal(e)
	}
	for _, p := range []string{".", "root.css", ".env"} {
		if in.Served(p) {
			t.Errorf("design -> . serves %s", p)
		}
	}
}

func TestListRootAndScope(t *testing.T) {
	root := initialized(t)
	putFile(t, root, ".doan/config.json", `{"v":1,"tokenCss":"tokens.css","serve":["design-x",".doan/canvases","missing"]}`)
	putFile(t, root, "tokens.css", "")
	putFile(t, root, "design-x/a.css", "")
	putFile(t, root, ".doan/canvases/a.html", validCanvas)
	putFile(t, root, ".doan/comments/foo.jsonl", createLine(cmt1, "1", validCanvas)+"\n")
	got := result(t, root, 0, "ls")
	if got["root"] != realPath(t, root) || !filepath.IsAbs(got["root"].(string)) {
		t.Fatal(got)
	}
	if !reflect.DeepEqual(got["scope"], []any{".doan/canvases", "design-x", "tokens.css"}) {
		t.Fatal(got["scope"])
	}
	var want any
	if e := json.Unmarshal([]byte(`[{"path":".doan/canvases/a.html","id":"foo","width":800,"title":"Example","frames":[{"id":"main","title":"Main"}],"comments":{"open":1,"resolved":0}}]`), &want); e != nil {
		t.Fatal(e)
	}
	if !reflect.DeepEqual(got["canvases"], want) || !reflect.DeepEqual(got["orphans"], []any{}) || len(got) != 4 {
		t.Fatal(got)
	}
	bare := t.TempDir()
	putFile(t, bare, ".doan/config.json", `{"v":1}`)
	got = result(t, bare, 0, "ls")
	if !reflect.DeepEqual(got["scope"], []any{}) || !reflect.DeepEqual(got["canvases"], []any{}) || got["root"] != realPath(t, bare) {
		t.Fatal(got)
	}
}

func TestListRootFromSubfolderWithoutRepoFlag(t *testing.T) {
	root := initialized(t)
	nested := filepath.Join(root, ".doan/canvases", "sub")
	if e := os.MkdirAll(nested, 0755); e != nil {
		t.Fatal(e)
	}
	t.Chdir(nested)
	var out, errout bytes.Buffer
	if code := Run([]string{"ls", "--json"}, strings.NewReader(""), &out, &errout); code != 0 || errout.Len() != 0 {
		t.Fatal(code, out.String(), errout.String())
	}
	var env map[string]any
	if e := json.Unmarshal(out.Bytes(), &env); e != nil {
		t.Fatal(e)
	}
	got := env["result"].(map[string]any)
	if got["root"] != realPath(t, root) || !reflect.DeepEqual(got["scope"], []any{".doan/canvases"}) {
		t.Fatal(got)
	}
}

func TestListRootInDiskSpelling(t *testing.T) {
	root := filepath.Join(realPath(t, t.TempDir()), "Repo")
	putFile(t, root, ".doan/config.json", `{"v":1}`)
	putFile(t, root, ".doan/canvases/a.html", validCanvas)
	upper := strings.ToUpper(root)
	if _, e := os.Stat(upper); os.IsNotExist(e) {
		t.Skip("temporary filesystem is case-sensitive")
	} else if e != nil {
		t.Fatal(e)
	}
	if got := result(t, upper, 0, "ls")["root"]; got != root {
		t.Fatalf("--repo: %v", got)
	}
	// os.Getwd trusts $PWD, so a shell that cd'ed with another spelling reaches Find with it.
	t.Chdir(filepath.Join(upper, ".DOAN/CANVASES"))
	var out, errout bytes.Buffer
	if code := Run([]string{"ls", "--json"}, strings.NewReader(""), &out, &errout); code != 0 || errout.Len() != 0 {
		t.Fatal(code, out.String(), errout.String())
	}
	var env map[string]any
	if e := json.Unmarshal(out.Bytes(), &env); e != nil {
		t.Fatal(e)
	}
	if got := env["result"].(map[string]any)["root"]; got != root {
		t.Fatalf("cwd: %v", got)
	}
}
