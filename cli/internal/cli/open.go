package cli

import (
	"os"
	"path/filepath"
	"time"
)

// Open asks the running Doan to open a canvas, and a frame in it. It is the one command besides
// `onboarding start` that may open the app, through the same bootstrap.
func Open(ctx Context, f Flags, args []string) (Outcome, *Error) {
	arg, frame, failure := openInput(args, f.Frames)
	if failure != nil {
		return Outcome{}, failure
	}
	r, failure := repository(ctx, f)
	if failure != nil {
		return Outcome{}, failure
	}
	resolved, err := workTarget(r.Root, arg)
	if err != nil {
		return Outcome{}, usageError(err.Error())
	}
	// workTarget accepts a canvas that does not exist yet (work start); opening one has nothing to show.
	if _, err := os.Stat(filepath.Join(r.Root, filepath.FromSlash(resolved))); os.IsNotExist(err) {
		return Outcome{}, openFailure("canvas_not_found", "No canvas at "+resolved)
	} else if err != nil {
		return Outcome{}, internal(err)
	}
	request, failure := openRequest(r.Root, resolved, frame)
	if failure != nil {
		return Outcome{}, failure
	}
	target := openTarget{root: r.Root, path: resolved, frame: frame}
	reply, failure := bootstrap(ctx, openFailure, func(deadline time.Time) (map[string]any, *Error, bool) {
		return callOpen(ctx, request, target, deadline)
	})
	if failure != nil {
		if failure.Code == "not_ready" {
			// The app answered in time but never finished starting; the asker can only try again later.
			return Outcome{}, &Error{Code: "busy", Message: "Doan is still opening", NextSteps: []string{"Tell the user Doan is still opening and ask them to ask again in a moment"}}
		}
		return Outcome{}, failure
	}
	return Outcome{Result: reply, Text: openText(resolved, frame, reply["frame"].(string))}, nil
}

// callOpen sends one v4 request and returns the validated reply; launchable is as for callOnboarding.
func callOpen(ctx Context, request map[string]any, target openTarget, deadline time.Time) (map[string]any, *Error, bool) {
	line, token, failure, launchable := exchange(ctx, request, deadline, openFailure)
	if failure != nil {
		return nil, failure, launchable
	}
	return openReply(line, target, []string{token, ctx.RuntimePath})
}

// openText is the line a person sees without --json.
func openText(path string, frame *string, found string) string {
	switch found {
	case "found":
		return "Opened " + path + " in Doan at frame " + *frame
	case "missing":
		return "Opened " + path + " in Doan; frame " + *frame + " was not found"
	}
	return "Opened " + path + " in Doan"
}
