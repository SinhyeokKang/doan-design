package formats

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

func fixtureFiles(t *testing.T, name, validity string) []string {
	t.Helper()
	directory := filepath.Join("..", "..", "..", "schema", "fixtures", filepath.FromSlash(name), validity)
	files, err := filepath.Glob(filepath.Join(directory, "*.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(files) == 0 {
		t.Fatalf("no fixtures in %s", directory)
	}
	return files
}

func readJSON(t *testing.T, file string) any {
	t.Helper()
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	var value any
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func TestValidationFixtures(t *testing.T) {
	groups := []struct {
		name     string
		validate func(any) error
	}{
		{"comment-event", ValidateCommentEvent},
		{"config", ValidateConfig},
		{"cli-envelope", ValidateEnvelope},
		{"runtime", ValidateRuntimeFile},
		{"sessions", ValidateSessionRecord},
		{"app-socket/request", ValidateSocketRequest},
		{"app-socket/response", ValidateSocketResponse},
		{"app-socket/selection", ValidateSelection},
		{"app-socket-v2/request", ValidateOnboardingRequest},
		{"app-socket-v2/response", ValidateOnboardingResponse},
	}
	for _, group := range groups {
		for _, validity := range []string{"valid", "invalid"} {
			for _, file := range fixtureFiles(t, group.name, validity) {
				t.Run(group.name+"/"+validity+"/"+filepath.Base(file), func(t *testing.T) {
					err := group.validate(readJSON(t, file))
					if (err == nil) != (validity == "valid") {
						t.Fatalf("validation error = %v; want %s", err, validity)
					}
				})
			}
		}
	}
}

func TestSocketProtocolsStayApart(t *testing.T) {
	pairs := []struct {
		kind   string
		v1, v2 func(any) error
	}{
		{"request", ValidateSocketRequest, ValidateOnboardingRequest},
		{"response", ValidateSocketResponse, ValidateOnboardingResponse},
	}
	for _, pair := range pairs {
		for _, file := range fixtureFiles(t, "app-socket/"+pair.kind, "valid") {
			if pair.v2(readJSON(t, file)) == nil {
				t.Errorf("v1 %s %s validates as v2", pair.kind, filepath.Base(file))
			}
		}
		for _, file := range fixtureFiles(t, "app-socket-v2/"+pair.kind, "valid") {
			if pair.v1(readJSON(t, file)) == nil {
				t.Errorf("v2 %s %s validates as v1", pair.kind, filepath.Base(file))
			}
		}
	}
}

func TestOnboardingCLIMapping(t *testing.T) {
	var mapping struct {
		Translate map[string]string `json:"translate"`
		ExitCodes map[string]int    `json:"exitCodes"`
		Cases     []struct {
			Name   string         `json:"name"`
			Op     string         `json:"op"`
			Reply  map[string]any `json:"reply"`
			Expect struct {
				OK   bool   `json:"ok"`
				Exit int    `json:"exit"`
				Code string `json:"code"`
			} `json:"expect"`
		} `json:"cases"`
	}
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "schema", "fixtures", "cli-envelope", "onboarding", "mapping.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &mapping); err != nil {
		t.Fatal(err)
	}

	var schemaDoc struct {
		Defs struct {
			ErrorCode          struct{ Enum []string } `json:"errorCode"`
			OperationErrorCode struct{ Enum []string } `json:"operationErrorCode"`
		} `json:"$defs"`
	}
	schemaData, err := os.ReadFile(filepath.Join("..", "..", "..", "schema", "app-socket.v2.schema.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(schemaData, &schemaDoc); err != nil {
		t.Fatal(err)
	}
	want := map[string]bool{}
	for _, code := range schemaDoc.Defs.ErrorCode.Enum {
		if translated, ok := mapping.Translate[code]; ok {
			code = translated
		}
		want[code] = true
	}
	for _, code := range schemaDoc.Defs.OperationErrorCode.Enum {
		want[code] = true
	}
	for _, code := range []string{"internal_error", "usage_error", "app_not_running", "app_protocol_mismatch", "app_launch_failed", "cancelled"} {
		want[code] = true
	}
	var wantCodes, gotCodes []string
	for code := range want {
		wantCodes = append(wantCodes, code)
	}
	for code := range mapping.ExitCodes {
		gotCodes = append(gotCodes, code)
	}
	sort.Strings(wantCodes)
	sort.Strings(gotCodes)
	if !reflect.DeepEqual(gotCodes, wantCodes) {
		t.Fatalf("exitCodes keys = %v; want %v", gotCodes, wantCodes)
	}

	for _, c := range mapping.Cases {
		t.Run(c.Name, func(t *testing.T) {
			validateReply := ValidateOnboardingResponse
			if c.Reply["v"] != float64(2) {
				validateReply = ValidateSocketResponse
			}
			if err := validateReply(c.Reply); err != nil {
				t.Fatalf("reply: %v", err)
			}
			var envelope map[string]any
			if c.Expect.OK {
				if c.Expect.Exit != 0 {
					t.Fatalf("exit = %d for ok", c.Expect.Exit)
				}
				envelope = map[string]any{"v": float64(1), "ok": true, "result": c.Reply["result"]}
			} else {
				if exit, ok := mapping.ExitCodes[c.Expect.Code]; !ok || exit != c.Expect.Exit {
					t.Fatalf("exit = %d; exitCodes[%q] = %d (%v)", c.Expect.Exit, c.Expect.Code, exit, ok)
				}
				envelope = map[string]any{"v": float64(1), "ok": false, "error": map[string]any{"code": c.Expect.Code, "message": "m", "nextSteps": []any{}}}
			}
			if err := ValidateEnvelope(envelope); err != nil {
				t.Fatalf("envelope: %v", err)
			}
		})
	}
}
