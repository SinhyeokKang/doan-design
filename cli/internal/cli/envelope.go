package cli

type Error struct {
	Code      string   `json:"code"`
	Message   string   `json:"message"`
	NextSteps []string `json:"nextSteps"`
}

func (e *Error) Error() string { return e.Message }

func Envelope(result any, failure *Error) map[string]any {
	if failure == nil {
		return map[string]any{"v": 1, "ok": true, "result": result}
	}
	normalized := *failure
	if normalized.NextSteps == nil {
		normalized.NextSteps = []string{}
	}
	return map[string]any{"v": 1, "ok": false, "error": normalized}
}

func ExitCode(code string) int {
	switch code {
	case "usage_error", "repo_not_found", "invalid_config", "unsupported_version", "comment_not_found", "canvas_not_found":
		return 2
	case "app_not_running", "app_protocol_mismatch", "project_not_open":
		return 3
	default:
		return 1
	}
}
