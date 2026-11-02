package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"net"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestWorkTarget(t *testing.T) {
	root := realPath(t, initialized(t))
	putFile(t, root, ".doan/canvases/existing.html", "canvas")
	for _, path := range []string{".doan/canvases/existing.html", ".doan/ds/new.html", ".doan/canvases/new.html"} {
		for _, input := range []string{path, filepath.Join(root, path)} {
			got, err := workTarget(root, input)
			if err != nil || got != path {
				t.Fatalf("%q: %q %v", input, got, err)
			}
		}
	}
	for _, path := range []string{"", "../a.html", "/tmp/a.html", ".doan/assets/a.html", ".doan/canvases/a.txt", ".doan/canvases/nested/a.html", ".doan/canvases/dir.html"} {
		if path == ".doan/canvases/dir.html" {
			if err := os.Mkdir(filepath.Join(root, path), 0755); err != nil {
				t.Fatal(err)
			}
		}
		if got, err := workTarget(root, path); err == nil {
			t.Fatalf("accepted %q as %q", path, got)
		}
	}
	for _, target := range []string{t.TempDir(), filepath.Join(t.TempDir(), "missing"), filepath.Join(root, "src")} {
		t.Run(target, func(t *testing.T) {
			r := realPath(t, initialized(t))
			if err := os.Symlink(target, filepath.Join(r, ".doan/ds")); err != nil {
				t.Fatal(err)
			}
			if _, err := workTarget(r, ".doan/ds/new.html"); err == nil {
				t.Fatal("accepted linked directory outside canvas scope")
			}
		})
	}
	outside := filepath.Join(t.TempDir(), "a.html")
	putFile(t, filepath.Dir(outside), "a.html", "outside")
	if err := os.Symlink(outside, filepath.Join(root, ".doan/canvases/link.html")); err != nil {
		t.Fatal(err)
	}
	if _, err := workTarget(root, ".doan/canvases/link.html"); err == nil {
		t.Fatal("accepted outside file")
	}
}

func TestWorkSession(t *testing.T) {
	for _, tt := range []struct{ claude, thread, legacy, provider, id string }{
		{"c", "", "", "claude", "c"}, {"", "t", "", "codex", "t"}, {"", "", "l", "codex", "l"}, {"", "t", "t", "codex", "t"},
		{}, {"c", "t", "", "", ""}, {"c", "", "l", "", ""}, {"", "t", "l", "", ""}, {"-bad", "", "", "", ""}, {"a\x00b", "", "", "", ""}, {"a b", "", "", "claude", "a b"}, {strings.Repeat("a", 129), "", "", "claude", strings.Repeat("a", 129)},
	} {
		p, id := workSession(tt.claude, tt.thread, tt.legacy)
		if p != tt.provider || id != tt.id {
			t.Fatalf("%+v: %q %q", tt, p, id)
		}
	}
}

func TestCanvasLinkFixtures(t *testing.T) {
	var fixtures struct {
		Build []struct{ Name, Root, Path, Frame, Expected string }
	}
	data, err := os.ReadFile("../../../schema/fixtures/open-link/cases.json")
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	if len(fixtures.Build) == 0 {
		t.Fatal("no fixtures")
	}
	for _, tt := range fixtures.Build {
		t.Run(tt.Name, func(t *testing.T) {
			want := strings.Split(tt.Expected, "&frame=")[0]
			if got := canvasLink(tt.Root, tt.Path); got != want {
				t.Fatalf("%s != %s", got, want)
			}
		})
	}
}

func TestReadWorkResponse(t *testing.T) {
	for _, tt := range []struct {
		line string
		want bool
	}{
		{`{"v":3,"ok":true}`, true}, {`{"v":3.0,"ok":true}`, true},
		{`{"v":1,"ok":false,"error":{"code":"bad_request","message":"old"}}`, false},
		{`{"v":2,"ok":true}`, false}, {`{"v":3,"ok":true,"extra":1}`, false}, {`{"v":3,"ok":true} {}`, false}, {`null`, false}, {`broken`, false},
	} {
		if got := readWorkResponse([]byte(tt.line)); got != tt.want {
			t.Fatalf("%s: %v", tt.line, got)
		}
	}
	for _, code := range []string{"bad_request", "bad_token", "project_not_open"} {
		if readWorkResponse([]byte(`{"v":3,"ok":false,"error":{"code":"` + code + `","message":"no"}}`)) {
			t.Fatal(code)
		}
	}
}

