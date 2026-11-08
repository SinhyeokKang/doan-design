package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

const leftoverEvent = `{"v":1,"id":"evt_00000000-0000-4000-8000-000000000001","at":"2090-01-01T00:00:00.000Z","type":"create","comment":"cmt_00000000-0000-4000-8000-000000000001","by":{"kind":"human","name":"Human"},"body":"change this","canvasHash":"sha256:00","target":{}}` + "\n"

func TestMissingAttributesRequiresOnlyTheLinguistLine(t *testing.T) {
	const union = ".doan/comments/*.jsonl merge=union"
	const linguist = ".doan/** linguist-documentation"
	for _, tt := range []struct {
		name string
		data string
		want []string
	}{
		{"neither", "*.txt text\n", []string{linguist}},
		{"empty", "", []string{linguist}},
		{"union only", union + "\n", []string{linguist}},
		{"linguist only", linguist + "\n", []string{}},
		{"both", union + "\n" + linguist + "\n", []string{}},
		{"crlf", union + "\r\n" + linguist + "\r\n", []string{}},
		{"crlf without linguist", "*.txt text\r\n", []string{linguist}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := missingAttributes([]byte(tt.data)); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("missingAttributes(%q) = %q; want %q", tt.data, got, tt.want)
			}
		})
	}
}

func TestInitWritesOnlyTheLinguistLineAndKeepsAnExistingUnionLine(t *testing.T) {
	fresh := t.TempDir()
	result(t, fresh, 0, "init")
	if got := readFile(t, fresh, ".gitattributes"); got != ".doan/** linguist-documentation\n" {
		t.Fatalf("fresh init attributes: %q", got)
	}
	kept := t.TempDir()
	const before = "*.txt text\r\n.doan/comments/*.jsonl merge=union\r\n"
	putFile(t, kept, ".gitattributes", before)
	result(t, kept, 0, "init")
	if got := readFile(t, kept, ".gitattributes"); got != before+".doan/** linguist-documentation\r\n" {
		t.Fatalf("init with a union line: %q", got)
	}
}

func TestConfigStorageRepoWritesOnlyTheLinguistLine(t *testing.T) {
	root, _ := localGit(t)
	storageOK(t, root, "init", "--storage", "local")
	putFile(t, root, ".gitattributes", "*.txt text\n")
	storageOK(t, root, "config", "--storage", "repo")
	if got := readFile(t, root, ".gitattributes"); got != "*.txt text\n.doan/** linguist-documentation\n" {
		t.Fatalf("config --storage repo attributes: %q", got)
	}
	storageOK(t, root, "config", "--storage", "local")
	const union = "*.txt text\n.doan/comments/*.jsonl merge=union\n"
	putFile(t, root, ".gitattributes", union)
	storageOK(t, root, "config", "--storage", "repo")
	if got := readFile(t, root, ".gitattributes"); got != union+".doan/** linguist-documentation\n" {
		t.Fatalf("config --storage repo with a union line: %q", got)
	}
}

// leftoverComments lays out what an older Doan may have left in .doan/comments/; Doan no longer reads any of it.
var leftoverComments = []struct {
	name string
	lay  func(t *testing.T, root string)
}{
	{"absent", func(t *testing.T, root string) {}},
	{"empty directory", func(t *testing.T, root string) {
		if err := os.MkdirAll(filepath.Join(root, ".doan/comments"), 0755); err != nil {
			t.Fatal(err)
		}
	}},
	{"file for another id", func(t *testing.T, root string) { putFile(t, root, ".doan/comments/gone.jsonl", leftoverEvent) }},
	{"file for the canvas id", func(t *testing.T, root string) { putFile(t, root, ".doan/comments/foo.jsonl", leftoverEvent) }},
	{"file instead of a directory", func(t *testing.T, root string) { putFile(t, root, ".doan/comments", leftoverEvent) }},
	{"symlinked directory", func(t *testing.T, root string) {
		target := filepath.Join(t.TempDir(), "comments")
		putFile(t, filepath.Dir(target), "comments/gone.jsonl", leftoverEvent)
		if err := os.Symlink(target, filepath.Join(root, ".doan/comments")); err != nil {
			t.Fatal(err)
		}
	}},
	{"unreadable directory", func(t *testing.T, root string) {
		putFile(t, root, ".doan/comments/gone.jsonl", leftoverEvent)
		dir := filepath.Join(root, ".doan/comments")
		if err := os.Chmod(dir, 0); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { os.Chmod(dir, 0755) })
	}},
}

func canvasRepo(t *testing.T) string {
	t.Helper()
	root := initialized(t)
	putFile(t, root, ".doan/canvases/foo.html", validCanvas)
	return root
}

func TestCheckIgnoresLeftoverComments(t *testing.T) {
	baseline := result(t, canvasRepo(t), 0, "check")["findings"]
	for _, tt := range leftoverComments {
		t.Run(tt.name, func(t *testing.T) {
			root := canvasRepo(t)
			tt.lay(t, root)
			if got := result(t, root, 0, "check")["findings"]; !reflect.DeepEqual(got, baseline) {
				t.Fatalf("findings = %v; want %v", got, baseline)
			}
		})
	}
}

func TestListHasNoCommentFields(t *testing.T) {
	for _, tt := range leftoverComments {
		t.Run(tt.name, func(t *testing.T) {
			root := canvasRepo(t)
			tt.lay(t, root)
			got := result(t, root, 0, "ls")
			for _, key := range []string{"orphans", "comments", "commentsError"} {
				if _, ok := got[key]; ok {
					t.Errorf("ls result has %q", key)
				}
			}
			rows := got["canvases"].([]any)
			if len(rows) != 1 {
				t.Fatalf("canvases = %v", rows)
			}
			row := rows[0].(map[string]any)
			for _, key := range []string{"comments", "commentsError"} {
				if _, ok := row[key]; ok {
					b, _ := json.Marshal(row)
					t.Errorf("canvas row has %q: %s", key, b)
				}
			}
		})
	}
}

func TestCommentCommandsAreUnknown(t *testing.T) {
	root := canvasRepo(t)
	putFile(t, root, ".doan/comments/foo.jsonl", leftoverEvent)
	before := readFile(t, root, ".doan/comments/foo.jsonl")
	for _, args := range [][]string{
		{"comments"},
		{"comment", "resolve", "cmt_00000000-0000-4000-8000-000000000001", "--agent", "codex"},
	} {
		got := runJSON(t, root, 2, args...)
		if got["error"].(map[string]any)["code"] != "usage_error" {
			t.Fatalf("%v: %v", args, got)
		}
	}
	if readFile(t, root, ".doan/comments/foo.jsonl") != before {
		t.Fatal("comment file changed")
	}
}
