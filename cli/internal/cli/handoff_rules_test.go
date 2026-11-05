package cli

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

const testHandoffKey = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"

// The CLI limit mirrors the schema's maxLength; reading the schema keeps one hand-kept number.
func TestHandoffTextLimitMatchesSchema(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "schema", "app-socket.v5.schema.json"))
	if err != nil {
		t.Fatal(err)
	}
	var schema struct {
		Defs struct {
			Request struct {
				Properties struct {
					Text struct {
						MaxLength int `json:"maxLength"`
					} `json:"text"`
				} `json:"properties"`
			} `json:"request"`
		} `json:"$defs"`
	}
	if err := json.Unmarshal(data, &schema); err != nil {
		t.Fatal(err)
	}
	if got := schema.Defs.Request.Properties.Text.MaxLength; got == 0 || got != handoffTextLimit {
		t.Fatalf("schema maxLength %d, handoffTextLimit %d", got, handoffTextLimit)
	}
}

func TestHandoffText(t *testing.T) {
	for _, tt := range []struct {
		name, raw, want string
		ok              bool
	}{
		{"empty", "", "", false},
		{"only whitespace", " \n\t \n", "", false},
		{"trimmed", "  Made the checkout canvas.\n", "Made the checkout canvas.", true},
		{"newlines and tabs inside", "Asked:\n\t- a\n\t- b", "Asked:\n\t- a\n\t- b", true},
		{"limit", strings.Repeat("a", handoffTextLimit), strings.Repeat("a", handoffTextLimit), true},
		{"limit + 1", strings.Repeat("a", handoffTextLimit+1), "", false},
		// The limit counts code points, as the schema does, not bytes or UTF-16 units.
		{"astral limit", strings.Repeat("😀", handoffTextLimit), strings.Repeat("😀", handoffTextLimit), true},
		{"astral limit + 1", strings.Repeat("😀", handoffTextLimit+1), "", false},
		{"surrounding whitespace is not counted", "\n\n" + strings.Repeat("가", handoffTextLimit) + "\n", strings.Repeat("가", handoffTextLimit), true},
		{"NUL", "a\x00b", "", false},
		{"carriage return inside", "a\rb", "", false},
		{"escape", "a\x1b[31mb", "", false},
		{"DEL", "a\x7fb", "", false},
		{"invalid UTF-8", "a\xffb", "", false},
		{"line separators are text", "a\u2028b\u2029c", "a\u2028b\u2029c", true},
	} {
		got, failure := handoffText(tt.raw)
		if tt.ok {
			if failure != nil || got != tt.want {
				t.Errorf("%s: %q %v", tt.name, got, failure)
			}
			continue
		}
		if failure == nil || failure.Code != "usage_error" || ExitCode(failure.Code) != 2 {
			t.Errorf("%s: accepted %q %v", tt.name, got, failure)
		}
	}
}

func TestHandoffKey(t *testing.T) {
	if got := handoffKey(testHandoffKey); got != testHandoffKey {
		t.Fatal(got)
	}
	for _, bad := range []string{"", testHandoffKey[:63], testHandoffKey + "0", strings.ToUpper(testHandoffKey), " " + testHandoffKey, testHandoffKey[:63] + "g", "-" + testHandoffKey[1:]} {
		if got := handoffKey(bad); got != "" {
			t.Errorf("accepted %q", bad)
		}
	}
}

// wireLine is the line exchange sends: the request with a 64-hex token, marshalled and newline-terminated.
func wireLine(t *testing.T, request map[string]any) []byte {
	t.Helper()
	wire := map[string]any{"token": testToken}
	for k, v := range request {
		wire[k] = v
	}
	b, err := json.Marshal(wire)
	if err != nil {
		t.Fatal(err)
	}
	return append(b, '\n')
}