func TestWorkSocketOutcomes(t *testing.T) {
	root := realPath(t, initialized(t))
	for _, tt := range []struct {
		name, line string
		want       bool
	}{
		{"success", `{"v":3,"ok":true}`, true}, {"old app", `{"v":1,"ok":false,"error":{"code":"bad_request","message":"old"}}`, false},
		{"other version", `{"v":4,"ok":true}`, false}, {"malformed", "junk", false}, {"shape", `{"v":3,"ok":true,"result":{}}`, false},
		{"bad_token", `{"v":3,"ok":false,"error":{"code":"bad_token","message":"no"}}`, false},
		{"bad_request", `{"v":3,"ok":false,"error":{"code":"bad_request","message":"no"}}`, false},
		{"project_not_open", `{"v":3,"ok":false,"error":{"code":"project_not_open","message":"no"}}`, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			app := &fakeApp{requests: make(chan map[string]any, 1), respond: reply(tt.line)}
			ctx := activeContext(t, root, app.dial(t))
			ctx.WorkProvider = "codex"
			ctx.WorkSession = "thread"
			out, e := Work(ctx, Flags{Repo: root}, []string{"start", ".doan/canvases/new.html"})
			assertWork(t, out, e, tt.want)
			req := <-app.requests
			want := map[string]any{"v": float64(3), "token": testToken, "root": root, "action": "start", "path": ".doan/canvases/new.html", "provider": "codex", "session": "thread"}
			if !reflect.DeepEqual(req, want) {
				t.Fatal(req)
			}
		})
	}
	for _, name := range []string{"missing", "directory", "invalid", "version", "dial", "permission", "timeout", "write", "closed", "truncated", "app conversation"} {
		t.Run(name, func(t *testing.T) {
			app := &fakeApp{requests: make(chan map[string]any, 1), respond: func(c net.Conn, _ []byte) { c.Close() }}
			ctx := activeContext(t, root, app.dial(t))
			switch name {
			case "missing":
				ctx.RuntimePath = filepath.Join(t.TempDir(), "missing")
			case "directory":
				ctx.RuntimePath = t.TempDir()
			case "invalid":
				putFile(t, filepath.Dir(ctx.RuntimePath), "runtime.json", "bad")
			case "version":
				putFile(t, filepath.Dir(ctx.RuntimePath), "runtime.json", `{"v":2}`)
			case "dial", "permission":
				ctx.Dial = func(string, time.Time) (net.Conn, error) { return nil, os.ErrPermission }
			case "timeout":
				app.respond = func(c net.Conn, _ []byte) { defer c.Close(); b := make([]byte, 1); c.Read(b) }
			case "write":
				ctx.Dial = func(string, time.Time) (net.Conn, error) { c, s := net.Pipe(); s.Close(); return c, nil }
			case "truncated":
				app.respond = func(c net.Conn, _ []byte) { defer c.Close(); c.Write([]byte(`{"v":3`)) }
			case "app conversation":
				ctx.AppConversation = true
				ctx.Dial = func(string, time.Time) (net.Conn, error) { t.Error("dialed"); return nil, errors.New("unexpected") }
			}
			before := time.Now()
			out, e := Work(ctx, Flags{Repo: root}, []string{"done", ".doan/canvases/new.html"})
			assertWork(t, out, e, false)
			if time.Since(before) > 3*time.Second {
				t.Fatal("exceeded timeout")
			}
			if !reflect.DeepEqual(out.Result.(map[string]any)["links"], []string{canvasLink(root, ".doan/canvases/new.html")}) {
				t.Fatal(out)
			}
		})
	}
}

