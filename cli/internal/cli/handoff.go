package cli

import (
	"io"
	"os"
	"path/filepath"
)

// Handoff asks the running Doan to continue this app conversation's work in a new conversation on a new canvas
// once the current turn ends. Unlike open it never starts the app: only a running app conversation can ask.
func Handoff(ctx Context, f Flags, args []string) (Outcome, *Error) {
	if len(args) != 1 {
		return Outcome{}, usageError("Expected handoff <canvas path> --message <text|->")
	}
	if !f.Given["message"] {
		return Outcome{}, usageError("handoff needs --message <text>, or --message - to read it from stdin")
	}
	// Checked before stdin is read, so a terminal agent is refused at once instead of waiting on its input.
	if ctx.Handoff == "" {
		return Outcome{}, handoffFailure("not_app_conversation", "This shell is not in a Doan app conversation")
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
	// workTarget accepts a canvas that does not exist yet; the agent hands off only a canvas it has written.
	if _, err := os.Stat(filepath.Join(r.Root, filepath.FromSlash(resolved))); os.IsNotExist(err) {
		return Outcome{}, handoffFailure("canvas_not_found", "No canvas at "+resolved)
	} else if err != nil {
		return Outcome{}, internal(err)
	}
	request, failure := handoffRequest(r.Root, resolved, ctx.Handoff, text)
	if failure != nil {
		return Outcome{}, failure
	}
	line, _, failure, _ := exchange(ctx, request, ctx.Now().Add(activeTimeout), handoffFailure)
	if failure != nil {
		return Outcome{}, failure
	}
	reply, failure := handoffReply(line, resolved)
	if failure != nil {
		return Outcome{}, failure
	}
	return Outcome{Result: reply, Text: "Requested a handoff to " + resolved + "; Doan starts a new conversation there when this turn ends"}, nil
}
