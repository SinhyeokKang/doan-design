package cli

import (
	_ "embed"
	"path/filepath"
	"strings"
)

//go:embed skill.md
var skillBody string

// presetListSlot is the line in skill.md that Skill replaces with the catalog's presets, so the guide keeps no copy.
const presetListSlot = "<!-- design preset list -->"

func Skill(ctx Context, args []string) (Outcome, *Error) {
	if len(args) != 0 {
		return Outcome{}, usageError("skill takes no positional arguments")
	}
	c, e := loadCatalog()
	if e != nil {
		return Outcome{}, internal(e)
	}
	var list strings.Builder
	for _, p := range c.Presets() {
		list.WriteString("- `" + p.ID + "` — " + p.Title + " (" + p.Scope + "). " + p.Description + "\n")
	}
	body := strings.Replace(skillBody, presetListSlot+"\n", list.String(), 1)
	// Only a CLI inside the app knows the install location; a standalone one keeps the generic example.
	if bundle, ok := ownBundle(ctx.Executable); ok {
		cli := filepath.Join(bundle, "Contents", "Resources", "bin", "doan")
		body += "\nThis guide came from the doan CLI inside " + bundle + ". Start onboarding with `" + shellQuote(cli) + " onboarding start --json`.\n"
	}
	return Outcome{Result: map[string]any{"version": Version, "body": body + "\n[doan:skill] end of guide v" + Version + "\n"}}, nil
}
