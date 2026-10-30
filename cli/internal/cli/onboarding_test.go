package cli

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"net"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

// onboardingApp is a fake app speaking app-socket v2 over a real unix socket.
type onboardingApp struct {
	runtime  string
	mu       sync.Mutex
	requests []map[string]any
	respond  func(request map[string]any) string
}

func (a *onboardingApp) received() []map[string]any {
	a.mu.Lock()
	defer a.mu.Unlock()
	return append([]map[string]any{}, a.requests...)
}

// startOnboardingApp listens in dir and writes dir/runtime.json pointing at it.
func startOnboardingApp(t *testing.T, dir string, respond func(map[string]any) string) *onboardingApp {
	t.Helper()
	socket := filepath.Join(dir, "app.sock")
	l, e := net.Listen("unix", socket)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { l.Close() })
	app := &onboardingApp{runtime: filepath.Join(dir, "runtime.json"), respond: respond}
	go func() {
		for {
			c, e := l.Accept()
			if e != nil {
				return
			}
			go func() {
				defer c.Close()
				line, e := bufio.NewReader(c).ReadBytes('\n')
				if e != nil {
					return
				}
				var req map[string]any
				json.Unmarshal(line, &req)
				app.mu.Lock()
				app.requests = append(app.requests, req)
				app.mu.Unlock()
				c.Write([]byte(app.respond(req) + "\n"))
			}()
		}
	}()
	putFile(t, dir, "runtime.json", runtimeJSON(socket))
	return app
}

func fixtureReply(t *testing.T, name string) string {
	t.Helper()
	b, e := os.ReadFile(filepath.Join("..", "..", "..", "schema", "fixtures", "app-socket-v2", "response", "valid", name+".json"))
	if e != nil {
		t.Fatal(e)
	}
	var v any
	if e := json.Unmarshal(b, &v); e != nil {
		t.Fatal(e)
	}
	compact, _ := json.Marshal(v)
	return string(compact)
}

// onboardingCalls gives each op a CLI argv and the equivalent MCP call.
var onboardingCalls = map[string]struct {
	args []string
	tool string
	mcp  map[string]any
}{
	"start":           {[]string{"onboarding", "start"}, "onboarding_start", map[string]any{}},
	"status":          {[]string{"onboarding", "status", "--session", "s_1"}, "onboarding_status", map[string]any{"sessionId": "s_1"}},
	"check":           {[]string{"onboarding", "check", "--session", "s_1", "--provider", "claude", "--request", "r_1"}, "onboarding_check", map[string]any{"sessionId": "s_1", "provider": "claude", "requestId": "r_1"}},
	"sign_in":         {[]string{"onboarding", "sign-in", "--session", "s_1", "--provider", "codex", "--request", "r_1"}, "onboarding_sign_in", map[string]any{"sessionId": "s_1", "provider": "codex", "requestId": "r_1"}},
	"cancel":          {[]string{"onboarding", "cancel", "--session", "s_1", "--operation", "op_1", "--request", "r_1"}, "onboarding_cancel", map[string]any{"sessionId": "s_1", "operationId": "op_1", "requestId": "r_1"}},
	"project_inspect": {[]string{"onboarding", "project", "inspect", "--session", "s_1", "--path", "/Users/me/app", "--request", "r_1"}, "onboarding_project_inspect", map[string]any{"sessionId": "s_1", "path": "/Users/me/app", "requestId": "r_1"}},
	"project_select":  {[]string{"onboarding", "project", "select", "--session", "s_1", "--inspection", "i_1", "--path", "/Users/me/app", "--request", "r_1"}, "onboarding_project_select", map[string]any{"sessionId": "s_1", "inspectionId": "i_1", "path": "/Users/me/app", "requestId": "r_1"}},
	"project_clone":   {[]string{"onboarding", "project", "clone", "--session", "s_1", "--inspection", "i_1", "--destination", "/Users/me/new", "--request", "r_1"}, "onboarding_project_clone", map[string]any{"sessionId": "s_1", "inspectionId": "i_1", "destination": "/Users/me/new", "requestId": "r_1"}},
	"complete":        {[]string{"onboarding", "complete", "--session", "s_1", "--request", "r_1"}, "onboarding_complete", map[string]any{"sessionId": "s_1", "requestId": "r_1"}},
}

// runOnboarding runs the CLI with --json and returns the exit code, the envelope and both streams.
func runOnboarding(t *testing.T, args ...string) (int, map[string]any, string) {
	t.Helper()
	var out, errout bytes.Buffer
	code := Run(append(append([]string{}, args...), "--json"), strings.NewReader(""), &out, &errout)
	var v map[string]any
	if e := json.Unmarshal(out.Bytes(), &v); e != nil || errout.Len() != 0 {
		t.Fatal(args, e, out.String(), errout.String())
	}
	if e := formats.ValidateEnvelope(v); e != nil {
		t.Fatal(args, e, out.String())
	}
	return code, v, out.String()
}

func roundTrip(t *testing.T, v any) any {
	t.Helper()
	b, e := json.Marshal(v)
	if e != nil {
		t.Fatal(e)
	}
	var out any
	json.Unmarshal(b, &out)
	return out
}

