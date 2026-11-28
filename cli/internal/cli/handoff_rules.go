package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

// handoffTextLimit is the text maxLength of app-socket.v5 and v8 schemas, in code points; tests read both.
const handoffTextLimit = 10000

// socketLineLimit is the app's LINE_LIMIT (app/src/main/runtime.ts): request bytes before the newline.
const socketLineLimit = 64 << 10

// handoffLineMax bounds the marshalled request without its token; the headroom covers the token field the
// transport adds, so the app never answers an over-long line with a bad_request the CLI cannot explain.
const handoffLineMax = socketLineLimit - 1024

// v5 and v8 are narrower than v4: a message goes to a canvas's conversation, and .doan/ds/ pages are not canvases.
var handoffCanvasPath = regexp.MustCompile(`^\.doan/canvases/[^/]+\.html$`)

var handoffKeyPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

// handoffKey applies the schema's key format to DOAN_HANDOFF; anything else is no key.
func handoffKey(value string) string {
	if !handoffKeyPattern.MatchString(value) {
		return ""
	}
	return value
}

// handoffText trims and refuses rather than cuts, so the agent can resend; as in the schema, \n and \t are the only control
// characters allowed. The trim adds U+FEFF, as the app's trim and /\S/u do: a message the app reads as blank is refused here.
func handoffText(raw string) (string, *Error) {
	if !utf8.ValidString(raw) {
		return "", usageError("--message must be UTF-8 text")
	}
	text := strings.TrimFunc(raw, func(r rune) bool { return unicode.IsSpace(r) || r == '\ufeff' })
	if text == "" {
		return "", usageError("--message needs the handoff message; use - to read it from stdin")
	}
	for _, r := range text {
		if (r < 0x20 && r != '\n' && r != '\t') || r == 0x7f {
			return "", usageError("--message must not contain control characters other than newlines and tabs")
		}
	}
	if utf8.RuneCountInString(text) > handoffTextLimit {
		return "", usageError("--message is longer than 10000 characters")
	}
	return text, nil
}

// handoffRequest builds the v5 request without the token.
func handoffRequest(root, path, key, text string) (map[string]any, *Error) {
	return messageRequest(5, root, path, key, text)
}

// messageRequest builds a canvas-message request of one protocol version, v5 and v8 alike. The byte check is on
// json.Marshal's output because it writes < > & U+2028 U+2029 as six bytes each, so the code-point limit alone does
// not bound the line.
func messageRequest(version int, root, path, key, text string) (map[string]any, *Error) {
	if !handoffCanvasPath.MatchString(path) {
		return nil, usageError("Expected .doan/canvases/*.html: " + path)
	}
	request := map[string]any{"v": version, "root": root, "handoff": key, "path": path, "text": text}
	encoded, err := json.Marshal(request)
	if err != nil {
		return nil, internal(err)
	}
	if len(encoded) > handoffLineMax {
		return nil, usageError("--message is too long to send to Doan; shorten it")
	}
	return request, nil
}

// handoffFailure and sendFailure build guidance in Go per code; the app's own wording is not reused.
func handoffFailure(code, message string) *Error { return messageFailure("handoff", code, message) }

func messageFailure(command, code, message string) *Error {
	ctl := "`doan " + command + "`"
	ready := "tell the user the canvas is ready to open in Doan"
	once := "hand off each other canvas once"
	other := "Hand off only to another canvas, not this conversation's own canvas"
	notApp := ctl + " works only in a conversation in the Doan app; tell the user to open the canvas in Doan and start a conversation there"
	missing := "Write the canvas first, then run " + ctl + " with its path; check the path with `doan ls`"
	if command == "send" {
		ready = "tell the user what you meant to send"
		once = "send to each other canvas once"
		other = "Send only to another canvas, not this conversation's own canvas"
		notApp = ctl + " works only in a conversation in the Doan app; tell the user what you meant to send"
		missing = ctl + " sends to a canvas that exists; check the path with `doan ls`"
	}
	steps := map[string][]string{
		"app_not_running":         unreachableSteps(ctl),
		"app_protocol_mismatch":   {"Ask the user to update Doan and the doan CLI to matching versions"},
		"project_not_open":        notOpenSteps(""),
		"canvas_not_found":        {missing},
		"not_app_conversation":    {notApp},
		"root_mismatch":           {"Run " + ctl + " from the conversation's working directory without --repo"},
		"not_running":             {"Run " + ctl + " only during a running turn; " + ready},
		"not_canvas_conversation": {"Only a canvas conversation can do this; " + ready},
		"plan_mode":               {"A conversation in Plan mode cannot " + command + "; " + ready},
		"handoff_turn":            {"A turn started by a handoff cannot hand off again; " + ready},
		"already_requested":       {"This turn already requested a " + command + " to this canvas; " + once},
		"same_canvas":             {other},
		"chain_one":               {"A turn that received a message makes one request; do not send or hand off again from this turn; " + ready},
		"chain_limit":             {"This conversation is the fifth in a chain of messages, which stops there; do not send or hand off from it; " + ready},
	}[code]
	return &Error{Code: code, Message: message, NextSteps: steps}
}

