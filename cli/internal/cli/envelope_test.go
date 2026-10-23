package cli

import (
	"encoding/json"
	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
	"reflect"
	"testing"
)

func TestEnvelope(t *testing.T) {
	for _, e := range []*Error{nil, {Code: "usage_error", Message: "Bad input"}, {Code: "internal_error", Message: "Failed", NextSteps: []string{"Retry"}}} {
		b, err := json.Marshal(Envelope(map[string]any{"items": []string{}}, e))
		if err != nil {
			t.Fatal(err)
		}
		var value any
		if err = json.Unmarshal(b, &value); err != nil {
			t.Fatal(err)
		}
		if err = formats.ValidateEnvelope(value); err != nil {
			t.Fatalf("%s: %v", b, err)
		}
		m := value.(map[string]any)
		if e == nil {
			if m["ok"] != true || m["error"] != nil {
				t.Fatal(m)
			}
		} else {
			if m["ok"] != false || m["result"] != nil {
				t.Fatal(m)
			}
			steps := m["error"].(map[string]any)["nextSteps"]
			if e.NextSteps == nil && !reflect.DeepEqual(steps, []any{}) {
				t.Fatal(steps)
			}
		}
	}
}
func TestExitCode(t *testing.T) {
	for code, want := range map[string]int{"internal_error": 1, "usage_error": 2, "repo_not_found": 2, "invalid_config": 2, "unsupported_version": 2, "app_not_running": 3, "app_protocol_mismatch": 3, "project_not_open": 3, "comment_not_found": 2, "canvas_not_found": 2, "unknown": 1, "": 1} {
		if got := ExitCode(code); got != want {
			t.Errorf("%s: %d != %d", code, got, want)
		}
	}
}
