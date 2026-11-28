package cli

import "github.com/SinhyeokKang/doan-design/cli/internal/formats"

// sendRequest builds the v8 request without the token; its text, path and line rules are the handoff's.
func sendRequest(root, path, key, text string) (map[string]any, *Error) {
	return messageRequest(8, root, path, key, text)
}

func sendFailure(code, message string) *Error { return messageFailure("send", code, message) }

// sendReply turns one v8 reply line into the command result. Any numeric v other than 8, including an earlier
// app's v1 bad_request for a version it does not know, is another protocol.
func sendReply(line []byte, root, path string) (map[string]any, *Error) {
	return messageReply(8, formats.ValidateSendResponse, sendFailure, "message", line, root, path)
}
