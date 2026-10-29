package cli

import (
	"fmt"

	"github.com/SinhyeokKang/doan-design/cli/internal/designskill"
)

// loadCatalog is a variable only so tests can make the embedded catalog fail.
var loadCatalog = designskill.Load

func presetError(message string) *Error {
	return &Error{Code: "usage_error", Message: message, NextSteps: []string{"Run `doan design-skill --json` to list design preset ids."}}
}

func DesignSkill(args []string) (Outcome, *Error) {
	if len(args) > 1 {
		return Outcome{}, usageError("design-skill takes at most one preset id")
	}
	c, e := loadCatalog()
	if e != nil {
		// go test validates the same embedded files, so this is a build defect rather than a bad request.
		return Outcome{}, internal(e)
	}
	if len(args) == 0 {
		rows := []designskill.Summary{}
		for _, p := range c.Presets() {
			rows = append(rows, p.Summary())
		}
		return Outcome{Result: map[string]any{"version": Version, "presets": rows}}, nil
	}
	id := args[0]
	if id == "" {
		return Outcome{}, presetError("design preset id must not be empty")
	}
	if !designskill.ValidID(id) {
		return Outcome{}, presetError(fmt.Sprintf("invalid design preset id %q", id))
	}
	p, ok := c.Lookup(id)
	if !ok {
		return Outcome{}, presetError(fmt.Sprintf("unknown design preset %q", id))
	}
	body, _ := c.Body(id, Version)
	return Outcome{Result: map[string]any{"version": Version, "preset": p.Summary(), "body": body, "sources": p.Sources}}, nil
}
