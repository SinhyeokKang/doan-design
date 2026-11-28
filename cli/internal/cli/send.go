package cli

// Send asks the running Doan to deliver a message to the latest conversation on an existing canvas once this app
// conversation's turn ends. Like handoff it never starts the app: only a running app conversation can ask.
func Send(ctx Context, f Flags, args []string) (Outcome, *Error) {
	return messageCommand{
		name:    "send",
		version: 8,
		request: sendRequest,
		fail:    sendFailure,
		reply:   sendReply,
		done: func(path string) string {
			return "Requested a message to " + path + "; Doan sends it when this turn ends"
		},
	}.run(ctx, f, args)
}
