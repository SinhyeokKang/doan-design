package cli

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

var workCanvasPath = regexp.MustCompile(`^\.doan/(canvases|ds)/[^/]+\.html$`)

func workTarget(root, path string) (string, error) {
	if path == "" {
		return "", fmt.Errorf("expected a canvas path")
	}
	candidate := path
	if !filepath.IsAbs(candidate) {
		candidate = filepath.Join(root, candidate)
	} else {
		// Canonicalize only the root alias here so canvas-directory spelling
		// still passes the lexical check before any in-repo links are followed.
		for ancestor := filepath.Dir(candidate); ; ancestor = filepath.Dir(ancestor) {
			real, err := filepath.EvalSymlinks(ancestor)
			if err == nil && real == root {
				suffix, err := filepath.Rel(ancestor, candidate)
				if err != nil {
					return "", err
				}
				candidate = filepath.Join(root, suffix)
				break
			}
			if filepath.Dir(ancestor) == ancestor {
				break
			}
		}
	}
	relative, err := filepath.Rel(root, candidate)
	if err != nil {
		return "", err
	}
	if !workCanvasPath.MatchString(filepath.ToSlash(relative)) {
		return "", fmt.Errorf("expected .doan/canvases/*.html or .doan/ds/*.html: %s", path)
	}
	// Resolve the nearest existing ancestor before appending missing components;
	// a dangling symlink must not be mistaken for a not-yet-created canvas.
	ancestor := candidate
	missing := []string{}
	for {
		info, e := os.Lstat(ancestor)
		if e == nil {
			if len(missing) == 0 && info.IsDir() {
				return "", fmt.Errorf("canvas is a directory: %s", path)
			}
			break
		}
		if !os.IsNotExist(e) {
			return "", e
		}
		missing = append(missing, filepath.Base(ancestor))
		parent := filepath.Dir(ancestor)
		if parent == ancestor {
			return "", e
		}
		ancestor = parent
	}
	ancestorRel, err := filepath.Rel(root, ancestor)
	if err != nil {
		return "", err
	}
	state, resolved, err := repo.Resolve(root, root, ancestorRel)
	if err != nil {
		return "", err
	}
	if state != repo.Inside {
		return "", fmt.Errorf("canvas path cannot be resolved inside the repository: %s", path)
	}
	info, err := os.Stat(filepath.Join(root, resolved))
	if err != nil {
		return "", err
	}
	if (len(missing) > 0 && !info.IsDir()) || (len(missing) == 0 && !info.Mode().IsRegular()) {
		return "", fmt.Errorf("expected a regular canvas file or directory parent: %s", path)
	}
	for i := len(missing) - 1; i >= 0; i-- {
		resolved = filepath.Join(resolved, missing[i])
	}
	resolved = filepath.ToSlash(resolved)
	if !workCanvasPath.MatchString(resolved) {
		return "", fmt.Errorf("resolved path is outside the canvas directories: %s", path)
	}
	return resolved, nil
}

func workSession(claude, thread, legacy string) (provider, id string) {
	if (claude != "" && (thread != "" || legacy != "")) || (thread != "" && legacy != "" && thread != legacy) {
		return "", ""
	}
	provider, id = "claude", claude
	if id == "" {
		provider, id = "codex", thread
		if id == "" {
			id = legacy
		}
	}
	if id == "" || strings.HasPrefix(id, "-") || strings.ContainsRune(id, 0) {
		return "", ""
	}
	return provider, id
}

func readWorkResponse(line []byte) bool {
	var value any
	if json.Unmarshal(line, &value) != nil || formats.ValidateWorkResponse(value) != nil {
		return false
	}
	return value.(map[string]any)["ok"] == true
}

func canvasLink(root, path string) string {
	encode := func(value string) string { return strings.ReplaceAll(url.QueryEscape(value), "+", "%20") }
	return "doan://open?root=" + encode(root) + "&canvas=" + encode(path)
}

// workNoteMax and the excluded characters below are the note limits of app-socket.v3.schema.json,
// which the app applies again; keep them in step. Lengths are code points.
const workNoteMax = 120

// workUpdateArgs checks work update's arguments after run.go parsed the flags. --frame may appear once.
// A note is rejected rather than cut so the agent can resend it and a cut cannot change its meaning.
func workUpdateArgs(positional, frames []string, rawNote string) (path, frame, note string, failure *Error) {
	if len(positional) != 1 {
		return "", "", "", usageError("work update takes one canvas path")
	}
	if len(frames) > 1 {
		return "", "", "", usageError("work update takes one --frame")
	}
	if len(frames) == 1 {
		if frames[0] == "" {
			return "", "", "", usageError("--frame needs a frame id; leave it out when no frame is being edited")
		}
		if failure := checkFrame(frames[0]); failure != nil {
			return "", "", "", failure
		}
		frame = frames[0]
	}
	// Checked before trimming so a trailing newline is an error, not silently dropped.
	for _, r := range rawNote {
		if unicode.IsControl(r) || r == '\u2028' || r == '\u2029' {
			return "", "", "", usageError("--note must be one line without control characters")
		}
	}
	note = strings.TrimSpace(rawNote)
	if utf8.RuneCountInString(note) > workNoteMax {
		return "", "", "", usageError("--note is longer than 120 characters")
	}
	return positional[0], frame, note, nil
}

// workIdentity says who a work signal is from: a terminal session (possibly anonymous) or,
// inside an app conversation, that conversation.
type workIdentity struct {
	provider, session, conversation string
	app                             bool
}

// workRequest builds the v3 request without the token. Inside an app conversation the app already
// tracks the turn, so only update is sent, and only with the conversation id.
func workRequest(action, root, path, frame, note string, id workIdentity) (map[string]any, bool) {
	request := map[string]any{"v": 3, "action": action, "root": root}
	if action != "done" {
		request["path"] = path
	}
	if action == "update" {
		if frame != "" {
			request["frame"] = frame
		}
		if note != "" {
			request["note"] = note
		}
	}
	if id.app {
		if action != "update" || id.conversation == "" {
			return nil, false
		}
		request["conversation"] = id.conversation
		return request, true
	}
	if id.session != "" {
		request["session"] = id.session
		request["provider"] = id.provider
	}
	return request, true
}

// conversationID applies the session id contract to DOAN_CONVERSATION_ID; an invalid id sends nothing.
func conversationID(value string) string {
	if value == "" || strings.HasPrefix(value, "-") || strings.ContainsRune(value, 0) {
		return ""
	}
	return value
}
