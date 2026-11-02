package cli

import "encoding/json"

func Work(ctx Context, f Flags, args []string) (Outcome, *Error) {
	if len(args) == 0 || (args[0] != "start" && args[0] != "done") {
		return Outcome{}, usageError("Expected work start <canvas path> or work done [<canvas path>...]")
	}
	action := args[0]
	if action == "start" && len(args) != 2 {
		return Outcome{}, usageError("work start takes one canvas path")
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
			if action == "start" {
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
	if !ctx.AppConversation {
		request := map[string]any{"v": 3, "action": action, "root": r.Root}
		if action == "start" {
			request["path"] = paths[0]
		}
		if ctx.WorkSession != "" {
			request["session"] = ctx.WorkSession
			request["provider"] = ctx.WorkProvider
		}
		result["delivered"] = sendWork(ctx, request)
	}
	return Outcome{Result: result}, nil
}

// Activity is best effort; app failures never block canvas editing or link output.
func sendWork(ctx Context, request map[string]any) bool {
	data, ok := readRuntimeBytes(ctx.RuntimePath)
	if !ok {
		return false
	}
	rt, code := readRuntime(data)
	if code != "" {
		return false
	}
	deadline := ctx.Now().Add(activeTimeout)
	conn, err := ctx.Dial(rt.Socket, deadline)
	if err != nil {
		return false
	}
	defer conn.Close()
	if conn.SetDeadline(deadline) != nil {
		return false
	}
	request["token"] = rt.Token
	data, err = json.Marshal(request)
	if err != nil {
		return false
	}
	data = append(data, '\n')
	n, err := conn.Write(data)
	if err != nil || n != len(data) {
		return false
	}
	line, failure := readLine(conn)
	return failure == nil && len(line) <= maxResponseLine && readWorkResponse(line)
}
