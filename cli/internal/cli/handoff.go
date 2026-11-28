package cli

// Handoff asks the running Doan to continue this app conversation's work in a new conversation on a canvas once the
// current turn ends. Unlike open it never starts the app: only a running app conversation can ask. Whether the canvas
// may be handed off to is the app's judgement.
func Handoff(ctx Context, f Flags, args []string) (Outcome, *Error) {
	return messageCommand{
		name:    "handoff",
		version: 5,
		request: handoffRequest,
		fail:    handoffFailure,
		reply:   handoffReply,
		done: func(path string) string {
			return "Requested a handoff to " + path + "; Doan starts a new conversation there when this turn ends"
		},
	}.run(ctx, f, args)
}
