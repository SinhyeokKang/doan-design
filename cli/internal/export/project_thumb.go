package export

import (
	"strings"
	"unicode"

	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

// Match String.prototype.trim in shellNavigation.ts: JavaScript trims the BOM but keeps NEL.
func trimProjectName(name string) string {
	return strings.TrimFunc(name, func(r rune) bool {
		return r == '\uFEFF' || (r != '\u0085' && unicode.IsSpace(r))
	})
}

func projectHue(name string) string {
	hues := [...]string{"rose", "orange", "amber", "emerald", "teal", "sky", "indigo", "fuchsia"}
	hash := uint32(5381)
	for _, point := range trimProjectName(name) {
		hash = hash*33 ^ uint32(point)
	}
	return hues[hash%uint32(len(hues))]
}

func projectInitial(name string) string {
	for _, point := range trimProjectName(name) {
		// Full uppercase can expand the initial, as in "ß" to "SS".
		return cases.Upper(language.Und).String(string(point))
	}
	return "?"
}
