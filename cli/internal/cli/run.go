package cli

import (
	"bufio"
	"context"
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
	Start    string
	Terminal bool
	Prompt   func(string) (string, error)
	Now      func() time.Time
	Random   io.Reader
	// RuntimePath and Dial reach the app (doan active); Run fills them so bodies never read the environment or open sockets.
	RuntimePath string
	Dial        func(socket string, deadline time.Time) (net.Conn, error)
}
type Outcome struct {
	Result any
	Exit   int
}
type Flags struct {
	JSON                          bool
	Repo, TokenCSS, Canvas, Agent string
	TokenCSSSet, CanvasSet        bool
}

var Version = "dev"
var kebabID = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
var agentName = regexp.MustCompile(`^[a-z0-9-]+$`)

const usage = `Usage: doan <command> [--repo <path>] [--json]
  init [--token-css <path>]
  ls
  comments [--canvas <id>]
  comment resolve <cmt_id>... --agent <name>
  check
  active
  skill
  mcp
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

// runtimePath is resolved only for active, so a bad DOAN_RUNTIME cannot break file-only commands.
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
func Run(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("doan", flag.ContinueOnError)
	var f Flags
	fs.BoolVar(&f.JSON, "json", false, "")
	fs.StringVar(&f.Repo, "repo", "", "")
	fs.StringVar(&f.TokenCSS, "token-css", "", "")
	fs.StringVar(&f.Canvas, "canvas", "", "")
	fs.StringVar(&f.Agent, "agent", "", "")
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
		case "init":
			allowed["token-css"] = true
		case "comments":
			allowed["canvas"] = true
		case "comment":
			allowed["agent"] = true
		case "mcp":
			// stdout carries only the protocol, so no flag (not even --json) applies.
			allowed = map[string]bool{}
		}
		fs.Visit(func(v *flag.Flag) {
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
			} else if cmd == "mcp" {
				if len(pos) > 1 {
					failure = usageError("mcp takes no positional arguments")
				} else {
					// emit is skipped: it would write a value to stdout after the protocol stream.
					if e := Serve(context.Background(), stdin, stdout); e != nil {
						// Exit 1 either way; a failed stderr write has nowhere else to go.
						io.WriteString(stderr, EscapeControl("error: "+e.Error()+"\n"))
						return 1
					}
					return 0
				}
			} else {
				start, e := os.Getwd()
				if e != nil {
					failure = internal(e)
				} else {
					ctx := Context{Start: start, Now: time.Now, Random: rand.Reader, Dial: func(socket string, deadline time.Time) (net.Conn, error) {
						return (&net.Dialer{Deadline: deadline}).Dial("unix", socket)
					}}
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
					case "ls":
						o, failure = List(ctx, f, pos[1:])
					case "comments":
						o, failure = Comments(ctx, f, pos[1:])
					case "skill":
						o, failure = Skill(pos[1:])
					case "check":
						o, failure = Check(ctx, f, pos[1:])
					case "active":
						if ctx.RuntimePath, failure = runtimePath(); failure == nil {
							o, failure = Active(ctx, f, pos[1:])
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