func assertWork(t *testing.T, out Outcome, e *Error, want bool) {
	t.Helper()
	var stdout, stderr bytes.Buffer
	if code := emit(out, e, true, &stdout, &stderr); code != 0 || stderr.Len() != 0 {
		t.Fatalf("exit %d %s %s", code, &stdout, &stderr)
	}
	if out.Result.(map[string]any)["delivered"] != want {
		t.Fatal(out)
	}
}

func TestWorkRunValidationAndSuppression(t *testing.T) {
	root := realPath(t, initialized(t))
	t.Setenv("DOAN_RUNTIME", filepath.Join(t.TempDir(), "missing"))
	t.Setenv("DOAN_APP_CONVERSATION", "1")
	for _, args := range [][]string{{"work"}, {"work", "other"}, {"work", "start"}, {"work", "start", ".doan/ds/a.html", ".doan/ds/b.html"}, {"work", "start", "bad.html"}} {
		failure(t, root, "usage_error", args...)
	}
	failure(t, t.TempDir(), "repo_not_found", "work", "done")
	broken := t.TempDir()
	putFile(t, broken, ".doan/config.json", "broken")
	failure(t, broken, "invalid_config", "work", "done")
	got := result(t, root, 0, "work", "done")
	if got["delivered"] != false || len(got["links"].([]any)) != 0 {
		t.Fatal(got)
	}
	got = result(t, root, 0, "work", "start", ".doan/ds/a.html")
	if got["delivered"] != false {
		t.Fatal(got)
	}
	t.Setenv("DOAN_RUNTIME", "relative")
	failure(t, root, "usage_error", "work", "done")
}

