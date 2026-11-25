package cli

import "encoding/json"

func Work(ctx Context, f Flags, args []string) (Outcome, *Error) {
	if len(args) == 0 || (args[0] != "start" && args[0] != "update" && args[0] != "done") {
		return Outcome{}, usageError("Expected work start <canvas path>, work update <canvas path> or work done [<canvas path>...]")
	}
	action := args[0]
	if action == "start" && len(args) != 2 {
		return Outcome{}, usageError("work start takes one canvas path")
	}
	var frame, note string
	if action == "update" {
		var path string
		var failure *Error
		if path, frame, note, failure = workUpdateArgs(args[1:], f.Frames, f.Note); failure != nil {
			return Outcome{}, failure
		}
		args = []string{action, path}
	}
	r, failure := repository(ctx, f)
	if failure != nil {
		return Outcome{}, failure
	}
	paths := make([]string, 0, len(args)-1)
	skipped := []string{}
	for _, arg := range args[1:] {
		path, err := workTarget(r.Root, arg)
		if err != nil {
			if action != "done" {
				return Outcome{}, usageError(err.Error())
			}
			skipped = append(skipped, arg)
			continue
		}
		paths = append(paths, path)
	}
	result := map[string]any{"delivered": false}
	if action == "done" {
		links := make([]string, 0, len(paths))
		for _, path := range paths {
			links = append(links, canvasLink(r.Root, path))
		}
		result["links"] = links
		result["skipped"] = skipped
	}
	path := ""
	if action != "done" {
		path = paths[0]
	}
	id := workIdentity{provider: ctx.WorkProvider, session: ctx.WorkSession, conversation: ctx.WorkConversation, app: ctx.AppConversation}
	if request, send := workRequest(action, r.Root, path, frame, note, id); send {
		delivered, others := sendWork(ctx, request)
		result["delivered"] = delivered
		// done ends this session's work, so who else is on the file does not matter to the agent.
		if action != "done" && len(others) > 0 {
			result["others"] = others
		}
	}
	return Outcome{Result: result}, nil
}

// Activity is best effort; app failures never block canvas editing or link output.
func sendWork(ctx Context, request map[string]any) (bool, []workOther) {
	data, ok := readRuntimeBytes(ctx.RuntimePath)
	if !ok {
		return false, nil
	}
	rt, code := readRuntime(data)
	if code != "" {
		return false, nil
	}
	deadline := ctx.Now().Add(activeTimeout)
	conn, err := ctx.Dial(rt.Socket, deadline)
	if err != nil {
		return false, nil
	}
	defer conn.Close()
	if conn.SetDeadline(deadline) != nil {
		return false, nil
	}
	request["token"] = rt.Token
	data, err = json.Marshal(request)
	if err != nil {
		return false, nil
	}
	data = append(data, '\n')
	n, err := conn.Write(data)
	if err != nil || n != len(data) {
		return false, nil
	}
	line, failure := readLine(conn)
	if failure != nil || len(line) > maxResponseLine {
		return false, nil
	}
	return readWorkResponse(line)
}