// The mapping fixture drives the real reply-to-envelope translation through
// both the CLI and the MCP tool, not a copy of its rules.
func TestOnboardingMappingFixture(t *testing.T) {
	b, e := os.ReadFile(filepath.Join("..", "..", "..", "schema", "fixtures", "cli-envelope", "onboarding", "mapping.json"))
	if e != nil {
		t.Fatal(e)
	}
	var mapping struct {
		ExitCodes map[string]int `json:"exitCodes"`
		Cases     []struct {
			Name   string         `json:"name"`
			Op     string         `json:"op"`
			Reply  map[string]any `json:"reply"`
			Expect struct {
				OK      bool   `json:"ok"`
				Code    string `json:"code"`
				Exit    int    `json:"exit"`
				IsError bool   `json:"isError"`
			} `json:"expect"`
		} `json:"cases"`
	}
	if e := json.Unmarshal(b, &mapping); e != nil {
		t.Fatal(e)
	}
	for code, exit := range mapping.ExitCodes {
		if ExitCode(code) != exit {
			t.Errorf("ExitCode(%s) = %d, want %d", code, ExitCode(code), exit)
		}
	}
	if len(mapping.Cases) == 0 {
		t.Fatal("no cases")
	}
	cs := mcpClient(t)
	for _, c := range mapping.Cases {
		call, ok := onboardingCalls[c.Op]
		if !ok {
			t.Fatal(c.Name, c.Op)
		}
		reply, _ := json.Marshal(c.Reply)
		app := startOnboardingApp(t, shortTempDir(t), func(req map[string]any) string {
			if formats.ValidateOnboardingRequest(req) != nil || req["op"] != c.Op || req["token"] != testToken {
				t.Errorf("%s: unexpected request %v", c.Name, req)
			}
			return string(reply)
		})
		t.Setenv("DOAN_RUNTIME", app.runtime)
		code, env, out := runOnboarding(t, call.args...)
		if code != c.Expect.Exit || env["ok"] != c.Expect.OK {
			t.Errorf("%s: exit %d %s", c.Name, code, out)
			continue
		}
		if c.Expect.OK {
			if !reflect.DeepEqual(env["result"], roundTrip(t, c.Reply["result"])) {
				t.Errorf("%s: result changed %s", c.Name, out)
			}
		} else if got := env["error"].(map[string]any)["code"]; got != c.Expect.Code {
			t.Errorf("%s: code %v, want %s", c.Name, got, c.Expect.Code)
		}
		if strings.Contains(out, testToken) {
			t.Errorf("%s: token in output", c.Name)
		}
		fromTool := callTool(t, cs, call.tool, call.mcp)
		if !reflect.DeepEqual(fromTool, env) {
			t.Errorf("%s: MCP %v, CLI %v", c.Name, fromTool, env)
		}
		if len(app.received()) != 2 {
			t.Errorf("%s: %d requests", c.Name, len(app.received()))
		}
	}
}

// Every CLI flag and the matching MCP argument put the same request on the wire.
func TestOnboardingArgumentParity(t *testing.T) {
	type call struct {
		op   string
		args []string
		tool string
		mcp  map[string]any
		want map[string]any
	}
	calls := []call{
		{"status", []string{"onboarding", "status", "--session", "s_1", "--operation", "op_2"}, "onboarding_status", map[string]any{"sessionId": "s_1", "operationId": "op_2"}, map[string]any{"sessionId": "s_1", "operationId": "op_2"}},
		{"check", []string{"onboarding", "check", "--session", "s_1", "--provider", "copilot", "--spend-copilot-request", "--request", "r_1"}, "onboarding_check", map[string]any{"sessionId": "s_1", "provider": "copilot", "spendCopilotRequest": true, "requestId": "r_1"}, map[string]any{"sessionId": "s_1", "provider": "copilot", "spendCopilotRequest": true, "requestId": "r_1"}},
		{"project_inspect", []string{"onboarding", "project", "inspect", "--session", "s_1", "--url", "https://github.com/o/r", "--destination", "/Users/me/My Repos/r", "--request", "r_1"}, "onboarding_project_inspect", map[string]any{"sessionId": "s_1", "url": "https://github.com/o/r", "destination": "/Users/me/My Repos/r", "requestId": "r_1"}, map[string]any{"sessionId": "s_1", "url": "https://github.com/o/r", "destination": "/Users/me/My Repos/r", "requestId": "r_1"}},
		// A folder chosen for a GitHub URL carries the URL so the app checks the folder's remote.
		{"project_inspect", []string{"onboarding", "project", "inspect", "--session", "s_1", "--path", "/Users/me/app", "--url", "git@github.com:o/r.git", "--request", "r_1"}, "onboarding_project_inspect", map[string]any{"sessionId": "s_1", "path": "/Users/me/app", "url": "git@github.com:o/r.git", "requestId": "r_1"}, map[string]any{"sessionId": "s_1", "path": "/Users/me/app", "url": "git@github.com:o/r.git", "requestId": "r_1"}},
		{"project_select", []string{"onboarding", "project", "select", "--session", "s_1", "--inspection", "i_1", "--path", "/Users/me/app", "--initialize", "--request", "r_1"}, "onboarding_project_select", map[string]any{"sessionId": "s_1", "inspectionId": "i_1", "path": "/Users/me/app", "initialize": true, "requestId": "r_1"}, map[string]any{"sessionId": "s_1", "inspectionId": "i_1", "path": "/Users/me/app", "initialize": true, "requestId": "r_1"}},
		// false booleans are the same as leaving the flag off.
		{"project_select", []string{"onboarding", "project", "select", "--session", "s_1", "--inspection", "i_1", "--path", "/Users/me/app", "--request", "r_1"}, "onboarding_project_select", map[string]any{"sessionId": "s_1", "inspectionId": "i_1", "path": "/Users/me/app", "initialize": false, "requestId": "r_1"}, map[string]any{"sessionId": "s_1", "inspectionId": "i_1", "path": "/Users/me/app", "requestId": "r_1"}},
		{"check", []string{"onboarding", "check", "--session", "s_1", "--provider", "cursor", "--request", "r_1"}, "onboarding_check", map[string]any{"sessionId": "s_1", "provider": "cursor", "spendCopilotRequest": false, "requestId": "r_1"}, map[string]any{"sessionId": "s_1", "provider": "cursor", "requestId": "r_1"}},
	}
	for op, c := range onboardingCalls {
		want := map[string]any{}
		for k, v := range c.mcp {
			want[k] = v
		}
		calls = append(calls, call{op, c.args, c.tool, c.mcp, want})
	}
	cs := mcpClient(t)
	for _, c := range calls {
		app := startOnboardingApp(t, shortTempDir(t), func(map[string]any) string {
			return `{"v":2,"ok":false,"error":{"code":"busy","message":"Another sign-in is running"}}`
		})
		t.Setenv("DOAN_RUNTIME", app.runtime)
		runOnboarding(t, c.args...)
		callTool(t, cs, c.tool, c.mcp)
		got := app.received()
		if len(got) != 2 {
			t.Fatalf("%s %v: %d requests", c.op, c.args, len(got))
		}
		want := map[string]any{"v": float64(2), "token": testToken, "op": c.op}
		for k, v := range c.want {
			want[k] = v
		}
		for i, req := range got {
			if !reflect.DeepEqual(req, want) {
				t.Errorf("%s %v [%d]: %v, want %v", c.op, c.args, i, req, want)
			}
			if e := formats.ValidateOnboardingRequest(req); e != nil {
				t.Errorf("%s: %v", c.op, e)
			}
		}
	}
}

