package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

// The bootstrap cap covers opening the app and its first runtime publish, not sign-in or clone time.
const bootstrapTimeout = 15 * time.Second
const bootstrapPoll = 250 * time.Millisecond

// bundleID is the appId electron-builder writes into the packaged app's Info.plist.
const bundleID = "design.doan.app"

type onboardingCommand struct {
	op       string
	flags    []string
	required []string
}

var onboardingCommands = map[string]onboardingCommand{
	"start":           {"start", nil, nil},
	"status":          {"status", []string{"session", "operation"}, []string{"session"}},
	"check":           {"check", []string{"session", "provider", "request", "spend-copilot-request"}, []string{"session", "provider", "request"}},
	"sign-in":         {"sign_in", []string{"session", "provider", "request"}, []string{"session", "provider", "request"}},
	"cancel":          {"cancel", []string{"session", "operation", "request"}, []string{"session", "operation", "request"}},
	"project inspect": {"project_inspect", []string{"session", "path", "url", "destination", "request"}, []string{"session", "request"}},
	"project select":  {"project_select", []string{"session", "inspection", "path", "initialize", "request"}, []string{"session", "inspection", "path", "request"}},
	"project clone":   {"project_clone", []string{"session", "inspection", "destination", "request"}, []string{"session", "inspection", "destination", "request"}},
	"complete":        {"complete", []string{"session", "request"}, []string{"session", "request"}},
}

// onboardingFlags lists every onboarding flag with its socket field; run accepts only these for onboarding.
var onboardingFlags = map[string]string{
	"session": "sessionId", "operation": "operationId", "provider": "provider", "request": "requestId",
	"path": "path", "url": "url", "destination": "destination", "inspection": "inspectionId",
	"spend-copilot-request": "spendCopilotRequest", "initialize": "initialize",
}

// The operation-starting ops whose own failed or cancelled operation fails the command;
// cancel reports its target and status reports operations as data.
var operationOps = map[string]bool{"check": true, "sign_in": true, "project_inspect": true, "project_select": true, "project_clone": true, "complete": true}

func onboardingFailure(code, message string) *Error {
	steps := map[string][]string{
		"app_not_running":       {"Ask the user to open Doan, then run `doan onboarding start` again", "If Doan is open, a sandbox may block this shell from its socket; use the MCP onboarding tools instead"},
		"app_launch_failed":     {"Ask the user to open Doan, then run `doan onboarding start` again"},
		"app_protocol_mismatch": {"Ask the user to update Doan and the doan CLI to matching versions"},
		"session_stale":         {"Doan restarted; run `doan onboarding start` and use the new sessionId"},
		"inspection_stale":      {"Run `doan onboarding project inspect` again and use its inspectionId"},
		"operation_not_found":   {"Run `doan onboarding status` to list this session's operations"},
		"request_conflict":      {"Use a new --request id for other arguments; reuse an id only to resend the same request"},
		"busy":                  {"Wait for the running operation (`doan onboarding status`), then send a new --request id"},
		"stop_required":         {"Ask the user to stop the running conversation in Doan, then retry"},
		"initialize_required":   {"Show the user the planned changes from inspect; with their approval run select again with --initialize"},
		"no_ready_agent":        {"Sign in to an agent first (`doan onboarding sign-in`)"},
		"no_project":            {"Select or clone a project first (`doan onboarding project select` or `clone`)"},
	}[code]
	return &Error{Code: code, Message: message, NextSteps: steps}
}

