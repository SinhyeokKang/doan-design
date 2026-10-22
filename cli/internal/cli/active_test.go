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
	"syscall"
	"testing"
	"time"
)

const testToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

func runtimeJSON(socket string) string {
	return `{"v":1,"socket":"` + socket + `","token":"` + testToken + `"}`
}

func TestReadRuntime(t *testing.T) {
	for _, tt := range []struct{ name, body, code string }{
		{"valid", runtimeJSON("/tmp/doan/app.sock"), ""},
		{"v 1.0", `{"v":1.0,"socket":"/s","token":"` + testToken + `"}`, ""},
		{"v 2", `{"v":2,"socket":"/s","token":"` + testToken + `"}`, "app_protocol_mismatch"},
		{"v 2 with other junk", `{"v":2,"extra":true}`, "app_protocol_mismatch"},
		{"v string", `{"v":"1","socket":"/s","token":"` + testToken + `"}`, "app_not_running"},
		{"v missing", `{"socket":"/s","token":"` + testToken + `"}`, "app_not_running"},
		{"bom", "\ufeff" + runtimeJSON("/s"), "app_not_running"},
		{"empty", ``, "app_not_running"},
		{"not json", `{`, "app_not_running"},
		{"trailing value", runtimeJSON("/s") + `{}`, "app_not_running"},
		{"array", `[]`, "app_not_running"},
		{"relative socket", runtimeJSON("app.sock"), "app_not_running"},
		{"uppercase token", `{"v":1,"socket":"/s","token":"` + strings.ToUpper(testToken) + `"}`, "app_not_running"},
		{"unknown field", `{"v":1,"socket":"/s","token":"` + testToken + `","pid":1}`, "app_not_running"},
	} {
		got, code := readRuntime([]byte(tt.body))
		if code != tt.code {
			t.Errorf("%s: %q, want %q", tt.name, code, tt.code)
		}
		if code == "" && (got.Socket == "" || got.Token != testToken) {
			t.Errorf("%s: %+v", tt.name, got)
		}
	}
}

func TestReadRuntimeFixtures(t *testing.T) {
	for _, kind := range []string{"valid", "invalid"} {
		paths, _ := filepath.Glob(filepath.Join("..", "..", "..", "schema", "fixtures", "runtime", kind, "*.json"))
		if len(paths) == 0 {
			t.Fatal("no fixtures", kind)
		}
		for _, p := range paths {
			b, e := os.ReadFile(p)
			if e != nil {
				t.Fatal(e)
			}
			if _, code := readRuntime(b); (code == "") != (kind == "valid") {
				t.Errorf("%s: %q", p, code)
			}
		}
	}
}

func TestReadResponse(t *testing.T) {
	selection := `{"root":"/r","canvas":{"path":"design/a.html","id":"a"},"frame":{"id":"main"},"element":{"selector":"div","html":"<div></div>"}}`
	for _, tt := range []struct{ name, line, code string }{
		{"no selection", `{"v":1,"ok":true,"result":{}}`, ""},
		{"selection", `{"v":1,"ok":true,"result":{"selection":` + selection + `}}`, ""},
		{"v 1.0", `{"v":1.0,"ok":true,"result":{}}`, ""},
		{"v 2", `{"v":2,"ok":true,"result":{}}`, "app_protocol_mismatch"},
		{"v 2 unknown shape", `{"v":2,"whatever":[]}`, "app_protocol_mismatch"},
		{"not json", `nope`, "internal_error"},
		{"two values", `{"v":1,"ok":true,"result":{}} {}`, "internal_error"},
		{"not object", `[1]`, "internal_error"},
		{"v missing", `{"ok":true,"result":{}}`, "internal_error"},
		{"unknown field", `{"v":1,"ok":true,"result":{},"x":1}`, "internal_error"},
		{"selection without root", `{"v":1,"ok":true,"result":{"selection":{"canvas":{"path":"a.html"}}}}`, "internal_error"},
		{"bad_token", `{"v":1,"ok":false,"error":{"code":"bad_token","message":"m"}}`, "app_not_running"},
		{"bad_request", `{"v":1,"ok":false,"error":{"code":"bad_request","message":"m"}}`, "internal_error"},
		{"project_not_open", `{"v":1,"ok":false,"error":{"code":"project_not_open","message":"m"}}`, "project_not_open"},
		{"unknown app error", `{"v":1,"ok":false,"error":{"code":"other","message":"m"}}`, "internal_error"},
	} {
		got, failure := readResponse([]byte(tt.line))
		code := ""
		if failure != nil {
			code = failure.Code
		}
		if code != tt.code {
			t.Errorf("%s: %q, want %q", tt.name, code, tt.code)
		}
		if tt.name == "no selection" && got != nil {
			t.Errorf("%s: %v", tt.name, got)
		}
		if tt.name == "selection" {
			want := map[string]any{"canvas": map[string]any{"path": "design/a.html", "id": "a"}, "frame": map[string]any{"id": "main"}, "element": map[string]any{"selector": "div", "html": "<div></div>"}}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("selection: %v", got)
			}
		}
	}
}

