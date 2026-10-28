package cli

import (
	_ "embed"
	"path/filepath"
)

//go:embed skill.md
var skillBody string

func Skill(ctx Context, args []string) (Outcome, *Error) {
	if len(args) != 0 {
		return Outcome{}, usageError("skill takes no positional arguments")
	}
	body := skillBody
	// Only a CLI inside the app knows the install location; a standalone one keeps the generic example.
	if bundle, ok := ownBundle(ctx.Executable); ok {
		cli := filepath.Join(bundle, "Contents", "Resources", "bin", "doan")
		body += "\nThis guide came from the doan CLI inside " + bundle + ". Start onboarding with `" + shellQuote(cli) + " onboarding start --json`.\n"
	}
	return Outcome{Result: map[string]any{"version": Version, "body": body + "\n[doan:skill] end of guide v" + Version + "\n"}}, nil
}
