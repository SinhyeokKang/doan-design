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

// Commands that read the unreadable file keep failing as a whole.
func expectWholeFailures(t *testing.T, root string, commands ...[]string) {
	t.Helper()
	for _, args := range commands {
		failure(t, root, "internal_error", args...)
	}
}

var checkCommand = []string{"check"}

func TestListUnreadableCanvas(t *testing.T) {
	root := initialized(t)
	putFile(t, root, ".doan/canvases/a.html", validCanvas)
	bee := strings.Replace(validCanvas, `content="foo"`, `content="bee"`, 1)
	putFile(t, root, ".doan/canvases/b.html", bee)
	unreadable(t, root, ".doan/canvases/a.html")
	got := result(t, root, 0, "ls")
	expectJSON(t, "canvases", got["canvases"], `[
		{"path":".doan/canvases/a.html","frames":[],"error":{"code":"unreadable_canvas","message":"Cannot read .doan/canvases/a.html: permission denied"}},
		{"path":".doan/canvases/b.html","id":"bee","width":800,"title":"Example","frames":[{"id":"main","title":"Main"}]}]`)
	expectWholeFailures(t, root, checkCommand)
}
func TestListEnumerationFailuresStayWhole(t *testing.T) {
	root := initialized(t)
	putFile(t, root, ".doan/canvases/a.html", validCanvas)
	putFile(t, root, ".doan/canvases/sub/x.html", validCanvas)
	unreadable(t, root, ".doan/canvases/sub")
	failure(t, root, "internal_error", "ls")
}
