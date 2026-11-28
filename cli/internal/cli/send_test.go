package cli

import (
	"bytes"
	"encoding/json"
	"net"
	"path/filepath"
	"reflect"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

// runSend runs the command with stdin and returns the JSON envelope and the exit code.
func runSend(t *testing.T, root, stdin string, args ...string) (map[string]any, int) {
	t.Helper()
	var out, errout bytes.Buffer
	code := Run(append(append([]string{"send"}, args...), "--repo", root, "--json"), strings.NewReader(stdin), &out, &errout)
	if errout.Len() != 0 {
		t.Fatalf("stderr %s", &errout)
	}
	var v map[string]any
	if err := json.Unmarshal(out.Bytes(), &v); err != nil {
		t.Fatal(err, out.String())
	}
	if err := formats.ValidateEnvelope(v); err != nil {
		t.Fatal(err)
	}
	return v, code
}

func sendCode(t *testing.T, root, stdin, code string, args ...string) map[string]any {
	t.Helper()
	v, exit := runSend(t, root, stdin, args...)
	if v["ok"] != false || v["error"].(map[string]any)["code"] != code || exit != ExitCode(code) {
		t.Fatalf("%v: exit %d, %v; want %s", args, exit, v, code)
	}
	return v["error"].(map[string]any)
}

func TestSendSendsTheV8Request(t *testing.T) {
	root := handoffProject(t)
	app := startAppAnswering(t, 8)
	t.Setenv("DOAN_HANDOFF", testHandoffKey)
	v, exit := runSend(t, root, "", ".doan/canvases/new.html", "--message", "  Pass the checkout copy on.\n")
	if exit != 0 || !reflect.DeepEqual(v["result"], map[string]any{"requested": true, "canvas": ".doan/canvases/new.html"}) {
		t.Fatal(exit, v)
	}
	_, req := app.request(t)
	want := map[string]any{"v": float64(8), "token": testToken, "root": root, "handoff": testHandoffKey, "path": ".doan/canvases/new.html", "text": "Pass the checkout copy on."}
	if !reflect.DeepEqual(req, want) {
		t.Fatal(req)
	}
	if err := formats.ValidateSendRequest(req); err != nil {
		t.Fatal(err)
	}

	// An absolute path inside the repository goes through workTarget like open.
	runSend(t, root, "", filepath.Join(root, ".doan/canvases/new.html"), "--message", "x")
	if _, req := app.request(t); req["path"] != ".doan/canvases/new.html" {
		t.Fatal(req)
	}
}

func TestSendReadsTheMessageFromStdin(t *testing.T) {
	root := handoffProject(t)
	app := startAppAnswering(t, 8)
	t.Setenv("DOAN_HANDOFF", testHandoffKey)
	if _, exit := runSend(t, root, "\nAsked for a checkout.\n\tDone: cart.\n", ".doan/canvases/new.html", "--message", "-"); exit != 0 {
		t.Fatal(exit)
	}
	if _, req := app.request(t); req["text"] != "Asked for a checkout.\n\tDone: cart." {
		t.Fatalf("%q", req["text"])
	}
	// A limit-length message of characters json.Marshal writes as six bytes still fits the 64 KiB line.
	for _, ch := range []string{"<", " "} {
		if _, exit := runSend(t, root, "x"+strings.Repeat(ch, handoffTextLimit-2)+"x", ".doan/canvases/new.html", "--message", "-"); exit != 0 {
			t.Fatal(ch, exit)
		}
		line, req := app.request(t)
		if len(line)-1 > socketLineLimit || formats.ValidateSendRequest(req) != nil {
			t.Fatalf("%q: %d bytes", ch, len(line))
		}
	}
	sendCode(t, root, strings.Repeat("a", handoffTextLimit+1), "usage_error", ".doan/canvases/new.html", "--message", "-")
	sendCode(t, root, strings.Repeat(" ", socketLineLimit+1)+"a", "usage_error", ".doan/canvases/new.html", "--message", "-")
	sendCode(t, root, "", "usage_error", ".doan/canvases/new.html", "--message", "-")
	app.silent(t)
}

func TestSendAppRefusals(t *testing.T) {
	root := handoffProject(t)
	app := startAppAnswering(t, 8)
	t.Setenv("DOAN_HANDOFF", testHandoffKey)
	for answer, code := range map[string]string{
		"bad_token":               "app_not_running",
		"project_not_open":        "project_not_open",
		"not_app_conversation":    "not_app_conversation",
		"root_mismatch":           "root_mismatch",
		"not_running":             "not_running",
		"not_canvas_conversation": "not_canvas_conversation",
		"plan_mode":               "plan_mode",
		"handoff_turn":            "handoff_turn",
		"already_requested":       "already_requested",
		"same_canvas":             "same_canvas",
		"chain_one":               "chain_one",
		"chain_limit":             "chain_limit",
	} {
		app.replies <- `{"v":8,"ok":false,"error":{"code":"` + answer + `","message":"app text"}}`
		failure := sendCode(t, root, "", code, ".doan/canvases/new.html", "--message", "x")
		if strings.Contains(failure["message"].(string), "app text") || len(failure["nextSteps"].([]any)) == 0 {
			t.Errorf("%s: %v", answer, failure)
		}
		app.request(t)
	}
	// An earlier app does not know v8 and answers on its v1 path.
	app.replies <- `{"v":1,"ok":false,"error":{"code":"bad_request","message":"Unsupported version"}}`
	sendCode(t, root, "", "app_protocol_mismatch", ".doan/canvases/new.html", "--message", "x")
	app.request(t)
	// An app that answers a v8 request in v5's version is another protocol too.
	app.replies <- `{"v":5,"ok":true,"requested":true}`
	sendCode(t, root, "", "app_protocol_mismatch", ".doan/canvases/new.html", "--message", "x")
	app.request(t)
}

func TestSendWithoutAKeyAsksNothing(t *testing.T) {
	root := handoffProject(t)
	app := startAppAnswering(t, 8)
	for _, key := range []string{"", strings.ToUpper(testHandoffKey), testHandoffKey[:10]} {
		t.Setenv("DOAN_HANDOFF", key)
		failure := sendCode(t, root, "", "not_app_conversation", ".doan/canvases/new.html", "--message", "x")
		if !strings.Contains(strings.Join(stringsOf(failure["nextSteps"]), "\n"), "`doan send` works only in a conversation in the Doan app") {
			t.Error(failure)
		}
	}
	// A terminal agent is refused without its stdin being waited on.
	t.Setenv("DOAN_HANDOFF", "")
	sendCode(t, root, "", "not_app_conversation", ".doan/canvases/new.html", "--message", "-")
	app.silent(t)
}

func TestSendInputErrorsAskNothing(t *testing.T) {
	root := handoffProject(t)
	app := startAppAnswering(t, 8)
	t.Setenv("DOAN_HANDOFF", testHandoffKey)
	sendCode(t, root, "", "canvas_not_found", ".doan/canvases/missing.html", "--message", "x")
	for _, args := range [][]string{
		{},
		{".doan/canvases/new.html"},
		{".doan/canvases/new.html", "--message", ""},
		{".doan/canvases/new.html", "--message", " \n "},
		{".doan/canvases/new.html", "--message", "a\x00b"},
		{".doan/canvases/new.html", ".doan/canvases/other.html", "--message", "x"},
		{".doan/ds/brand.html", "--message", "x"},
		{"src/a.html", "--message", "x"},
		{".doan/canvases/new.html", "--message", "x", "--frame", "main"},
		{".doan/canvases/new.html", "--message", "x", "--note", "n"},
	} {
		sendCode(t, root, "", "usage_error", args...)
	}
	app.silent(t)
}

func TestSendRuntime(t *testing.T) {
	root := handoffProject(t)
	t.Setenv("DOAN_HANDOFF", testHandoffKey)
	t.Setenv("DOAN_RUNTIME", "relative/runtime.json")
	sendCode(t, root, "", "usage_error", ".doan/canvases/new.html", "--message", "x")

	t.Setenv("DOAN_RUNTIME", filepath.Join(t.TempDir(), "none.json"))
	failure := sendCode(t, root, "", "app_not_running", ".doan/canvases/new.html", "--message", "x")
	requireRecoveryOrder(t, stringsOf(failure["nextSteps"]), [][]string{
		{"Ask the user to open Doan", "`doan send`"},
		{"If Doan is open, a sandbox may block this shell from its socket", "outside the sandbox", "approval"},
		{"If it still fails", "Applications", "Settings… > About"},
	})
}

// send never opens the app: no bootstrap, whatever the runtime file says.
func TestSendNeverLaunches(t *testing.T) {
	root := handoffProject(t)
	ctx := Context{Start: root, Now: time.Now, Handoff: testHandoffKey,
		RuntimePath: filepath.Join(t.TempDir(), "none.json"),
		Dial:        func(string, time.Time) (net.Conn, error) { return nil, syscall.ECONNREFUSED },
		Executable:  func() (string, error) { t.Fatal("looked for the app bundle"); return "", nil },
		Launch:      func(string, bool) error { t.Fatal("launched the app"); return nil },
		Sleep:       func(time.Duration) { t.Fatal("waited for the app") },
	}
	for _, runtime := range []string{"", "present"} {
		if runtime != "" {
			putFile(t, filepath.Dir(ctx.RuntimePath), filepath.Base(ctx.RuntimePath), runtimeJSON("/tmp/doan-test/gone.sock"))
		}
		if _, failure := Send(ctx, Flags{Repo: root, Message: "x", Given: map[string]bool{"message": true}}, []string{".doan/canvases/new.html"}); failure == nil || failure.Code != "app_not_running" {
			t.Fatal(failure)
		}
	}
}

func TestSendHumanOutputAndHelp(t *testing.T) {
	root := handoffProject(t)
	startAppAnswering(t, 8)
	t.Setenv("DOAN_HANDOFF", testHandoffKey)
	var out, errout bytes.Buffer
	if code := Run([]string{"send", ".doan/canvases/new.html", "--message", "x", "--repo", root}, strings.NewReader(""), &out, &errout); code != 0 || errout.Len() != 0 {
		t.Fatal(code, errout.String())
	}
	if !strings.Contains(out.String(), ".doan/canvases/new.html") || !strings.Contains(out.String(), "Doan sends it when this turn ends") {
		t.Fatal(out.String())
	}
	usage := result(t, root, 0, "help")["usage"].(string)
	if !strings.Contains(usage, "send <canvas path> --message <text|->") {
		t.Fatal(usage)
	}
	// --message belongs to handoff and send only.
	failure(t, root, "usage_error", "open", ".doan/canvases/new.html", "--message", "x")
}

// An existing canvas is a handoff target now: the CLI has no new-canvas condition, the app judges.
func TestHandoffToAnExistingCanvasReachesTheApp(t *testing.T) {
	root := handoffProject(t)
	app := startHandoffApp(t)
	t.Setenv("DOAN_HANDOFF", testHandoffKey)
	putFile(t, root, ".doan/canvases/older.html", validCanvas)
	if _, exit := runHandoff(t, root, "", ".doan/canvases/older.html", "--message", "Continue on the older canvas."); exit != 0 {
		t.Fatal(exit)
	}
	if _, req := app.request(t); req["v"] != float64(5) || req["path"] != ".doan/canvases/older.html" {
		t.Fatal(req)
	}
}

func TestHandoffChainRefusals(t *testing.T) {
	root := handoffProject(t)
	app := startHandoffApp(t)
	t.Setenv("DOAN_HANDOFF", testHandoffKey)
	for _, code := range []string{"chain_one", "chain_limit"} {
		app.replies <- `{"v":5,"ok":false,"error":{"code":"` + code + `","message":"app text"}}`
		failure := handoffCode(t, root, "", code, ".doan/canvases/new.html", "--message", "x")
		if strings.Contains(failure["message"].(string), "app text") || len(failure["nextSteps"].([]any)) == 0 {
			t.Errorf("%s: %v", code, failure)
		}
		app.request(t)
	}
}