func TestOnboardingUsageErrorsSendNothing(t *testing.T) {
	app := startOnboardingApp(t, shortTempDir(t), func(map[string]any) string { return fixtureReply(t, "start-fresh") })
	t.Setenv("DOAN_RUNTIME", app.runtime)
	for _, args := range [][]string{
		{"onboarding"},
		{"onboarding", "nope"},
		{"onboarding", "start", "extra"},
		{"onboarding", "start", "--session", "s_1"},
		{"onboarding", "start", "--repo", "/tmp"},
		{"onboarding", "project"},
		{"onboarding", "project", "nope"},
		{"onboarding", "status"},
		{"onboarding", "status", "--session", "s_1", "--request", "r_1"},
		{"onboarding", "status", "--session", "a b"},
		{"onboarding", "status", "--session", ""},
		{"onboarding", "check", "--session", "s_1", "--provider", "copilot", "--request", "r_1"},
		{"onboarding", "check", "--session", "s_1", "--provider", "gemini", "--request", "r_1"},
		{"onboarding", "check", "--session", "s_1", "--provider", "claude"},
		{"onboarding", "sign-in", "--session", "s_1", "--provider", "claude"},
		{"onboarding", "sign-in", "--session", "s_1", "--provider", "claude", "--request", "r_1", "--spend-copilot-request"},
		{"onboarding", "cancel", "--session", "s_1", "--request", "r_1"},
		{"onboarding", "project", "inspect", "--session", "s_1", "--request", "r_1"},
		{"onboarding", "project", "inspect", "--session", "s_1", "--path", "/a", "--url", "https://github.com/o/r", "--destination", "/b", "--request", "r_1"},
		{"onboarding", "project", "inspect", "--session", "s_1", "--path", "/a", "--url", "", "--request", "r_1"},
		{"onboarding", "project", "inspect", "--session", "s_1", "--path", "rel", "--url", "https://github.com/o/r", "--request", "r_1"},
		{"onboarding", "project", "inspect", "--session", "s_1", "--path", "/a", "--destination", "/b", "--request", "r_1"},
		{"onboarding", "project", "inspect", "--session", "s_1", "--path", "rel", "--request", "r_1"},
		{"onboarding", "project", "inspect", "--session", "s_1", "--path", "", "--url", "https://github.com/o/r", "--request", "r_1"},
		{"onboarding", "project", "inspect", "--session", "s_1", "--url", "https://github.com/o/r", "--destination", "rel", "--request", "r_1"},
		{"onboarding", "project", "select", "--session", "s_1", "--path", "/a", "--request", "r_1"},
		{"onboarding", "project", "select", "--session", "s_1", "--inspection", "i_1", "--path", "./a", "--request", "r_1"},
		{"onboarding", "project", "clone", "--session", "s_1", "--inspection", "i_1", "--request", "r_1"},
		{"onboarding", "project", "clone", "--session", "s_1", "--inspection", "i_1", "--destination", "/b", "--initialize", "--request", "r_1"},
		{"onboarding", "project", "clone", "--session", "s_1", "--inspection", "i_1", "--destination", "/b", "--token-css", "/t.css", "--request", "r_1"},
		{"onboarding", "complete", "--session", "s_1"},
		{"onboarding", "complete", "--session", "s_1", "--request", "r_1", "--path", "/a"},
		{"ls", "--session", "s_1"},
	} {
		code, env, out := runOnboarding(t, args...)
		if code != 2 || env["error"].(map[string]any)["code"] != "usage_error" {
			t.Errorf("%v: %d %s", args, code, out)
		}
	}
	if n := len(app.received()); n != 0 {
		t.Fatalf("%d requests sent", n)
	}
}

func TestOnboardingMCPArgumentRejects(t *testing.T) {
	cs := mcpClient(t)
	for _, tt := range []struct {
		tool string
		args map[string]any
	}{
		{"onboarding_start", map[string]any{"sessionId": "s_1"}},
		{"onboarding_status", map[string]any{"sessionId": 1}},
		{"onboarding_status", map[string]any{"sessionId": "s_1", "repo": "/r"}},
		{"onboarding_check", map[string]any{"sessionId": "s_1", "provider": "copilot", "requestId": "r_1", "spendCopilotRequest": "yes"}},
		{"onboarding_check", map[string]any{"sessionId": "s_1", "provider": "copilot", "requestId": "r_1"}},
		{"onboarding_project_inspect", map[string]any{"sessionId": "s_1", "path": "rel", "requestId": "r_1"}},
		{"onboarding_project_inspect", map[string]any{"sessionId": "s_1", "path": "/a", "url": "https://github.com/o/r", "destination": "/b", "requestId": "r_1"}},
		{"onboarding_project_inspect", map[string]any{"sessionId": "s_1", "destination": "/b", "requestId": "r_1"}},
		{"onboarding_project_select", map[string]any{"sessionId": "s_1", "inspectionId": "i_1", "path": "/a", "initialize": "true", "requestId": "r_1"}},
		{"onboarding_project_clone", map[string]any{"sessionId": "s_1", "inspectionId": "i_1", "destination": "/b", "tokenCss": "/t.css", "requestId": "r_1"}},
		{"onboarding_project_clone", map[string]any{"sessionId": "s_1", "inspectionId": "i_1", "destination": "/b", "serve": []string{"/x"}, "requestId": "r_1"}},
		{"onboarding_complete", map[string]any{"sessionId": "s_1", "requestId": nil}},
	} {
		toolCode(t, cs, tt.tool, tt.args, "usage_error")
	}
}