func Onboarding(ctx Context, f Flags, args []string) (Outcome, *Error) {
	if len(args) == 0 {
		return Outcome{}, usageError("Expected onboarding start, status, check, sign-in, cancel, project inspect|select|clone, or complete")
	}
	name, rest := args[0], args[1:]
	if name == "project" {
		if len(rest) == 0 {
			return Outcome{}, usageError("Expected onboarding project inspect, select, or clone")
		}
		name, rest = "project "+rest[0], rest[1:]
	}
	cmd, ok := onboardingCommands[name]
	if !ok {
		return Outcome{}, usageError("Unknown onboarding command: " + name)
	}
	if len(rest) != 0 {
		return Outcome{}, usageError("onboarding " + name + " takes no positional arguments")
	}
	request, failure := onboardingRequest(name, cmd, f)
	if failure != nil {
		return Outcome{}, failure
	}
	var reply map[string]any
	if cmd.op == "start" {
		reply, failure = onboardingStart(ctx, request)
	} else {
		reply, failure, _ = callOnboarding(ctx, request, ctx.Now().Add(activeTimeout))
	}
	if failure != nil {
		return Outcome{}, failure
	}
	return Outcome{Result: reply["result"]}, nil
}

func onboardingRequest(name string, cmd onboardingCommand, f Flags) (map[string]any, *Error) {
	for flag := range f.Given {
		if flag == "json" {
			continue
		}
		known := false
		for _, a := range cmd.flags {
			known = known || a == flag
		}
		if !known {
			return nil, usageError("Flag --" + flag + " is not supported by onboarding " + name)
		}
	}
	for _, flag := range cmd.required {
		if !f.Given[flag] {
			return nil, usageError("onboarding " + name + " requires --" + flag)
		}
	}
	values := map[string]string{
		"session": f.Session, "operation": f.Operation, "provider": f.Provider, "request": f.Request,
		"path": f.Path, "url": f.URL, "destination": f.Destination, "inspection": f.Inspection,
	}
	request := map[string]any{"v": 2, "op": cmd.op}
	for _, flag := range cmd.flags {
		if !f.Given[flag] {
			continue
		}
		switch flag {
		case "spend-copilot-request":
			if f.SpendCopilotRequest {
				request[onboardingFlags[flag]] = true
			}
		case "initialize":
			if f.Initialize {
				request[onboardingFlags[flag]] = true
			}
		case "path", "destination":
			// Relative paths would resolve against a working directory the app cannot see.
			if !filepath.IsAbs(values[flag]) {
				return nil, usageError("--" + flag + " must be an absolute path")
			}
			request[onboardingFlags[flag]] = values[flag]
		default:
			request[onboardingFlags[flag]] = values[flag]
		}
	}
	if cmd.op == "project_inspect" {
		if f.Given["path"] == f.Given["url"] {
			return nil, usageError("onboarding project inspect takes exactly one of --path or --url")
		}
		if f.Given["destination"] && !f.Given["url"] {
			return nil, usageError("--destination goes only with --url")
		}
	}
	if cmd.op == "check" && f.Provider == "copilot" && !f.SpendCopilotRequest {
		return nil, usageError("A Copilot check spends one model request; add --spend-copilot-request only when the user agreed")
	}
	probe := map[string]any{"token": ""}
	for k, v := range request {
		probe[k] = v
	}
	if formats.ValidateOnboardingRequest(probe) != nil {
		return nil, usageError("Invalid onboarding arguments: ids use letters, digits, _ and - (at most 128), and --provider is claude, codex, cursor, antigravity or copilot")
	}
	return request, nil
}

// onboardingStart is the only onboarding path that may open the app, and only the bundle this CLI belongs to.
func onboardingStart(ctx Context, request map[string]any) (map[string]any, *Error) {
	reply, failure, launchable := callOnboarding(ctx, request, ctx.Now().Add(activeTimeout))
	// An explicit DOAN_RUNTIME names a specific app (dev, e2e, eval); opening the default one would answer for another.
	if failure == nil || !launchable || ctx.RuntimeExplicit {
		return reply, failure
	}
	bundle, ok := ownBundle(ctx.Executable)
	if !ok {
		return nil, onboardingFailure("app_not_running", "Doan is not running, and this doan CLI is not inside a Doan app to open")
	}
	deadline := ctx.Now().Add(bootstrapTimeout)
	if ctx.Launch(bundle) != nil {
		return nil, onboardingFailure("app_launch_failed", "Could not open Doan")
	}
	for {
		ctx.Sleep(bootstrapPoll)
		attempt := ctx.Now().Add(activeTimeout)
		if attempt.After(deadline) {
			attempt = deadline
		}
		reply, failure, _ = callOnboarding(ctx, request, attempt)
		// While the launched app starts, a missing runtime, a refused socket or a slow first answer all mean "not yet".
		if failure == nil || failure.Code != "app_not_running" {
			return reply, failure
		}
		if !ctx.Now().Before(deadline) {
			return nil, onboardingFailure("app_launch_failed", "Doan did not become ready within 15 seconds")
		}
	}
}

