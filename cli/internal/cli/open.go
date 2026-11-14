package cli

import (
	"os"
	"path/filepath"
	"time"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/export"
)

// Open asks the running Doan to open a canvas, and a frame in it. It is the one command besides
// `onboarding start` that may open the app, through the same bootstrap.
func Open(ctx Context, f Flags, args []string) (Outcome, *Error) {
	arg, frame, failure := openInput(args, f.Frames, f.Prototype)
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
	stored, err := os.Stat(filepath.Join(r.Root, filepath.FromSlash(resolved)))
	if os.IsNotExist(err) {
		return Outcome{}, openFailure("canvas_not_found", "No canvas at "+resolved)
	} else if err != nil {
		return Outcome{}, internal(err)
	}
	if f.Prototype {
		return openPrototype(ctx, r.Root, resolved, stored.Size(), *frame)
	}
	request, failure := openRequest(r.Root, resolved, frame)
	if failure != nil {
		return Outcome{}, failure
	}
	target := openTarget{root: r.Root, path: resolved, frame: frame}
	reply, failure := bootstrap(ctx, false, openFailure, func(deadline time.Time) (map[string]any, *Error, bool) {
		return callOpen(ctx, request, target, deadline)
	})
	if failure != nil {
		return Outcome{}, stillOpening(failure)
	}
	return Outcome{Result: reply, Text: openText(resolved, frame, reply["frame"].(string))}, nil
}

// openPrototype judges the frame from the file before asking the app, so a frame that cannot play never reaches
// it, then plays it over v6. The board width is not read: playing does not need it.
func openPrototype(ctx Context, root, resolved string, size int64, frame string) (Outcome, *Error) {
	if size > export.MaxBytes {
		return Outcome{}, prototypeFailure("canvas_unreadable", "The canvas "+resolved+" is over "+export.FormatSize(export.MaxBytes))
	}
	src, err := export.ReadFile(root, resolved)
	if os.IsNotExist(err) {
		return Outcome{}, openFailure("canvas_not_found", "No canvas at "+resolved)
	} else if err != nil {
		return Outcome{}, prototypeFailure("canvas_unreadable", "Doan could not read the canvas "+resolved)
	}
	model, err := canvas.Parse(resolved, src)
	if err != nil {
		return Outcome{}, prototypeFailure("canvas_unreadable", "Doan could not parse the canvas "+resolved)
	}
	played, refusal := canvas.PrototypeTarget(model, frame)
	if refusal != canvas.PrototypeOK {
		return Outcome{}, prototypeFrameFailure(refusal, frame, resolved)
	}
	request, failure := prototypeRequest(root, resolved, played.ID, played.Size)
	if failure != nil {
		return Outcome{}, failure
	}
	target := prototypeTarget{root: root, path: resolved, frame: frame}
	reply, failure := bootstrap(ctx, false, prototypeFailure, func(deadline time.Time) (map[string]any, *Error, bool) {
		line, token, failure, launchable := exchange(ctx, request, deadline, prototypeFailure)
		if failure != nil {
			return nil, failure, launchable
		}
		return prototypeReply(line, target, []string{token, ctx.RuntimePath})
	})
	if failure != nil {
		return Outcome{}, stillOpening(failure)
	}
	return Outcome{Result: reply, Text: "Playing " + frame + " from " + resolved + " in Doan’s prototype window"}, nil
}

// stillOpening turns a not_ready that outlasted the bootstrap into busy: the app answered in time but never
// finished starting, so the asker can only try again later.
func stillOpening(failure *Error) *Error {
	if failure.Code == "not_ready" {
		return &Error{Code: "busy", Message: "Doan is still opening", NextSteps: []string{"Tell the user Doan is still opening and ask them to ask again in a moment"}}
	}
	return failure
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
