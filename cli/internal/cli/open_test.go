package cli

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

func frameArg(s string) *string { return &s }

func TestOpenInput(t *testing.T) {
	for _, tt := range []struct {
		name   string
		args   []string
		frames []string
		ok     bool
	}{
		{"no canvas", nil, nil, false},
		{"two canvases", []string{".doan/canvases/a.html", ".doan/canvases/b.html"}, nil, false},
		{"frame twice", []string{".doan/canvases/a.html"}, []string{"a", "b"}, false},
		{"frame twice, same value", []string{".doan/canvases/a.html"}, []string{"a", "a"}, false},
		{"empty frame", []string{".doan/canvases/a.html"}, []string{""}, false},
		{"control character", []string{".doan/canvases/a.html"}, []string{"he\nro"}, false},
		{"NUL", []string{".doan/canvases/a.html"}, []string{"he\x00ro"}, false},
		{"DEL", []string{".doan/canvases/a.html"}, []string{"he\x7fro"}, false},
		{"201 characters", []string{".doan/canvases/a.html"}, []string{strings.Repeat("a", 201)}, false},
		{"200 characters", []string{".doan/canvases/a.html"}, []string{strings.Repeat("a", 200)}, true},
		// The limit counts characters, as the schema does, not bytes.
		{"200 Korean characters", []string{".doan/canvases/a.html"}, []string{strings.Repeat("가", 200)}, true},
		{"spaces and slashes", []string{".doan/canvases/a.html"}, []string{"hero section/1"}, true},
		{"no frame", []string{".doan/canvases/a.html"}, nil, true},
	} {
		canvas, frame, failure := openInput(tt.args, tt.frames)
		if tt.ok {
			if failure != nil || canvas != tt.args[0] || (len(tt.frames) == 0) != (frame == nil) || (frame != nil && *frame != tt.frames[0]) {
				t.Errorf("%s: %q %v %v", tt.name, canvas, frame, failure)
			}
			continue
		}
		if failure == nil || failure.Code != "usage_error" || ExitCode(failure.Code) != 2 {
			t.Errorf("%s: accepted: %q %v", tt.name, canvas, failure)
		}
	}
}

func TestOpenRequest(t *testing.T) {
	root := "/Users/me/repo"
	got, failure := openRequest(root, ".doan/canvases/home.html", nil)
	want := map[string]any{"v": 4, "root": root, "path": ".doan/canvases/home.html"}
	if failure != nil || !reflect.DeepEqual(got, want) {
		t.Fatal(got, failure)
	}
	got, failure = openRequest(root, ".doan/ds/brand.html", frameArg("hero"))
	want = map[string]any{"v": 4, "root": root, "path": ".doan/ds/brand.html", "frame": "hero"}
	if failure != nil || !reflect.DeepEqual(got, want) {
		t.Fatal(got, failure)
	}
	// The request has the fields the app reads and no token: the transport adds it.
	probe := map[string]any{"token": ""}
	for k, v := range got {
		probe[k] = v
	}
	if e := formats.ValidateOpenRequest(probe); e != nil {
		t.Fatal(e)
	}
	for _, bad := range []string{"", "src/a.html", ".doan/assets/a.html", ".doan/canvases/a.txt", ".doan/canvases/nested/a.html", "../.doan/canvases/a.html", ".doan/canvases/../../a.html", "/Users/me/repo/.doan/canvases/a.html", `.doan\canvases\a.html`} {
		if request, failure := openRequest(root, bad, nil); failure == nil || failure.Code != "usage_error" {
			t.Errorf("accepted %q: %v", bad, request)
		}
	}
	for _, frame := range []string{"", "a\tb", strings.Repeat("a", 201)} {
		if request, failure := openRequest(root, ".doan/canvases/a.html", frameArg(frame)); failure == nil || failure.Code != "usage_error" {
			t.Errorf("accepted frame %q: %v", frame, request)
		}
	}
}

