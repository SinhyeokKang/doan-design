package cli

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

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
		asked     bool // the request named a frame
	}{
		{name: "opened, frame found", line: string(replyFixture(t, "opened-found")), result: map[string]any{"opened": true, "frame": "found"}, asked: true},
		{name: "opened, frame missing", line: string(replyFixture(t, "opened-missing")), result: map[string]any{"opened": true, "frame": "missing"}, asked: true},
		// The real app answers none exactly when no frame was asked (deepLinks.ts); a result that does not fit is refused.
		{name: "found for no frame", line: string(replyFixture(t, "opened-found")), code: "internal_error", exit: 1},
		{name: "missing for no frame", line: string(replyFixture(t, "opened-missing")), code: "internal_error", exit: 1},
		{name: "none for a frame", line: string(replyFixture(t, "opened-none")), code: "internal_error", exit: 1, asked: true},
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
		target := target
		if tt.asked {
			target.frame = frameArg("hero")
		}
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

// open runs the command against the harness's fake clock and launcher.
func (h *launchHarness) open(root string, args []string, frames ...string) (Outcome, *Error) {
	ctx := h.ctx
	ctx.Start = root
	return Open(ctx, Flags{Repo: root, Frames: frames, Given: map[string]bool{}}, args)
}

func openedApp(t *testing.T, dir string, frame string) *onboardingApp {
	return startOnboardingApp(t, dir, func(map[string]any) string {
		return `{"v":4,"ok":true,"opened":true,"frame":"` + frame + `"}`
	})
}

func openProject(t *testing.T) string {
	t.Helper()
	root := realPath(t, initialized(t))
	putFile(t, root, ".doan/canvases/home.html", validCanvas)
	putFile(t, root, ".doan/ds/brand.html", validCanvas)
	return root
}

func TestOpenSendsTheV4Request(t *testing.T) {
	root := openProject(t)
	for _, tt := range []struct {
		name   string
		args   []string
		frames []string
		frame  string
		want   map[string]any
		text   string
	}{
		{"canvas only", []string{".doan/canvases/home.html"}, nil, "none",
			map[string]any{"v": float64(4), "token": testToken, "root": root, "path": ".doan/canvases/home.html"},
			"Opened .doan/canvases/home.html in Doan"},
		{"frame found", []string{".doan/canvases/home.html"}, []string{"hero"}, "found",
			map[string]any{"v": float64(4), "token": testToken, "root": root, "path": ".doan/canvases/home.html", "frame": "hero"},
			"Opened .doan/canvases/home.html in Doan at frame hero"},
		{"frame missing", []string{filepath.Join(root, ".doan/ds/brand.html")}, []string{"nope"}, "missing",
			map[string]any{"v": float64(4), "token": testToken, "root": root, "path": ".doan/ds/brand.html", "frame": "nope"},
			"Opened .doan/ds/brand.html in Doan; frame nope was not found"},
	} {
		h := newLaunchHarness(t)
		app := openedApp(t, h.dir, tt.frame)
		o, failure := h.open(root, tt.args, tt.frames...)
		if failure != nil {
			t.Fatalf("%s: %v", tt.name, failure)
		}
		if !reflect.DeepEqual(o.Result, map[string]any{"opened": true, "frame": tt.frame}) || o.Text != tt.text {
			t.Errorf("%s: %v %q", tt.name, o.Result, o.Text)
		}
		if got := app.received(); len(got) != 1 || !reflect.DeepEqual(got[0], tt.want) {
			t.Errorf("%s: wire %v", tt.name, got)
		}
		if len(h.launches) != 0 || h.elapsed != 0 {
			t.Errorf("%s: %v %v", tt.name, h.launches, h.elapsed)
		}
	}
}

// The JSON result and the line a person reads come from the same reply, so a frame result that does not fit
// the request fails instead of letting them disagree.
func TestOpenRefusesAFrameResultThatDoesNotFitTheRequest(t *testing.T) {
	root := openProject(t)
	for _, tt := range []struct {
		reply  string
		frames []string
	}{{"found", nil}, {"missing", nil}, {"none", []string{"hero"}}} {
		h := newLaunchHarness(t)
		openedApp(t, h.dir, tt.reply)
		o, failure := h.open(root, []string{".doan/canvases/home.html"}, tt.frames...)
		if failure == nil || failure.Code != "internal_error" || o.Result != nil || o.Text != "" {
			t.Errorf("%s with %v: %v %v", tt.reply, tt.frames, o, failure)
		}
	}
}

func TestOpenAsksNothingWhenTheInputIsWrong(t *testing.T) {
	root := openProject(t)
	outside := t.TempDir()
	putFile(t, outside, ".doan/canvases/home.html", "canvas")
	if err := os.Symlink(filepath.Join(outside, ".doan/canvases/home.html"), filepath.Join(root, ".doan/canvases/out.html")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(root, ".doan/canvases/gone.html"), filepath.Join(root, ".doan/canvases/dangling.html")); err != nil {
		t.Fatal(err)
	}
	for _, tt := range []struct {
		name   string
		args   []string
		frames []string
		code   string
	}{
		{"no canvas", nil, nil, "usage_error"},
		{"two canvases", []string{".doan/canvases/home.html", ".doan/ds/brand.html"}, nil, "usage_error"},
		{"frame twice", []string{".doan/canvases/home.html"}, []string{"a", "b"}, "usage_error"},
		{"empty frame", []string{".doan/canvases/home.html"}, []string{""}, "usage_error"},
		{"control character", []string{".doan/canvases/home.html"}, []string{"a\nb"}, "usage_error"},
		{"long frame", []string{".doan/canvases/home.html"}, []string{strings.Repeat("a", 201)}, "usage_error"},
		{"outside the canvas directories", []string{"src/home.html"}, nil, "usage_error"},
		{"parent traversal", []string{".doan/canvases/../../home.html"}, nil, "usage_error"},
		{"absolute path outside the root", []string{filepath.Join(outside, ".doan/canvases/home.html")}, nil, "usage_error"},
		{"link leaving the root", []string{".doan/canvases/out.html"}, nil, "usage_error"},
		{"dangling link", []string{".doan/canvases/dangling.html"}, nil, "usage_error"},
		{"no such file", []string{".doan/canvases/missing.html"}, nil, "canvas_not_found"},
		{"no such file in ds", []string{".doan/ds/missing.html"}, []string{"hero"}, "canvas_not_found"},
	} {
		h := newLaunchHarness(t)
		app := openedApp(t, h.dir, "none")
		_, failure := h.open(root, tt.args, tt.frames...)
		if failure == nil || failure.Code != tt.code {
			t.Errorf("%s: %v", tt.name, failure)
			continue
		}
		if tt.code == "canvas_not_found" && ExitCode(tt.code) != 2 {
			t.Errorf("%s: exit %d", tt.name, ExitCode(tt.code))
		}
		if len(app.received()) != 0 || len(h.launches) != 0 {
			t.Errorf("%s asked the app: %v %v", tt.name, app.received(), h.launches)
		}
	}
	// A canvases directory that is a link to src: the resolved path leaves the canvas directories (POSTMORTEM 2026-10-31).
	linked := realPath(t, initialized(t))
	putFile(t, linked, "src/page.html", "canvas")
	if err := os.RemoveAll(filepath.Join(linked, ".doan/canvases")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(linked, "src"), filepath.Join(linked, ".doan/canvases")); err != nil {
		t.Fatal(err)
	}
	h0 := newLaunchHarness(t)
	app0 := openedApp(t, h0.dir, "none")
	if _, failure := h0.open(linked, []string{".doan/canvases/page.html"}); failure == nil || failure.Code != "usage_error" || len(app0.received()) != 0 || len(h0.launches) != 0 {
		t.Errorf("canvases directory linked to src: %v %v", failure, app0.received())
	}
	// A symlink that stays inside the root opens the canvas it points at.
	if err := os.Symlink(filepath.Join(root, ".doan/canvases/home.html"), filepath.Join(root, ".doan/canvases/alias.html")); err != nil {
		t.Fatal(err)
	}
	h := newLaunchHarness(t)
	app := openedApp(t, h.dir, "none")
	if _, failure := h.open(root, []string{".doan/canvases/alias.html"}); failure != nil {
		t.Fatal(failure)
	}
	if got := app.received(); len(got) != 1 || got[0]["path"] != ".doan/canvases/home.html" {
		t.Fatal(got)
	}
}

func TestOpenRepositoryErrors(t *testing.T) {
	h := newLaunchHarness(t)
	app := openedApp(t, h.dir, "none")
	notRepo := realPath(t, t.TempDir())
	if _, failure := h.open(notRepo, []string{".doan/canvases/home.html"}); failure == nil || failure.Code != "repo_not_found" || ExitCode(failure.Code) != 2 {
		t.Fatal(failure)
	}
	if len(app.received()) != 0 || len(h.launches) != 0 {
		t.Fatal(app.received(), h.launches)
	}
}

func TestOpenAppRefusals(t *testing.T) {
	root := openProject(t)
	for _, tt := range []struct {
		reply, code, in string
		exit            int
	}{
		{`{"v":4,"ok":false,"error":{"code":"project_not_open","message":"m"}}`, "project_not_open", `"` + filepath.Base(root) + `"`, 3},
		{`{"v":4,"ok":false,"error":{"code":"canvas_not_found","message":"m"}}`, "canvas_not_found", ".doan/canvases/home.html", 2},
		{`{"v":4,"ok":false,"error":{"code":"busy","message":"Finish Doan's first run"}}`, "busy", "Finish Doan's first run", 5},
		{`{"v":4,"ok":false,"error":{"code":"bad_request","message":"m"}}`, "internal_error", "malformed", 1},
		{`{"v":1,"ok":false,"error":{"code":"bad_request","message":"m"}}`, "app_protocol_mismatch", "another protocol", 3},
	} {
		h := newLaunchHarness(t)
		app := startOnboardingApp(t, h.dir, func(map[string]any) string { return tt.reply })
		_, failure := h.open(root, []string{".doan/canvases/home.html"})
		if failure == nil || failure.Code != tt.code || ExitCode(failure.Code) != tt.exit || !strings.Contains(failure.Message, tt.in) {
			t.Errorf("%s: %v", tt.code, failure)
		}
		// A refusal is final: no retry, no launch.
		if len(app.received()) != 1 || len(h.launches) != 0 || h.elapsed != 0 {
			t.Errorf("%s: %d requests, %v, %v", tt.code, len(app.received()), h.launches, h.elapsed)
		}
	}
}

func TestOpenBootstrapLaunchesOwningBundleOnce(t *testing.T) {
	root := openProject(t)
	h := newLaunchHarness(t)
	var app *onboardingApp
	// The app publishes its runtime a few polls after the launch.
	h.onSleep = func(n int) {
		if n == 3 {
			app = openedApp(t, h.dir, "found")
		}
	}
	o, failure := h.open(root, []string{".doan/canvases/home.html"}, "hero")
	if failure != nil || o.Result.(map[string]any)["frame"] != "found" {
		t.Fatal(o, failure)
	}
	if len(h.launches) != 1 || h.launches[0] != filepath.Join(realPath(t, h.dir), "Doan Apps", "doan.app") {
		t.Fatal(h.launches)
	}
	if len(app.received()) != 1 || h.elapsed > 15*time.Second {
		t.Fatal(app.received(), h.elapsed)
	}
}

// A launched app answers not_ready until it has restored; the request is sent again, never held by the app.
func TestOpenLaunchedAppNotReadyThenOpens(t *testing.T) {
	root := openProject(t)
	h := newLaunchHarness(t)
	var app *onboardingApp
	var mu sync.Mutex
	calls := 0
	h.onLaunch = func() {
		app = startOnboardingApp(t, h.dir, func(map[string]any) string {
			mu.Lock()
			defer mu.Unlock()
			calls++
			if calls <= 3 {
				return `{"v":4,"ok":false,"error":{"code":"not_ready","message":"m"}}`
			}
			return `{"v":4,"ok":true,"opened":true,"frame":"none"}`
		})
	}
	if _, failure := h.open(root, []string{".doan/canvases/home.html"}); failure != nil {
		t.Fatal(failure)
	}
	if len(h.launches) != 1 || len(app.received()) != 4 {
		t.Fatal(h.launches, len(app.received()))
	}
}

func TestOpenBootstrapStopsAtFifteenSeconds(t *testing.T) {
	root := openProject(t)
	h := newLaunchHarness(t)
	started := time.Now()
	_, failure := h.open(root, []string{".doan/canvases/home.html"})
	if failure == nil || failure.Code != "app_launch_failed" || ExitCode(failure.Code) != 3 {
		t.Fatal(failure)
	}
	if len(h.launches) != 1 || h.elapsed < 15*time.Second || h.elapsed > 16*time.Second {
		t.Fatal(h.launches, h.elapsed)
	}
	if time.Since(started) > 5*time.Second {
		t.Fatal("bootstrap waited on the wall clock")
	}
	if !strings.Contains(strings.Join(failure.NextSteps, "\n"), "doan open") {
		t.Fatal(failure.NextSteps)
	}
}

// A launched app that never leaves not_ready is still a failed launch, not a busy app.
func TestOpenLaunchedAppNeverReadyIsLaunchFailure(t *testing.T) {
	root := openProject(t)
	h := newLaunchHarness(t)
	h.onLaunch = func() {
		startOnboardingApp(t, h.dir, func(map[string]any) string {
			return `{"v":4,"ok":false,"error":{"code":"not_ready","message":"m"}}`
		})
	}
	_, failure := h.open(root, []string{".doan/canvases/home.html"})
	if failure == nil || failure.Code != "app_launch_failed" || len(h.launches) != 1 || h.elapsed < 15*time.Second || h.elapsed > 16*time.Second {
		t.Fatal(failure, h.launches, h.elapsed)
	}
}

func TestOpenRunningAppThatStaysNotReadyIsBusy(t *testing.T) {
	root := openProject(t)
	h := newLaunchHarness(t)
	app := startOnboardingApp(t, h.dir, func(map[string]any) string {
		return `{"v":4,"ok":false,"error":{"code":"not_ready","message":"m"}}`
	})
	started := time.Now()
	_, failure := h.open(root, []string{".doan/canvases/home.html"})
	if failure == nil || failure.Code != "busy" || ExitCode(failure.Code) != 5 || !strings.Contains(failure.Message, "still opening") {
		t.Fatal(failure)
	}
	if len(h.launches) != 0 || h.elapsed < 15*time.Second || h.elapsed > 16*time.Second || len(app.received()) < 2 {
		t.Fatal(h.launches, h.elapsed, len(app.received()))
	}
	if time.Since(started) > 5*time.Second {
		t.Fatal("retries waited on the wall clock")
	}
}

func TestOpenRunningAppNotReadyThenOpens(t *testing.T) {
	root := openProject(t)
	h := newLaunchHarness(t)
	var mu sync.Mutex
	calls := 0
	app := startOnboardingApp(t, h.dir, func(map[string]any) string {
		mu.Lock()
		defer mu.Unlock()
		calls++
		if calls < 3 {
			return `{"v":4,"ok":false,"error":{"code":"not_ready","message":"m"}}`
		}
		return `{"v":4,"ok":true,"opened":true,"frame":"none"}`
	})
	if _, failure := h.open(root, []string{".doan/canvases/home.html"}); failure != nil {
		t.Fatal(failure)
	}
	if len(h.launches) != 0 || len(app.received()) != 3 {
		t.Fatal(h.launches, len(app.received()))
	}
}

// If the app quits while it is asked to retry, that is app_not_running, not a launch to attempt.
func TestOpenAppGoneWhileNotReadyIsNotLaunched(t *testing.T) {
	root := openProject(t)
	h := newLaunchHarness(t)
	startOnboardingApp(t, h.dir, func(map[string]any) string {
		return `{"v":4,"ok":false,"error":{"code":"not_ready","message":"m"}}`
	})
	h.onSleep = func(n int) { os.Remove(filepath.Join(h.dir, "runtime.json")) }
	_, failure := h.open(root, []string{".doan/canvases/home.html"})
	if failure == nil || failure.Code != "app_not_running" || len(h.launches) != 0 {
		t.Fatal(failure, h.launches)
	}
}

func TestOpenExplicitRuntimeNeverLaunches(t *testing.T) {
	root := openProject(t)
	for _, tt := range []struct {
		name  string
		setup func(h *launchHarness)
		code  string
	}{
		{"missing", func(h *launchHarness) {}, "app_not_running"},
		{"broken", func(h *launchHarness) { putFile(t, h.dir, "runtime.json", `{`) }, "app_not_running"},
		{"unreachable", func(h *launchHarness) {
			putFile(t, h.dir, "runtime.json", runtimeJSON(filepath.Join(h.dir, "gone.sock")))
		}, "app_not_running"},
		{"stale token", func(h *launchHarness) {
			startOnboardingApp(t, h.dir, func(map[string]any) string { return string(replyFixture(t, "error-bad-token")) })
		}, "app_not_running"},
		{"old app", func(h *launchHarness) {
			startOnboardingApp(t, h.dir, func(map[string]any) string {
				return `{"v":1,"ok":false,"error":{"code":"bad_request","message":"m"}}`
			})
		}, "app_protocol_mismatch"},
	} {
		h := newLaunchHarness(t)
		h.ctx.RuntimeExplicit = true
		tt.setup(h)
		_, failure := h.open(root, []string{".doan/canvases/home.html"})
		if failure == nil || failure.Code != tt.code || len(h.launches) != 0 || h.elapsed != 0 {
			t.Errorf("%s: %v %v %v", tt.name, failure, h.launches, h.elapsed)
			continue
		}
		if strings.Contains(failure.Message, h.dir) {
			t.Errorf("%s names the runtime path: %s", tt.name, failure.Message)
		}
	}
	// An explicit runtime that is still starting is asked again, and still never launched.
	h := newLaunchHarness(t)
	h.ctx.RuntimeExplicit = true
	var mu sync.Mutex
	calls := 0
	startOnboardingApp(t, h.dir, func(map[string]any) string {
		mu.Lock()
		defer mu.Unlock()
		calls++
		if calls < 2 {
			return `{"v":4,"ok":false,"error":{"code":"not_ready","message":"m"}}`
		}
		return `{"v":4,"ok":true,"opened":true,"frame":"none"}`
	})
	if _, failure := h.open(root, []string{".doan/canvases/home.html"}); failure != nil || len(h.launches) != 0 {
		t.Fatal(failure, h.launches)
	}
}

func TestOpenOutsideABundleDoesNotLaunch(t *testing.T) {
	root := openProject(t)
	h := newLaunchHarness(t)
	standalone := filepath.Join(h.dir, "doan")
	putFile(t, h.dir, "doan", "#!/bin/sh\n")
	h.ctx.Executable = func() (string, error) { return standalone, nil }
	_, failure := h.open(root, []string{".doan/canvases/home.html"})
	if failure == nil || failure.Code != "app_not_running" || len(h.launches) != 0 || h.elapsed != 0 {
		t.Fatal(failure, h.launches)
	}
	requireRecoveryOrder(t, failure.NextSteps, [][]string{
		{"open Doan", "doan open"},
		{"If Doan is open, a sandbox may block this shell from its socket", "outside the sandbox", "approval", "Codex sessions started after Doan opens", "by name", "restart earlier sessions"},
		{"If it still fails", "Applications", "Settings… > About"},
	})
}

// Without DOAN_RUNTIME, a runtime the shell may not read means the app is likely running behind a sandbox.
func TestOpenDeniedRuntimeIsNotLaunched(t *testing.T) {
	root := openProject(t)
	h := newLaunchHarness(t)
	putFile(t, h.dir, "runtime.json", runtimeJSON(filepath.Join(h.dir, "app.sock")))
	os.Chmod(filepath.Join(h.dir, "runtime.json"), 0)
	_, failure := h.open(root, []string{".doan/canvases/home.html"})
	if failure == nil || failure.Code != "app_not_running" || len(h.launches) != 0 {
		t.Fatal(failure, h.launches)
	}
}

// runOpen runs the real command against a fake app and returns its exit code, stdout and stderr.
func runOpen(t *testing.T, runtime string, args ...string) (int, string, string) {
	t.Helper()
	t.Setenv("DOAN_RUNTIME", runtime)
	var out, errout bytes.Buffer
	code := Run(append([]string{"open"}, args...), strings.NewReader(""), &out, &errout)
	return code, out.String(), errout.String()
}

func TestRunOpenArguments(t *testing.T) {
	root := openProject(t)
	for _, tt := range []struct {
		name  string
		args  []string
		frame any
		code  int
	}{
		{"frame after the path", []string{".doan/canvases/home.html", "--frame", "hero"}, "hero", 0},
		{"frame before the path", []string{"--frame", "hero", ".doan/canvases/home.html"}, "hero", 0},
		{"frame with equals", []string{".doan/canvases/home.html", "--frame=hero"}, "hero", 0},
		{"frame with spaces", []string{".doan/canvases/home.html", "--frame", "hero section"}, "hero section", 0},
		{"no frame", []string{".doan/canvases/home.html"}, nil, 0},
		{"frame without a value", []string{".doan/canvases/home.html", "--frame"}, nil, 2},
		{"empty frame", []string{".doan/canvases/home.html", "--frame="}, nil, 2},
		{"frame twice", []string{".doan/canvases/home.html", "--frame", "a", "--frame", "b"}, nil, 2},
		{"no path", []string{"--frame", "hero"}, nil, 2},
		{"unsupported flag", []string{".doan/canvases/home.html", "--canvas", "x"}, nil, 2},
		{"onboarding flag", []string{".doan/canvases/home.html", "--session", "s"}, nil, 2},
	} {
		// Answers as the real app does: a frame result only when a frame was asked.
		app := startOnboardingApp(t, shortTempDir(t), func(request map[string]any) string {
			if request["frame"] == nil {
				return `{"v":4,"ok":true,"opened":true,"frame":"none"}`
			}
			return `{"v":4,"ok":true,"opened":true,"frame":"found"}`
		})
		code, out, errout := runOpen(t, app.runtime, append(tt.args, "--repo", root, "--json")...)
		if code != tt.code || errout != "" {
			t.Errorf("%s: exit %d: %s %s", tt.name, code, out, errout)
			continue
		}
		got := app.received()
		if tt.code != 0 {
			if len(got) != 0 || !strings.Contains(out, `"usage_error"`) {
				t.Errorf("%s: %v %s", tt.name, got, out)
			}
			continue
		}
		if len(got) != 1 || got[0]["frame"] != tt.frame || got[0]["path"] != ".doan/canvases/home.html" {
			t.Errorf("%s: %v", tt.name, got)
		}
	}
	// --frame belongs to open alone.
	if code, out, _ := runOpen(t, "/x/runtime.json", "--repo", root, "--json"); code != 2 {
		t.Fatal(code, out)
	}
	var out, errout bytes.Buffer
	if code := Run([]string{"ls", "--frame", "x", "--repo", root, "--json"}, strings.NewReader(""), &out, &errout); code != 2 || !strings.Contains(out.String(), "--frame") {
		t.Fatal(code, out.String())
	}
}

func TestRunOpenRuntimeEnvironment(t *testing.T) {
	root := openProject(t)
	home := t.TempDir()
	t.Setenv("HOME", home)
	args := []string{".doan/canvases/home.html", "--repo", root, "--json"}
	// A relative DOAN_RUNTIME is a usage error, as for active and work.
	if code, out, _ := runOpen(t, "relative/runtime.json", args...); code != 2 || !strings.Contains(out, `"usage_error"`) {
		t.Fatal(code, out)
	}
	// Set but empty is explicit: the default app is neither read as a hint to launch nor launched.
	if code, out, _ := runOpen(t, "", args...); code != 3 || !strings.Contains(out, `"app_not_running"`) {
		t.Fatal(code, out)
	}
	if code, out, _ := runOpen(t, filepath.Join(home, "none", "runtime.json"), args...); code != 3 || !strings.Contains(out, `"app_not_running"`) || strings.Contains(out, home) {
		t.Fatal(code, out)
	}
}

func TestRunOpenOutput(t *testing.T) {
	root := openProject(t)
	app := openedApp(t, shortTempDir(t), "found")
	code, out, errout := runOpen(t, app.runtime, ".doan/canvases/home.html", "--frame", "hero", "--repo", root)
	if code != 0 || out != "Opened .doan/canvases/home.html in Doan at frame hero\n" || errout != "" {
		t.Fatal(code, out, errout)
	}
	// A frame id with control characters cannot reach the terminal: the request is refused before output.
	code, out, errout = runOpen(t, app.runtime, ".doan/canvases/home.html", "--frame", "a\x1b[2Jb", "--repo", root)
	if code != 2 || out != "" || strings.Contains(errout, "\x1b") {
		t.Fatal(code, out, errout)
	}
	missing := startOnboardingApp(t, shortTempDir(t), func(map[string]any) string {
		return `{"v":4,"ok":false,"error":{"code":"project_not_open","message":"m"}}`
	})
	code, out, errout = runOpen(t, missing.runtime, ".doan/canvases/home.html", "--repo", root)
	if code != 3 || out != "" || !strings.HasPrefix(errout, "error: Doan does not have the folder ") || !strings.Contains(errout, "Add Projects") {
		t.Fatal(code, out, errout)
	}
	code, out, _ = runOpen(t, app.runtime, ".doan/canvases/home.html", "--frame", "hero", "--repo", root, "--json")
	var envelope map[string]any
	if json.Unmarshal([]byte(out), &envelope) != nil || code != 0 || !reflect.DeepEqual(envelope["result"], map[string]any{"opened": true, "frame": "found"}) {
		t.Fatal(code, out)
	}
}

func TestOpenNeverPrintsTheTokenOrRuntimePath(t *testing.T) {
	root := openProject(t)
	for name, reply := range map[string]string{
		"busy message": `{"v":4,"ok":false,"error":{"code":"busy","message":"blocked by ` + testToken + `"}}`,
		"token field":  `{"v":4,"ok":true,"opened":true,"frame":"none","token":"` + testToken + `"}`,
		"opened":       `{"v":4,"ok":true,"opened":true,"frame":"none"}`,
	} {
		app := startOnboardingApp(t, shortTempDir(t), func(map[string]any) string { return reply })
		for _, mode := range [][]string{{"--json"}, {}} {
			args := append([]string{".doan/canvases/home.html", "--repo", root}, mode...)
			code, out, errout := runOpen(t, app.runtime, args...)
			if all := out + errout; strings.Contains(all, testToken) || strings.Contains(all, app.runtime) || strings.Contains(all, filepath.Dir(app.runtime)) {
				t.Errorf("%s %v exit %d leaked: %s %s", name, mode, code, out, errout)
			}
		}
	}
}

func TestHelpListsOpen(t *testing.T) {
	var out, errout bytes.Buffer
	if code := Run([]string{"help"}, strings.NewReader(""), &out, &errout); code != 0 || !strings.Contains(out.String(), "  open <canvas path> [--frame <id>]\n") {
		t.Fatal(code, out.String())
	}
}

// fakeAttempt replays one scripted outcome per call, so bootstrap is judged on the clock alone.
type scriptedAttempt struct {
	steps []func() (map[string]any, *Error, bool)
	calls int
}

func (a *scriptedAttempt) attempt(time.Time) (map[string]any, *Error, bool) {
	step := a.steps[min(a.calls, len(a.steps)-1)]
	a.calls++
	return step()
}

func notReadyStep() (map[string]any, *Error, bool) {
	return nil, &Error{Code: "not_ready", Message: "Doan is still starting"}, false
}

func slowStep() (map[string]any, *Error, bool) {
	return nil, openFailure("app_not_running", "Doan did not answer"), false
}

func goneStep() (map[string]any, *Error, bool) {
	return nil, openFailure("app_not_running", "Doan is not running"), true
}

func openedStep() (map[string]any, *Error, bool) {
	return map[string]any{"opened": true, "frame": "none"}, nil, false
}

// After a not_ready the app is known to be running: a slow answer is the same "still opening", not a missing app.
func TestBootstrapAfterNotReadyKeepsWaitingThroughSlowAnswers(t *testing.T) {
	h := newLaunchHarness(t)
	script := &scriptedAttempt{steps: []func() (map[string]any, *Error, bool){notReadyStep, slowStep, slowStep, notReadyStep, openedStep}}
	reply, failure := bootstrap(h.ctx, openFailure, script.attempt)
	if failure != nil || reply["opened"] != true || script.calls != 5 || len(h.launches) != 0 {
		t.Fatal(reply, failure, script.calls, h.launches)
	}
	// Never answering to the end is the app that is still opening, so the cap ends it as not_ready.
	h = newLaunchHarness(t)
	script = &scriptedAttempt{steps: []func() (map[string]any, *Error, bool){notReadyStep, slowStep}}
	_, failure = bootstrap(h.ctx, openFailure, script.attempt)
	if failure == nil || failure.Code != "not_ready" || len(h.launches) != 0 || h.elapsed < 15*time.Second || h.elapsed > 16*time.Second {
		t.Fatal(failure, h.launches, h.elapsed)
	}
}

// A runtime that vanished (or a stale token) after a not_ready is a gone app, which is final.
func TestBootstrapAfterNotReadyStopsWhenTheAppIsGone(t *testing.T) {
	h := newLaunchHarness(t)
	script := &scriptedAttempt{steps: []func() (map[string]any, *Error, bool){notReadyStep, slowStep, goneStep}}
	_, failure := bootstrap(h.ctx, openFailure, script.attempt)
	if failure == nil || failure.Code != "app_not_running" || script.calls != 3 || len(h.launches) != 0 {
		t.Fatal(failure, script.calls, h.launches)
	}
}

// Without a not_ready first, a slow non-launchable answer is final, as `onboarding start` has always done.
func TestBootstrapSlowFirstAnswerIsFinal(t *testing.T) {
	h := newLaunchHarness(t)
	script := &scriptedAttempt{steps: []func() (map[string]any, *Error, bool){slowStep, openedStep}}
	_, failure := bootstrap(h.ctx, openFailure, script.attempt)
	if failure == nil || failure.Code != "app_not_running" || script.calls != 1 || len(h.launches) != 0 || h.elapsed != 0 {
		t.Fatal(failure, script.calls, h.launches, h.elapsed)
	}
}