func TestReadResponseFixtures(t *testing.T) {
	paths, _ := filepath.Glob(filepath.Join("..", "..", "..", "schema", "fixtures", "app-socket", "response", "valid", "*.json"))
	if len(paths) == 0 {
		t.Fatal("no fixtures")
	}
	for _, p := range paths {
		b, e := os.ReadFile(p)
		if e != nil {
			t.Fatal(e)
		}
		// Fixtures may be pretty-printed; the wire carries one line.
		var compact bytes.Buffer
		if e := json.Compact(&compact, b); e != nil {
			t.Fatal(e)
		}
		got, failure := readResponse(compact.Bytes())
		if strings.Contains(p, "error-") {
			if failure == nil {
				t.Errorf("%s: no failure", p)
			}
		} else if failure != nil {
			t.Errorf("%s: %v", p, failure)
		} else if got != nil && got["root"] != nil {
			t.Errorf("%s: root leaked into result", p)
		}
	}
}

// fakeApp answers one request over net.Pipe; respond gets the request line and
// returns the reply, or "" to send nothing.
type fakeApp struct {
	requests chan map[string]any
	respond  func(conn net.Conn, request []byte)
}

func (a *fakeApp) dial(t *testing.T) func(string, time.Time) (net.Conn, error) {
	return func(socket string, _ time.Time) (net.Conn, error) {
		if socket != "/tmp/doan-test/app.sock" {
			t.Errorf("dialed %s", socket)
		}
		client, server := net.Pipe()
		t.Cleanup(func() { server.Close() })
		go func() {
			line, e := bufio.NewReader(server).ReadBytes('\n')
			if e != nil {
				return
			}
			var req map[string]any
			if json.Unmarshal(line, &req) == nil {
				a.requests <- req
			}
			a.respond(server, line)
		}()
		return client, nil
	}
}

func reply(line string) func(net.Conn, []byte) {
	return func(conn net.Conn, _ []byte) {
		conn.Write([]byte(line + "\n"))
		conn.Close()
	}
}

func activeContext(t *testing.T, root string, dial func(string, time.Time) (net.Conn, error)) Context {
	t.Helper()
	path := filepath.Join(t.TempDir(), "runtime.json")
	putFile(t, filepath.Dir(path), "runtime.json", runtimeJSON("/tmp/doan-test/app.sock"))
	return Context{Start: root, Now: time.Now, RuntimePath: path, Dial: dial}
}

func activeCode(t *testing.T, ctx Context, root, code string) *Error {
	t.Helper()
	_, failure := Active(ctx, Flags{Repo: root}, nil)
	if failure == nil || failure.Code != code {
		t.Fatalf("%v, want %s", failure, code)
	}
	return failure
}

func TestActiveSendsRootAndReturnsSelection(t *testing.T) {
	root := realPath(t, initialized(t))
	app := &fakeApp{requests: make(chan map[string]any, 1), respond: reply(`{"v":1,"ok":true,"result":{"selection":{"root":"` + root + `","canvas":{"path":"design/a.html"},"element":{"doanId":"cta","selector":"[data-doan-id=\"cta\"]","html":"<a>Go</a>","text":"Go"}}}}`)}
	o, failure := Active(activeContext(t, root, app.dial(t)), Flags{Repo: root}, nil)
	if failure != nil {
		t.Fatal(failure)
	}
	if req := <-app.requests; !reflect.DeepEqual(req, map[string]any{"v": float64(1), "token": testToken, "root": root}) {
		t.Fatal(req)
	}
	want := map[string]any{"repo": root, "selection": map[string]any{"canvas": map[string]any{"path": "design/a.html"}, "element": map[string]any{"doanId": "cta", "selector": `[data-doan-id="cta"]`, "html": "<a>Go</a>", "text": "Go"}}}
	if !reflect.DeepEqual(o.Result, want) || o.Exit != 0 {
		t.Fatal(o)
	}
}

