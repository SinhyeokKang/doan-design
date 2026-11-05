package cli

import (
	"bufio"
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

// handoffApp is a fake app on a real unix socket under an absolute temporary DOAN_RUNTIME.
// Each connection gets the next reply; lines records what arrived.
type handoffApp struct {
	lines   chan []byte
	replies chan string
}

func startHandoffApp(t *testing.T) *handoffApp {
	t.Helper()
	dir := shortTempDir(t)
	socket := filepath.Join(dir, "app.sock")
	l, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { l.Close() })
	app := &handoffApp{lines: make(chan []byte, 16), replies: make(chan string, 16)}
	go func() {
		for {
			c, err := l.Accept()
			if err != nil {
				return
			}
			line, _ := bufio.NewReader(c).ReadBytes('\n')
			app.lines <- line
			select {
			case r := <-app.replies:
				c.Write([]byte(r + "\n"))
			default:
				c.Write([]byte(`{"v":5,"ok":true,"requested":true}` + "\n"))
			}
			c.Close()
		}
	}()
	putFile(t, dir, "runtime.json", runtimeJSON(socket))
	t.Setenv("DOAN_RUNTIME", filepath.Join(dir, "runtime.json"))
	return app
}

// silent fails unless nothing reached the app.
func (a *handoffApp) silent(t *testing.T) {
	t.Helper()
	select {
	case line := <-a.lines:
		t.Fatalf("asked the app: %s", line)
	case <-time.After(50 * time.Millisecond):
	}
}

func (a *handoffApp) request(t *testing.T) ([]byte, map[string]any) {
	t.Helper()
	select {
	case line := <-a.lines:
		var req map[string]any
		if err := json.Unmarshal(line, &req); err != nil {
			t.Fatal(err, string(line))
		}
		return line, req
	case <-time.After(3 * time.Second):
		t.Fatal("no request reached the app")
	}
	return nil, nil
}

func handoffProject(t *testing.T) string {
	t.Helper()
	root := realPath(t, initialized(t))
	putFile(t, root, ".doan/canvases/new.html", validCanvas)
	putFile(t, root, ".doan/ds/brand.html", validCanvas)
	return root
}

// runHandoff runs the command with stdin and returns the JSON envelope and the exit code.
func runHandoff(t *testing.T, root, stdin string, args ...string) (map[string]any, int) {
	t.Helper()
	var out, errout bytes.Buffer
	code := Run(append(append([]string{"handoff"}, args...), "--repo", root, "--json"), strings.NewReader(stdin), &out, &errout)
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

func handoffCode(t *testing.T, root, stdin, code string, args ...string) map[string]any {
	t.Helper()
	v, exit := runHandoff(t, root, stdin, args...)
	if v["ok"] != false || v["error"].(map[string]any)["code"] != code || exit != ExitCode(code) {
		t.Fatalf("%v: exit %d, %v; want %s", args, exit, v, code)
	}
	return v["error"].(map[string]any)
}

func TestHandoffSendsTheV5Request(t *testing.T) {
	root := handoffProject(t)
	app := startHandoffApp(t)
	t.Setenv("DOAN_HANDOFF", testHandoffKey)
	v, exit := runHandoff(t, root, "", ".doan/canvases/new.html", "--message", "  Made the checkout canvas.\n")
	if exit != 0 || !reflect.DeepEqual(v["result"], map[string]any{"requested": true, "canvas": ".doan/canvases/new.html"}) {
		t.Fatal(exit, v)
	}
	_, req := app.request(t)
	want := map[string]any{"v": float64(5), "token": testToken, "root": root, "handoff": testHandoffKey, "path": ".doan/canvases/new.html", "text": "Made the checkout canvas."}
	if !reflect.DeepEqual(req, want) {
		t.Fatal(req)
	}
	if err := formats.ValidateHandoffRequest(req); err != nil {
		t.Fatal(err)
	}

	// An absolute path inside the repository goes through workTarget like open.
	runHandoff(t, root, "", filepath.Join(root, ".doan/canvases/new.html"), "--message", "x")
	if _, req := app.request(t); req["path"] != ".doan/canvases/new.html" {
		t.Fatal(req)
	}
}

func TestHandoffReadsTheMessageFromStdin(t *testing.T) {
	root := handoffProject(t)
	app := startHandoffApp(t)
	t.Setenv("DOAN_HANDOFF", testHandoffKey)
	if _, exit := runHandoff(t, root, "\nAsked for a checkout.\n\tDone: cart.\n", ".doan/canvases/new.html", "--message", "-"); exit != 0 {
		t.Fatal(exit)
	}
	if _, req := app.request(t); req["text"] != "Asked for a checkout.\n\tDone: cart." {
		t.Fatalf("%q", req["text"])
	}

	// A limit-length message of characters json.Marshal writes as six bytes still fits the 64 KiB line.
	// Go and JavaScript trim U+2028 as whitespace, so the run is wrapped in letters to stay in the text.
	for _, ch := range []string{"<", "\u2028"} {
		if _, exit := runHandoff(t, root, "x"+strings.Repeat(ch, handoffTextLimit-2)+"x", ".doan/canvases/new.html", "--message", "-"); exit != 0 {
			t.Fatal(ch, exit)
		}
		line, req := app.request(t)
		if len(line)-1 > socketLineLimit || formats.ValidateHandoffRequest(req) != nil {
			t.Fatalf("%q: %d bytes", ch, len(line))
		}
	}

	// Over the code-point limit, and past what stdin is read up to: refused before asking the app.
	handoffCode(t, root, strings.Repeat("a", handoffTextLimit+1), "usage_error", ".doan/canvases/new.html", "--message", "-")
	handoffCode(t, root, strings.Repeat(" ", socketLineLimit+1)+"a", "usage_error", ".doan/canvases/new.html", "--message", "-")
	handoffCode(t, root, "", "usage_error", ".doan/canvases/new.html", "--message", "-")
	app.silent(t)
}

func TestHandoffAppRefusals(t *testing.T) {
	root := handoffProject(t)
	app := startHandoffApp(t)
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
	} {
		app.replies <- `{"v":5,"ok":false,"error":{"code":"` + answer + `","message":"app text"}}`
		failure := handoffCode(t, root, "", code, ".doan/canvases/new.html", "--message", "x")
		if strings.Contains(failure["message"].(string), "app text") || len(failure["nextSteps"].([]any)) == 0 {
			t.Errorf("%s: %v", answer, failure)
		}
		app.request(t)
	}
	// An older app answers an unknown v on its v1 path.
	app.replies <- `{"v":1,"ok":false,"error":{"code":"bad_request","message":"Unsupported version"}}`
	handoffCode(t, root, "", "app_protocol_mismatch", ".doan/canvases/new.html", "--message", "x")
	app.request(t)
}