// callOnboarding sends one v2 request and returns the validated reply. launchable
// reports a failure that means no app is listening, which only start may act on.
func callOnboarding(ctx Context, request map[string]any, deadline time.Time) (map[string]any, *Error, bool) {
	if _, e := os.Stat(ctx.RuntimePath); errors.Is(e, fs.ErrNotExist) {
		return nil, onboardingFailure("app_not_running", "Doan is not running"), true
	}
	data, ok := readRuntimeBytes(ctx.RuntimePath)
	if !ok {
		return nil, onboardingFailure("app_not_running", "Cannot read the Doan runtime file"), false
	}
	rt, code := readRuntime(data)
	if code == "app_protocol_mismatch" {
		return nil, onboardingFailure(code, "The Doan runtime file has another protocol version"), false
	} else if code != "" {
		// Doan rewrites the file when it starts, so a damaged one is no sign of a running app.
		return nil, onboardingFailure(code, "The Doan runtime file is not valid"), true
	}
	conn, e := ctx.Dial(rt.Socket, deadline)
	if e != nil {
		// A left-over runtime file points at a removed or unbound socket; a denied one may be a sandbox around a running app.
		gone := errors.Is(e, syscall.ENOENT) || errors.Is(e, syscall.ECONNREFUSED)
		return nil, onboardingFailure("app_not_running", "Cannot connect to Doan"), gone
	}
	defer conn.Close()
	if e := conn.SetDeadline(deadline); e != nil {
		return nil, internal(e), false
	}
	wire := map[string]any{"token": rt.Token}
	for k, v := range request {
		wire[k] = v
	}
	line, e := json.Marshal(wire)
	if e != nil {
		return nil, internal(e), false
	}
	if _, e := conn.Write(append(line, '\n')); e != nil {
		return nil, onboardingFailure("app_not_running", "Cannot send to Doan"), false
	}
	answer, failure := readLine(conn)
	if failure != nil {
		return nil, failure, false
	}
	return readOnboardingReply(answer, request["op"].(string), rt.Token)
}

func readOnboardingReply(line []byte, op, token string) (map[string]any, *Error, bool) {
	decoder := json.NewDecoder(bytes.NewReader(line))
	decoder.UseNumber()
	var value any
	var extra any
	if decoder.Decode(&value) != nil || decoder.Decode(&extra) != io.EOF {
		return nil, internal(errors.New("Doan sent a response that is not one JSON value")), false
	}
	obj, ok := value.(map[string]any)
	if !ok {
		return nil, internal(errors.New("Doan sent a response that is not a JSON object")), false
	}
	// Any numeric v other than 2, including an older app's v1 bad_request, is another protocol.
	if n, ok := obj["v"].(json.Number); ok {
		if v, e := n.Float64(); e != nil || v != 2 {
			return nil, onboardingFailure("app_protocol_mismatch", "Doan answered with another protocol version"), false
		}
		obj["v"] = float64(2)
	}
	if formats.ValidateOnboardingResponse(obj) != nil {
		return nil, internal(errors.New("Doan sent a response that does not match app-socket v2")), false
	}
	// The app writes messages without secrets; the token this CLI holds is still never echoed.
	failed := func(code string, e map[string]any) (map[string]any, *Error, bool) {
		message := e["message"].(string)
		if strings.Contains(message, token) {
			message = "Doan refused the request"
		}
		return nil, onboardingFailure(code, message), false
	}
	if obj["ok"] == false {
		e := obj["error"].(map[string]any)
		switch code := e["code"].(string); code {
		case "bad_token":
			// The runtime file outlived the app that wrote it; a new app has another token.
			return nil, onboardingFailure("app_not_running", "Doan rejected the token in its runtime file"), true
		case "bad_request":
			return nil, internal(errors.New("Doan rejected the request as malformed")), false
		default:
			return failed(code, e)
		}
	}
	if obj["op"] != op {
		return nil, internal(errors.New("Doan answered another operation")), false
	}
	if operationOps[op] {
		operation := obj["result"].(map[string]any)["operation"].(map[string]any)
		switch operation["state"] {
		case "failed":
			e := operation["error"].(map[string]any)
			return failed(e["code"].(string), e)
		case "cancelled":
			return nil, onboardingFailure("cancelled", "The operation was cancelled"), false
		}
	}
	return obj, nil, false
}