func TestHandoffRequest(t *testing.T) {
	root := "/Users/me/repo"
	got, failure := handoffRequest(root, ".doan/canvases/checkout.html", testHandoffKey, "Made it")
	want := map[string]any{"v": 5, "root": root, "handoff": testHandoffKey, "path": ".doan/canvases/checkout.html", "text": "Made it"}
	if failure != nil || !reflect.DeepEqual(got, want) {
		t.Fatal(got, failure)
	}
	var probe any
	if err := json.Unmarshal(wireLine(t, got), &probe); err != nil {
		t.Fatal(err)
	}
	if err := formats.ValidateHandoffRequest(probe); err != nil {
		t.Fatal(err)
	}
	// v5 is narrower than v4: a handoff starts a conversation on a canvas, never on a ds page.
	for _, bad := range []string{"", ".doan/ds/brand.html", "src/a.html", ".doan/canvases/a.txt", ".doan/canvases/nested/a.html", "../.doan/canvases/a.html", "/Users/me/repo/.doan/canvases/a.html"} {
		if request, failure := handoffRequest(root, bad, testHandoffKey, "Made it"); failure == nil || failure.Code != "usage_error" {
			t.Errorf("accepted %q: %v", bad, request)
		}
	}
}

// json.Marshal writes '<' as \u003c and U+2028 as \u2028: six bytes each. A message at the code-point limit made
// only of them must still fit the app's 64 KiB line, token included.
func TestHandoffRequestWorstCaseFitsTheLine(t *testing.T) {
	root := "/Users/me/projects/some-longer-folder-name/repo"
	for _, ch := range []string{"<", ">", "&", "\u2028", "\u2029"} {
		text := strings.Repeat(ch, handoffTextLimit)
		request, failure := handoffRequest(root, ".doan/canvases/checkout.html", testHandoffKey, text)
		if failure != nil {
			t.Fatalf("%q: %v", ch, failure)
		}
		line := wireLine(t, request)
		if len(line)-1 > socketLineLimit {
			t.Fatalf("%q: %d bytes", ch, len(line)-1)
		}
		if bytes.Count(line, []byte(`\u`)) < handoffTextLimit {
			t.Fatalf("%q was not escaped to six bytes", ch)
		}
		var probe any
		if err := json.Unmarshal(line, &probe); err != nil || formats.ValidateHandoffRequest(probe) != nil {
			t.Fatalf("%q: %v", ch, err)
		}
	}
}

// The byte limit is on the marshalled request, so a long root can push a limit-length message over it.
func TestHandoffRequestLineBoundary(t *testing.T) {
	text := strings.Repeat("<", handoffTextLimit)
	size := func(root string) int {
		request := map[string]any{"v": 5, "root": root, "handoff": testHandoffKey, "path": ".doan/canvases/a.html", "text": text}
		b, err := json.Marshal(request)
		if err != nil {
			t.Fatal(err)
		}
		return len(b)
	}
	pad := handoffLineMax - size("/")
	if pad <= 0 {
		t.Fatalf("no room: %d", pad)
	}
	fits := "/" + strings.Repeat("r", pad)
	if size(fits) != handoffLineMax {
		t.Fatal(size(fits))
	}
	if _, failure := handoffRequest(fits, ".doan/canvases/a.html", testHandoffKey, text); failure != nil {
		t.Fatal(failure)
	}
	over := fits + "r"
	if request, failure := handoffRequest(over, ".doan/canvases/a.html", testHandoffKey, text); failure == nil || failure.Code != "usage_error" {
		t.Fatalf("accepted %d bytes: %v", size(over), request != nil)
	}
	// The headroom leaves the token's field inside the app's limit.
	if handoffLineMax+len(`"token":"`+testToken+`",`) > socketLineLimit {
		t.Fatal("headroom does not cover a 64-hex token")
	}
}

func handoffFixture(t *testing.T, kind, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "..", "schema", "fixtures", "app-socket-v5", "response", kind, name))
	if err != nil {
		t.Fatal(err)
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, b); err != nil {
		t.Fatal(err)
	}
	return compact.Bytes()
}

