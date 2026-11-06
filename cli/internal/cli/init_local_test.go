package cli

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func localGit(t *testing.T) (string, func(...string) string) {
	t.Helper()
	base := t.TempDir()
	base, _ = filepath.EvalSymlinks(base)
	home := filepath.Join(base, "home")
	os.Mkdir(home, 0755)
	git := func(args ...string) string {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + home, "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_SYSTEM=/dev/null", "GIT_CONFIG_COUNT=0"}
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %v %s", args, err, out)
		}
		return string(out)
	}
	root := filepath.Join(base, "repo")
	git("init", "--template=", root)
	return root, git
}
func storageRun(t *testing.T, root string, args ...string) (map[string]any, int) {
	t.Helper()
	var out, err bytes.Buffer
	code := Run(append(args, "--repo", root, "--json"), strings.NewReader(""), &out, &err)
	var env map[string]any
	if e := json.Unmarshal(out.Bytes(), &env); e != nil {
		t.Fatal(e, out.String(), err.String())
	}
	return env, code
}
func storageOK(t *testing.T, root string, args ...string) map[string]any {
	t.Helper()
	env, code := storageRun(t, root, args...)
	if code != 0 {
		t.Fatal(code, env)
	}
	return env["result"].(map[string]any)
}

func TestInitLocalAndStorageTransitions(t *testing.T) {
	root, git := localGit(t)
	got := storageOK(t, root, "init", "--storage", "local")
	if !reflect.DeepEqual(got["created"], []any{".doan/canvases/", ".doan/config.json", ".git/info/exclude"}) {
		t.Fatal(got)
	}
	if git("-C", root, "status", "--porcelain") != "" {
		t.Fatal("local files visible")
	}
	if _, e := os.Stat(filepath.Join(root, ".gitattributes")); !os.IsNotExist(e) {
		t.Fatal(e)
	}
	for _, cmd := range []string{"ls", "config"} {
		r := storageOK(t, root, cmd)
		if r["storage"] != "local" || r["storageReason"] != nil {
			t.Fatal(r)
		}
	}
	env, code := storageRun(t, root, "init", "--storage", "local")
	if code != 2 || !strings.Contains(env["error"].(map[string]any)["message"].(string), "already set up") {
		t.Fatal(code, env)
	}
	got = storageOK(t, root, "config", "--storage", "repo")
	if got["storage"] != "repo" || !reflect.DeepEqual(got["written"], []any{".gitattributes", ".git/info/exclude"}) {
		t.Fatal(got)
	}
	if !strings.Contains(git("-C", root, "status", "--porcelain"), ".doan/") {
		t.Fatal("repo files invisible")
	}
	attrs := readFile(t, root, ".gitattributes")
	got = storageOK(t, root, "config", "--storage", "local")
	if got["storage"] != "local" || !strings.Contains(got["guidance"].(string), "git rm -r --cached .doan") || readFile(t, root, ".gitattributes") != attrs {
		t.Fatal(got)
	}
	got = storageOK(t, root, "config", "--storage", "local")
	if got["changed"] != false {
		t.Fatal(got)
	}
}
func TestInitLocalFailureAndRetry(t *testing.T) {
	root, _ := localGit(t)
	os.MkdirAll(filepath.Join(root, ".git/info"), 0755)
	os.WriteFile(filepath.Join(root, ".git/info/exclude"), []byte("foreign\r\n"), 0444)
	env, code := storageRun(t, root, "init", "--storage", "local")
	if code != 1 {
		t.Fatal(code, env)
	}
	if _, e := os.Stat(filepath.Join(root, ".doan")); !os.IsNotExist(e) {
		t.Fatal("created files on exclude failure", e)
	}
	os.Chmod(filepath.Join(root, ".git/info/exclude"), 0644)
	storageOK(t, root, "init", "--storage", "local")
	if readFile(t, root, ".git/info/exclude") != "foreign\r\n# doan: local\r\n/.doan/\r\n" {
		t.Fatal("foreign bytes changed")
	}
	matches, _ := filepath.Glob(filepath.Join(root, ".doan/.config-*"))
	if len(matches) > 0 {
		t.Fatal(matches)
	}
}
func TestStorageNonGitAndInvalid(t *testing.T) {
	root := t.TempDir()
	env, code := storageRun(t, root, "init", "--storage", "local")
	if code != 2 || env["error"].(map[string]any)["code"] != "usage_error" {
		t.Fatal(code, env)
	}
	entries, _ := os.ReadDir(root)
	if len(entries) != 0 {
		t.Fatal(entries)
	}
	storageOK(t, root, "init")
	got := storageOK(t, root, "config")
	if got["storage"] != "repo" || got["storageReason"] != "not_git" {
		t.Fatal(got)
	}
	for _, cmd := range []string{"init", "config"} {
		for _, value := range []string{"", "unknown", "LOCAL"} {
			env, code := storageRun(t, root, cmd, "--storage", value)
			if code != 2 {
				t.Fatal(code, env)
			}
		}
	}
}
func TestPlainInitInLocalWorktree(t *testing.T) {
	root, git := localGit(t)
	git("-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "fixture")
	storageOK(t, root, "init", "--storage", "local")
	linked := filepath.Join(filepath.Dir(root), "linked")
	git("-C", root, "worktree", "add", "-b", "topic", linked)
	storageOK(t, linked, "init")
	if _, err := os.Stat(filepath.Join(linked, ".gitattributes")); !os.IsNotExist(err) {
		t.Fatal(err)
	}
	if git("-C", linked, "status", "--porcelain") != "" {
		t.Fatal("worktree visible")
	}
}

func TestStorageReadDeepCompare(t *testing.T) {
	root := t.TempDir()
	root, _ = filepath.EvalSymlinks(root)
	storageOK(t, root, "init")
	got := storageOK(t, root, "config")
	want := map[string]any{"repo": root, "serve": []any{}, "changed": false, "storage": "repo", "storageReason": "not_git"}
	if !reflect.DeepEqual(got, want) {
		t.Fatal(got)
	}
	got = storageOK(t, root, "ls")
	if got["storage"] != "repo" || got["storageReason"] != "not_git" {
		t.Fatal(got)
	}
}
func TestStorageRepoKeepsPairWhenAttributesFail(t *testing.T) {
	root, _ := localGit(t)
	storageOK(t, root, "init", "--storage", "local")
	os.Mkdir(filepath.Join(root, ".gitattributes"), 0755)
	_, code := storageRun(t, root, "config", "--storage", "repo")
	if code != 1 {
		t.Fatal(code)
	}
	if got := storageOK(t, root, "config"); got["storage"] != "local" {
		t.Fatal(got)
	}
}
func TestStorageLSReadOnlyReason(t *testing.T) {
	root, _ := localGit(t)
	storageOK(t, root, "init", "--storage", "local")
	os.Chmod(filepath.Join(root, ".git/info/exclude"), 0444)
	got := storageOK(t, root, "ls")
	if got["storage"] != "local" || got["storageReason"] != "exclude_unwritable" {
		t.Fatal(got)
	}
}
func TestOnboardingStorageRequest(t *testing.T) {
	for _, name := range []string{"project inspect", "project select", "project clone"} {
		for _, storage := range []string{"", "local", "repo"} {
			f := Flags{Session: "s_1", Request: "r_1", Inspection: "i_1", Path: "/tmp/project", Destination: "/tmp/project", Storage: storage, Given: map[string]bool{"session": true, "request": true}}
			if name == "project clone" {
				f.Given["destination"] = true
			} else {
				f.Given["path"] = true
			}
			if name != "project inspect" {
				f.Given["inspection"] = true
			}
			if storage != "" {
				f.Given["storage"] = true
			}
			got, err := onboardingRequest(name, onboardingCommands[name], f)
			if err != nil {
				t.Fatal(err)
			}
			if storage == "" {
				if _, ok := got["storage"]; ok {
					t.Fatal(got)
				}
			} else if got["storage"] != storage {
				t.Fatal(got)
			}
		}
	}
	for _, code := range []string{"local_not_git", "local_exclude_failed", "inspection_stale"} {
		if len(onboardingFailure(code, "failed").NextSteps) == 0 {
			t.Fatal(code)
		}
	}
}

func TestLocalInitPublicationFailureRetry(t *testing.T) {
	root, _ := localGit(t)
	f := Flags{Repo: root, Storage: "local", Given: map[string]bool{"storage": true}}
	_, failure := initWithRename(Context{Start: root}, f, nil, func(string, string) error { return os.ErrPermission })
	if failure == nil {
		t.Fatal("publication unexpectedly passed")
	}
	if _, err := os.Stat(filepath.Join(root, ".doan/config.json")); !os.IsNotExist(err) {
		t.Fatal(err)
	}
	storageOK(t, root, "init", "--storage", "local")
	if strings.Count(readFile(t, root, ".git/info/exclude"), "# doan: local") != 1 {
		t.Fatal("duplicate pair")
	}
	temps, _ := filepath.Glob(filepath.Join(root, ".doan/.config-*"))
	if len(temps) != 0 {
		t.Fatal(temps)
	}
}