// ownBundle returns the Doan app this CLI is bundled in, judged from the CLI's
// real path only, so no argument or environment can point it at another program.
func ownBundle(executable func() (string, error)) (string, bool) {
	if executable == nil {
		return "", false
	}
	path, e := executable()
	if e != nil {
		return "", false
	}
	real, e := filepath.EvalSymlinks(path)
	if e != nil {
		return "", false
	}
	bin := filepath.Dir(real)
	resources := filepath.Dir(bin)
	contents := filepath.Dir(resources)
	bundle := filepath.Dir(contents)
	if filepath.Base(real) != "doan" || filepath.Base(bin) != "bin" || filepath.Base(resources) != "Resources" || filepath.Base(contents) != "Contents" || filepath.Ext(bundle) != ".app" {
		return "", false
	}
	info, e := os.Lstat(filepath.Join(contents, "Info.plist"))
	if e != nil || !info.Mode().IsRegular() || info.Size() > 1<<20 {
		return "", false
	}
	data, e := os.ReadFile(filepath.Join(contents, "Info.plist"))
	if e != nil {
		return "", false
	}
	keys := plistStrings(data)
	name := keys["CFBundleExecutable"]
	if keys["CFBundleIdentifier"] != bundleID || name == "" || strings.Contains(name, "/") {
		return "", false
	}
	// Lstat: a link would let LaunchServices start a program from outside the bundle.
	info, e = os.Lstat(filepath.Join(contents, "MacOS", name))
	if e != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0o111 == 0 {
		return "", false
	}
	return bundle, true
}

// plistStrings reads the top-level string values of an XML property list; a binary one yields nothing.
func plistStrings(data []byte) map[string]string {
	out := map[string]string{}
	decoder := xml.NewDecoder(bytes.NewReader(data))
	depth, key := 0, ""
	for {
		token, e := decoder.Token()
		if e != nil {
			return out
		}
		switch t := token.(type) {
		case xml.StartElement:
			depth++
			if depth != 3 {
				continue
			}
			var text string
			if t.Name.Local == "key" || t.Name.Local == "string" {
				if decoder.DecodeElement(&text, &t) != nil {
					return out
				}
			} else if decoder.Skip() != nil {
				return out
			}
			depth--
			if t.Name.Local == "key" {
				key = text
				continue
			}
			if t.Name.Local == "string" && key != "" {
				out[key] = text
			}
			key = ""
		case xml.EndElement:
			depth--
		}
	}
}

// launchBundle opens the app through LaunchServices so it is visible and does not inherit this shell's environment.
func launchBundle(bundle string) error {
	if runtime.GOOS != "darwin" {
		return errors.New("opening Doan is supported only on macOS")
	}
	ctx, cancel := context.WithTimeout(context.Background(), bootstrapTimeout)
	defer cancel()
	return exec.CommandContext(ctx, "/usr/bin/open", bundle).Run()
}

var shellSafe = regexp.MustCompile(`^[A-Za-z0-9_./@%+=:,-]+$`)

// shellQuote quotes a path for copy-paste into sh or zsh.
func shellQuote(s string) string {
	if shellSafe.MatchString(s) {
		return s
	}
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
