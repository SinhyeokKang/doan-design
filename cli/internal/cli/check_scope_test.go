package cli

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/check"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

const nfdCanvas = ".doan/canvases/café.html"

// scopeRepo holds a canvas of each kind the listing has and stylesheets reached each way a canvas can reach one.
func scopeRepo(t *testing.T) string {
	t.Helper()
	root := initialized(t)
	putFile(t, root, ".doan/assets/shared.css", `.x{color:red}`)
	putFile(t, root, ".doan/assets/chain.css", `@import "shared.css";`)
	putFile(t, root, ".doan/assets/lonely.css", `.y{color:red}`)
	putFile(t, root, ".doan/canvases/a.html", scopeCanvas("a", `<link rel="stylesheet" href="../assets/shared.css">`))
	putFile(t, root, ".doan/canvases/c.html", scopeCanvas("c", `<link rel="stylesheet" href="../assets/chain.css">`))
	putFile(t, root, ".doan/canvases/e.html", scopeCanvas("e", `<style>@import "../assets/gone.css";</style>`))
	putFile(t, root, ".doan/canvases/sub/s.html", scopeCanvas("s", ""))
	putFile(t, root, ".doan/ds/d.html", scopeCanvas("d", ""))
	putFile(t, root, nfdCanvas, scopeCanvas("cafe", ""))
	putFile(t, root, ".doan/canvases/.hidden.html", scopeCanvas("hidden", ""))
	putFile(t, root, ".doan/canvases/Upper.HTML", scopeCanvas("upper", ""))
	putFile(t, root, "notes/page.html", scopeCanvas("page", ""))
	for link, target := range map[string]string{".doan/canvases/link.html": "a.html", ".doan/assets/alias.css": "shared.css"} {
		if e := os.Symlink(target, filepath.Join(root, link)); e != nil {
			t.Fatal(e)
		}
	}
	if e := os.Mkdir(filepath.Join(root, ".doan/assets/dir.css"), 0755); e != nil {
		t.Fatal(e)
	}
	return root
}

// scopeInputs returns what Check hands checkScope, the repository's canonical root first.
func scopeInputs(t *testing.T, root string) (string, check.Input, []string) {
	t.Helper()
	r, e := repo.Find(root, "")
	if e != nil {
		t.Fatal(e)
	}
	in, e := checkInput(r, repo.NewResolver(r.Root), nil)
	if e != nil {
		t.Fatal(e)
	}
	listed, e := repo.Canvases(r.Root)
	if e != nil {
		t.Fatal(e)
	}
	return r.Root, in, listed
}

func scopePaths(scope map[string]bool) []string {
	if scope == nil {
		return nil
	}
	out := []string{}
	for p := range scope {
		out = append(out, p)
	}
	sort.Strings(out)
	return out
}