// The command resolves the typed path with workTarget before building the request; these pin what that
// pair accepts and refuses, for relative, in-root absolute and outside-root absolute spellings.
func TestOpenPathsThroughWorkTarget(t *testing.T) {
	root := realPath(t, initialized(t))
	putFile(t, root, ".doan/canvases/home.html", "canvas")
	for _, input := range []string{".doan/canvases/home.html", filepath.Join(root, ".doan/canvases/home.html"), "./.doan/canvases/home.html"} {
		resolved, err := workTarget(root, input)
		if err != nil {
			t.Fatalf("%q: %v", input, err)
		}
		if request, failure := openRequest(root, resolved, nil); failure != nil || request["path"] != ".doan/canvases/home.html" {
			t.Errorf("%q: %v %v", input, request, failure)
		}
	}
	outside := t.TempDir()
	putFile(t, outside, ".doan/canvases/home.html", "canvas")
	for _, input := range []string{"", "../x/.doan/canvases/home.html", ".doan/canvases/../../home.html", ".doan/assets/a.html", "src/a.html", filepath.Join(outside, ".doan/canvases/home.html"), "/etc/passwd"} {
		if resolved, err := workTarget(root, input); err == nil {
			t.Errorf("workTarget accepted %q as %q", input, resolved)
		}
	}
}

func replyFixture(t *testing.T, name string) []byte {
	t.Helper()
	b, e := os.ReadFile(filepath.Join("..", "..", "..", "schema", "fixtures", "app-socket-v4", "response", "valid", name+".json"))
	if e != nil {
		t.Fatal(e)
	}
	return b
}

func TestOpenReply(t *testing.T) {
	target := openTarget{root: "/Users/me/repo", path: ".doan/canvases/home.html"}
	secrets := []string{testToken, "/Users/me/Library/Application Support/doan/runtime.json"}
	for _, tt := range []struct {
		name      string
		line      string
		result    map[string]any
		code      string
		exit      int
		launch    bool
		inMessage string
	}{
		{name: "opened, frame found", line: string(replyFixture(t, "opened-found")), result: map[string]any{"opened": true, "frame": "found"}},
		{name: "opened, frame missing", line: string(replyFixture(t, "opened-missing")), result: map[string]any{"opened": true, "frame": "missing"}},
		{name: "opened, no frame asked", line: string(replyFixture(t, "opened-none")), result: map[string]any{"opened": true, "frame": "none"}},
		{name: "unregistered root", line: string(replyFixture(t, "error-project-not-open")), code: "project_not_open", exit: 3, inMessage: `"repo"`},
		{name: "canvas not in the list", line: string(replyFixture(t, "error-canvas-not-found")), code: "canvas_not_found", exit: 2, inMessage: ".doan/canvases/home.html"},
		{name: "busy keeps the app's reason", line: `{"v":4,"ok":false,"error":{"code":"busy","message":"Finish Doan's first run"}}`, code: "busy", exit: 5, inMessage: "Finish Doan's first run"},
		{name: "busy, locked page", line: `{"v":4,"ok":false,"error":{"code":"busy","message":"The Project Settings page has unsaved work"}}`, code: "busy", exit: 5, inMessage: "Project Settings"},
		{name: "busy, empty reason", line: `{"v":4,"ok":false,"error":{"code":"busy","message":""}}`, code: "busy", exit: 5, inMessage: "cannot open a canvas right now"},
		{name: "not ready is the retry signal", line: string(replyFixture(t, "error-not-ready")), code: "not_ready"},
		{name: "stale token", line: string(replyFixture(t, "error-bad-token")), code: "app_not_running", exit: 3, launch: true},
		{name: "malformed request", line: string(replyFixture(t, "error-bad-request")), code: "internal_error", exit: 1},
		{name: "older app, v1 bad_request", line: `{"v":1,"ok":false,"error":{"code":"bad_request","message":"The request is not an app-socket v1 request."}}`, code: "app_protocol_mismatch", exit: 3},
		{name: "v3", line: `{"v":3,"ok":true}`, code: "app_protocol_mismatch", exit: 3},
		{name: "v 4.5", line: `{"v":4.5,"ok":true}`, code: "app_protocol_mismatch", exit: 3},
		{name: "v 4.0 reads as 4", line: `{"v":4.0,"ok":true,"opened":true,"frame":"none"}`, result: map[string]any{"opened": true, "frame": "none"}},
		{name: "not json", line: `nope`, code: "internal_error", exit: 1},
		{name: "two values", line: `{"v":4,"ok":true,"opened":true,"frame":"none"} {}`, code: "internal_error", exit: 1},
		{name: "array", line: `[]`, code: "internal_error", exit: 1},
		{name: "schema: no frame result", line: `{"v":4,"ok":true,"opened":true}`, code: "internal_error", exit: 1},
		{name: "schema: unknown code", line: `{"v":4,"ok":false,"error":{"code":"locked","message":"m"}}`, code: "internal_error", exit: 1},
		{name: "token as a field", line: `{"v":4,"ok":true,"opened":true,"frame":"none","token":"` + testToken + `"}`, code: "internal_error", exit: 1},
		{name: "runtime path as a field", line: `{"v":4,"ok":true,"opened":true,"frame":"none","runtime":"/Users/me/Library/Application Support/doan/runtime.json"}`, code: "internal_error", exit: 1},
	} {
		result, failure, launchable := openReply([]byte(tt.line), target, secrets)
		if launchable != tt.launch {
			t.Errorf("%s: launchable %v", tt.name, launchable)
		}
		if tt.code == "" {
			if failure != nil || !reflect.DeepEqual(result, tt.result) {
				t.Errorf("%s: %v %v", tt.name, result, failure)
			}
			continue
		}
		if failure == nil || failure.Code != tt.code || result != nil {
			t.Errorf("%s: %v %v", tt.name, result, failure)
			continue
		}
		if tt.code != "not_ready" && ExitCode(failure.Code) != tt.exit {
			t.Errorf("%s: exit %d", tt.name, ExitCode(failure.Code))
		}
		if !strings.Contains(failure.Message, tt.inMessage) {
			t.Errorf("%s: message %q", tt.name, failure.Message)
		}
	}
}