func TestHandoffWithoutAKeyAsksNothing(t *testing.T) {
	root := handoffProject(t)
	app := startHandoffApp(t)
	for _, key := range []string{"", strings.ToUpper(testHandoffKey), testHandoffKey[:10]} {
		t.Setenv("DOAN_HANDOFF", key)
		failure := handoffCode(t, root, "", "not_app_conversation", ".doan/canvases/new.html", "--message", "x")
		if !strings.Contains(strings.Join(stringsOf(failure["nextSteps"]), "\n"), "canvas conversation") {
			t.Error(failure)
		}
	}
	// A terminal agent is refused without its stdin being waited on.
	t.Setenv("DOAN_HANDOFF", "")
	handoffCode(t, root, "", "not_app_conversation", ".doan/canvases/new.html", "--message", "-")
	app.silent(t)
}

func stringsOf(v any) []string {
	out := []string{}
	for _, s := range v.([]any) {
		out = append(out, s.(string))
	}
	return out
}

func TestHandoffInputErrorsAskNothing(t *testing.T) {
	root := handoffProject(t)
	app := startHandoffApp(t)
	t.Setenv("DOAN_HANDOFF", testHandoffKey)
	handoffCode(t, root, "", "canvas_not_found", ".doan/canvases/missing.html", "--message", "x")
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
		handoffCode(t, root, "", "usage_error", args...)
	}
	app.silent(t)
	// --message belongs to handoff only.
	failure(t, root, "usage_error", "open", ".doan/canvases/new.html", "--message", "x")
}

func TestHandoffRuntime(t *testing.T) {
	root := handoffProject(t)
	t.Setenv("DOAN_HANDOFF", testHandoffKey)
	t.Setenv("DOAN_RUNTIME", "relative/runtime.json")
	handoffCode(t, root, "", "usage_error", ".doan/canvases/new.html", "--message", "x")

	t.Setenv("DOAN_RUNTIME", filepath.Join(t.TempDir(), "none.json"))
	failure := handoffCode(t, root, "", "app_not_running", ".doan/canvases/new.html", "--message", "x")
	requireRecoveryOrder(t, stringsOf(failure["nextSteps"]), [][]string{
		{"Ask the user to open Doan", "`doan handoff`"},
		{"If Doan is open, a sandbox may block this shell from its socket", "outside the sandbox", "approval"},
		{"If it still fails", "Applications", "Settings… > About"},
	})
}

// handoff never opens the app: no bootstrap, whatever the runtime file says.
func TestHandoffNeverLaunches(t *testing.T) {
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
		if _, failure := Handoff(ctx, Flags{Repo: root, Message: "x", Given: map[string]bool{"message": true}}, []string{".doan/canvases/new.html"}); failure == nil || failure.Code != "app_not_running" {
			t.Fatal(failure)
		}
	}
}

func TestHandoffHumanOutputAndHelp(t *testing.T) {
	root := handoffProject(t)
	startHandoffApp(t)
	t.Setenv("DOAN_HANDOFF", testHandoffKey)
	var out, errout bytes.Buffer
	if code := Run([]string{"handoff", ".doan/canvases/new.html", "--message", "x", "--repo", root}, strings.NewReader(""), &out, &errout); code != 0 || errout.Len() != 0 {
		t.Fatal(code, errout.String())
	}
	if !strings.Contains(out.String(), ".doan/canvases/new.html") || !strings.Contains(out.String(), "when this turn ends") {
		t.Fatal(out.String())
	}
	usage := result(t, root, 0, "help")["usage"].(string)
	if !strings.Contains(usage, "handoff <canvas path> --message <text|->") || !strings.Contains(usage, "Doan app conversations only") {
		t.Fatal(usage)
	}
}
