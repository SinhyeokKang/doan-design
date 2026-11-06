package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

// handoffTextLimit is the text maxLength of app-socket.v5.schema.json, in code points; a test reads the schema.
const handoffTextLimit = 10000

// socketLineLimit is the app's LINE_LIMIT (app/src/main/runtime.ts): request bytes before the newline.
const socketLineLimit = 64 << 10

// handoffLineMax bounds the marshalled request without its token; the headroom covers the token field the
// transport adds, so the app never answers an over-long line with a bad_request the CLI cannot explain.
const handoffLineMax = socketLineLimit - 1024

// v5 is narrower than v4: a handoff starts a conversation on a canvas, and .doan/ds/ pages are not canvases.
var handoffCanvasPath = regexp.MustCompile(`^\.doan/canvases/[^/]+\.html$`)

var handoffKeyPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

// handoffKey applies the schema's key format to DOAN_HANDOFF; anything else is no key.
func handoffKey(value string) string {
	if !handoffKeyPattern.MatchString(value) {
		return ""
	}
	return value
}

// handoffText trims the message and refuses rather than cuts it, so the agent can resend a shorter one.
// The control-character rule is the schema's: only \n and \t are allowed.
func handoffText(raw string) (string, *Error) {
	if !utf8.ValidString(raw) {
		return "", usageError("--message must be UTF-8 text")
	}
	text := strings.TrimSpace(raw)
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

// handoffRequest builds the v5 request without the token. The byte check is on json.Marshal's output because it
// writes < > & U+2028 U+2029 as six bytes each, so the code-point limit alone does not bound the line.
func handoffRequest(root, path, key, text string) (map[string]any, *Error) {
	if !handoffCanvasPath.MatchString(path) {
		return nil, usageError("Expected .doan/canvases/*.html: " + path)
	}
	request := map[string]any{"v": 5, "root": root, "handoff": key, "path": path, "text": text}
	encoded, err := json.Marshal(request)
	if err != nil {
		return nil, internal(err)
	}
	if len(encoded) > handoffLineMax {
		return nil, usageError("--message is too long to send to Doan; shorten it")
	}
	return request, nil
}

// handoffFailure builds guidance in Go per code; the app's own wording is not reused.
func handoffFailure(code, message string) *Error {
	ready := "tell the user the new canvas is ready to open in Doan"
	steps := map[string][]string{
		"app_not_running":         unreachableSteps("`doan handoff`"),
		"app_protocol_mismatch":   {"Ask the user to update Doan and the doan CLI to matching versions"},
		"project_not_open":        {"Tell the user which folder Doan does not have open and ask them to add it in Doan (Add Projects)"},
		"canvas_not_found":        {"Write the canvas first, then run `doan handoff` with its path; check the path with `doan ls`"},
		"not_app_conversation":    {"`doan handoff` works only in a canvas conversation in the Doan app; tell the user to open the new canvas in Doan and start a conversation there"},
		"root_mismatch":           {"Run `doan handoff` from the conversation's working directory without --repo"},
		"not_running":             {"Run `doan handoff` only during the turn that made the canvas; " + ready},
		"not_canvas_conversation": {"Only a canvas conversation hands off; " + ready},
		"plan_mode":               {"A conversation in Plan mode cannot hand off; " + ready},
		"handoff_turn":            {"A turn started by a handoff cannot hand off again; " + ready},
		"already_requested":       {"This turn already requested a handoff; do not run `doan handoff` again"},
		"same_canvas":             {"Hand off only to a new canvas, not this conversation's own canvas"},
	}[code]
	return &Error{Code: code, Message: message, NextSteps: steps}
}

// handoffReply turns one v5 reply line into the command result. Any numeric v other than 5, including an older
// app's v1 bad_request for a version it does not know, is another protocol.
func handoffReply(line []byte, path string) (map[string]any, *Error) {
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
		if v, err := n.Float64(); err != nil || v != 5 {
			return nil, handoffFailure("app_protocol_mismatch", "Doan answered with another protocol version")
		}
		obj["v"] = float64(5)
	}
	if formats.ValidateHandoffResponse(obj) != nil {
		return nil, internal(errors.New("Doan sent a response that does not match app-socket v5"))
	}
	if obj["ok"] == true {
		return map[string]any{"requested": true, "canvas": path}, nil
	}
	switch code := obj["error"].(map[string]any)["code"].(string); code {
	case "bad_token":
		// The runtime file outlived the app that wrote it; a new app has another token.
		return nil, handoffFailure("app_not_running", "Doan rejected the token in its runtime file")
	case "bad_request":
		return nil, internal(errors.New("Doan rejected the handoff request as malformed"))
	default:
		return nil, handoffFailure(code, map[string]string{
			"project_not_open":        "Doan does not have this project open",
			"not_app_conversation":    "Doan does not know this conversation",
			"root_mismatch":           "This project is not the conversation's project",
			"not_running":             "The conversation has no running turn",
			"not_canvas_conversation": "This conversation is not a canvas conversation",
			"plan_mode":               "The conversation is in Plan mode",
			"handoff_turn":            "This turn was started by a handoff",
			"already_requested":       "This turn already requested a handoff",
			"same_canvas":             path + " is this conversation's own canvas",
		}[code])
	}
}
