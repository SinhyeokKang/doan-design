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

// send shares the text rules and the limit with handoff, so v8's maxLength must be the same number.
func TestSendTextLimitMatchesSchema(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "schema", "app-socket.v8.schema.json"))
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

// Every text the v8 request fixtures refuse is refused here as usage_error, and every valid one taken.
func TestSendTextFollowsSharedRequestFixtures(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "schema", "fixtures", "app-socket-v8", "request")
	for _, validity := range []string{"valid", "invalid"} {
		files, err := filepath.Glob(filepath.Join(dir, validity, "*.json"))
		if err != nil || len(files) == 0 {
			t.Fatal(validity, err)
		}
		for _, file := range files {
			name := filepath.Base(file)
			if validity == "invalid" && !strings.HasPrefix(name, "text-") {
				continue
			}
			data, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			var request struct {
				Text any `json:"text"`
			}
			if err := json.Unmarshal(data, &request); err != nil {
				t.Fatal(name, err)
			}
			text, ok := request.Text.(string)
			if !ok {
				continue
			}
			_, failure := handoffText(text)
			if validity == "valid" && failure != nil {
				t.Errorf("%s/%s: refused %v", validity, name, failure)
			}
			if validity == "invalid" && (failure == nil || failure.Code != "usage_error") {
				t.Errorf("%s/%s: accepted", validity, name)
			}
		}
	}
}

func TestSendRequest(t *testing.T) {
	root := "/Users/me/repo"
	got, failure := sendRequest(root, ".doan/canvases/checkout.html", testHandoffKey, "Pass it on")
	want := map[string]any{"v": 8, "root": root, "handoff": testHandoffKey, "path": ".doan/canvases/checkout.html", "text": "Pass it on"}
	if failure != nil || !reflect.DeepEqual(got, want) {
		t.Fatal(got, failure)
	}
	var probe any
	if err := json.Unmarshal(wireLine(t, got), &probe); err != nil {
		t.Fatal(err)
	}
	if err := formats.ValidateSendRequest(probe); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"", ".doan/ds/brand.html", "src/a.html", ".doan/canvases/a.txt", ".doan/canvases/nested/a.html", "../.doan/canvases/a.html", "/Users/me/repo/.doan/canvases/a.html"} {
		if request, failure := sendRequest(root, bad, testHandoffKey, "Pass it on"); failure == nil || failure.Code != "usage_error" {
			t.Errorf("accepted %q: %v", bad, request)
		}
	}
	// The line limit is the handoff's: a message of six-byte characters at the limit fits the line.
	text := strings.Repeat("<", handoffTextLimit)
	request, failure := sendRequest("/Users/me/projects/some-longer-folder-name/repo", ".doan/canvases/a.html", testHandoffKey, text)
	if failure != nil {
		t.Fatal(failure)
	}
	if line := wireLine(t, request); len(line)-1 > socketLineLimit || !bytes.Contains(line, []byte(`\u003c`)) {
		t.Fatalf("%d bytes", len(line))
	}
	if _, failure := sendRequest("/"+strings.Repeat("r", socketLineLimit), ".doan/canvases/a.html", testHandoffKey, text); failure == nil || failure.Code != "usage_error" {
		t.Fatal("accepted a line past the limit")
	}
}

func sendFixture(t *testing.T, kind, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "..", "schema", "fixtures", "app-socket-v8", "response", kind, name))
	if err != nil {
		t.Fatal(err)
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, b); err != nil {
		t.Fatal(err)
	}
	return compact.Bytes()
}