func TestOpenReplyGuidance(t *testing.T) {
	target := openTarget{root: "/Users/me/repo", path: ".doan/canvases/home.html"}
	steps := func(line string) string {
		_, failure, _ := openReply([]byte(line), target, nil)
		return strings.Join(failure.NextSteps, "\n")
	}
	for _, tt := range []struct{ line, want string }{
		{`{"v":4,"ok":false,"error":{"code":"project_not_open","message":"m"}}`, "Add Projects"},
		{`{"v":4,"ok":false,"error":{"code":"canvas_not_found","message":"m"}}`, "doan ls"},
		{`{"v":4,"ok":false,"error":{"code":"busy","message":"m"}}`, "finish it"},
		{`{"v":1,"ok":false,"error":{"code":"bad_request","message":"m"}}`, "update Doan"},
		{`{"v":4,"ok":false,"error":{"code":"bad_token","message":"m"}}`, "doan open"},
	} {
		if got := steps(tt.line); !strings.Contains(got, tt.want) {
			t.Errorf("%s: nextSteps %q miss %q", tt.line, got, tt.want)
		}
	}
	// A busy reason is for the agent to relay, not to act on blindly: it must not invite a retry loop.
	if got := steps(`{"v":4,"ok":false,"error":{"code":"busy","message":"m"}}`); !strings.Contains(got, "only when they ask again") {
		t.Error(got)
	}
}

// An app-composed message that names the token or runtime file is replaced, as for onboarding.
func TestOpenReplyKeepsSecretsOut(t *testing.T) {
	target := openTarget{root: "/Users/me/repo", path: ".doan/canvases/home.html"}
	runtimePath := "/Users/me/Library/Application Support/doan/runtime.json"
	for _, leak := range []string{testToken, runtimePath} {
		line := `{"v":4,"ok":false,"error":{"code":"busy","message":"blocked by ` + leak + `"}}`
		_, failure, _ := openReply([]byte(line), target, []string{testToken, runtimePath})
		if failure == nil || failure.Code != "busy" || failure.Message != "Doan sent a message that cannot be shown" {
			t.Errorf("leaked %q: %v", leak, failure)
		}
	}
}
