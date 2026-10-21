package cli

import _ "embed"

//go:embed skill.md
var skillBody string

func Skill(args []string) (Outcome, *Error) {
	if len(args) != 0 {
		return Outcome{}, usageError("skill takes no positional arguments")
	}
	return Outcome{Result: map[string]any{"version": Version, "body": skillBody + "\n[doan:skill] end of guide v" + Version + "\n"}}, nil
}