func TestActiveNoSelection(t *testing.T) {
	root := realPath(t, initialized(t))
	app := &fakeApp{requests: make(chan map[string]any, 1), respond: reply(`{"v":1,"ok":true,"result":{}}`)}
	o, failure := Active(activeContext(t, root, app.dial(t)), Flags{Repo: root}, nil)
	if failure != nil || !reflect.DeepEqual(o.Result, map[string]any{"repo": root}) {
		t.Fatal(o, failure)
	}
}

func TestActiveAppErrors(t *testing.T) {
	root := initialized(t)
	for _, tt := range []struct {
		name    string
		respond func(net.Conn, []byte)
		code    string
		step    string
	}{
		{"bad_token", reply(`{"v":1,"ok":false,"error":{"code":"bad_token","message":"m"}}`), "app_not_running", "open Doan"},
		{"project_not_open", reply(`{"v":1,"ok":false,"error":{"code":"project_not_open","message":"m"}}`), "project_not_open", "open this project in Doan"},
		{"bad_request", reply(`{"v":1,"ok":false,"error":{"code":"bad_request","message":"m"}}`), "internal_error", ""},
		{"response v 2", reply(`{"v":2}`), "app_protocol_mismatch", ""},
		{"not json", reply(`<html>`), "internal_error", ""},
		{"closed without response", func(c net.Conn, _ []byte) { c.Close() }, "app_not_running", "MCP `active`"},
		{"partial line then close", func(c net.Conn, _ []byte) { c.Write([]byte(`{"v":1`)); c.Close() }, "internal_error", ""},
		{"oversized line", func(c net.Conn, _ []byte) { c.Write(bytes.Repeat([]byte(" "), 64<<10+1)); c.Close() }, "internal_error", ""},
		{"valid json over the cap", func(c net.Conn, _ []byte) {
			ok := `{"v":1,"ok":true,"result":{}}`
			c.Write([]byte(ok + strings.Repeat(" ", 64<<10+1-len(ok)) + "\n"))
			c.Close()
		}, "internal_error", ""},
	} {
		t.Run(tt.name, func(t *testing.T) {
			app := &fakeApp{requests: make(chan map[string]any, 1), respond: tt.respond}
			failure := activeCode(t, activeContext(t, root, app.dial(t)), root, tt.code)
			if tt.step != "" && !strings.Contains(strings.Join(failure.NextSteps, "\n"), tt.step) {
				t.Fatal(failure.NextSteps)
			}
		})
	}
}

func TestActiveLineAtCapIsRead(t *testing.T) {
	root := realPath(t, initialized(t))
	line := `{"v":1,"ok":true,"result":{}}`
	line += strings.Repeat(" ", 64<<10-len(line))
	app := &fakeApp{requests: make(chan map[string]any, 1), respond: reply(line)}
	if _, failure := Active(activeContext(t, root, app.dial(t)), Flags{Repo: root}, nil); failure != nil {
		t.Fatal(failure)
	}
}

func TestActiveTimesOutAfterTwoSeconds(t *testing.T) {
	root := initialized(t)
	app := &fakeApp{requests: make(chan map[string]any, 1), respond: func(net.Conn, []byte) {}}
	ctx := activeContext(t, root, app.dial(t))
	// The deadline is Now()+2s, so a clock 1.95s behind leaves 50ms of real waiting.
	ctx.Now = func() time.Time { return time.Now().Add(-1950 * time.Millisecond) }
	start := time.Now()
	activeCode(t, ctx, root, "app_not_running")
	if d := time.Since(start); d > time.Second {
		t.Fatal(d)
	}
}

func TestActiveDialFailures(t *testing.T) {
	root := initialized(t)
	for _, err := range []error{syscall.ENOENT, syscall.ECONNREFUSED, syscall.EACCES, errors.New("other")} {
		var got time.Time
		ctx := activeContext(t, root, func(_ string, deadline time.Time) (net.Conn, error) {
			got = deadline
			return nil, &net.OpError{Op: "dial", Net: "unix", Err: err}
		})
		now := time.Unix(1000, 0)
		ctx.Now = func() time.Time { return now }
		activeCode(t, ctx, root, "app_not_running")
		if !got.Equal(now.Add(2 * time.Second)) {
			t.Fatal(got)
		}
	}
}

