package formats

import "sort"

func FoldText(text string) FoldResult {
	parsed := ParseLines(text)
	folded := Fold(parsed.Events)
	warnings := append([]Warning{}, parsed.Warnings...)
	warnings = append(warnings, folded.Warnings...)
	sort.Slice(warnings, func(i, j int) bool {
		if warnings[i].Line != warnings[j].Line {
			return warnings[i].Line < warnings[j].Line
		}
		return warnings[i].Code < warnings[j].Code
	})
	return FoldResult{Comments: folded.Comments, Warnings: warnings}
}
