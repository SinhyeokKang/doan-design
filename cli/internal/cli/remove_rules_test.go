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

func removeFixture(t *testing.T, kind, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "..", "schema", "fixtures", "app-socket-v7", "response", kind, name))
	if err != nil {
		t.Fatal(err)
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, b); err != nil {
		t.Fatal(err)
	}
	return compact.Bytes()
}

func TestRemoveRequest(t *testing.T) {
	got := removeRequest("/Users/me/repo")
	if !reflect.DeepEqual(got, map[string]any{"v": 7, "root": "/Users/me/repo"}) {
		t.Fatal(got)
	}
	var probe any
	if err := json.Unmarshal(wireLine(t, got), &probe); err != nil {
		t.Fatal(err)
	}
	if err := formats.ValidateRemoveRequest(probe); err != nil {
		t.Fatal(err)
	}
}

func TestRemoveReply(t *testing.T) {
	const root = "/Users/me/repo-fix"
	got, failure := removeReply(removeFixture(t, "valid", "removed.json"), root, nil)
	want := map[string]any{"removed": true, "project": "repo", "roots": []string{"/Users/me/repo", "/Users/me/repo-fix", "/Users/me/.worktrees/repo-wt"}}
	if failure != nil || !reflect.DeepEqual(got, want) {
		t.Fatal(got, failure)
	}
	for _, tt := range []struct {
		file, code string
		exit       int
	}{
		{"error-bad-token.json", "app_not_running", 3},
		{"error-bad-request.json", "internal_error", 1},
		{"error-project-not-open.json", "project_not_open", 3},
		{"error-busy.json", "busy", 5},
		{"error-conversation-running.json", "conversation_running", 5},
	} {
		got, failure := removeReply(removeFixture(t, "valid", tt.file), root, nil)
		if failure == nil || failure.Code != tt.code || ExitCode(failure.Code) != tt.exit || got != nil {
			t.Errorf("%s: %v %v", tt.file, got, failure)
			continue
		}
		if failure.Message == "" {
			t.Errorf("%s: no message", tt.file)
		}
		if tt.code != "internal_error" && len(failure.NextSteps) == 0 {
			t.Errorf("%s: no nextSteps", tt.file)
		}
	}
	// Another protocol, including an older app's v1 bad_request for a version it does not know.
	for _, line := range []string{
		`{"v":1,"ok":false,"error":{"code":"bad_request","message":"Unsupported version"}}`,
		`{"v":6,"ok":true,"played":true}`,
		`{"v":8,"ok":true,"removed":true,"project":"repo","roots":["/Users/me/repo-fix"]}`,
	} {
		if _, failure := removeReply([]byte(line), root, nil); failure == nil || failure.Code != "app_protocol_mismatch" || ExitCode(failure.Code) != 3 {
			t.Errorf("%s: %v", line, failure)
		}
	}
	// Outside the schema, or a success that does not name the requested root.
	for _, line := range []string{
		``, `not json`, `[]`,
		`{"v":7,"ok":true,"removed":true,"project":"repo","roots":["/Users/me/repo-fix"]} {}`,
		`{"v":7,"ok":true,"removed":true,"project":"repo","roots":[]}`,
		`{"v":7,"ok":true,"removed":true,"project":"repo","roots":["/Users/me/repo"]}`,
		`{"v":7,"ok":false,"error":{"code":"not_ready","message":"m"}}`,
	} {
		if _, failure := removeReply([]byte(line), root, nil); failure == nil || failure.Code != "internal_error" {
			t.Errorf("%q: %v", line, failure)
		}
	}
	// v 7.0 is v 7.
	if got, failure := removeReply([]byte(`{"v":7.0,"ok":true,"removed":true,"project":"repo","roots":["/Users/me/repo-fix"]}`), root, nil); failure != nil || got == nil {
		t.Fatal(got, failure)
	}
}

