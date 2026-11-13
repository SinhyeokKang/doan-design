package cli

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

func TestExportInput(t *testing.T) {
	canvasPath := []string{".doan/canvases/a.html"}
	for _, tt := range []struct {
		name      string
		args      []string
		output    string
		frames    []string
		prototype bool
		frame     *string
		want      string // a part of the usage message; empty when accepted
	}{
		{name: "canvas only", args: canvasPath, output: "x.html"},
		{name: "a prototype frame", args: canvasPath, output: "x.html", frames: []string{"hero"}, prototype: true, frame: frameArg("hero")},
		{name: "200 characters", args: canvasPath, output: "x.html", frames: []string{strings.Repeat("가", 200)}, prototype: true, frame: frameArg(strings.Repeat("가", 200))},
		{name: "no canvas", output: "x.html", want: "one canvas path"},
		{name: "two canvases", args: []string{"a", "b"}, output: "x.html", want: "one canvas path"},
		{name: "no output", args: canvasPath, want: "-o <file>"},
		{name: "no output, prototype frame", args: canvasPath, frames: []string{"hero"}, prototype: true, want: "-o <file>"},
		{name: "frame without prototype", args: canvasPath, output: "x.html", frames: []string{"hero"}, want: "--frame needs --prototype"},
		{name: "prototype without a frame", args: canvasPath, output: "x.html", prototype: true, want: "--prototype needs --frame <id>"},
		{name: "two frames", args: canvasPath, output: "x.html", frames: []string{"a", "b"}, prototype: true, want: "one --frame"},
		{name: "empty frame", args: canvasPath, output: "x.html", frames: []string{""}, prototype: true, want: "--frame"},
		{name: "control character", args: canvasPath, output: "x.html", frames: []string{"a\nb"}, prototype: true, want: "control characters"},
		{name: "201 characters", args: canvasPath, output: "x.html", frames: []string{strings.Repeat("a", 201)}, prototype: true, want: "200 characters"},
	} {
		arg, frame, failure := exportInput(tt.args, tt.output, tt.frames, tt.prototype)
		if tt.want == "" {
			if failure != nil || arg != tt.args[0] || !reflect.DeepEqual(frame, tt.frame) {
				t.Errorf("%s: %q %v %v", tt.name, arg, frame, failure)
			}
			continue
		}
		if failure == nil || failure.Code != "usage_error" || ExitCode(failure.Code) != 2 || !strings.Contains(failure.Message, tt.want) {
			t.Errorf("%s: %v", tt.name, failure)
		}
	}
}

func TestPrototypeRequest(t *testing.T) {
	root := "/Users/me/repo"
	for _, path := range []string{".doan/canvases/home.html", ".doan/ds/brand.html"} {
		got, failure := prototypeRequest(root, path, "hero", "390x844")
		want := map[string]any{"v": 6, "root": root, "path": path, "frame": "hero", "mark": "390x844"}
		if failure != nil || !reflect.DeepEqual(got, want) {
			t.Fatal(got, failure)
		}
		// The request has the fields the app reads and no token: the transport adds it.
		probe := map[string]any{"token": ""}
		for k, v := range got {
			probe[k] = v
		}
		if e := formats.ValidatePrototypeRequest(probe); e != nil {
			t.Fatal(e)
		}
	}
	for _, bad := range []string{"", "src/a.html", ".doan/assets/a.html", ".doan/canvases/nested/a.html", "../.doan/canvases/a.html", "/Users/me/repo/.doan/canvases/a.html"} {
		if request, failure := prototypeRequest(root, bad, "hero", "390x844"); failure == nil || failure.Code != "usage_error" {
			t.Errorf("accepted %q: %v", bad, request)
		}
	}
}

func prototypeReplyFixture(t *testing.T, name string) string {
	t.Helper()
	b, e := os.ReadFile(filepath.Join("..", "..", "..", "schema", "fixtures", "app-socket-v6", "response", "valid", name+".json"))
	if e != nil {
		t.Fatal(e)
	}
	return string(b)
}

