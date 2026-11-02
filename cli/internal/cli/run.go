package cli

import (
	"bufio"
	"crypto/rand"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/SinhyeokKang/doan-design/cli/internal/check"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

type Context struct {
	WorkSession, WorkProvider string
	AppConversation           bool
	Session                   *sessionRecording
	Start                     string
	Home                      string
	Terminal                  bool
	Prompt                    func(string) (string, error)
	Now                       func() time.Time
	Random                    io.Reader
	// RuntimePath and Dial reach the app; Run fills them so bodies never read the environment or open sockets.
	RuntimePath string
	Dial        func(socket string, deadline time.Time) (net.Conn, error)
	// RuntimeExplicit, Executable, Launch and Sleep let only onboarding start and open open the app this CLI is bundled in.
	RuntimeExplicit bool
	Executable      func() (string, error)
	Launch          func(bundle string) error
	Sleep           func(time.Duration)
}
type Outcome struct {
	Result any
	Exit   int
	// Text is what a person sees on success without --json; the JSON result is unchanged.
	Text string
}
type Flags struct {
	JSON                          bool
	Repo, TokenCSS, Canvas, Agent string
	TokenCSSSet, CanvasSet        bool
	ClearTokenCSS                 bool
	AddServe, RemoveServe         []string
	// Frames keeps every --frame so a repeated one is an error rather than the last one winning.
	Frames []string

	Session, Operation, Provider, Request, Path, URL, Destination, Inspection string
	SpendCopilotRequest, Initialize                                           bool
	// Given tells an empty flag value from an absent flag.
	Given map[string]bool
}

var Version = "dev"
var kebabID = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
var agentName = regexp.MustCompile(`^[a-z0-9-]+$`)

const usage = `Usage: doan <command> [--repo <path>] [--json]
  init [--token-css <path>]
  config [--token-css <path> | --clear-token-css] [--add-serve <path>]... [--remove-serve <path>]...
  ls
  comments [--canvas <id>]
  comment resolve <cmt_id>... --agent <name>
  check
  active
  work start <canvas path>
  work done [<canvas path>...]
  open <canvas path> [--frame <id>]
  onboarding start
  onboarding status --session <id> [--operation <id>]
  onboarding check --session <id> --provider <id> --request <id> [--spend-copilot-request]
  onboarding sign-in --session <id> --provider <id> --request <id>
  onboarding cancel --session <id> --operation <id> --request <id>
      (cancels only a sign_in or project_clone operation; any other kind returns the target unchanged)
  onboarding project inspect --session <id> (--path <absolute> [--url <github-url>] | --url <github-url> [--destination <absolute>]) --request <id>
  onboarding project select --session <id> --inspection <id> --path <absolute> [--initialize] --request <id>
  onboarding project clone --session <id> --inspection <id> --destination <absolute> --request <id>
  onboarding complete --session <id> --request <id>
  skill
  design-skill [<id>]
  help
`

func internal(err error) *Error { return &Error{Code: "internal_error", Message: err.Error()} }
func usageError(message string) *Error {
	return &Error{Code: "usage_error", Message: message, NextSteps: []string{"Run `doan help`"}}
}
func repository(ctx Context, f Flags) (repo.Repository, *Error) {
	r, e := repo.Find(ctx.Start, f.Repo)
	if e != nil {
		var re *repo.Error
		if errors.As(e, &re) {
			return r, &Error{Code: re.Code, Message: re.Message, NextSteps: []string{"Check --repo and .doan/config.json; run `doan init` to initialize a directory"}}
		}
		return r, internal(e)
	}
	return r, nil
}

// runtimePath is resolved only for active, work, open and onboarding, so a bad DOAN_RUNTIME cannot break file-only commands.
// An e2e or dev app started with --user-data-dir writes runtime.json there, and this variable points the CLI at it.
func runtimePath() (string, *Error) {
	if p := os.Getenv("DOAN_RUNTIME"); p != "" {
		if !filepath.IsAbs(p) {
			return "", usageError("DOAN_RUNTIME must be an absolute path")
		}
		return p, nil
	}
	home, e := os.UserHomeDir()
	if e != nil {
		return "", internal(e)
	}
	return filepath.Join(home, "Library", "Application Support", "doan", "runtime.json"), nil
}

// onboardingRuntime, also used by open, treats a set but empty DOAN_RUNTIME as
// explicit, so it never opens the default app; active keeps reading empty as unset.
func onboardingRuntime() (string, bool, *Error) {
	_, explicit := os.LookupEnv("DOAN_RUNTIME")
	path, failure := runtimePath()
	return path, explicit, failure
}
func Run(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("doan", flag.ContinueOnError)
	var f Flags
	fs.BoolVar(&f.JSON, "json", false, "")
	fs.StringVar(&f.Repo, "repo", "", "")
	fs.StringVar(&f.TokenCSS, "token-css", "", "")
	fs.BoolVar(&f.ClearTokenCSS, "clear-token-css", false, "")
	fs.Func("add-serve", "", func(s string) error { f.AddServe = append(f.AddServe, s); return nil })
	fs.Func("remove-serve", "", func(s string) error { f.RemoveServe = append(f.RemoveServe, s); return nil })
	fs.StringVar(&f.Canvas, "canvas", "", "")
	fs.StringVar(&f.Agent, "agent", "", "")
	fs.Func("frame", "", func(s string) error { f.Frames = append(f.Frames, s); return nil })
	for name, target := range map[string]*string{"session": &f.Session, "operation": &f.Operation, "provider": &f.Provider, "request": &f.Request, "path": &f.Path, "url": &f.URL, "destination": &f.Destination, "inspection": &f.Inspection} {
		fs.StringVar(target, name, "", "")
	}
	fs.BoolVar(&f.SpendCopilotRequest, "spend-copilot-request", false, "")
	fs.BoolVar(&f.Initialize, "initialize", false, "")
	f.Given = map[string]bool{}
	pos, err := SplitArgs(args, fs)
	o := Outcome{}
	var failure *Error
	if errors.Is(err, flag.ErrHelp) {
		o.Result = map[string]any{"usage": usage}
	} else if err != nil {
		if !errors.As(err, &failure) {
			failure = internal(err)
		}
	} else if len(pos) == 0 {
		failure = usageError("A command is required")
	} else {
		cmd := pos[0]
		allowed := map[string]bool{"json": true, "repo": true}
		switch cmd {
		case "config":
			allowed["token-css"] = true
			allowed["clear-token-css"] = true
			allowed["add-serve"] = true
			allowed["remove-serve"] = true
		case "init":
			allowed["token-css"] = true
		case "comments":
			allowed["canvas"] = true
		case "comment":
			allowed["agent"] = true
		case "open":
			allowed["frame"] = true
		case "onboarding":
			// Onboarding takes absolute paths and never searches for a repository.
			allowed = map[string]bool{"json": true}
			for name := range onboardingFlags {
				allowed[name] = true
			}
		}
		fs.Visit(func(v *flag.Flag) {
			f.Given[v.Name] = true
			if v.Name == "token-css" {
				f.TokenCSSSet = true
			}
			if v.Name == "canvas" {
				f.CanvasSet = true
			}
			if !allowed[v.Name] {
				failure = usageError("Flag --" + v.Name + " is not supported by " + cmd)
			}
		})
		if failure == nil {
			if cmd == "help" {
				o.Result = map[string]any{"usage": usage}
			} else {
				start, e := os.Getwd()
				if e != nil {
					failure = internal(e)
				} else {
					ctx := Context{Start: start, Now: time.Now, Random: rand.Reader, Dial: func(socket string, deadline time.Time) (net.Conn, error) {
						return (&net.Dialer{Deadline: deadline}).Dial("unix", socket)
					}, Executable: os.Executable, Launch: launchBundle, Sleep: time.Sleep}
					if home, err := os.UserHomeDir(); err == nil {
						ctx.Home = home
					}
					if file, ok := stdin.(*os.File); ok {
						ctx.Terminal = isTerminal(file)
					}
					reader := bufio.NewReader(stdin)
					ctx.Prompt = func(q string) (string, error) {
						if _, e := fmt.Fprint(stdout, q+" "); e != nil {
							return "", e
						}
						s, e := reader.ReadString('\n')
						if e != nil && e != io.EOF {
							return "", e
						}
						return strings.TrimSuffix(strings.TrimSuffix(s, "\n"), "\r"), nil
					}
					switch cmd {
					case "init":
						o, failure = Init(ctx, f, pos[1:])
					case "config":
						o, failure = Config(ctx, f, pos[1:])
					case "ls":
						o, failure = List(ctx, f, pos[1:])
					case "comments":
						o, failure = Comments(ctx, f, pos[1:])
					case "skill":
						o, failure = Skill(ctx, pos[1:])
					case "design-skill":
						o, failure = DesignSkill(pos[1:])
					case "check":
						ctx.Session = sessionFromEnvironment(ctx.Home)
						o, failure = Check(ctx, f, pos[1:])
					case "work":
						ctx.WorkProvider, ctx.WorkSession = workSession(os.Getenv("CLAUDE_CODE_SESSION_ID"), os.Getenv("CODEX_THREAD_ID"), os.Getenv("CODEX_SESSION_ID"))
						ctx.AppConversation = os.Getenv("DOAN_APP_CONVERSATION") == "1"
						if ctx.RuntimePath, failure = runtimePath(); failure == nil || failure.Code == "internal_error" {
							o, failure = Work(ctx, f, pos[1:])
						}
					case "active":
						if ctx.RuntimePath, failure = runtimePath(); failure == nil {
							o, failure = Active(ctx, f, pos[1:])
						}
					case "onboarding":
						if ctx.RuntimePath, ctx.RuntimeExplicit, failure = onboardingRuntime(); failure == nil {
							o, failure = Onboarding(ctx, f, pos[1:])
						}
					case "open":
						if ctx.RuntimePath, ctx.RuntimeExplicit, failure = onboardingRuntime(); failure == nil {
							o, failure = Open(ctx, f, pos[1:])
						}
					case "comment":
						if len(pos) < 2 || pos[1] != "resolve" {
							failure = usageError("Expected comment resolve")
						} else {
							o, failure = Resolve(ctx, f, pos[2:])
						}
					default:
						failure = usageError("Unknown command: " + cmd)
					}
				}
			}
		}
	}
	return emit(o, failure, f.JSON, stdout, stderr)
}
func emit(o Outcome, failure *Error, jsonMode bool, stdout, stderr io.Writer) int {
	exit := o.Exit
	if failure != nil {
		exit = ExitCode(failure.Code)
	}
	if jsonMode {
		if e := json.NewEncoder(stdout).Encode(Envelope(o.Result, failure)); e != nil {
			return 1
		}
		return exit
	}
	if failure != nil {
		text := "error: " + failure.Message + "\n"
		for _, s := range failure.NextSteps {
			text += s + "\n"
		}
		if _, e := io.WriteString(stderr, EscapeControl(text)); e != nil {
			return 1
		}
		return exit
	}
	if o.Text != "" {
		if _, e := io.WriteString(stdout, EscapeControl(o.Text)+"\n"); e != nil {
			return 1
		}
		return exit
	}
	if m, ok := o.Result.(map[string]any); ok {
		if summary, ok := m["summary"].(check.Summary); ok {
			if _, e := fmt.Fprintf(stdout, "%d canvases checked\n", summary.Canvases); e != nil {
				return 1
			}
		}
		for _, key := range []string{"usage", "body"} {
			if s, ok := m[key].(string); ok {
				if _, e := io.WriteString(stdout, EscapeControl(s)); e != nil {
					return 1
				}
				return exit
			}
		}
	}
	b, e := json.MarshalIndent(o.Result, "", "  ")
	if e != nil {
		return 1
	}
	if _, e = fmt.Fprintln(stdout, EscapeControl(string(b))); e != nil {
		return 1
	}
	return exit
}