func TestActiveRuntimeFile(t *testing.T) {
	root := initialized(t)
	dial := func(string, time.Time) (net.Conn, error) { t.Fatal("dialed"); return nil, nil }
	for _, tt := range []struct{ name, body, code string }{
		{"broken", `{`, "app_not_running"},
		{"v 2", `{"v":2,"socket":"/s","token":"` + testToken + `"}`, "app_protocol_mismatch"},
	} {
		ctx := activeContext(t, root, dial)
		putFile(t, filepath.Dir(ctx.RuntimePath), "runtime.json", tt.body)
		activeCode(t, ctx, root, tt.code)
	}
	ctx := activeContext(t, root, dial)
	ctx.RuntimePath = filepath.Join(t.TempDir(), "none.json")
	activeCode(t, ctx, root, "app_not_running")
}

func TestActiveArguments(t *testing.T) {
	root := initialized(t)
	dial := func(string, time.Time) (net.Conn, error) { t.Fatal("dialed"); return nil, nil }
	if _, failure := Active(activeContext(t, root, dial), Flags{Repo: root}, []string{"x"}); failure == nil || failure.Code != "usage_error" {
		t.Fatal(failure)
	}
	activeCode(t, activeContext(t, root, dial), filepath.Join(root, "missing"), "repo_not_found")
	t.Setenv("DOAN_RUNTIME", filepath.Join(t.TempDir(), "none.json"))
	failure(t, root, "usage_error", "active", "--canvas", "x")
}

func TestRunActiveRuntimePath(t *testing.T) {
	root := initialized(t)
	t.Setenv("DOAN_RUNTIME", "rel/runtime.json")
	failure(t, root, "usage_error", "active")
	// A relative value only matters to active.
	result(t, root, 0, "ls")

	t.Setenv("DOAN_RUNTIME", filepath.Join(t.TempDir(), "none.json"))
	failure(t, root, "app_not_running", "active")

	// Empty means unset: the default path under HOME is read.
	home := t.TempDir()
	putFile(t, home, "Library/Application Support/doan/runtime.json", `{"v":2}`)
	t.Setenv("HOME", home)
	t.Setenv("DOAN_RUNTIME", "")
	failure(t, root, "app_protocol_mismatch", "active")
}

// shortTempDir keeps unix socket paths under the 104-byte macOS limit that t.TempDir can exceed.
func shortTempDir(t *testing.T) string {
	t.Helper()
	dir, e := os.MkdirTemp("", "doan")
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	return dir
}

func TestRunActiveOverRealSocket(t *testing.T) {
	root := realPath(t, initialized(t))
	dir := shortTempDir(t)
	socket := filepath.Join(dir, "app.sock")
	l, e := net.Listen("unix", socket)
	if e != nil {
		t.Fatal(e)
	}
	go func() {
		c, e := l.Accept()
		if e != nil {
			return
		}
		defer c.Close()
		line, _ := bufio.NewReader(c).ReadBytes('\n')
		var req map[string]any
		json.Unmarshal(line, &req)
		if req["token"] != testToken || req["root"] != root {
			c.Write([]byte(`{"v":1,"ok":false,"error":{"code":"bad_request","message":"m"}}` + "\n"))
			return
		}
		c.Write([]byte(`{"v":1,"ok":true,"result":{"selection":{"root":"` + root + `","canvas":{"path":"design/a.html"},"frame":{"id":"main","title":"Main"}}}}` + "\n"))
	}()
	putFile(t, dir, "runtime.json", runtimeJSON(socket))
	t.Setenv("DOAN_RUNTIME", filepath.Join(dir, "runtime.json"))
	got := result(t, root, 0, "active")
	want := map[string]any{"repo": root, "selection": map[string]any{"canvas": map[string]any{"path": "design/a.html"}, "frame": map[string]any{"id": "main", "title": "Main"}}}
	if !reflect.DeepEqual(got, want) {
		t.Fatal(got)
	}

	// A runtime file left by a dead app: the socket file exists but nobody listens.
	l.(*net.UnixListener).SetUnlinkOnClose(false)
	l.Close()
	failure(t, root, "app_not_running", "active")
	// And once the socket file is gone too.
	os.Remove(socket)
	failure(t, root, "app_not_running", "active")
}
