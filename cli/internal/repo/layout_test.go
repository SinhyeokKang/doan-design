package repo

import (
	"reflect"
	"testing"
)

func TestUnifiedLayoutDiscoveryAndScope(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, ".doan/config.json", `{"v":1}`)
	put(t, root, ".doan/canvases/home.html", "")
	put(t, root, ".doan/canvases/nested/detail.html", "")
	put(t, root, ".doan/assets/preview.html", "")
	put(t, root, ".doan/comments/home.jsonl", "")
	put(t, root, "doan/legacy.html", "")
	got, err := Canvases(root)
	want := []string{".doan/canvases/home.html", ".doan/canvases/nested/detail.html"}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("canvases = %v, %v; want %v", got, err, want)
	}
	scope := scopeOf(t, root, Config{})
	if !reflect.DeepEqual(scope, []string{".doan/assets", ".doan/canvases"}) {
		t.Fatalf("scope = %v", scope)
	}
}

func TestUnifiedLayoutDoesNotServeMetadataThroughAliases(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, ".doan/config.json", `{"v":1}`)
	put(t, root, ".doan/comments/home.jsonl", "")
	link(t, ".doan", root+"/alias")
	link(t, "../comments", root+"/.doan/canvases")
	scope := scopeOf(t, root, Config{Serve: []string{".doan", "alias", ".doan/comments"}, TokenCSS: ".doan/config.json"})
	if len(scope) != 0 {
		t.Fatalf("metadata leaked into scope: %v", scope)
	}
}
