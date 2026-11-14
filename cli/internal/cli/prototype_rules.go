package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"path/filepath"
	"strings"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

// prototypeTarget is what a v6 reply is read against: the resolved canvas and the frame the request named.
type prototypeTarget struct {
	root, path, frame string
}

// exportInput takes the positional arguments, -o and every --frame given. --frame and --prototype come
// together: a frame alone has no meaning for a whole-canvas export, and refusing it keeps an agent from
// believing it exported one frame.
func exportInput(args []string, output string, frames []string, prototype bool) (string, *string, *Error) {
	if len(args) != 1 {
		return "", nil, usageError("export takes one canvas path")
	}
	if output == "" {
		return "", nil, usageError("export needs -o <file>")
	}
	if len(frames) > 1 {
		return "", nil, usageError("export takes one --frame")
	}
	if len(frames) == 0 {
		if prototype {
			return "", nil, usageError("--prototype needs --frame <id>")
		}
		return args[0], nil, nil
	}
	if !prototype {
		return "", nil, usageError("--frame needs --prototype in export; leave both out to export the whole canvas")
	}
	if failure := checkFrame(frames[0]); failure != nil {
		return "", nil, failure
	}
	return args[0], &frames[0], nil
}

// prototypeRequest builds the v6 request, without the token, for a canvas path already resolved inside root
// and a frame the file already showed to be marked with mark.
func prototypeRequest(root, resolved, frame, mark string) (map[string]any, *Error) {
	if !workCanvasPath.MatchString(resolved) {
		return nil, usageError("Expected .doan/canvases/*.html or .doan/ds/*.html: " + resolved)
	}
	return map[string]any{"v": 6, "root": root, "path": resolved, "frame": frame, "mark": mark}, nil
}

// prototypeFailure adds the next steps for the codes only a prototype open returns to those of doan open.
func prototypeFailure(code, message string) *Error {
	switch code {
	case "canvas_not_found":
		return &Error{Code: code, Message: message, NextSteps: []string{"Tell the user Doan could not find that canvas; check the path with `doan ls`, and run `doan check` in case two canvases share its id"}}
	case "canvas_unreadable":
		return &Error{Code: code, Message: message, NextSteps: []string{"Run `doan check --json`, fix the canvas, then try again"}}
	}
	return openFailure(code, message)
}

// prototypeFrameFailure is the refusal open and export share for a frame that cannot play.
func prototypeFrameFailure(refusal canvas.PrototypeRefusal, frame, path string) *Error {
	found := []string{"Check the frame id in the canvas file: Doan plays and exports only a frame written there on exactly one `data-doan-frame` element, not one a script adds"}
	switch refusal {
	case canvas.PrototypeShared:
		return &Error{Code: "frame_not_found", Message: "More than one frame has the id " + frame + " in " + path, NextSteps: found}
	case canvas.PrototypeTooLong:
		return &Error{Code: "frame_not_found", Message: "Frame id " + frame + " in " + path + " is longer than 200 UTF-16 units, which Doan cannot play", NextSteps: found}
	case canvas.PrototypeNotMarked:
		return &Error{Code: "not_prototype", Message: "Frame " + frame + " in " + path + " is not marked for prototyping with a valid `data-doan-prototype` size", NextSteps: []string{"Tell the user the frame is not marked for prototyping; add `data-doan-prototype=\"<width>x<height>\"` to it only if they ask"}}
	}
	return &Error{Code: "frame_not_found", Message: "No frame " + frame + " in " + path, NextSteps: found}
}

// prototypeReply turns one v6 reply line into the command result, as openReply does for v4: not_ready comes
// back as a failure with that code, and launchable is true when the runtime file outlived its app.
func prototypeReply(line []byte, target prototypeTarget, secrets []string) (map[string]any, *Error, bool) {
	decoder := json.NewDecoder(bytes.NewReader(line))
	decoder.UseNumber()
	var value, extra any
	if decoder.Decode(&value) != nil || decoder.Decode(&extra) != io.EOF {
		return nil, internal(errors.New("Doan sent a response that is not one JSON value")), false
	}
	obj, ok := value.(map[string]any)
	if !ok {
		return nil, internal(errors.New("Doan sent a response that is not a JSON object")), false
	}
	// Any numeric v other than 6, including an app from before v6 answering with its v1 bad_request, is
	// another protocol.
	if n, ok := obj["v"].(json.Number); ok {
		if v, err := n.Float64(); err != nil || v != 6 {
			return nil, prototypeFailure("app_protocol_mismatch", "Doan answered with another protocol version"), false
		}
		obj["v"] = float64(6)
	}
	if formats.ValidatePrototypeResponse(obj) != nil {
		return nil, internal(errors.New("Doan sent a response that does not match app-socket v6")), false
	}
	if !withoutSecrets(obj, secrets) {
		return nil, internal(errors.New("Doan sent a response that names its runtime token or file")), false
	}
	if obj["ok"] == true {
		return map[string]any{"opened": true, "frame": "found", "prototype": true}, nil, false
	}
	reply := obj["error"].(map[string]any)
	message, _ := reply["message"].(string)
	switch code := reply["code"].(string); code {
	case "bad_token":
		// The runtime file outlived the app that wrote it; a new app has another token.
		return nil, prototypeFailure("app_not_running", "Doan rejected the token in its runtime file"), true
	case "bad_request":
		return nil, internal(errors.New("Doan rejected the request as malformed")), false
	case "not_ready":
		return nil, &Error{Code: "not_ready", Message: "Doan is still starting"}, false
	case "project_not_open":
		return nil, prototypeFailure(code, "Doan does not have the folder "+quoteName(filepath.Base(target.root))+" open"), false
	case "canvas_not_found":
		return nil, prototypeFailure(code, "Doan has no canvas "+target.path+" in "+quoteName(filepath.Base(target.root))), false
	default:
		// busy: the app names what blocks, and its text is the only part that varies.
		if strings.TrimSpace(message) == "" {
			message = "Doan cannot play a prototype right now"
		}
		return nil, prototypeFailure(code, message), false
	}
}