func TestCheckScope(t *testing.T) {
	root := scopeRepo(t)
	canonicalRoot, in, listed := scopeInputs(t, root)
	aliases := t.TempDir()
	if e := os.Symlink(root, filepath.Join(aliases, "repo")); e != nil {
		t.Fatal(e)
	}
	other := initialized(t)
	putFile(t, other, ".doan/canvases/a.html", scopeCanvas("a", ""))
	putFile(t, other, ".doan/assets/shared.css", "")
	outside := filepath.Join(filepath.Dir(root), "outside.css")
	alias := func(p string) string { return filepath.Join(aliases, "repo", p) }
	a, c, e := ".doan/canvases/a.html", ".doan/canvases/c.html", ".doan/canvases/e.html"
	tests := []struct {
		name string
		args []string
		want []string
		code string
	}{
		{"a repo-relative canvas", []string{a}, []string{a}, ""},
		{"an absolute canvas", []string{filepath.Join(root, a)}, []string{a}, ""},
		{"a canvas through a root alias", []string{alias(a)}, []string{a}, ""},
		{"one canvas in several spellings", []string{a, filepath.Join(root, a), "./.doan/canvases/../canvases/a.html", ".doan/canvases/A.html"}, []string{a}, ""},
		{"a canvas in a subfolder", []string{".doan/canvases/sub/s.html"}, []string{".doan/canvases/sub/s.html"}, ""},
		{"a ds canvas", []string{".doan/ds/d.html"}, []string{".doan/ds/d.html"}, ""},
		{"an NFC argument for an NFD file", []string{".doan/canvases/café.html"}, []string{nfdCanvas}, ""},
		{"several canvases", []string{a, ".doan/ds/d.html"}, []string{a, ".doan/ds/d.html"}, ""},
		{"a dot file", []string{".doan/canvases/.hidden.html"}, nil, "canvas_not_found"},
		{"a miscased .HTML file", []string{".doan/canvases/Upper.HTML"}, nil, "canvas_not_found"},
		{"a symlinked canvas", []string{".doan/canvases/link.html"}, nil, "canvas_not_found"},
		{"a missing canvas", []string{".doan/canvases/nope.html"}, nil, "canvas_not_found"},
		{"an html file outside the canvas folders", []string{"notes/page.html"}, nil, "canvas_not_found"},
		{"a stylesheet reaches the canvas that links it and the one importing it through another", []string{".doan/assets/shared.css"}, []string{a, c}, ""},
		{"a stylesheet through an absolute path and a root alias", []string{filepath.Join(root, ".doan/assets/shared.css"), alias(".doan/assets/shared.css")}, []string{a, c}, ""},
		{"a symlinked stylesheet", []string{".doan/assets/alias.css"}, []string{a, c}, ""},
		{"a stylesheet in the middle of the chain", []string{".doan/assets/chain.css"}, []string{c}, ""},
		{"a deleted stylesheet a canvas imports in its style", []string{".doan/assets/gone.css"}, []string{e}, ""},
		{"a deleted stylesheet by absolute path", []string{filepath.Join(root, ".doan/assets/gone.css")}, []string{e}, ""},
		{"a stylesheet and a canvas together", []string{".doan/assets/chain.css", ".doan/ds/d.html"}, []string{c, ".doan/ds/d.html"}, ""},
		{"a stylesheet no canvas reaches", []string{".doan/assets/lonely.css"}, nil, "usage_error"},
		{"a missing stylesheet no canvas links", []string{".doan/assets/never.css"}, nil, "usage_error"},
		{"a directory named like a stylesheet", []string{".doan/assets/dir.css"}, nil, "usage_error"},
		{"the config", []string{".doan/config.json"}, nil, ""},
		{"the config by absolute path, with a canvas", []string{filepath.Join(root, ".doan/config.json"), a}, nil, ""},
		{"a markdown file", []string{"README.md"}, nil, "usage_error"},
		{"a script", []string{".doan/assets/app.js"}, nil, "usage_error"},
		{"an upper-case .CSS", []string{".doan/assets/shared.CSS"}, nil, "usage_error"},
		{"another json file", []string{".doan/assets/config.json"}, nil, "usage_error"},
		{"a directory", []string{".doan/canvases"}, nil, "usage_error"},
		{"a directory with a slash", []string{".doan/canvases/"}, nil, "usage_error"},
		{"an empty argument", []string{""}, nil, "usage_error"},
		{"a relative path out of the repo", []string{"../outside.css"}, nil, "usage_error"},
		{"an absolute path out of the repo", []string{outside}, nil, "usage_error"},
		{"a canvas of another worktree", []string{filepath.Join(other, a)}, nil, "usage_error"},
		{"a stylesheet of another worktree", []string{filepath.Join(other, ".doan/assets/shared.css")}, nil, "usage_error"},
		{"the config of another worktree", []string{filepath.Join(other, ".doan/config.json")}, nil, "usage_error"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			scope, failure := checkScope(canonicalRoot, in, listed, tt.args)
			if tt.code != "" {
				if failure == nil || failure.Code != tt.code {
					t.Fatalf("want %s, got %+v scope %v", tt.code, failure, scopePaths(scope))
				}
				return
			}
			if failure != nil {
				t.Fatalf("unexpected %+v", failure)
			}
			if got := scopePaths(scope); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("scope %q want %q", got, tt.want)
			}
		})
	}
}

func TestCheckScopeMessages(t *testing.T) {
	root, in, listed := scopeInputs(t, scopeRepo(t))
	_, failure := checkScope(root, in, listed, []string{".doan/assets/lonely.css"})
	if failure == nil || failure.Message != "No canvas links or imports .doan/assets/lonely.css" {
		t.Fatalf("%+v", failure)
	}
	_, failure = checkScope(root, in, listed, []string{".doan/canvases/nope.html"})
	if failure == nil || !reflect.DeepEqual(failure.NextSteps, []string{"Run `doan ls --json` and pass a path it lists"}) {
		t.Fatalf("%+v", failure)
	}
	_, failure = checkScope(root, in, listed, []string{"README.md"})
	for _, kind := range []string{".html", ".css", ".doan/config.json"} {
		if failure == nil || !strings.Contains(failure.Message, kind) {
			t.Fatalf("usage message must name %s: %+v", kind, failure)
		}
	}
}

func checkJSON(t *testing.T, root string, want int, args ...string) map[string]any {
	t.Helper()
	return runJSON(t, root, want, append([]string{"check"}, args...)...)
}