// The app owns message text, but the token the CLI read must never come back out.
func TestOnboardingNeverPrintsTheToken(t *testing.T) {
	app := startOnboardingApp(t, shortTempDir(t), func(map[string]any) string {
		return `{"v":2,"ok":false,"error":{"code":"busy","message":"held by ` + testToken + `"}}`
	})
	t.Setenv("DOAN_RUNTIME", app.runtime)
	_, _, out := runOnboarding(t, onboardingCalls["sign_in"].args...)
	if strings.Contains(out, testToken) || !strings.Contains(out, `"busy"`) {
		t.Fatal(out)
	}
	var stdout, stderr bytes.Buffer
	Run(onboardingCalls["sign_in"].args, strings.NewReader(""), &stdout, &stderr)
	if strings.Contains(stdout.String()+stderr.String(), testToken) {
		t.Fatal(stderr.String())
	}
	toolOut, _ := json.Marshal(callTool(t, mcpClient(t), "onboarding_sign_in", onboardingCalls["sign_in"].mcp))
	if strings.Contains(string(toolOut), testToken) {
		t.Fatal(string(toolOut))
	}
}

func TestOnboardingFailedOperationNeverPrintsTheToken(t *testing.T) {
	app := startOnboardingApp(t, shortTempDir(t), func(map[string]any) string {
		return `{"v":2,"ok":true,"op":"sign_in","result":{"operation":{"operationId":"op_1","requestId":"r_1","kind":"sign_in","provider":"codex","state":"failed","error":{"code":"sign_in_failed","message":"exit ` + testToken + `"}}}}`
	})
	t.Setenv("DOAN_RUNTIME", app.runtime)
	code, env, out := runOnboarding(t, onboardingCalls["sign_in"].args...)
	if code != 5 || env["error"].(map[string]any)["code"] != "sign_in_failed" || strings.Contains(out, testToken) {
		t.Fatal(out)
	}
}

// Results are data even when an operation failed, but the token and the
// runtime.json path (which holds it) still never reach any output.
func TestOnboardingRepliesNeverCarryTokenOrRuntimePath(t *testing.T) {
	failedClone := func(message string) string {
		return `{"operationId":"op_1","requestId":"r_0","kind":"project_clone","state":"failed","error":{"code":"clone_failed","message":"` + message + `"}}`
	}
	state := func(op, message string) string {
		return `{"v":2,"ok":true,"op":"` + op + `","result":{"sessionId":"s_1","revision":1,"completed":false,"agents":null,"project":null,"operations":[` + failedClone(message) + `]}}`
	}
	for _, tt := range []struct {
		name  string
		op    string
		reply func(runtime string) string
		code  string
	}{
		{"status token", "status", func(string) string { return state("status", "held "+testToken) }, ""},
		{"status runtime path", "status", func(runtime string) string { return state("status", "see "+runtime) }, ""},
		{"start token", "start", func(string) string { return state("start", testToken) }, ""},
		{"cancel token", "cancel", func(string) string {
			return `{"v":2,"ok":true,"op":"cancel","result":{"operation":` + failedClone(testToken) + `}}`
		}, ""},
		{"error runtime path", "sign_in", func(runtime string) string {
			return `{"v":2,"ok":false,"error":{"code":"busy","message":"read ` + runtime + `"}}`
		}, "busy"},
		{"failed operation runtime path", "project_clone", func(runtime string) string {
			return `{"v":2,"ok":true,"op":"project_clone","result":{"operation":` + strings.Replace(failedClone(runtime), `"requestId":"r_0"`, `"requestId":"r_1"`, 1) + `}}`
		}, "clone_failed"},
		// Only messages are free text; the token anywhere else makes the reply unusable.
		{"token as a session id", "status", func(string) string {
			return strings.Replace(state("status", "m"), `"sessionId":"s_1"`, `"sessionId":"`+testToken+`"`, 1)
		}, "internal_error"},
	} {
		var app *onboardingApp
		app = startOnboardingApp(t, shortTempDir(t), func(map[string]any) string { return tt.reply(app.runtime) })
		t.Setenv("DOAN_RUNTIME", app.runtime)
		call := onboardingCalls[tt.op]
		code, env, out := runOnboarding(t, call.args...)
		var stdout, stderr bytes.Buffer
		Run(call.args, strings.NewReader(""), &stdout, &stderr)
		toolOut, _ := json.Marshal(callTool(t, mcpClient(t), call.tool, call.mcp))
		for _, text := range []string{out, stdout.String() + stderr.String(), string(toolOut)} {
			if strings.Contains(text, testToken) || strings.Contains(text, app.runtime) {
				t.Errorf("%s: leaked in %s", tt.name, text)
			}
		}
		if tt.code == "" {
			ops := env["result"].(map[string]any)
			if tt.op != "cancel" {
				ops = ops["operations"].([]any)[0].(map[string]any)
			} else {
				ops = ops["operation"].(map[string]any)
			}
			if code != 0 || ops["state"] != "failed" || ops["error"].(map[string]any)["code"] != "clone_failed" {
				t.Errorf("%s: %d %s", tt.name, code, out)
			}
		} else if env["ok"] != false || env["error"].(map[string]any)["code"] != tt.code {
			t.Errorf("%s: %s", tt.name, out)
		}
	}
}

