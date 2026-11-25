package export

import (
	"strings"
	"unicode"

	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

// jsTrim is JavaScript's String.prototype.trim, so names match the app's: Unicode White_Space without U+0085,
// plus U+FEFF.
func jsTrim(s string) string {
	return strings.TrimFunc(s, func(r rune) bool {
		return r == '\uFEFF' || (r != '\u0085' && unicode.IsSpace(r))
	})
}

func projectHue(name string) string {
	hues := [...]string{"rose", "orange", "amber", "emerald", "teal", "sky", "indigo", "fuchsia"}
	hash := uint32(5381)
	for _, point := range jsTrim(name) {
		hash = hash*33 ^ uint32(point)
	}
	return hues[hash%uint32(len(hues))]
}

func projectInitial(name string) string {
	for _, point := range jsTrim(name) {
		// Full uppercase can expand the initial, as in "ß" to "SS".
		return cases.Upper(language.Und).String(string(point))
	}
	return "?"
}
