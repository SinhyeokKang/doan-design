package cli

import (
	"crypto/sha256"
	"fmt"
	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
	"os"
	"path/filepath"
)

type canvasFile struct {
	Model      canvas.Canvas
	Data       []byte
	ParseError error
}
type commentFile struct {
	File repo.CommentFile
	Text string
	Fold formats.FoldResult
}

func readCanvases(root string) ([]canvasFile, error) {
	paths, e := repo.Canvases(root)
	if e != nil {
		return nil, e
	}
	files := []canvasFile{}
	for _, p := range paths {
		b, e := os.ReadFile(filepath.Join(root, p))
		if e != nil {
			return nil, e
		}
		c, e := canvas.Parse(p, b)
		files = append(files, canvasFile{c, b, e})
	}
	return files, nil
}
func readComments(root string) ([]commentFile, error) {
	paths, e := repo.CommentFiles(root)
	if e != nil {
		return nil, e
	}
	files := []commentFile{}
	for _, p := range paths {
		b, e := os.ReadFile(filepath.Join(root, p.Path))
		if e != nil {
			return nil, e
		}
		files = append(files, commentFile{p, string(b), formats.FoldText(string(b))})
	}
	return files, nil
}
func List(ctx Context, f Flags, args []string) (Outcome, *Error) {
	if len(args) != 0 {
		return Outcome{}, usageError("ls takes no positional arguments")
	}
	r, failure := repository(ctx, f)
	if failure != nil {
		return Outcome{}, failure
	}
	canvases, e := readCanvases(r.Root)
	if e != nil {
		return Outcome{}, internal(e)
	}
	files, e := readComments(r.Root)
	if e != nil {
		return Outcome{}, internal(e)
	}
	counts := map[string]map[string]int{}
	for _, file := range files {
		counts[file.File.ID] = map[string]int{"open": 0, "resolved": 0}
		for _, c := range file.Fold.Comments {
			counts[file.File.ID][c.Status]++
		}
	}
	items := []any{}
	for _, file := range canvases {
		c := file.Model
		frames := []any{}
		count := map[string]int{"open": 0, "resolved": 0}
		item := map[string]any{"path": c.Path, "frames": frames, "comments": count}
		if file.ParseError == nil {
			if c.HasID && !c.IDDup && kebabID.MatchString(c.ID) {
				item["id"] = c.ID
			}
			if c.HasWidth && !c.WidthDup && c.Width > 0 {
				item["width"] = c.Width
			}
			if c.Title != "" {
				item["title"] = c.Title
			}
			for _, frame := range c.Frames {
				v := map[string]any{"id": frame.ID}
				if frame.Title != nil {
					v["title"] = *frame.Title
				}
				if frame.Implements != nil {
					v["implements"] = *frame.Implements
				}
				frames = append(frames, v)
			}
			item["frames"] = frames
			if c.HasID && counts[c.ID] != nil {
				item["comments"] = counts[c.ID]
			}
		}
		items = append(items, item)
	}
	return Outcome{Result: map[string]any{"canvases": items}}, nil
}

type listedComment struct {
	formats.Comment
	Canvas     string  `json:"canvas"`
	CanvasPath *string `json:"canvasPath,omitempty"`
	Outdated   *bool   `json:"outdated,omitempty"`
}
type listedWarning struct {
	formats.Warning
	File string `json:"file"`
}

func Comments(ctx Context, f Flags, args []string) (Outcome, *Error) {
	if len(args) != 0 {
		return Outcome{}, usageError("comments takes no positional arguments")
	}
	r, failure := repository(ctx, f)
	if failure != nil {
		return Outcome{}, failure
	}
	canvases, e := readCanvases(r.Root)
	if e != nil {
		return Outcome{}, internal(e)
	}
	files, e := readComments(r.Root)
	if e != nil {
		return Outcome{}, internal(e)
	}
	byID := map[string][]canvasFile{}
	for _, c := range canvases {
		if c.ParseError == nil && c.Model.HasID {
			byID[c.Model.ID] = append(byID[c.Model.ID], c)
		}
	}
	selected := f.CanvasSet || f.Canvas != ""
	found := len(byID[f.Canvas]) > 0
	items := []listedComment{}
	warnings := []listedWarning{}
	for _, file := range files {
		if selected && file.File.ID != f.Canvas {
			continue
		}
		found = true
		for _, w := range file.Fold.Warnings {
			warnings = append(warnings, listedWarning{w, file.File.Path})
		}
		for _, c := range file.Fold.Comments {
			if c.Status != "open" {
				continue
			}
			v := listedComment{Comment: c, Canvas: file.File.ID}
			if cs := byID[file.File.ID]; len(cs) == 1 {
				path := cs[0].Model.Path
				outdated := fmt.Sprintf("sha256:%x", sha256.Sum256(cs[0].Data)) != c.CanvasHash
				v.CanvasPath = &path
				v.Outdated = &outdated
			}
			items = append(items, v)
		}
	}
	if selected && !found {
		return Outcome{}, &Error{Code: "canvas_not_found", Message: "Canvas not found: " + f.Canvas, NextSteps: []string{"Run `doan ls --json`"}}
	}
	return Outcome{Result: map[string]any{"comments": items, "warnings": warnings}}, nil
}