func TestOnboardingRuntimeEnvironment(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	defaultPath := filepath.Join(home, "Library", "Application Support", "doan", "runtime.json")
	t.Setenv("DOAN_RUNTIME", "/x/runtime.json")
	if path, explicit, failure := onboardingRuntime(); failure != nil || path != "/x/runtime.json" || !explicit {
		t.Fatal(path, explicit, failure)
	}
	// Set but empty is still an explicit choice for onboarding: no bootstrap.
	t.Setenv("DOAN_RUNTIME", "")
	if path, explicit, failure := onboardingRuntime(); failure != nil || path != defaultPath || !explicit {
		t.Fatal(path, explicit, failure)
	}
	os.Unsetenv("DOAN_RUNTIME")
	if path, explicit, failure := onboardingRuntime(); failure != nil || path != defaultPath || explicit {
		t.Fatal(path, explicit, failure)
	}
}

func TestOnboardingRejectsInvalidReplies(t *testing.T) {
	for _, tt := range []struct{ name, reply, code string }{
		{"v1 success", `{"v":1,"ok":true,"result":{}}`, "app_protocol_mismatch"},
		{"v3", `{"v":3,"ok":true}`, "app_protocol_mismatch"},
		{"not json", `nope`, "internal_error"},
		{"schema", `{"v":2,"ok":true,"op":"start","result":{}}`, "internal_error"},
		{"other op", fixtureReply(t, "sign-in-pending"), "internal_error"},
		{"secret field", `{"v":2,"ok":true,"op":"start","result":{"sessionId":"s_1","revision":0,"completed":false,"agents":null,"project":null,"operations":[],"token":"x"}}`, "internal_error"},
	} {
		app := startOnboardingApp(t, shortTempDir(t), func(map[string]any) string { return tt.reply })
		t.Setenv("DOAN_RUNTIME", app.runtime)
		code, env, out := runOnboarding(t, "onboarding", "start")
		if env["ok"] != false || env["error"].(map[string]any)["code"] != tt.code || code != ExitCode(tt.code) {
			t.Errorf("%s: %s", tt.name, out)
		}
	}
}

// fakeBundle lays out <dir>/<name>/Contents like an electron-builder doan.app and returns the bundled CLI.
func fakeBundle(t *testing.T, dir, name, id string) string {
	t.Helper()
	contents := filepath.Join(dir, name, "Contents")
	putFile(t, contents, "Info.plist", `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>doan</string>
  <key>CFBundleExecutable</key>
  <string>doan</string>
  <key>CFBundleIdentifier</key>
  <string>`+id+`</string>
  <key>LSEnvironment</key>
  <dict><key>CFBundleIdentifier</key><string>design.doan.app</string></dict>
</dict>
</plist>
`)
	for _, p := range []string{"MacOS/doan", "Resources/bin/doan"} {
		putFile(t, contents, p, "#!/bin/sh\n")
		if e := os.Chmod(filepath.Join(contents, p), 0o755); e != nil {
			t.Fatal(e)
		}
	}
	return filepath.Join(contents, "Resources", "bin", "doan")
}

func TestOwnBundle(t *testing.T) {
	dir := realPath(t, t.TempDir())
	good := fakeBundle(t, dir, "My Apps/doan.app", "design.doan.app")
	other := fakeBundle(t, dir, "other.app", "com.example.other")
	notApp := fakeBundle(t, dir, "doan-folder", "design.doan.app")
	noExec := fakeBundle(t, dir, "noexec.app", "design.doan.app")
	os.Chmod(filepath.Join(dir, "noexec.app", "Contents", "MacOS", "doan"), 0o644)
	noPlist := fakeBundle(t, dir, "noplist.app", "design.doan.app")
	os.Remove(filepath.Join(dir, "noplist.app", "Contents", "Info.plist"))
	binaryPlist := fakeBundle(t, dir, "binary.app", "design.doan.app")
	putFile(t, filepath.Join(dir, "binary.app", "Contents"), "Info.plist", "bplist00\x00design.doan.app")
	escape := fakeBundle(t, dir, "escape.app", "design.doan.app")
	os.Chmod(filepath.Join(dir, "escape.app", "Contents", "MacOS", "doan"), 0o644)
	os.Remove(filepath.Join(dir, "escape.app", "Contents", "MacOS", "doan"))
	os.Symlink(filepath.Join(dir, "My Apps", "doan.app", "Contents", "MacOS", "doan"), filepath.Join(dir, "escape.app", "Contents", "MacOS", "doan"))
	// A link on PATH that resolves into the bundle is the bundle's own CLI.
	linked := filepath.Join(dir, "bin", "doan")
	os.MkdirAll(filepath.Dir(linked), 0o755)
	os.Symlink(good, linked)
	// A bundle-shaped path whose CLI is a link to a standalone build is not.
	standalone := filepath.Join(dir, "standalone", "doan")
	putFile(t, filepath.Dir(standalone), "doan", "#!/bin/sh\n")
	fake := fakeBundle(t, dir, "fake.app", "design.doan.app")
	os.Remove(fake)
	os.Symlink(standalone, fake)
	// The plist and CLI stay inside, but the MacOS directory points elsewhere.
	parentLink := fakeBundle(t, dir, "parentlink.app", "design.doan.app")
	mac := filepath.Join(dir, "parentlink.app", "Contents", "MacOS")
	os.Rename(mac, filepath.Join(dir, "outside-macos"))
	os.Symlink(filepath.Join(dir, "outside-macos"), mac)
	// A bundle reached through a linked parent folder is still that bundle.
	os.Symlink(filepath.Join(dir, "My Apps"), filepath.Join(dir, "Linked Apps"))
	viaParent := filepath.Join(dir, "Linked Apps", "doan.app", "Contents", "Resources", "bin", "doan")

	for _, tt := range []struct {
		name, exe, want string
	}{
		{"bundle with spaces", good, filepath.Join(dir, "My Apps", "doan.app")},
		{"link into bundle", linked, filepath.Join(dir, "My Apps", "doan.app")},
		{"other bundle id", other, ""},
		{"not .app", notApp, ""},
		{"app executable not executable", noExec, ""},
		{"missing Info.plist", noPlist, ""},
		{"binary Info.plist", binaryPlist, ""},
		{"app executable is a link out of the bundle", escape, ""},
		{"bundle-shaped link to a standalone CLI", fake, ""},
		{"MacOS directory links out of the bundle", parentLink, ""},
		{"linked parent folder", viaParent, filepath.Join(dir, "My Apps", "doan.app")},
		{"standalone", standalone, ""},
		{"missing", filepath.Join(dir, "none"), ""},
	} {
		got, ok := ownBundle(func() (string, error) { return tt.exe, nil })
		if got != tt.want || ok != (tt.want != "") {
			t.Errorf("%s: %q %v, want %q", tt.name, got, ok, tt.want)
		}
	}
	if _, ok := ownBundle(func() (string, error) { return "", errors.New("no executable") }); ok {
		t.Error("error executable trusted")
	}
}

