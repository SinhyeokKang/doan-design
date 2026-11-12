package cli

type Error struct {
	Code      string   `json:"code"`
	Message   string   `json:"message"`
	NextSteps []string `json:"nextSteps"`
	// Config names the config file a failure is about, absolute because a
	// discovered parent config lies outside any --repo; JSON output only.
	Config string `json:"config,omitempty"`
	// StorageReason is "not_git" only on ls's repo_not_found for a folder in no Git repository, so the app can plan
	// the repository Keep out of Git would create before Set Up.
	StorageReason string `json:"storageReason,omitempty"`
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
	case "usage_error", "repo_not_found", "invalid_config", "unsupported_version", "canvas_not_found",
		"invalid_url", "path_unavailable", "not_candidate", "initialize_required", "request_conflict", "operation_not_found", "inspection_stale", "destination_exists",
		"export_refused", "export_too_large", "not_app_conversation", "root_mismatch", "git_init_failed":
		return 2
	case "app_not_running", "app_protocol_mismatch", "project_not_open", "app_launch_failed", "session_stale":
		return 3
	// Onboarding refusals and failed operations that the user or the app must resolve.
	case "busy", "stop_required", "not_owner", "not_connected", "sign_out_failed", "auth_unavailable", "no_ready_agent", "no_project", "cancelled",
		"sign_in_failed", "network", "storage_failed", "check_failed", "account_mismatch", "cli_install_failed", "repository_unreachable", "git_missing",
		"remote_mismatch", "clone_failed", "cleanup_failed", "config_invalid", "init_failed", "local_not_git", "local_exclude_failed", "project_unavailable", "project_unreadable", "completion_save_failed", "completion_unsupported_version",
		// Handoff refusals the conversation's state decides.
		"not_running", "not_canvas_conversation", "plan_mode", "handoff_turn", "already_requested", "same_canvas":
		return 5
	default:
		return 1
	}
}