func TestCheckPathsExitOnlyOnScopedErrors(t *testing.T) {
	root := scopeRepo(t)
	putFile(t, root, ".doan/canvases/bad.html", `<head><meta name="doan:canvas" content="bad"></head>`)
	checkJSON(t, root, 4)
	got := checkJSON(t, root, 0, ".doan/canvases/a.html")["result"].(map[string]any)
	if !reflect.DeepEqual(got["summary"], map[string]any{"canvases": 1.0, "errors": 0.0, "warnings": 0.0}) {
		t.Fatal(got)
	}
	got = checkJSON(t, root, 4, ".doan/canvases/a.html", ".doan/canvases/bad.html")["result"].(map[string]any)
	if !reflect.DeepEqual(got["summary"], map[string]any{"canvases": 2.0, "errors": 1.0, "warnings": 0.0}) {
		t.Fatal(got)
	}
}

func TestCheckPathsKeepSharedFindingsOfTheScope(t *testing.T) {
	root := checkGoldenRepo(t)
	got := checkJSON(t, root, 4, ".doan/canvases/z.html")["result"].(map[string]any)
	tokens := []string{}
	for _, f := range got["findings"].([]any) {
		f := f.(map[string]any)
		if f["code"] == "undefined_token" {
			tokens = append(tokens, f["canvas"].(string)+" "+f["token"].(string))
		}
	}
	if !reflect.DeepEqual(tokens, []string{"zeta --deep", "zeta --brand"}) {
		t.Fatal(got)
	}
}

func TestCheckUnparsableCanvasPath(t *testing.T) {
	root := checkGoldenRepo(t)
	got := checkJSON(t, root, 4, ".doan/canvases/broken.html")["result"].(map[string]any)
	codes := []string{}
	for _, f := range got["findings"].([]any) {
		codes = append(codes, f.(map[string]any)["code"].(string))
	}
	if !reflect.DeepEqual(codes, []string{"unparsable_canvas", "token_css_not_found", "serve_withheld"}) {
		t.Fatal(codes)
	}
	if got["summary"].(map[string]any)["canvases"] != 1.0 {
		t.Fatal(got["summary"])
	}
}

// The config path reports what the no-argument run does; only the text summary line takes the scope form.
func TestCheckConfigPathMatchesWholeRepo(t *testing.T) {
	root := checkGoldenRepo(t)
	code, out, errout := runCheck(root, ".doan/config.json", "--json")
	want, e := os.ReadFile(filepath.Join("testdata", "check-golden", "check.json"))
	if e != nil {
		t.Fatal(e)
	}
	if code != 4 || errout != "" || out != string(want) {
		t.Fatalf("exit %d stderr %q\n%s", code, errout, out)
	}
	code, out, errout = runCheck(root, ".doan/config.json")
	if want, e = os.ReadFile(filepath.Join("testdata", "check-golden", "check.txt")); e != nil {
		t.Fatal(e)
	}
	if code != 4 || errout != "" || out != strings.Replace(string(want), "6 canvases checked\n", "6 canvases in scope (6 checked)\n", 1) {
		t.Fatalf("exit %d stderr %q\n%s", code, errout, out)
	}
}

func TestCheckPathsTextSummaryLine(t *testing.T) {
	root := checkGoldenRepo(t)
	_, out, _ := runCheck(root, ".doan/canvases/z.html", ".doan/canvases/a.html")
	if line, _, _ := strings.Cut(out, "\n"); line != "2 canvases in scope (6 checked)" {
		t.Fatal(out)
	}
}

func TestCheckRepoErrorsComeBeforePathErrors(t *testing.T) {
	empty := t.TempDir()
	failure(t, empty, "repo_not_found", "check", "README.md")
	failure(t, empty, "repo_not_found", "check", ".doan/canvases/nope.html")
	root := initialized(t)
	putFile(t, root, ".doan/config.json", `{`)
	failure(t, root, "invalid_config", "check", "README.md")
	putFile(t, root, ".doan/config.json", `{"v":99}`)
	failure(t, root, "unsupported_version", "check", "README.md")
}

// A path of a kind check does not take fails before any canvas is read, so an unreadable canvas does not hide it.
func TestCheckPathKindComesBeforeReading(t *testing.T) {
	root := scopeRepo(t)
	putFile(t, root, ".doan/canvases/locked.html", scopeCanvas("locked", ""))
	unreadable(t, root, ".doan/canvases/locked.html")
	failure(t, root, "usage_error", "check", "README.md")
	failure(t, root, "internal_error", "check", ".doan/canvases/nope.html")
}
