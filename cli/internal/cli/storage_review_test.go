package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStorageReviewExplicitRepoConflict(t *testing.T) {
	root, _ := localGit(t)
	storageOK(t, root, "init", "--storage", "local")
	os.RemoveAll(filepath.Join(root, ".doan"))
	env, code := storageRun(t, root, "init", "--storage", "repo")
	if code != 2 || !strings.Contains(env["error"].(map[string]any)["nextSteps"].([]any)[0].(string), "config --storage repo") {
		t.Fatal(code, env)
	}
	if _, err := os.Stat(filepath.Join(root, ".doan")); !os.IsNotExist(err) {
		t.Fatal(err)
	}
	got := storageOK(t, root, "init")
	if got["storage"] != "local" {
		t.Fatal(got)
	}
	if got = storageOK(t, root, "init"); got["storage"] != "local" {
		t.Fatal(got)
	}
}
func TestStorageReviewNoWriteNeeded(t *testing.T) {
	for _, mode := range []string{"local", "repo"} {
		t.Run(mode, func(t *testing.T) {
			root, _ := localGit(t)
			storageOK(t, root, "init", "--storage", mode)
			path := filepath.Join(root, ".git/info/exclude")
			os.MkdirAll(filepath.Dir(path), 0755)
			if mode == "repo" {
				os.WriteFile(path, []byte("foreign\n"), 0644)
				os.Remove(filepath.Join(root, ".gitattributes"))
			}
			os.Chmod(path, 0444)
			got := storageOK(t, root, "config", "--storage", mode)
			if got["changed"] != false {
				t.Fatal(got)
			}
			if mode == "local" {
				os.RemoveAll(filepath.Join(root, ".doan"))
				got = storageOK(t, root, "init")
				if got["storage"] != "local" {
					t.Fatal(got)
				}
			}
		})
	}
}
func TestStorageReviewSymlinkAndUnknown(t *testing.T) {
	for _, kind := range []string{"linked-repo", "linked-local", "oversized", "broken-git"} {
		t.Run(kind, func(t *testing.T) {
			root, _ := localGit(t)
			path := filepath.Join(root, ".git/info/exclude")
			os.MkdirAll(filepath.Dir(path), 0755)
			switch kind {
			case "linked-repo", "linked-local":
				data := "foreign\n"
				if kind == "linked-local" {
					data = "# doan: local\n/.doan/\n"
				}
				target := filepath.Join(root, "exclude-target")
				os.WriteFile(target, []byte(data), 0644)
				os.Symlink(target, path)
			case "oversized":
				os.WriteFile(path, []byte(strings.Repeat("x", (1<<20)+1)), 0644)
			case "broken-git":
				os.RemoveAll(filepath.Join(root, ".git"))
				os.WriteFile(filepath.Join(root, ".git"), []byte("bad"), 0644)
			}
			if strings.HasPrefix(kind, "linked-") {
				got := storageOK(t, root, "init")
				want := "repo"
				if kind == "linked-local" {
					want = "local"
				}
				if got["storage"] != want {
					t.Fatal(got)
				}
				env, code := storageRun(t, root, "config", "--storage", map[string]string{"repo": "local", "local": "repo"}[want])
				if code != 5 || env["error"].(map[string]any)["code"] != "local_exclude_failed" {
					t.Fatal(code, env)
				}
			} else {
				env, code := storageRun(t, root, "init")
				if code != 5 || env["error"].(map[string]any)["code"] != "local_exclude_failed" {
					t.Fatal(code, env)
				}
				got := storageOK(t, root, "init", "--storage", "repo")
				if got["storage"] != "unknown" {
					t.Fatal(got)
				}
			}
		})
	}
}
func TestStorageReviewCodesAndMixedWrites(t *testing.T) {
	root := t.TempDir()
	t.Setenv("HOME", root)
	env, code := storageRun(t, root, "init", "--storage", "local")
	if code != 5 || env["error"].(map[string]any)["code"] != "local_not_git" {
		t.Fatal(code, env)
	}
	gitRoot, _ := localGit(t)
	storageOK(t, gitRoot, "init")
	before := readFile(t, gitRoot, ".doan/config.json")
	for _, flags := range [][]string{{"--clear-token-css"}, {"--token-css", "tokens.css"}, {"--add-serve", "assets"}, {"--remove-serve", "assets"}} {
		env, code = storageRun(t, gitRoot, append([]string{"config", "--storage", "local"}, flags...)...)
		if code != 2 {
			t.Fatal(code, env)
		}
		if storageOK(t, gitRoot, "config")["storage"] != "repo" || readFile(t, gitRoot, ".doan/config.json") != before {
			t.Fatal("partial change")
		}
	}
}
func TestStorageReviewLinkedAttributes(t *testing.T) {
	root, _ := localGit(t)
	os.WriteFile(filepath.Join(root, "shared-attrs"), []byte("*.txt text\n"), 0644)
	os.Symlink("shared-attrs", filepath.Join(root, ".gitattributes"))
	got := storageOK(t, root, "init", "--storage", "repo")
	if got["storage"] != "repo" || !strings.Contains(readFile(t, root, "shared-attrs"), "merge=union") {
		t.Fatal(got)
	}
	storageOK(t, root, "config", "--storage", "local")
	os.WriteFile(filepath.Join(root, "shared-attrs"), []byte("*.txt text\n"), 0644)
	storageOK(t, root, "config", "--storage", "repo")
	if !strings.Contains(readFile(t, root, "shared-attrs"), "merge=union") {
		t.Fatal("attributes missing")
	}
}

func TestStorageReviewMixedWritesRefusedBeforeChange(t *testing.T) {
	for _, flag := range []string{"--clear-token-css", "--remove-serve"} {
		t.Run(flag, func(t *testing.T) {
			root, _ := localGit(t)
			storageOK(t, root, "init")
			args := []string{"config", "--storage", "local", flag}
			if flag == "--remove-serve" {
				args = append(args, "missing")
			}
			env, code := storageRun(t, root, args...)
			if code != 2 {
				t.Fatal(code, env)
			}
			if storageOK(t, root, "config")["storage"] != "repo" {
				t.Fatal("storage changed")
			}
		})
	}
}

func TestStorageReviewFailuresArePathFree(t *testing.T) {
	for _, kind := range []string{"read-only", "near-cap", "broken-git"} {
		t.Run(kind, func(t *testing.T) {
			root, _ := localGit(t)
			path := filepath.Join(root, ".git/info/exclude")
			os.MkdirAll(filepath.Dir(path), 0755)
			switch kind {
			case "read-only":
				os.WriteFile(path, []byte("foreign\n"), 0444)
			case "near-cap":
				os.WriteFile(path, []byte(strings.Repeat("x", (1<<20)-1)), 0644)
			case "broken-git":
				os.RemoveAll(filepath.Join(root, ".git"))
				os.WriteFile(filepath.Join(root, ".git"), []byte("bad"), 0644)
			}
			env, code := storageRun(t, root, "init", "--storage", "local")
			if code != 5 {
				t.Fatal(code, env)
			}
			failure := env["error"].(map[string]any)
			if failure["code"] != "local_exclude_failed" || strings.Contains(failure["message"].(string), root) || len(failure["nextSteps"].([]any)) == 0 {
				t.Fatal(failure)
			}
			if _, err := os.Stat(filepath.Join(root, ".doan")); !os.IsNotExist(err) {
				t.Fatal("created .doan on refusal", err)
			}
		})
	}
}
