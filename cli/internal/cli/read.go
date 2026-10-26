package cli

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
)

type canvasFile struct {
	Model      canvas.Canvas
	Data       []byte
	ParseError error
	ReadError  error
}
type commentFile struct {
	File      repo.CommentFile
	Text      string
	Fold      formats.FoldResult
	ReadError error
}

// scanCanvases keeps a file that cannot be read as a ReadError entry with only its path.
// Only an enumeration failure fails the scan, because then the set of files is unknown.
func scanCanvases(root string) ([]canvasFile, error) {
	paths, e := repo.Canvases(root)
	if e != nil {
		return nil, e
	}
	files := []canvasFile{}
	for _, p := range paths {
		b, e := os.ReadFile(filepath.Join(root, p))
		if e != nil {
			files = append(files, canvasFile{Model: canvas.Canvas{Path: p}, ReadError: e})
			continue
		}
		c, e := canvas.Parse(p, b)
		files = append(files, canvasFile{Model: c, Data: b, ParseError: e})
	}
	return files, nil
}
func scanComments(root string) ([]commentFile, error) {
	paths, e := repo.CommentFiles(root)
	if e != nil {
		return nil, e
	}
	files := []commentFile{}
	for _, p := range paths {
		b, e := os.ReadFile(filepath.Join(root, p.Path))
		if e != nil {
			files = append(files, commentFile{File: p, ReadError: e})
			continue
		}
		files = append(files, commentFile{File: p, Text: string(b), Fold: formats.FoldText(string(b))})
	}
	return files, nil
}

// readCanvases and readComments fail on the first unreadable file; only ls reports it per row.
func readCanvases(root string) ([]canvasFile, error) {
	files, e := scanCanvases(root)
	if e != nil {
		return nil, e
	}
	for _, f := range files {
		if f.ReadError != nil {
			return nil, f.ReadError
		}
	}
	return files, nil
}
func readComments(root string) ([]commentFile, error) {
	files, e := scanComments(root)
	if e != nil {
		return nil, e
	}
	for _, f := range files {
		if f.ReadError != nil {
			return nil, f.ReadError
		}
	}
	return files, nil
}

// readFailure names the repo-relative path and the cause; the OS error itself carries the absolute path.
func readFailure(code, path string, e error) map[string]string {
	cause := "read failed"
	var pathError *fs.PathError
	if errors.As(e, &pathError) {
		cause = pathError.Err.Error()
	}
	return map[string]string{"code": code, "message": "Cannot read " + path + ": " + cause}
}
func List(ctx Context, f Flags, args []string) (Outcome, *Error) {
	if len(args) != 0 {
		return Outcome{}, usageError("ls takes no positional arguments")
	}
	r, failure := repository(ctx, f)
	if failure != nil {
		return Outcome{}, failure
	}
	canvases, e := scanCanvases(r.Root)
	if e != nil {
		return Outcome{}, internal(e)
	}
	files, e := scanComments(r.Root)
	if e != nil {
		return Outcome{}, internal(e)
	}
	scope, e := repo.Scope(r.Root, r.Config)
	if e != nil {
		return Outcome{}, internal(e)
	}
	counts := map[string]map[string]int{}
	failures := map[string]map[string]string{}
	for _, file := range files {
		if file.ReadError != nil {
			failures[file.File.ID] = readFailure("unreadable_comments", file.File.Path, file.ReadError)
			continue
		}
		counts[file.File.ID] = map[string]int{"open": 0, "resolved": 0}
		for _, c := range file.Fold.Comments {
			counts[file.File.ID][c.Status]++
		}
	}
	items := []any{}
	parsed := []canvas.Canvas{}
	uncertain := false
	for _, file := range canvases {
		c := file.Model
		frames := []any{}
		count := map[string]int{"open": 0, "resolved": 0}
		item := map[string]any{"path": c.Path, "frames": frames, "comments": count}
		if file.ReadError != nil {
			// Omitted rather than zero: a read error is not an empty list.
			delete(item, "comments")
			item["error"] = readFailure("unreadable_canvas", c.Path, file.ReadError)
			uncertain = true
		} else if file.ParseError != nil {
			uncertain = true
		} else {
			parsed = append(parsed, c)
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
			} else if c.HasID && failures[c.ID] != nil {
				delete(item, "comments")
				item["commentsError"] = failures[c.ID]
			}
		}
		items = append(items, item)
	}
	orphans := []any{}
	listed := []repo.CommentFile{}
	for _, file := range files {
		listed = append(listed, file.File)
	}
	for _, f := range repo.OrphanFiles(parsed, listed) {
		// A canvas that cannot be read or parsed may still use this id.
		orphan := map[string]any{"id": f.ID, "file": f.Path, "uncertain": uncertain}
		if failures[f.ID] != nil {
			orphan["error"] = failures[f.ID]
		} else {
			orphan["comments"] = counts[f.ID]
		}
		orphans = append(orphans, orphan)
	}
	result := map[string]any{"root": r.Root, "scope": scope, "canvases": items, "orphans": orphans}
	if git := repo.ReadGit(r.Root, ctx.Home); git != nil {
		result["git"] = git
	}
	return Outcome{Result: result}, nil
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
	selected := f.CanvasSet
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
	sort.SliceStable(items, func(i, j int) bool { return items[i].Canvas < items[j].Canvas })
	return Outcome{Result: map[string]any{"comments": items, "warnings": warnings}}, nil
}
