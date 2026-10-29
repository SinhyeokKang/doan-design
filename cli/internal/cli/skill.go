package cli

import (
	_ "embed"
	"path/filepath"
	"strings"
)

//go:embed skill.md
var skillBody string

// presetListSlot is the line in skill.md that Skill replaces with the catalog's preset ids, so the guide keeps no copy.
const presetListSlot = "<!-- design preset list -->"

func Skill(ctx Context, args []string) (Outcome, *Error) {
	if len(args) != 0 {
		return Outcome{}, usageError("skill takes no positional arguments")
	}
	c, e := loadCatalog()
	if e != nil {
		return Outcome{}, internal(e)
	}
	// Ids only: descriptions come from `doan design-skill --json`, so the guide stays under agents' tool-output caps.
	var ids []string
	for _, p := range c.Presets() {
		ids = append(ids, p.ID)
	}
	body := strings.Replace(skillBody, presetListSlot+"\n", "Preset ids: "+strings.Join(ids, ", ")+".\n", 1)
	// Only a CLI inside the app knows the install location; a standalone one keeps the generic example.
	if bundle, ok := ownBundle(ctx.Executable); ok {
		body += bundleNote(bundle)
	}
	return Outcome{Result: map[string]any{"version": Version, "body": body + "\n[doan:skill] end of guide v" + Version + "\n"}}, nil
}

func bundleNote(bundle string) string {
	cli := filepath.Join(bundle, "Contents", "Resources", "bin", "doan")
	return "\nThis guide came from the doan CLI inside " + bundle + ". Start onboarding with `" + shellQuote(cli) + " onboarding start --json`.\n"
}
