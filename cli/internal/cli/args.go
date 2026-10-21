package cli

import (
	"errors"
	"flag"
	"io"
	"strings"
)

func SplitArgs(args []string, fs *flag.FlagSet) ([]string, error) {
	fs.SetOutput(io.Discard)
	// Preserve JSON output even when parsing fails before reaching its flag.
	for _, arg := range args {
		if arg == "--" {
			break
		}
		if arg == "--json" || arg == "-json" {
			if f := fs.Lookup("json"); f != nil {
				if err := f.Value.Set("true"); err != nil {
					return nil, &Error{Code: "usage_error", Message: err.Error()}
				}
			}
		}
	}
	end := len(args)
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--" {
			end = i
			break
		}
		if !strings.HasPrefix(arg, "-") || arg == "-" {
			continue
		}
		name := strings.TrimPrefix(strings.TrimPrefix(arg, "-"), "-")
		if strings.Contains(name, "=") {
			continue
		}
		if f := fs.Lookup(name); f != nil {
			b, ok := f.Value.(interface{ IsBoolFlag() bool })
			if !ok || !b.IsBoolFlag() {
				i++
			}
		}
	}
	rest := args[:end]
	positionals := []string{}
	for len(rest) > 0 {
		if err := fs.Parse(rest); err != nil {
			if errors.Is(err, flag.ErrHelp) {
				return nil, err
			}
			return nil, &Error{Code: "usage_error", Message: err.Error()}
		}
		rest = fs.Args()
		if len(rest) > 0 {
			positionals = append(positionals, rest[0])
			rest = rest[1:]
		}
	}
	if end < len(args) {
		positionals = append(positionals, args[end+1:]...)
	}
	return positionals, nil
}