func TestRemoveReplyInvalidFixtures(t *testing.T) {
	files, err := filepath.Glob(filepath.Join("..", "..", "..", "schema", "fixtures", "app-socket-v7", "response", "invalid", "*.json"))
	if err != nil || len(files) == 0 {
		t.Fatal(err)
	}
	for _, file := range files {
		name := filepath.Base(file)
		if got, failure := removeReply(removeFixture(t, "invalid", name), "/r", nil); failure == nil || got != nil {
			t.Errorf("%s: accepted %v", name, got)
		}
	}
}

// busy is the one code whose message is the app's, since it names what blocks; a message naming the token or the
// runtime file is not passed on, and a structured value naming one fails the command.
func TestRemoveReplyMessages(t *testing.T) {
	const root = "/Users/me/repo"
	_, failure := removeReply([]byte(`{"v":7,"ok":false,"error":{"code":"busy","message":"A dialog is open in Doan. Close it, then try again."}}`), root, nil)
	if failure == nil || failure.Message != "A dialog is open in Doan. Close it, then try again." {
		t.Fatal(failure)
	}
	_, failure = removeReply([]byte(`{"v":7,"ok":false,"error":{"code":"busy","message":"   "}}`), root, nil)
	if failure == nil || failure.Code != "busy" || strings.TrimSpace(failure.Message) == "" {
		t.Fatal(failure)
	}
	_, failure = removeReply([]byte(`{"v":7,"ok":false,"error":{"code":"busy","message":"token `+testToken+`"}}`), root, []string{testToken})
	if failure == nil || failure.Code != "busy" || strings.Contains(failure.Message, testToken) {
		t.Fatal(failure)
	}
	for _, code := range []string{"project_not_open", "conversation_running"} {
		_, failure := removeReply([]byte(`{"v":7,"ok":false,"error":{"code":"`+code+`","message":"app text"}}`), root, nil)
		if failure == nil || failure.Code != code || strings.Contains(failure.Message, "app text") {
			t.Errorf("%s: %v", code, failure)
		}
	}
	line := []byte(`{"v":7,"ok":true,"removed":true,"project":"` + testToken + `","roots":["/Users/me/repo"]}`)
	if got, failure := removeReply(line, root, []string{testToken}); failure == nil || failure.Code != "internal_error" || got != nil {
		t.Fatal(got, failure)
	}
}

func TestRemoveFailureSteps(t *testing.T) {
	requireRecoveryOrder(t, removeFailure("app_not_running", "m").NextSteps, [][]string{
		{"Ask the user to open Doan", "`doan remove`"},
		{"If Doan is open, a sandbox may block this shell from its socket", "outside the sandbox", "approval"},
		{"If it still fails", "Applications", "Settings… > About"},
	})
	for code, want := range map[string]string{
		"conversation_running":  "Tell the user a conversation is still running in this project in Doan; nothing was removed. Run `doan remove` again only when they ask again",
		"busy":                  "Tell the user what Doan is waiting for (see the message) and ask them to finish it; run `doan remove` again only when they ask again",
		"project_not_open":      "Tell the user Doan does not list this folder's project; nothing was removed",
		"app_protocol_mismatch": "Ask the user to update Doan and the doan CLI to matching versions",
	} {
		if steps := removeFailure(code, "m").NextSteps; !reflect.DeepEqual(steps, []string{want}) {
			t.Errorf("%s: %q", code, steps)
		}
	}
}

func TestRemoveText(t *testing.T) {
	got := removeText("repo", []string{"/Users/me/repo", "/Users/me/repo-fix"})
	if got != "Removed repo from Doan: /Users/me/repo, /Users/me/repo-fix. Files and Git worktrees stay on disk." {
		t.Fatal(got)
	}
	if got := removeText("app", []string{"/a/app"}); got != "Removed app from Doan: /a/app. Files and Git worktrees stay on disk." {
		t.Fatal(got)
	}
}
