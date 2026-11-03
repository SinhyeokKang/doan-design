import { LAUNCHD_PATH } from "./launchEnv";

// Keys recorded from a throwaway bundle opened through LaunchServices with an empty caller environment.
export const DOCK = {
  HOME: "/Users/ada", USER: "ada", LOGNAME: "ada", SHELL: "/bin/zsh", TMPDIR: "/var/folders/x/T/", SSH_AUTH_SOCK: "/var/run/launchd/Listeners",
  COMMAND_MODE: "unix2003", XPC_FLAGS: "0x0", XPC_SERVICE_NAME: "0", OSLogRateLimit: "64", __CF_USER_TEXT_ENCODING: "0x1F5:0x3:0x33",
  __CFBundleIdentifier: "design.doan.app", PATH: LAUNCHD_PATH,
};
export const TERMINAL = {
  ...DOCK, PATH: "/opt/homebrew/bin:/usr/bin:/bin", ORCA_TERMINAL_HANDLE: "term_1", ORCA_AGENT_HOOK_TOKEN: "tok", ORCA_AGENT_HOOK_PORT: "1",
  ORCA_AGENT_HOOK_ENDPOINT: "http://127.0.0.1:1", CLAUDE_CODE_SESSION_ID: "s", CODEX_THREAD_ID: "t", CLAUDE_CONFIG_DIR: "/orca/profile/claude",
  CODEX_HOME: "/orca/profile/codex", TERM_PROGRAM: "Orca", TERM: "xterm-256color", FOO: "bar", UNSET: undefined,
};
// Set with `launchctl setenv`, so a Dock launch has them as well.
export const NETWORK_LOCALE = {
  HTTPS_PROXY: "http://proxy:8080", no_proxy: "localhost", NODE_EXTRA_CA_CERTS: "/etc/ca.pem", SSL_CERT_FILE: "/etc/cert.pem",
  REQUESTS_CA_BUNDLE: "/etc/bundle.pem", CURL_CA_BUNDLE: "/etc/curl.pem", LANG: "ko_KR.UTF-8", LC_ALL: "ko_KR.UTF-8", TZ: "Asia/Seoul",
};