func TestPrototypeReply(t *testing.T) {
	target := prototypeTarget{root: "/Users/me/repo", path: ".doan/canvases/home.html", frame: "hero"}
	runtimePath := "/Users/me/Library/Application Support/doan/runtime.json"
	secrets := []string{testToken, runtimePath}
	played := map[string]any{"opened": true, "frame": "found", "prototype": true}
	for _, tt := range []struct {
		name, line, code, inMessage string
		result                      map[string]any
		exit                        int
		launch                      bool
	}{
		{name: "played", line: prototypeReplyFixture(t, "played"), result: played},
		{name: "v 6.0 reads as 6", line: `{"v":6.0,"ok":true,"played":true}`, result: played},
		{name: "unregistered root", line: prototypeReplyFixture(t, "error-project-not-open"), code: "project_not_open", exit: 3, inMessage: `"repo"`},
		{name: "canvas not in the list", line: prototypeReplyFixture(t, "error-canvas-not-found"), code: "canvas_not_found", exit: 2, inMessage: ".doan/canvases/home.html"},
		{name: "busy keeps the app's reason", line: `{"v":6,"ok":false,"error":{"code":"busy","message":"Finish Doan’s first run, then try again."}}`, code: "busy", exit: 5, inMessage: "Finish Doan’s first run"},
		{name: "busy, empty reason", line: `{"v":6,"ok":false,"error":{"code":"busy","message":" "}}`, code: "busy", exit: 5, inMessage: "cannot play a prototype right now"},
		{name: "not ready is the retry signal", line: prototypeReplyFixture(t, "error-not-ready"), code: "not_ready"},
		{name: "stale token", line: prototypeReplyFixture(t, "error-bad-token"), code: "app_not_running", exit: 3, launch: true},
		{name: "malformed request", line: prototypeReplyFixture(t, "error-bad-request"), code: "internal_error", exit: 1},
		// An app from before v6 answers with its v1 bad_request.
		{name: "older app, v1 bad_request", line: `{"v":1,"ok":false,"error":{"code":"bad_request","message":"The request is not an app-socket v1 request."}}`, code: "app_protocol_mismatch", exit: 3},
		{name: "a v4 answer", line: `{"v":4,"ok":true,"opened":true,"frame":"found"}`, code: "app_protocol_mismatch", exit: 3},
		{name: "v 6.5", line: `{"v":6.5,"ok":true,"played":true}`, code: "app_protocol_mismatch", exit: 3},
		{name: "not json", line: `nope`, code: "internal_error", exit: 1},
		{name: "two values", line: `{"v":6,"ok":true,"played":true} {}`, code: "internal_error", exit: 1},
		{name: "array", line: `[]`, code: "internal_error", exit: 1},
		{name: "schema: played false", line: `{"v":6,"ok":true,"played":false}`, code: "internal_error", exit: 1},
		// Frame judgment is the CLI's; an app answering with a CLI code is outside the protocol.
		{name: "schema: frame_not_found from the app", line: `{"v":6,"ok":false,"error":{"code":"frame_not_found","message":"m"}}`, code: "internal_error", exit: 1},
		{name: "token as a field", line: `{"v":6,"ok":true,"played":true,"token":"` + testToken + `"}`, code: "internal_error", exit: 1},
		{name: "runtime path as a field", line: `{"v":6,"ok":true,"played":true,"runtime":"` + runtimePath + `"}`, code: "internal_error", exit: 1},
	} {
		result, failure, launchable := prototypeReply([]byte(tt.line), target, secrets)
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
	// An app-composed message that names the token or runtime file is replaced.
	for _, leak := range secrets {
		_, failure, _ := prototypeReply([]byte(`{"v":6,"ok":false,"error":{"code":"busy","message":"blocked by `+leak+`"}}`), target, secrets)
		if failure == nil || failure.Code != "busy" || failure.Message != "Doan sent a message that cannot be shown" {
			t.Errorf("leaked %q: %v", leak, failure)
		}
	}
}

func TestPrototypeReplyGuidance(t *testing.T) {
	target := prototypeTarget{root: "/Users/me/repo", path: ".doan/canvases/home.html", frame: "hero"}
	steps := func(line string) string {
		_, failure, _ := prototypeReply([]byte(line), target, nil)
		return strings.Join(failure.NextSteps, "\n")
	}
	for _, tt := range []struct{ line, want string }{
		{`{"v":6,"ok":false,"error":{"code":"project_not_open","message":"m"}}`, "Add Projects"},
		{`{"v":6,"ok":false,"error":{"code":"canvas_not_found","message":"m"}}`, "doan ls"},
		// The app also answers canvas_not_found when two canvases share the canvas id; doan check finds that.
		{`{"v":6,"ok":false,"error":{"code":"canvas_not_found","message":"m"}}`, "doan check"},
		{`{"v":6,"ok":false,"error":{"code":"busy","message":"m"}}`, "only when they ask again"},
		{`{"v":1,"ok":false,"error":{"code":"bad_request","message":"m"}}`, "update Doan"},
		{`{"v":6,"ok":false,"error":{"code":"bad_token","message":"m"}}`, "doan open"},
	} {
		if got := steps(tt.line); !strings.Contains(got, tt.want) {
			t.Errorf("%s: nextSteps %q miss %q", tt.line, got, tt.want)
		}
	}
}

// Both commands judge the frame the same way and refuse with the same codes, so an agent meets one rule.
func TestPrototypeFrameFailure(t *testing.T) {
	path := ".doan/canvases/home.html"
	for _, tt := range []struct {
		refusal   canvas.PrototypeRefusal
		code      string
		inMessage []string
		inSteps   string
	}{
		{canvas.PrototypeMissing, "frame_not_found", []string{"No frame hero in " + path}, "not one a script adds"},
		{canvas.PrototypeShared, "frame_not_found", []string{"More than one frame", "hero", path}, "exactly one"},
		{canvas.PrototypeTooLong, "frame_not_found", []string{"hero", "200 UTF-16 units"}, "exactly one"},
		{canvas.PrototypeNotMarked, "not_prototype", []string{"hero", path, "not marked for prototyping"}, "only if they ask"},
	} {
		failure := prototypeFrameFailure(tt.refusal, "hero", path)
		if failure.Code != tt.code || ExitCode(failure.Code) != 2 {
			t.Errorf("%v: %v exit %d", tt.refusal, failure, ExitCode(failure.Code))
			continue
		}
		for _, part := range tt.inMessage {
			if !strings.Contains(failure.Message, part) {
				t.Errorf("%v: message %q lacks %q", tt.refusal, failure.Message, part)
			}
		}
		if !strings.Contains(strings.Join(failure.NextSteps, "\n"), tt.inSteps) {
			t.Errorf("%v: nextSteps %q lack %q", tt.refusal, failure.NextSteps, tt.inSteps)
		}
	}
	if ExitCode("canvas_unreadable") != 2 {
		t.Errorf("canvas_unreadable exits %d", ExitCode("canvas_unreadable"))
	}
}