// handoffReply turns one v5 reply line into the command result. Any numeric v other than 5, including an older
// app's v1 bad_request for a version it does not know, is another protocol.
func handoffReply(line []byte, root, path string) (map[string]any, *Error) {
	return messageReply(5, formats.ValidateHandoffResponse, handoffFailure, "handoff", line, root, path)
}

// messageReply turns one reply line of the given protocol version into the command result.
func messageReply(version int, validate func(any) error, fail func(code, message string) *Error, noun string, line []byte, root, path string) (map[string]any, *Error) {
	decoder := json.NewDecoder(bytes.NewReader(line))
	decoder.UseNumber()
	var value, extra any
	if decoder.Decode(&value) != nil || decoder.Decode(&extra) != io.EOF {
		return nil, internal(errors.New("Doan sent a response that is not one JSON value"))
	}
	obj, ok := value.(map[string]any)
	if !ok {
		return nil, internal(errors.New("Doan sent a response that is not a JSON object"))
	}
	if n, ok := obj["v"].(json.Number); ok {
		if v, err := n.Float64(); err != nil || v != float64(version) {
			return nil, fail("app_protocol_mismatch", "Doan answered with another protocol version")
		}
		obj["v"] = float64(version)
	}
	if validate(obj) != nil {
		return nil, internal(fmt.Errorf("Doan sent a response that does not match app-socket v%d", version))
	}
	if obj["ok"] == true {
		return map[string]any{"requested": true, "canvas": path}, nil
	}
	switch code := obj["error"].(map[string]any)["code"].(string); code {
	case "bad_token":
		// The runtime file outlived the app that wrote it; a new app has another token.
		return nil, fail("app_not_running", "Doan rejected the token in its runtime file")
	case "bad_request":
		return nil, internal(errors.New("Doan rejected the " + noun + " request as malformed"))
	default:
		return nil, fail(code, map[string]string{
			"project_not_open":        notOpenMessage(root),
			"not_app_conversation":    "Doan does not know this conversation",
			"root_mismatch":           "This project is not the conversation's project",
			"not_running":             "The conversation has no running turn",
			"not_canvas_conversation": "This conversation is not a canvas conversation",
			"plan_mode":               "The conversation is in Plan mode",
			"handoff_turn":            "This turn was started by a handoff",
			"already_requested":       "This turn already requested a " + noun + " to this canvas",
			"same_canvas":             path + " is this conversation's own canvas",
			"chain_one":               "This turn received a message and already made its one request",
			"chain_limit":             "This conversation is the fifth in a chain of messages",
		}[code])
	}
}

// messageCommand is what handoff and send share, from arguments to the app's reply: the checks that need no app
// come first, so a terminal agent is refused at once and a bad message never reaches the socket.
type messageCommand struct {
	name    string // handoff or send
	version int
	request func(root, path, key, text string) (map[string]any, *Error)
	fail    func(code, message string) *Error
	reply   func(line []byte, root, path string) (map[string]any, *Error)
	done    func(path string) string
}

func (c messageCommand) run(ctx Context, f Flags, args []string) (Outcome, *Error) {
	if len(args) != 1 {
		return Outcome{}, usageError("Expected " + c.name + " <canvas path> --message <text|->")
	}
	if !f.Given["message"] {
		return Outcome{}, usageError(c.name + " needs --message <text>, or --message - to read it from stdin")
	}
	// Checked before stdin is read, so a terminal agent is refused at once instead of waiting on its input.
	if ctx.Handoff == "" {
		return Outcome{}, c.fail("not_app_conversation", "This shell is not in a Doan app conversation")
	}
	raw := f.Message
	if raw == "-" {
		data, err := io.ReadAll(io.LimitReader(ctx.Input, socketLineLimit+1))
		if err != nil {
			return Outcome{}, internal(err)
		}
		// Past the line limit nothing could be sent, so stdin is not read further.
		if len(data) > socketLineLimit {
			return Outcome{}, usageError("The message on stdin is longer than 64 KiB")
		}
		raw = string(data)
	}
	text, failure := handoffText(raw)
	if failure != nil {
		return Outcome{}, failure
	}
	r, failure := repository(ctx, f)
	if failure != nil {
		return Outcome{}, failure
	}
	resolved, err := workTarget(r.Root, args[0])
	if err != nil {
		return Outcome{}, usageError(err.Error())
	}
	if !handoffCanvasPath.MatchString(resolved) {
		return Outcome{}, usageError("Expected .doan/canvases/*.html: " + resolved)
	}
	// workTarget accepts a canvas that does not exist yet; the agent addresses only a canvas that is written.
	if _, err := os.Stat(filepath.Join(r.Root, filepath.FromSlash(resolved))); os.IsNotExist(err) {
		return Outcome{}, c.fail("canvas_not_found", "No canvas at "+resolved)
	} else if err != nil {
		return Outcome{}, internal(err)
	}
	request, failure := c.request(r.Root, resolved, ctx.Handoff, text)
	if failure != nil {
		return Outcome{}, failure
	}
	line, _, failure, _ := exchange(ctx, request, ctx.Now().Add(activeTimeout), c.fail)
	if failure != nil {
		return Outcome{}, failure
	}
	reply, failure := c.reply(line, r.Root, resolved)
	if failure != nil {
		return Outcome{}, failure
	}
	return Outcome{Result: reply, Text: c.done(resolved)}, nil
}
