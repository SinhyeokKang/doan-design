package repo

import "github.com/SinhyeokKang/doan-design/cli/internal/canvas"

// OrphanFiles returns the comment files whose id is no canvas's first doan:canvas string.
// Invalid or duplicated ids still match, so the result never nudges an agent to delete
// comments that an id fix would bring back. Callers pass only canvases that parsed.
func OrphanFiles(canvases []canvas.Canvas, files []CommentFile) []CommentFile {
	ids := map[string]bool{}
	for _, c := range canvases {
		if c.HasID {
			ids[c.ID] = true
		}
	}
	orphans := []CommentFile{}
	for _, f := range files {
		if !ids[f.ID] {
			orphans = append(orphans, f)
		}
	}
	return orphans
}