// launchHarness runs onboarding commands with a fake clock, a fake launcher and a
// bundled CLI, against the default (not explicit) runtime path in its own HOME.
type launchHarness struct {
	t        *testing.T
	ctx      Context
	dir      string
	elapsed  time.Duration
	launches []string
	onLaunch func()
	onSleep  func(n int)
	sleeps   int
}

func newLaunchHarness(t *testing.T) *launchHarness {
	h := &launchHarness{t: t, dir: shortTempDir(t)}
	cli := fakeBundle(t, h.dir, "Doan Apps/doan.app", "design.doan.app")
	base := time.Now()
	h.ctx = Context{
		Now: func() time.Time { return base.Add(h.elapsed) },
		Sleep: func(d time.Duration) {
			h.elapsed += d
			h.sleeps++
			if h.onSleep != nil {
				h.onSleep(h.sleeps)
			}
		},
		RuntimePath: filepath.Join(h.dir, "runtime.json"),
		Executable:  func() (string, error) { return cli, nil },
		Launch: func(bundle string) error {
			h.launches = append(h.launches, bundle)
			if h.onLaunch != nil {
				h.onLaunch()
			}
			return nil
		},
		Dial: func(socket string, deadline time.Time) (net.Conn, error) {
			return (&net.Dialer{Deadline: deadline}).Dial("unix", socket)
		},
	}
	return h
}

func (h *launchHarness) run(args ...string) (Outcome, *Error) {
	f := Flags{Given: map[string]bool{}}
	for i := 0; i+1 < len(args); i++ {
		if strings.HasPrefix(args[i], "--") {
			name := strings.TrimPrefix(args[i], "--")
			f.Given[name] = true
			switch name {
			case "session":
				f.Session = args[i+1]
			}
		}
	}
	pos := []string{}
	for i := 0; i < len(args); i++ {
		if strings.HasPrefix(args[i], "--") {
			i++
			continue
		}
		pos = append(pos, args[i])
	}
	return Onboarding(h.ctx, f, pos)
}

func TestOnboardingStartLaunchesOwningBundleOnce(t *testing.T) {
	h := newLaunchHarness(t)
	// The app publishes its runtime a few polls after the launch.
	h.onSleep = func(n int) {
		if n == 3 {
			startOnboardingApp(t, h.dir, func(map[string]any) string { return fixtureReply(t, "start-fresh") })
		}
	}
	o, failure := h.run("start")
	if failure != nil {
		t.Fatal(failure)
	}
	if o.Result.(map[string]any)["sessionId"] != "s_7Hq2" {
		t.Fatal(o.Result)
	}
	if len(h.launches) != 1 || h.launches[0] != filepath.Join(realPath(t, h.dir), "Doan Apps", "doan.app") {
		t.Fatal(h.launches)
	}
	if h.elapsed > 15*time.Second {
		t.Fatal(h.elapsed)
	}
}

func TestOnboardingStartBootstrapStopsAtFifteenSeconds(t *testing.T) {
	h := newLaunchHarness(t)
	started := time.Now()
	_, failure := h.run("start")
	if failure == nil || failure.Code != "app_launch_failed" || ExitCode(failure.Code) != 3 {
		t.Fatal(failure)
	}
	if len(h.launches) != 1 {
		t.Fatal(h.launches)
	}
	if h.elapsed < 15*time.Second || h.elapsed > 16*time.Second {
		t.Fatal(h.elapsed)
	}
	if time.Since(started) > 5*time.Second {
		t.Fatal("bootstrap waited on the wall clock")
	}
}

func TestOnboardingStartLaunchFailure(t *testing.T) {
	h := newLaunchHarness(t)
	h.ctx.Launch = func(string) error {
		h.launches = append(h.launches, "x")
		return errors.New("open: LSOpenURLsWithRole() failed /secret/stderr")
	}
	_, failure := h.run("start")
	if failure == nil || failure.Code != "app_launch_failed" || len(h.launches) != 1 || strings.Contains(failure.Message, "/secret/stderr") {
		t.Fatal(failure, h.launches)
	}
}

func TestOnboardingStartRunningAppIsNotLaunched(t *testing.T) {
	h := newLaunchHarness(t)
	startOnboardingApp(t, h.dir, func(map[string]any) string { return fixtureReply(t, "start-fresh") })
	if _, failure := h.run("start"); failure != nil || len(h.launches) != 0 {
		t.Fatal(failure, h.launches)
	}
}

// A launched app that is listening but has not answered yet is still starting.
func TestOnboardingStartKeepsPollingThroughAnUnansweredConnection(t *testing.T) {
	h := newLaunchHarness(t)
	h.onLaunch = func() {
		socket := filepath.Join(h.dir, "app.sock")
		l, e := net.Listen("unix", socket)
		if e != nil {
			t.Fatal(e)
		}
		t.Cleanup(func() { l.Close() })
		go func() {
			for n := 0; ; n++ {
				c, e := l.Accept()
				if e != nil {
					return
				}
				bufio.NewReader(c).ReadBytes('\n')
				if n > 0 {
					c.Write([]byte(fixtureReply(t, "start-fresh") + "\n"))
				}
				c.Close()
			}
		}()
		putFile(t, h.dir, "runtime.json", runtimeJSON(socket))
	}
	if _, failure := h.run("start"); failure != nil || len(h.launches) != 1 {
		t.Fatal(failure, h.launches)
	}
}

