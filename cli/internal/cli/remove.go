package cli

// Remove asks the running Doan to take this folder's project group out of its list, as Remove from Doan does. Like
// active and handoff it never starts the app, and it never writes userData itself: the app judges and removes.
func Remove(ctx Context, f Flags, args []string) (Outcome, *Error) {
	if len(args) != 0 {
		return Outcome{}, usageError("remove takes no positional arguments")
	}
	r, failure := repository(ctx, f)
	if failure != nil {
		// The app lists these as Not set up or Config error (a newer config version included).
		if failure.Code == "repo_not_found" || failure.Code == "invalid_config" || failure.Code == "unsupported_version" {
			failure.NextSteps = problemRootSteps
		}
		return Outcome{}, failure
	}
	line, token, failure, _ := exchange(ctx, removeRequest(r.Root), ctx.Now().Add(activeTimeout), removeFailure)
	if failure != nil {
		return Outcome{}, failure
	}
	reply, failure := removeReply(line, r.Root, []string{token, ctx.RuntimePath})
	if failure != nil {
		return Outcome{}, failure
	}
	return Outcome{Result: reply, Text: removeText(reply["project"].(string), reply["roots"].([]string))}, nil
}