func TestSendReply(t *testing.T) {
	const root, canvas = "/Users/me/repo", ".doan/canvases/checkout.html"
	got, failure := sendReply(sendFixture(t, "valid", "requested.json"), root, canvas)
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
		{"error-chain-one.json", "chain_one", 5},
		{"error-chain-limit.json", "chain_limit", 5},
	} {
		got, failure := sendReply(sendFixture(t, "valid", tt.file), root, canvas)
		if failure == nil || failure.Code != tt.code || ExitCode(failure.Code) != tt.exit || got != nil {
			t.Errorf("%s: %v %v", tt.file, got, failure)
			continue
		}
		if failure.Message == "" {
			t.Errorf("%s: message %q", tt.file, failure.Message)
		}
		if tt.code != "internal_error" && len(failure.NextSteps) == 0 {
			t.Errorf("%s: no nextSteps", tt.file)
		}
	}
	// An earlier app does not know v8 and answers on its v1 path; another version is another protocol.
	for _, line := range []string{`{"v":1,"ok":false,"error":{"code":"bad_request","message":"Unsupported version"}}`, `{"v":5,"ok":true,"requested":true}`, `{"v":7,"ok":true,"requested":true}`} {
		if _, failure := sendReply([]byte(line), root, canvas); failure == nil || failure.Code != "app_protocol_mismatch" || ExitCode(failure.Code) != 3 {
			t.Errorf("%s: %v", line, failure)
		}
	}
	for _, line := range []string{``, `not json`, `[]`, `{"v":8,"ok":true,"requested":true} {}`, `{"v":8,"ok":true}`, `{"v":8,"ok":false,"error":{"code":"busy","message":"m"}}`, `{"v":8,"ok":false,"error":{"code":"chain_return","message":"m"}}`} {
		if _, failure := sendReply([]byte(line), root, canvas); failure == nil || failure.Code != "internal_error" {
			t.Errorf("%q: %v", line, failure)
		}
	}
}

func TestSendReplyInvalidFixtures(t *testing.T) {
	files, err := filepath.Glob(filepath.Join("..", "..", "..", "schema", "fixtures", "app-socket-v8", "response", "invalid", "*.json"))
	if err != nil || len(files) == 0 {
		t.Fatal(err)
	}
	for _, file := range files {
		name := filepath.Base(file)
		got, failure := sendReply(sendFixture(t, "invalid", name), "/Users/me/repo", ".doan/canvases/a.html")
		if failure == nil || got != nil {
			t.Errorf("%s: accepted %v", name, got)
		}
	}
}

// A send refuses with its own command's words, and a refused request never reads as a handoff's.
func TestSendFailureSteps(t *testing.T) {
	requireRecoveryOrder(t, sendFailure("app_not_running", "m").NextSteps, [][]string{
		{"Ask the user to open Doan", "`doan send`"},
		{"If Doan is open, a sandbox may block this shell from its socket", "outside the sandbox", "approval"},
		{"If it still fails", "Applications", "Settings… > About"},
	})
	for code, words := range map[string][]string{
		"not_app_conversation": {"`doan send` works only in a conversation in the Doan app"},
		"root_mismatch":        {"`doan send`", "without --repo"},
		"canvas_not_found":     {"`doan send`", "`doan ls`"},
		"already_requested":    {"This turn already requested a message to this canvas; send to each other canvas once", "A handoff and a send to the same canvas count together"},
		"same_canvas":          {"another canvas", "own canvas"},
		"chain_one":            {"A turn started by a message can send only once.", "Do not run `doan handoff` or `doan send` again in this turn"},
		"chain_limit":          {"This chain reached 5 steps.", "This turn cannot hand off or send"},
		"project_not_open":     {"File > Add Projects…", "Project Settings", "another checkout or worktree"},
	} {
		steps := strings.Join(sendFailure(code, "m").NextSteps, "\n")
		for _, word := range words {
			if !strings.Contains(steps, word) {
				t.Errorf("%s: %q missing from %q", code, word, steps)
			}
		}
		if strings.Contains(steps, "doan handoff") && code != "chain_one" && code != "chain_limit" {
			t.Errorf("%s: names `doan handoff`: %q", code, steps)
		}
	}
	for _, code := range []string{"app_protocol_mismatch", "not_running", "not_canvas_conversation", "plan_mode", "handoff_turn", "chain_one", "chain_limit"} {
		if len(sendFailure(code, "m").NextSteps) == 0 {
			t.Errorf("%s: no nextSteps", code)
		}
	}
}

// The grammar is per command: a send never says it "hands off", and the already-requested reply names a message.
func TestSendFailureVerbs(t *testing.T) {
	const ready = "tell the user what you meant to send"
	for code, want := range map[string]string{
		"plan_mode":               "A conversation in Plan mode cannot send; " + ready,
		"not_canvas_conversation": "Only a canvas conversation sends; " + ready,
		"same_canvas":             "Send only to another canvas, not this conversation's own canvas",
	} {
		if got := sendFailure(code, "m").NextSteps; len(got) != 1 || got[0] != want {
			t.Errorf("%s: %q; want %q", code, got, want)
		}
	}
	_, failure := sendReply(sendFixture(t, "valid", "error-already-requested.json"), "/Users/me/repo", ".doan/canvases/a.html")
	if failure == nil || failure.Message != "This turn already requested a message to this canvas" {
		t.Fatal(failure)
	}
}