func TestOnboardingStartProtocolMismatchStopsPolling(t *testing.T) {
	h := newLaunchHarness(t)
	h.onLaunch = func() {
		startOnboardingApp(t, h.dir, func(map[string]any) string {
			return `{"v":1,"ok":false,"error":{"code":"bad_request","message":"not an app-socket v1 request"}}`
		})
	}
	_, failure := h.run("start")
	if failure == nil || failure.Code != "app_protocol_mismatch" || len(h.launches) != 1 || h.elapsed > time.Second {
		t.Fatal(failure, h.launches, h.elapsed)
	}
}

func TestOnboardingStartWithoutBundleGivesGuidance(t *testing.T) {
	h := newLaunchHarness(t)
	standalone := filepath.Join(h.dir, "doan")
	putFile(t, h.dir, "doan", "#!/bin/sh\n")
	h.ctx.Executable = func() (string, error) { return standalone, nil }
	_, failure := h.run("start")
	if failure == nil || failure.Code != "app_not_running" || len(h.launches) != 0 || h.elapsed != 0 {
		t.Fatal(failure, h.launches)
	}
	if !strings.Contains(strings.Join(failure.NextSteps, "\n"), "doan onboarding start") {
		t.Fatal(failure.NextSteps)
	}
}

// A workspace-write sandbox denies the socket of a running Doan, and an agent
// that reads app_not_running as "not open" stops (agent-eval 2026-10-29 O1, O2).
func TestOnboardingAppFailuresGiveSandboxGuidance(t *testing.T) {
	for _, code := range []string{"app_not_running", "app_launch_failed"} {
		steps := strings.Join(onboardingFailure(code, "m").NextSteps, "\n")
		for _, want := range []string{"open Doan", "sandbox", "socket permission error", "Codex sessions started after Doan opens", "by name", "restart earlier sessions", "If it still fails", "Settings… > About", "outside the sandbox"} {
			if !strings.Contains(steps, want) {
				t.Errorf("%s nextSteps miss %q: %s", code, want, steps)
			}
		}
	}
}

func TestOnboardingExplicitRuntimeNeverLaunches(t *testing.T) {
	for _, tt := range []struct {
		name  string
		setup func(h *launchHarness)
		code  string
	}{
		{"missing", func(h *launchHarness) {}, "app_not_running"},
		{"broken", func(h *launchHarness) { putFile(t, h.dir, "runtime.json", `{`) }, "app_not_running"},
		{"other runtime version", func(h *launchHarness) { putFile(t, h.dir, "runtime.json", `{"v":2}`) }, "app_protocol_mismatch"},
		{"unreachable", func(h *launchHarness) {
			putFile(t, h.dir, "runtime.json", runtimeJSON(filepath.Join(h.dir, "gone.sock")))
		}, "app_not_running"},
		{"denied", func(h *launchHarness) {
			putFile(t, h.dir, "runtime.json", runtimeJSON(filepath.Join(h.dir, "gone.sock")))
			os.Chmod(filepath.Join(h.dir, "runtime.json"), 0)
		}, "app_not_running"},
		{"old app", func(h *launchHarness) {
			startOnboardingApp(t, h.dir, func(map[string]any) string {
				return `{"v":1,"ok":false,"error":{"code":"bad_request","message":"m"}}`
			})
		}, "app_protocol_mismatch"},
		{"stale token", func(h *launchHarness) {
			startOnboardingApp(t, h.dir, func(map[string]any) string { return fixtureReply(t, "error-bad-token") })
		}, "app_not_running"},
	} {
		h := newLaunchHarness(t)
		h.ctx.RuntimeExplicit = true
		tt.setup(h)
		_, failure := h.run("start")
		if failure == nil || failure.Code != tt.code || len(h.launches) != 0 || h.elapsed != 0 {
			t.Errorf("%s: %v %v %v", tt.name, failure, h.launches, h.elapsed)
		}
		// runtime.json holds the socket token, so its path stays out of the output.
		if failure != nil && strings.Contains(failure.Message, h.dir) {
			t.Errorf("%s: %s", tt.name, failure.Message)
		}
	}
}

// Without DOAN_RUNTIME, a runtime the shell may not read means the app is
// likely running behind a sandbox: launching again would only wait 15 s.
func TestOnboardingStartDeniedDefaultRuntimeIsNotLaunched(t *testing.T) {
	h := newLaunchHarness(t)
	putFile(t, h.dir, "runtime.json", runtimeJSON(filepath.Join(h.dir, "app.sock")))
	os.Chmod(filepath.Join(h.dir, "runtime.json"), 0)
	_, failure := h.run("start")
	if failure == nil || failure.Code != "app_not_running" || len(h.launches) != 0 {
		t.Fatal(failure, h.launches)
	}
}

func TestOnboardingOnlyStartLaunches(t *testing.T) {
	h := newLaunchHarness(t)
	if _, failure := h.run("status", "--session", "s_1"); failure == nil || failure.Code != "app_not_running" {
		t.Fatal(failure)
	}
	root := initialized(t)
	ctx := h.ctx
	ctx.Start = root
	if _, failure := Active(ctx, Flags{Repo: root}, nil); failure == nil || failure.Code != "app_not_running" {
		t.Fatal(failure)
	}
	if len(h.launches) != 0 || h.elapsed != 0 {
		t.Fatal(h.launches, h.elapsed)
	}
}

