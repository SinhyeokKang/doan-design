package cli

import (
	"bufio"
	"bytes"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

// removeApp is a fake app on a real unix socket under an absolute temporary DOAN_RUNTIME. Each connection gets the
// next reply; "" closes the connection without one, as an app that quits mid-request does.
type removeApp struct {
	lines   chan []byte
	replies chan string
}

func startRemoveApp(t *testing.T) *removeApp {
	t.Helper()
	dir := shortTempDir(t)
	socket := filepath.Join(dir, "app.sock")
	l, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { l.Close() })
	app := &removeApp{lines: make(chan []byte, 16), replies: make(chan string, 16)}
	go func() {
		for {
			c, err := l.Accept()
			if err != nil {
				return
			}
			line, _ := bufio.NewReader(c).ReadBytes('\n')
			app.lines <- line
			if r := <-app.replies; r != "" {
				c.Write([]byte(r + "\n"))
			}
			c.Close()
		}
	}()
	putFile(t, dir, "runtime.json", runtimeJSON(socket))
	t.Setenv("DOAN_RUNTIME", filepath.Join(dir, "runtime.json"))
	return app
}

func (a *removeApp) request(t *testing.T) map[string]any {
	t.Helper()
	select {
	case line := <-a.lines:
		var req map[string]any
		if err := json.Unmarshal(line, &req); err != nil {
			t.Fatal(err, string(line))
		}
		return req
	case <-time.After(3 * time.Second):
		t.Fatal("no request reached the app")
	}
	return nil
}

func (a *removeApp) silent(t *testing.T) {
	t.Helper()
	select {
	case line := <-a.lines:
		t.Fatalf("asked the app: %s", line)
	case <-time.After(50 * time.Millisecond):
	}
}

func removedReply(project string, roots ...string) string {
	b, _ := json.Marshal(map[string]any{"v": 7, "ok": true, "removed": true, "project": project, "roots": roots})
	return string(b)
}