func TestHandoffReply(t *testing.T) {
	const canvas = ".doan/canvases/checkout.html"
	got, failure := handoffReply(handoffFixture(t, "valid", "requested.json"), canvas)
	if failure != nil || !reflect.DeepEqual(got, map[string]any{"requested": true, "canvas": canvas}) {
		t.Fatal(got, failure)
	}
	for _, tt := range []struct {
		file, code string
		exit       int
	}{
		{"error-bad-token.json", "app_not_running", 3},
		{"error-bad-request.json", "internal_error", 1},
		{"error-project-not-open.json", "project_not_open", 3},
		{"error-not-app-conversation.json", "not_app_conversation", 2},
		{"error-root-mismatch.json", "root_mismatch", 2},
		{"error-not-running.json", "not_running", 5},
		{"error-not-canvas-conversation.json", "not_canvas_conversation", 5},
		{"error-plan-mode.json", "plan_mode", 5},
		{"error-handoff-turn.json", "handoff_turn", 5},
		{"error-already-requested.json", "already_requested", 5},
		{"error-same-canvas.json", "same_canvas", 5},
	} {
		line := handoffFixture(t, "valid", tt.file)
		got, failure := handoffReply(line, canvas)
		if failure == nil || failure.Code != tt.code || ExitCode(failure.Code) != tt.exit || got != nil {
			t.Errorf("%s: %v %v", tt.file, got, failure)
			continue
		}
		// The CLI writes its own message per code (TestHandoffAppRefusals checks the app's text is not passed on).
		if failure.Message == "" {
			t.Errorf("%s: message %q", tt.file, failure.Message)
		}
		if tt.code != "internal_error" && len(failure.NextSteps) == 0 {
			t.Errorf("%s: no nextSteps", tt.file)
		}
	}
	// An older app does not know v5 and answers on its v1 path.
	for _, line := range []string{`{"v":1,"ok":false,"error":{"code":"bad_request","message":"Unsupported version"}}`, `{"v":4,"ok":true,"frame":"none"}`, `{"v":6,"ok":true,"requested":true}`} {
		if _, failure := handoffReply([]byte(line), canvas); failure == nil || failure.Code != "app_protocol_mismatch" || ExitCode(failure.Code) != 3 {
			t.Errorf("%s: %v", line, failure)
		}
	}
	for _, line := range []string{``, `not json`, `[]`, `{"v":5,"ok":true,"requested":true} {}`, `{"v":5,"ok":true}`, `{"v":5,"ok":false,"error":{"code":"busy","message":"m"}}`} {
		if _, failure := handoffReply([]byte(line), canvas); failure == nil || failure.Code != "internal_error" {
			t.Errorf("%q: %v", line, failure)
		}
	}
}

func TestHandoffReplyInvalidFixtures(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "schema", "fixtures", "app-socket-v5", "response", "invalid")
	files, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil || len(files) == 0 {
		t.Fatal(err)
	}
	for _, file := range files {
		name := filepath.Base(file)
		got, failure := handoffReply(handoffFixture(t, "invalid", name), ".doan/canvases/a.html")
		if failure == nil || got != nil {
			t.Errorf("%s: accepted %v", name, got)
		}
	}
}

func TestHandoffFailureSteps(t *testing.T) {
	requireRecoveryOrder(t, handoffFailure("app_not_running", "m").NextSteps, [][]string{
		{"Ask the user to open Doan", "`doan handoff`"},
		{"If Doan is open, a sandbox may block this shell from its socket", "outside the sandbox", "approval"},
		{"If it still fails", "Applications", "Settings… > About"},
	})
	for code, words := range map[string][]string{
		"not_app_conversation": {"Doan app", "canvas conversation", "open the new canvas"},
		"root_mismatch":        {"without --repo"},
		"canvas_not_found":     {"`doan ls`"},
		"already_requested":    {"do not run `doan handoff` again"},
	} {
		steps := strings.Join(handoffFailure(code, "m").NextSteps, "\n")
		for _, word := range words {
			if !strings.Contains(steps, word) {
				t.Errorf("%s: %q missing from %q", code, word, steps)
			}
		}
	}
	for _, code := range []string{"app_protocol_mismatch", "project_not_open", "not_running", "not_canvas_conversation", "plan_mode", "handoff_turn", "same_canvas"} {
		if len(handoffFailure(code, "m").NextSteps) == 0 {
			t.Errorf("%s: no nextSteps", code)
		}
	}
}
