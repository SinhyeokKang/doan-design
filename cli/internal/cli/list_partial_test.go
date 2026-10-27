package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// unreadable removes every permission bit from rel until the test ends.
func unreadable(t *testing.T, root, rel string) {
	t.Helper()
	if os.Geteuid() == 0 {
		t.Skip("root ignores permission bits")
	}
	p := filepath.Join(root, rel)
	info, e := os.Stat(p)
	if e != nil {
		t.Fatal(e)
	}
	if e := os.Chmod(p, 0); e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { os.Chmod(p, info.Mode().Perm()) })
}
func jsonValue(t *testing.T, s string) any {
	t.Helper()
	var v any
	if e := json.Unmarshal([]byte(s), &v); e != nil {
		t.Fatal(e, s)
	}
	return v
}
func expectJSON(t *testing.T, name string, got any, want string) {
	t.Helper()
	if w := jsonValue(t, want); !reflect.DeepEqual(got, w) {
		b, _ := json.Marshal(got)
		t.Fatalf("%s:\n got %s\nwant %s", name, b, want)
	}
}

const fooRow = `{"path":"doan/a.html","id":"foo","width":800,"title":"Example","frames":[{"id":"main","title":"Main"}]`

// Commands that read the unreadable file keep failing as a whole (spec: out of scope).
func expectWholeFailures(t *testing.T, root string, commands ...[]string) {
	t.Helper()
	for _, args := range commands {
		failure(t, root, "internal_error", args...)
	}
}

var (
	commentsCommand = []string{"comments"}
	checkCommand    = []string{"check"}
	resolveCommand  = []string{"comment", "resolve", cmt1, "--agent", "codex"}
)

