package cli

import (
	"errors"
	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
	"io/fs"
	"os"
	"path/filepath"
)

type canvasFile struct {
	Model      canvas.Canvas
	Data       []byte
	ParseError error
	ReadError  error
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
	r, failure, searched := findRepository(ctx, f)
	if failure != nil {
		if failure.Code == "repo_not_found" && searched != "" {
			failure.StorageReason = notFoundStorageReason(searched, repo.ReadStorage(searched, ctx.Home))
		}
		return Outcome{}, failure
	}
	canvases, e := scanCanvases(r.Root)
	if e != nil {
		return Outcome{}, internal(e)
	}
	scope, e := repo.Scope(r.Root, r.Config)
	if e != nil {
		return Outcome{}, internal(e)
	}
	items := []any{}
	for _, file := range canvases {
		c := file.Model
		frames := []any{}
		item := map[string]any{"path": c.Path, "frames": frames}
		if file.ReadError != nil {
			item["error"] = readFailure("unreadable_canvas", c.Path, file.ReadError)
		} else if file.ParseError == nil {
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
		}
		items = append(items, item)
	}
	result := map[string]any{"root": r.Root, "scope": scope, "canvases": items}
	addStorageResult(result, repo.ReadStorage(r.Root, ctx.Home))
	if git := repo.ReadGit(r.Root, ctx.Home); git != nil {
		result["git"] = git
	}
	return Outcome{Result: result}, nil
}
