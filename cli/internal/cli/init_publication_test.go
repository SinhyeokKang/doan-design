package cli

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"syscall"
	"testing"
)

func TestInitPublicationFailureThenRetry(t *testing.T) {
	root := t.TempDir()
	const foreign = "*.txt text\r\n"
	const union = ".doan/comments/*.jsonl merge=union\r\n.doan/** linguist-documentation\r\n"
	putFile(t, root, ".gitattributes", foreign)
	injected := &os.LinkError{Op: "rename", Err: syscall.EIO}
	calls := 0
	_, err := initWithRename(Context{Start: root}, Flags{}, nil, func(from, to string) error {
		calls++
		if filepath.Dir(from) != filepath.Dir(to) || filepath.Base(to) != "config.json" {
			t.Fatalf("publication must use a sibling temp: %s -> %s", from, to)
		}
		if got := readFile(t, root, ".gitattributes"); got != foreign+union {
			t.Fatalf("attributes not complete before publication: %q", got)
		}
		if got := readFile(t, filepath.Dir(from), filepath.Base(from)); got != "{\n  \"v\": 1\n}\n" {
			t.Fatalf("incomplete staged config: %q", got)
		}
		// Deny only publication, leaving normal cleanup and the next invocation operational.
		return injected
	})
	if err == nil || err.Code != "internal_error" || ExitCode(err.Code) != 1 {
		t.Fatalf("publication failure: %+v", err)
	}
	if calls != 1 {
		t.Fatalf("publication calls: %d", calls)
	}
	if !strings.Contains(err.Message, injected.Error()) {
		t.Fatalf("publication error lost: %v", err)
	}
	if _, err := os.Lstat(filepath.Join(root, ".doan/config.json")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("config published despite failure: %v", err)
	}
	entries, e := os.ReadDir(filepath.Join(root, ".doan"))
	if e != nil || len(entries) != 1 || entries[0].Name() != "canvases" {
		t.Fatalf("staged file leaked: %v %v", entries, e)
	}
	if got := readFile(t, root, ".gitattributes"); got != foreign+union {
		t.Fatalf("partial-operation attributes: %q", got)
	}
	got := result(t, root, 0, "init")
	if got["initialized"] != true || !reflect.DeepEqual(got["created"], []any{".doan/config.json"}) {
		t.Fatal(got)
	}
	if attrs := readFile(t, root, ".gitattributes"); attrs != foreign+union || strings.Count(attrs, union) != 1 {
		t.Fatalf("retry changed attributes: %q", attrs)
	}
	entries, e = os.ReadDir(filepath.Join(root, ".doan"))
	if e != nil || len(entries) != 2 || entries[0].Name() != "canvases" || entries[1].Name() != "config.json" {
		t.Fatalf("retry staging cleanup: %v %v", entries, e)
	}
	if again := result(t, root, 0, "init"); again["initialized"] != false || len(again["created"].([]any)) != 0 {
		t.Fatal(again)
	}
}