func TestShellQuote(t *testing.T) {
	for in, want := range map[string]string{
		"/Applications/doan.app/Contents/Resources/bin/doan":      "/Applications/doan.app/Contents/Resources/bin/doan",
		"/Users/me/My Apps/doan.app/Contents/Resources/bin/doan":  "'/Users/me/My Apps/doan.app/Contents/Resources/bin/doan'",
		"/Users/me/it's/doan.app/Contents/Resources/bin/doan":     `'/Users/me/it'\''s/doan.app/Contents/Resources/bin/doan'`,
		"/Users/me/$HOME`x`/doan.app/Contents/Resources/bin/doan": "'/Users/me/$HOME`x`/doan.app/Contents/Resources/bin/doan'",
	} {
		if got := shellQuote(in); got != want {
			t.Errorf("%q: %q, want %q", in, got, want)
		}
	}
}

func TestSkillNamesTheBundledCLI(t *testing.T) {
	dir := realPath(t, t.TempDir())
	cli := fakeBundle(t, dir, "My Apps/doan.app", "design.doan.app")
	o, failure := Skill(Context{Executable: func() (string, error) { return cli, nil }}, nil)
	if failure != nil {
		t.Fatal(failure)
	}
	body := o.Result.(map[string]any)["body"].(string)
	want := "`'" + cli + "' onboarding start --json`"
	if !strings.Contains(body, want) || !strings.HasSuffix(body, "[doan:skill] end of guide vdev\n") {
		t.Fatal(body)
	}
	plain, _ := Skill(Context{}, nil)
	o, _ = Skill(Context{Executable: func() (string, error) { return filepath.Join(dir, "doan"), nil }}, nil)
	if body := o.Result.(map[string]any)["body"].(string); body != plain.Result.(map[string]any)["body"] {
		t.Fatal("standalone CLI changed the guide")
	}
}

func TestOnboardingHelpAndGuide(t *testing.T) {
	for _, line := range []string{
		"onboarding start",
		"onboarding status --session <id> [--operation <id>]",
		"onboarding check --session <id> --provider <id> --request <id> [--spend-copilot-request]",
		"onboarding sign-in --session <id> --provider <id> --request <id>",
		"onboarding cancel --session <id> --operation <id> --request <id>",
		"onboarding project inspect --session <id> (--path <absolute> [--url <github-url>] | --url <github-url> [--destination <absolute>]) --request <id>",
		"onboarding project select --session <id> --inspection <id> --path <absolute> [--initialize] --request <id>",
		"onboarding project clone --session <id> --inspection <id> --destination <absolute> --request <id>",
		"onboarding complete --session <id> --request <id>",
	} {
		if !strings.Contains(usage, "  "+line+"\n") {
			t.Errorf("usage misses %s", line)
		}
		if !strings.Contains(skillBody, "doan "+strings.SplitN(line, " --", 2)[0]) {
			t.Errorf("guide misses %s", line)
		}
	}
	for _, row := range [][2]string{
		{"onboarding_start", "doan onboarding start"},
		{"onboarding_status", "doan onboarding status"},
		{"onboarding_check", "doan onboarding check"},
		{"onboarding_sign_in", "doan onboarding sign-in"},
		{"onboarding_cancel", "doan onboarding cancel"},
		{"onboarding_project_inspect", "doan onboarding project inspect"},
		{"onboarding_project_select", "doan onboarding project select"},
		{"onboarding_project_clone", "doan onboarding project clone"},
		{"onboarding_complete", "doan onboarding complete"},
	} {
		found := false
		for _, l := range strings.Split(skillBody, "\n") {
			found = found || (strings.Contains(l, "| `"+row[0]+"`") && strings.Contains(l, "`"+row[1]+"`"))
		}
		if !found {
			t.Errorf("guide table misses %s", row)
		}
	}
	for _, s := range []string{"Prefer `doan onboarding start --json` on PATH", "Only if `doan` is not on PATH", "<Doan.app>/Contents/Resources/bin/doan onboarding start --json", "quote", "--spend-copilot-request", "--initialize", "app_launch_failed", "exit 5", "requestId"} {
		if !strings.Contains(skillBody, s) {
			t.Errorf("guide misses %q", s)
		}
	}
	for _, parts := range [][]string{
		// The sandbox fallback that `active` already has (agent-eval 2026-10-29 O1, O2).
		{"`app_not_running`", "`app_launch_failed`", "sandbox", "socket permission error", "Codex sessions started after Doan opens", "by name", "restart earlier sessions", "If it still fails", "Settings… > About", "outside the sandbox", "open Doan"},
		// The changes are always told before the write, but a user who already agreed is not asked again (agent-eval 2026-10-29 O1, re-measure).
		{"`project inspect`", "always tell the user", "`changes`", "`clone.changes`", "before `select --initialize` or `clone`", "already agreed", "do not ask again", "Otherwise ask first"},
	} {
		found := false
		for _, l := range strings.Split(skillBody, "\n") {
			all := true
			for _, part := range parts {
				all = all && strings.Contains(l, part)
			}
			found = found || all
		}
		if !found {
			t.Errorf("guide has no line with %q", parts)
		}
	}
	// Help and the guide must not need a project.
	t.Chdir(t.TempDir())
	for _, args := range [][]string{{"help"}, {"skill"}} {
		var out, errout bytes.Buffer
		if code := Run(args, strings.NewReader(""), &out, &errout); code != 0 || errout.Len() != 0 {
			t.Fatal(args, code, errout.String())
		}
	}
}

// cancel only reaches sign_in and project_clone (buzz-onboarding D15); the guide, help and tool text must say so.
func TestOnboardingCancelWordingStatesScope(t *testing.T) {
	want := "only a `sign_in` or `project_clone` operation; for any other kind it returns the target unchanged"
	if !strings.Contains(skillBody, want) {
		t.Errorf("guide misses cancel scope")
	}
	if !strings.Contains(usage, "cancels only a sign_in or project_clone operation; any other kind returns the target unchanged") {
		t.Errorf("usage misses cancel scope")
	}
	for _, tool := range mcpTools {
		if tool.name == "onboarding_cancel" && !strings.Contains(tool.description, "Only a sign_in or project_clone operation is cancelled; for any other kind the target is returned unchanged") {
			t.Errorf("tool description misses cancel scope: %s", tool.description)
		}
	}
}
