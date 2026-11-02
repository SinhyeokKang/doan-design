package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

// openFrameMax and the control-character rule below are the frame limits of app-socket.v4.schema.json,
// which the app applies again; keep them in step.
const openFrameMax = 200

// openTarget is what the reply is read against: the resolved canvas the request named.
type openTarget struct {
	root, path string
	frame      *string
}

// openInput takes the positional arguments and every --frame given; --frame may appear once.
func openInput(args, frames []string) (string, *string, *Error) {
	if len(args) != 1 {
		return "", nil, usageError("Expected open <canvas path> [--frame <id>]")
	}
	if len(frames) > 1 {
		return "", nil, usageError("open takes one --frame")
	}
	if len(frames) == 0 {
		return args[0], nil, nil
	}
	if failure := checkFrame(frames[0]); failure != nil {
		return "", nil, failure
	}
	return args[0], &frames[0], nil
}

func checkFrame(frame string) *Error {
	if frame == "" {
		return usageError("--frame needs a frame id; leave it out to open the canvas only")
	}
	if utf8.RuneCountInString(frame) > openFrameMax {
		return usageError("--frame is longer than 200 characters")
	}
	for _, r := range frame {
		if r < 0x20 || r == 0x7f {
			return usageError("--frame must not contain control characters")
		}
	}
	return nil
}

// openRequest builds the v4 request, without the token, for a canvas path already resolved inside root.
func openRequest(root, resolved string, frame *string) (map[string]any, *Error) {
	if !workCanvasPath.MatchString(resolved) {
		return nil, usageError("Expected .doan/canvases/*.html or .doan/ds/*.html: " + resolved)
	}
	request := map[string]any{"v": 4, "root": root, "path": resolved}
	if frame != nil {
		if failure := checkFrame(*frame); failure != nil {
			return nil, failure
		}
		request["frame"] = *frame
	}
	return request, nil
}

// openFailure builds message-adjacent guidance in Go per code; the app's own wording is not reused.
func openFailure(code, message string) *Error {
	steps := map[string][]string{
		"app_not_running":       unreachableSteps("`doan open`"),
		"app_launch_failed":     unreachableSteps("`doan open`"),
		"app_protocol_mismatch": {"Ask the user to update Doan and the doan CLI to matching versions"},
		"project_not_open":      {"Tell the user which folder Doan does not have open and ask them to add it in Doan (Add Projects), then to ask again"},
		"canvas_not_found":      {"Tell the user Doan could not find that canvas; check the path with `doan ls`"},
		"busy":                  {"Tell the user what Doan is waiting for (see the message) and ask them to finish it; run `doan open` again only when they ask again"},
	}[code]
	return &Error{Code: code, Message: message, NextSteps: steps}
}

// openReply turns one v4 reply line into the command result. not_ready comes back as a failure with that
// code: it is the signal to ask again, and never reaches the caller of the command. launchable is true when
// the reply means the runtime file outlived its app.
func openReply(line []byte, target openTarget, secrets []string) (map[string]any, *Error, bool) {
	obj, mismatch, e := decodeOpenReply(line)
	if e != nil {
		return nil, internal(e), false
	}
	if mismatch {
		return nil, openFailure("app_protocol_mismatch", "Doan answered with another protocol version"), false
	}
	if formats.ValidateOpenResponse(obj) != nil {
		return nil, internal(errors.New("Doan sent a response that does not match app-socket v4")), false
	}
	if !withoutSecrets(obj, secrets) {
		return nil, internal(errors.New("Doan sent a response that names its runtime token or file")), false
	}
	if obj["ok"] == true {
		return map[string]any{"opened": true, "frame": obj["frame"]}, nil, false
	}
	reply := obj["error"].(map[string]any)
	message, _ := reply["message"].(string)
	switch code := reply["code"].(string); code {
	case "bad_token":
		// The runtime file outlived the app that wrote it; a new app has another token.
		return nil, openFailure("app_not_running", "Doan rejected the token in its runtime file"), true
	case "bad_request":
		return nil, internal(errors.New("Doan rejected the request as malformed")), false
	case "not_ready":
		return nil, &Error{Code: "not_ready", Message: "Doan is still starting"}, false
	case "project_not_open":
		return nil, openFailure(code, "Doan does not have the folder "+quoteName(filepath.Base(target.root))+" open"), false
	case "canvas_not_found":
		return nil, openFailure(code, "Doan has no canvas "+target.path+" in "+quoteName(filepath.Base(target.root))), false
	default:
		// busy: the app names what blocks, and its text is the only part that varies.
		if strings.TrimSpace(message) == "" {
			message = "Doan cannot open a canvas right now"
		}
		return nil, openFailure(code, message), false
	}
}

func quoteName(s string) string { return `"` + s + `"` }

// decodeOpenReply reads exactly one JSON object; any numeric v other than 4, including an older app's v1
// bad_request, is another protocol.
func decodeOpenReply(line []byte) (obj map[string]any, mismatch bool, err error) {
	decoder := json.NewDecoder(bytes.NewReader(line))
	decoder.UseNumber()
	var value, extra any
	if decoder.Decode(&value) != nil || decoder.Decode(&extra) != io.EOF {
		return nil, false, errors.New("Doan sent a response that is not one JSON value")
	}
	obj, ok := value.(map[string]any)
	if !ok {
		return nil, false, errors.New("Doan sent a response that is not a JSON object")
	}
	if n, ok := obj["v"].(json.Number); ok {
		if v, e := n.Float64(); e != nil || v != 4 {
			return obj, true, nil
		}
		obj["v"] = float64(4)
	}
	return obj, false, nil
}
