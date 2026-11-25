package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"slices"
	"strings"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

// removeRequest builds the v7 request without the token, which exchange adds.
func removeRequest(root string) map[string]any {
	return map[string]any{"v": 7, "root": root}
}

// problemRootSteps replaces doan init's guidance for remove: a folder Doan lists as Not set up or Config error is
// taken out in the app, and setting it up only to remove it would write files the user did not ask for.
var problemRootSteps = []string{"If Doan lists this folder as Not set up or Config error, ask the user to use Remove from Doan in the app; do not run `doan init` here"}

// removeFailure builds guidance in Go per code; only busy keeps the app's message (see removeReply).
func removeFailure(code, message string) *Error {
	steps := map[string][]string{
		"app_not_running":       unreachableSteps("`doan remove`"),
		"app_protocol_mismatch": {"Ask the user to update Doan and the doan CLI to matching versions"},
		"conversation_running":  {"Tell the user a conversation is still running in this project in Doan; nothing was removed. Run `doan remove` again only when they ask again"},
		"busy":                  {"Tell the user what Doan is waiting for (see the message) and ask them to finish it; run `doan remove` again only when they ask again"},
		// Unlike notOpenSteps, adding the folder only to remove it is no recovery.
		"project_not_open": {
			"Tell the user Doan does not have the folder at the path in the message open; nothing was removed",
			"If they say Doan already has a project with this name, ask them to compare its path (Project Settings shows it) with the path in the message: a different path is another checkout or worktree, which they remove with Remove from Doan in the app",
		},
	}[code]
	return &Error{Code: code, Message: message, NextSteps: steps}
}

// removeReply turns one v7 reply line into the command result; any other numeric v, an older app's v1 bad_request
// included, is another protocol. A removal that does not name root removed some other project.
func removeReply(line []byte, root string, secrets []string) (map[string]any, *Error) {
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
		if v, err := n.Float64(); err != nil || v != 7 {
			return nil, removeFailure("app_protocol_mismatch", "Doan answered with another protocol version")
		}
		obj["v"] = float64(7)
	}
	if formats.ValidateRemoveResponse(obj) != nil {
		return nil, internal(errors.New("Doan sent a response that does not match app-socket v7"))
	}
	if !withoutSecrets(obj, secrets) {
		return nil, internal(errors.New("Doan sent a response that names its runtime token or file"))
	}
	if obj["ok"] == true {
		roots := []string{}
		for _, item := range obj["roots"].([]any) {
			roots = append(roots, item.(string))
		}
		if !slices.Contains(roots, root) {
			return nil, internal(errors.New("Doan removed a project that does not hold this folder"))
		}
		return map[string]any{"removed": true, "project": obj["project"], "roots": roots}, nil
	}
	reply := obj["error"].(map[string]any)
	switch code := reply["code"].(string); code {
	case "bad_token":
		// The runtime file outlived the app that wrote it; a new app has another token. A conversation's CLI refuses `doan remove`
		// before dialling (conversation_refused), so a refusal here reads as a stale runtime file.
		return nil, removeFailure("app_not_running", "Doan rejected the token in its runtime file")
	case "bad_request":
		return nil, internal(errors.New("Doan rejected the remove request as malformed"))
	case "project_not_open":
		return nil, removeFailure(code, notOpenMessage(root))
	case "conversation_running":
		return nil, removeFailure(code, "A conversation is running in this project in Doan")
	default:
		// busy: the app names what blocks, and its text is the only part that varies.
		message, _ := reply["message"].(string)
		if strings.TrimSpace(message) == "" {
			message = "Doan cannot remove a project right now"
		}
		return nil, removeFailure(code, message)
	}
}

// removeText is the line a person sees without --json.
func removeText(project string, roots []string) string {
	return "Removed " + project + " from Doan: " + strings.Join(roots, ", ") + ". Files and Git worktrees stay on disk."
}
