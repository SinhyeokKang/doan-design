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
	case "usage_error", "repo_not_found", "invalid_config", "unsupported_version", "comment_not_found", "canvas_not_found",
		"invalid_url", "path_unavailable", "not_candidate", "initialize_required", "request_conflict", "operation_not_found", "inspection_stale", "destination_exists":
		return 2
	case "app_not_running", "app_protocol_mismatch", "project_not_open", "app_launch_failed", "session_stale":
		return 3
	// Onboarding refusals and failed operations that the user or the app must resolve.
	case "busy", "stop_required", "not_owner", "not_connected", "sign_out_failed", "auth_unavailable", "no_ready_agent", "no_project", "cancelled",
		"sign_in_failed", "network", "storage_failed", "check_failed", "account_mismatch", "cli_install_failed", "repository_unreachable", "git_missing",
		"remote_mismatch", "clone_failed", "cleanup_failed", "config_invalid", "init_failed", "project_unavailable", "completion_save_failed", "completion_unsupported_version":
		return 5
	default:
		return 1
	}
}