func TestListUnreadableCommentFile(t *testing.T) {
	root := initialized(t)
	putFile(t, root, "doan/a.html", validCanvas)
	putFile(t, root, ".doan/comments/foo.jsonl", createLine(cmt1, "1", validCanvas)+"\n")
	unreadable(t, root, ".doan/comments/foo.jsonl")
	got := result(t, root, 0, "ls")
	expectJSON(t, "canvases", got["canvases"], `[`+fooRow+`,"commentsError":{"code":"unreadable_comments","message":"Cannot read .doan/comments/foo.jsonl: permission denied"}}]`)
	expectJSON(t, "orphans", got["orphans"], `[]`)
	expectWholeFailures(t, root, commentsCommand, resolveCommand)
}
func TestListUnreadableCanvas(t *testing.T) {
	root := initialized(t)
	putFile(t, root, "doan/a.html", validCanvas)
	bee := strings.Replace(validCanvas, `content="foo"`, `content="bee"`, 1)
	putFile(t, root, "doan/b.html", bee)
	putFile(t, root, ".doan/comments/bee.jsonl", createLine(cmt2, "2", bee)+"\n")
	putFile(t, root, ".doan/comments/foo.jsonl", createLine(cmt1, "1", validCanvas)+"\n")
	unreadable(t, root, "doan/a.html")
	got := result(t, root, 0, "ls")
	expectJSON(t, "canvases", got["canvases"], `[
		{"path":"doan/a.html","frames":[],"error":{"code":"unreadable_canvas","message":"Cannot read doan/a.html: permission denied"}},
		{"path":"doan/b.html","id":"bee","width":800,"title":"Example","frames":[{"id":"main","title":"Main"}],"comments":{"open":1,"resolved":0}}]`)
	// The unreadable canvas may own foo.jsonl, so the orphan is uncertain.
	expectJSON(t, "orphans", got["orphans"], `[{"id":"foo","file":".doan/comments/foo.jsonl","comments":{"open":1,"resolved":0},"uncertain":true}]`)
	expectWholeFailures(t, root, commentsCommand, checkCommand)
}
func TestListUnreadableCanvasAndCommentFile(t *testing.T) {
	root := initialized(t)
	putFile(t, root, "doan/a.html", validCanvas)
	putFile(t, root, ".doan/comments/foo.jsonl", createLine(cmt1, "1", validCanvas)+"\n")
	unreadable(t, root, "doan/a.html")
	unreadable(t, root, ".doan/comments/foo.jsonl")
	got := result(t, root, 0, "ls")
	expectJSON(t, "canvases", got["canvases"], `[{"path":"doan/a.html","frames":[],"error":{"code":"unreadable_canvas","message":"Cannot read doan/a.html: permission denied"}}]`)
	expectJSON(t, "orphans", got["orphans"], `[{"id":"foo","file":".doan/comments/foo.jsonl","error":{"code":"unreadable_comments","message":"Cannot read .doan/comments/foo.jsonl: permission denied"},"uncertain":true}]`)
}
func TestListUnreadableOrphan(t *testing.T) {
	root := initialized(t)
	putFile(t, root, "doan/a.html", validCanvas)
	putFile(t, root, ".doan/comments/foo.jsonl", createLine(cmt1, "1", validCanvas)+"\n")
	putFile(t, root, ".doan/comments/gone.jsonl", createLine(cmt2, "2", validCanvas)+"\n")
	unreadable(t, root, ".doan/comments/gone.jsonl")
	got := result(t, root, 0, "ls")
	expectJSON(t, "canvases", got["canvases"], `[`+fooRow+`,"comments":{"open":1,"resolved":0}}]`)
	expectJSON(t, "orphans", got["orphans"], `[{"id":"gone","file":".doan/comments/gone.jsonl","error":{"code":"unreadable_comments","message":"Cannot read .doan/comments/gone.jsonl: permission denied"},"uncertain":false}]`)
}
func TestListOrphans(t *testing.T) {
	root := initialized(t)
	upper := strings.Replace(validCanvas, `content="foo"`, `content="Upper"`, 1)
	dup := strings.Replace(validCanvas, "</head>", `<meta name="doan:canvas" content="other"></head>`, 1)
	dup = strings.Replace(dup, `content="foo"`, `content="dup"`, 1)
	putFile(t, root, "doan/a.html", validCanvas)
	putFile(t, root, "doan/dup.html", dup)
	putFile(t, root, "doan/upper.html", upper)
	putFile(t, root, ".doan/comments/foo.jsonl", createLine(cmt1, "1", validCanvas)+"\n")
	putFile(t, root, ".doan/comments/Upper.jsonl", createLine(cmt1, "1", upper)+"\n")
	putFile(t, root, ".doan/comments/dup.jsonl", createLine(cmt1, "1", dup)+"\n")
	// Not a kebab id: listed like any other file, by its file name.
	putFile(t, root, ".doan/comments/Gone.jsonl", createLine(cmt1, "1", validCanvas)+"\n"+createLine(cmt2, "2", validCanvas)+"\n")
	// Only malformed and unknown-version lines: still an orphan, with zero counts.
	putFile(t, root, ".doan/comments/junk.jsonl", "broken\n{\"v\":2}\n")
	if e := os.Symlink(filepath.Join(root, ".doan/comments/Gone.jsonl"), filepath.Join(root, ".doan/comments/link.jsonl")); e != nil {
		t.Fatal(e)
	}
	got := result(t, root, 0, "ls")
	if len(got["canvases"].([]any)) != 3 {
		t.Fatal(got)
	}
	orphans := `[
		{"id":"Gone","file":".doan/comments/Gone.jsonl","comments":{"open":2,"resolved":0},"uncertain":%s},
		{"id":"junk","file":".doan/comments/junk.jsonl","comments":{"open":0,"resolved":0},"uncertain":%s}]`
	expectJSON(t, "orphans", got["orphans"], strings.ReplaceAll(orphans, "%s", "false"))
	// A canvas that does not parse has an unknown id, so every orphan becomes uncertain.
	putFile(t, root, "doan/z.html", validCanvas+strings.Repeat("<div>", 600))
	got = result(t, root, 0, "ls")
	expectJSON(t, "unparsable row", got["canvases"].([]any)[3], `{"path":"doan/z.html","frames":[],"comments":{"open":0,"resolved":0}}`)
	expectJSON(t, "orphans", got["orphans"], strings.ReplaceAll(orphans, "%s", "true"))
}
func TestListOrphansWithoutCommentDirectory(t *testing.T) {
	root := initialized(t)
	putFile(t, root, "doan/a.html", validCanvas)
	expectJSON(t, "orphans", result(t, root, 0, "ls")["orphans"], `[]`)
	outside := t.TempDir()
	putFile(t, outside, "gone.jsonl", createLine(cmt1, "1", validCanvas)+"\n")
	if e := os.Symlink(outside, filepath.Join(root, ".doan/comments")); e != nil {
		t.Fatal(e)
	}
	expectJSON(t, "linked directory", result(t, root, 0, "ls")["orphans"], `[]`)
}
func TestListEnumerationFailuresStayWhole(t *testing.T) {
	for _, dir := range []string{".doan/comments", "doan/sub"} {
		t.Run(dir, func(t *testing.T) {
			root := initialized(t)
			putFile(t, root, "doan/a.html", validCanvas)
			putFile(t, root, dir+"/x.html", validCanvas)
			unreadable(t, root, dir)
			failure(t, root, "internal_error", "ls")
		})
	}
}