func TestWorkRejectsLinkedDirectory(t *testing.T) {
	root := realPath(t, initialized(t))
	if err := os.Mkdir(filepath.Join(root, ".doan/canvases/directory.html"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("directory.html", filepath.Join(root, ".doan/canvases/link.html")); err != nil {
		t.Fatal(err)
	}
	if _, err := workTarget(root, ".doan/canvases/link.html"); err == nil {
		t.Fatal("accepted directory through link")
	}
}

func TestWorkResponseLineCap(t *testing.T) {
	root := realPath(t, initialized(t))
	success := `{"v":3,"ok":true}`
	for _, length := range []int{maxResponseLine, maxResponseLine + 1} {
		t.Run(strconv.Itoa(length), func(t *testing.T) {
			app := &fakeApp{requests: make(chan map[string]any, 1), respond: reply(strings.Repeat(" ", length-len(success)-1) + success)}
			out, e := Work(activeContext(t, root, app.dial(t)), Flags{Repo: root}, []string{"done"})
			assertWork(t, out, e, length <= maxResponseLine)
		})
	}
}

func TestWorkDoneWireAndLinks(t *testing.T) {
	root := realPath(t, initialized(t))
	for _, paths := range [][]string{{}, {".doan/canvases/a.html", ".doan/ds/b.html"}} {
		app := &fakeApp{requests: make(chan map[string]any, 1), respond: reply(`{"v":3,"ok":true}`)}
		ctx := activeContext(t, root, app.dial(t))
		now := time.Now()
		ctx.Now = func() time.Time { return now }
		dial := ctx.Dial
		ctx.Dial = func(socket string, deadline time.Time) (net.Conn, error) {
			if !deadline.Equal(now.Add(activeTimeout)) {
				t.Error("wrong deadline")
			}
			return dial(socket, deadline)
		}
		out, e := Work(ctx, Flags{Repo: root}, append([]string{"done"}, paths...))
		assertWork(t, out, e, true)
		req := <-app.requests
		if !reflect.DeepEqual(req, map[string]any{"v": float64(3), "token": testToken, "root": root, "action": "done"}) {
			t.Fatal(req)
		}
		links := out.Result.(map[string]any)["links"].([]string)
		if len(links) != len(paths) {
			t.Fatal(links)
		}
		for i, path := range paths {
			if links[i] != canvasLink(root, path) {
				t.Fatal(links)
			}
		}
	}
}

func TestWorkWithoutHome(t *testing.T) {
	root := realPath(t, initialized(t))
	t.Setenv("HOME", "")
	t.Setenv("DOAN_RUNTIME", "")
	for _, suppressed := range []string{"", "1"} {
		t.Run("conversation="+suppressed, func(t *testing.T) {
			t.Setenv("DOAN_APP_CONVERSATION", suppressed)
			for _, action := range []string{"start", "done"} {
				got := result(t, root, 0, "work", action, ".doan/canvases/a.html")
				if got["delivered"] != false {
					t.Fatal(got)
				}
			}
		})
	}
}

func TestWorkDoneSkipsBadPaths(t *testing.T) {
	root := realPath(t, initialized(t))
	for _, suppressed := range []bool{false, true} {
		for _, paths := range [][]string{{"bad.html", "../outside.html"}, {"bad.html", ".doan/canvases/a.html", ".doan/assets/a.png"}} {
			app := &fakeApp{requests: make(chan map[string]any, 1), respond: reply(`{"v":3,"ok":true}`)}
			ctx := activeContext(t, root, app.dial(t))
			ctx.AppConversation = suppressed
			out, e := Work(ctx, Flags{Repo: root}, append([]string{"done"}, paths...))
			assertWork(t, out, e, !suppressed)
			got := out.Result.(map[string]any)
			skipped := []string{paths[0], paths[len(paths)-1]}
			links := []string{}
			if len(paths) == 3 {
				links = append(links, canvasLink(root, paths[1]))
			}
			if !reflect.DeepEqual(got["skipped"], skipped) || !reflect.DeepEqual(got["links"], links) {
				t.Fatal(got)
			}
			if !suppressed {
				req := <-app.requests
				if req["action"] != "done" {
					t.Fatal(req)
				}
			}
		}
	}
}

func TestWorkAcceptsSymlinkedRootAncestor(t *testing.T) {
	parent := realPath(t, t.TempDir())
	root := filepath.Join(parent, "repo")
	putFile(t, root, ".doan/config.json", `{"v":1}`)
	alias := filepath.Join(t.TempDir(), "alias")
	if err := os.Symlink(parent, alias); err != nil {
		t.Fatal(err)
	}
	putFile(t, root, ".doan/canvases/existing.html", "canvas")
	t.Setenv("DOAN_APP_CONVERSATION", "1")
	t.Setenv("DOAN_RUNTIME", filepath.Join(t.TempDir(), "missing"))
	for _, name := range []string{"existing.html", "new.html"} {
		path := ".doan/canvases/" + name
		for _, action := range []string{"start", "done"} {
			got := result(t, root, 0, "work", action, filepath.Join(alias, "repo", path))
			if action == "done" && !reflect.DeepEqual(got["links"], []any{canvasLink(root, path)}) {
				t.Fatal(got)
			}
		}
	}
}

func TestWorkTargetDiskSpelling(t *testing.T) {
	root := realPath(t, initialized(t))
	putFile(t, root, ".doan/canvases/Home.html", "canvas")
	if _, err := os.Stat(filepath.Join(root, ".doan/canvases/home.html")); err != nil {
		t.Skip("case-sensitive filesystem")
	}
	putFile(t, root, ".doan/canvases/한.html", "canvas")
	entries, err := os.ReadDir(filepath.Join(root, ".doan/canvases"))
	if err != nil {
		t.Fatal(err)
	}
	korean := ""
	for _, entry := range entries {
		if entry.Name() != "Home.html" {
			korean = entry.Name()
		}
	}
	for input, want := range map[string]string{"home.html": "Home.html", "한.html": korean} {
		got, err := workTarget(root, ".doan/canvases/"+input)
		if err != nil || got != ".doan/canvases/"+want {
			t.Fatalf("%q: %q %v", input, got, err)
		}
	}
}

func TestWorkRejectsDirectoryCaseVariants(t *testing.T) {
	root := realPath(t, initialized(t))
	t.Setenv("DOAN_APP_CONVERSATION", "1")
	t.Setenv("DOAN_RUNTIME", filepath.Join(t.TempDir(), "missing"))
	failure(t, root, "usage_error", "work", "start", ".DOAN/Canvases/x.html")
}