func runRemove(t *testing.T, root string, args ...string) (map[string]any, int) {
	t.Helper()
	var out, errout bytes.Buffer
	code := Run(append(append([]string{"remove"}, args...), "--repo", root, "--json"), strings.NewReader(""), &out, &errout)
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

func removeCode(t *testing.T, root, code string, args ...string) map[string]any {
	t.Helper()
	v, exit := runRemove(t, root, args...)
	if v["ok"] != false || v["error"].(map[string]any)["code"] != code || exit != ExitCode(code) {
		t.Fatalf("%v: exit %d, %v; want %s", args, exit, v, code)
	}
	return v["error"].(map[string]any)
}

func TestRemoveSendsTheV7RequestAndReturnsTheGroup(t *testing.T) {
	root := realPath(t, initialized(t))
	app := startRemoveApp(t)
	app.replies <- removedReply("repo", "/Users/me/repo", root)
	v, exit := runRemove(t, root)
	want := map[string]any{"removed": true, "project": "repo", "roots": []any{"/Users/me/repo", root}}
	if exit != 0 || !reflect.DeepEqual(v["result"], want) {
		t.Fatal(exit, v)
	}
	req := app.request(t)
	if !reflect.DeepEqual(req, map[string]any{"v": float64(7), "token": testToken, "root": root}) {
		t.Fatal(req)
	}
	if err := formats.ValidateRemoveRequest(req); err != nil {
		t.Fatal(err)
	}
	// Without --repo the search starts at the working directory and goes up; the discovered root is sent.
	putFile(t, root, "src/a.txt", "x")
	app.replies <- removedReply("repo", root)
	ctx := Context{Start: filepath.Join(root, "src"), Now: time.Now, RuntimePath: os.Getenv("DOAN_RUNTIME"), Dial: func(socket string, deadline time.Time) (net.Conn, error) {
		return (&net.Dialer{Deadline: deadline}).Dial("unix", socket)
	}}
	if _, failure := Remove(ctx, Flags{}, nil); failure != nil {
		t.Fatal(failure)
	}
	if req := app.request(t); req["root"] != root {
		t.Fatal(req)
	}
}

func TestRemoveHumanOutput(t *testing.T) {
	root := realPath(t, initialized(t))
	app := startRemoveApp(t)
	app.replies <- removedReply("repo", "/Users/me/repo", root)
	var out, errout bytes.Buffer
	if code := Run([]string{"remove", "--repo", root}, strings.NewReader(""), &out, &errout); code != 0 || errout.Len() != 0 {
		t.Fatal(code, errout.String())
	}
	if out.String() != "Removed repo from Doan: /Users/me/repo, "+root+". Files and Git worktrees stay on disk.\n" {
		t.Fatalf("%q", out.String())
	}
}

func TestRemoveAppRefusals(t *testing.T) {
	root := realPath(t, initialized(t))
	app := startRemoveApp(t)
	for answer, code := range map[string]string{
		"bad_token":            "app_not_running",
		"project_not_open":     "project_not_open",
		"busy":                 "busy",
		"conversation_running": "conversation_running",
	} {
		app.replies <- `{"v":7,"ok":false,"error":{"code":"` + answer + `","message":"Finish Doan's first run, then try again."}}`
		failure := removeCode(t, root, code)
		if len(failure["nextSteps"].([]any)) == 0 {
			t.Errorf("%s: %v", answer, failure)
		}
		app.request(t)
	}
	// An older app answers an unknown v on its v1 path.
	app.replies <- `{"v":1,"ok":false,"error":{"code":"bad_request","message":"Unsupported version"}}`
	removeCode(t, root, "app_protocol_mismatch")
	app.request(t)
	// The app quits after reading the request.
	app.replies <- ""
	removeCode(t, root, "app_not_running")
	app.request(t)
}

func TestRemoveInputErrorsAskNothing(t *testing.T) {
	root := realPath(t, initialized(t))
	app := startRemoveApp(t)
	for _, args := range [][]string{
		{"extra"},
		{root},
		{"--frame", "main"},
		{"--message", "x"},
		{"--storage", "local"},
		{"--force"},
	} {
		removeCode(t, root, "usage_error", args...)
	}
	app.silent(t)
}

// A folder Doan cannot list as a project ends before the app is asked, and the guidance is the app's Remove from
// Doan, not doan init.
func TestRemoveProblemRootsPointToTheApp(t *testing.T) {
	startRemoveApp(t)
	notSetUp := t.TempDir()
	broken := t.TempDir()
	putFile(t, broken, ".doan/config.json", `{`)
	for root, code := range map[string]string{notSetUp: "repo_not_found", broken: "invalid_config"} {
		failure := removeCode(t, root, code)
		if steps := stringsOf(failure["nextSteps"]); !reflect.DeepEqual(steps, []string{"If Doan lists this folder as Not set up or Config error, ask the user to use Remove from Doan in the app; do not run `doan init` here"}) {
			t.Errorf("%s: %q", code, steps)
		}
	}
	// Other commands keep their own guidance.
	v := runJSON(t, notSetUp, 2, "ls")
	if !strings.Contains(strings.Join(stringsOf(v["error"].(map[string]any)["nextSteps"]), "\n"), "doan init") {
		t.Fatal(v)
	}
}

func TestRemoveRuntime(t *testing.T) {
	root := realPath(t, initialized(t))
	t.Setenv("DOAN_RUNTIME", "relative/runtime.json")
	removeCode(t, root, "usage_error")

	t.Setenv("DOAN_RUNTIME", filepath.Join(t.TempDir(), "none.json"))
	failure := removeCode(t, root, "app_not_running")
	requireRecoveryOrder(t, stringsOf(failure["nextSteps"]), [][]string{
		{"Ask the user to open Doan", "`doan remove`"},
		{"If Doan is open, a sandbox may block this shell from its socket", "outside the sandbox", "approval"},
		{"If it still fails", "Applications", "Settings… > About"},
	})
}

// remove never opens the app: no bootstrap, whatever the runtime file says.
func TestRemoveNeverLaunches(t *testing.T) {
	root := realPath(t, initialized(t))
	ctx := Context{Start: root, Now: time.Now,
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
		if _, failure := Remove(ctx, Flags{Repo: root}, nil); failure == nil || failure.Code != "app_not_running" {
			t.Fatal(failure)
		}
	}
}

// An app conversation sends the same request: the app refuses it because that conversation's own turn is running.
func TestRemoveInAnAppConversationSendsTheSameRequest(t *testing.T) {
	root := realPath(t, initialized(t))
	app := startRemoveApp(t)
	t.Setenv("DOAN_APP_CONVERSATION", "1")
	t.Setenv("DOAN_HANDOFF", testHandoffKey)
	app.replies <- `{"v":7,"ok":false,"error":{"code":"conversation_running","message":"m"}}`
	removeCode(t, root, "conversation_running")
	if req := app.request(t); !reflect.DeepEqual(req, map[string]any{"v": float64(7), "token": testToken, "root": root}) {
		t.Fatal(req)
	}
}
