package cli

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/export"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

// Export writes one canvas as a single HTML file that opens without Doan, the
// repository or a network. The order of the checks is the order of the error
// codes in the docs: arguments, repository, canvas, references, size, output.
func Export(ctx Context, f Flags, args []string) (Outcome, *Error) {
	if len(args) != 1 {
		return Outcome{}, usageError("export takes one canvas path")
	}
	if f.Output == "" {
		return Outcome{}, usageError("export needs -o <file>")
	}
	output := f.Output
	if !filepath.IsAbs(output) {
		output = filepath.Join(ctx.Start, output)
	}
	output = filepath.Clean(output)
	inside, err := export.UnderDoan(output)
	if err != nil {
		return Outcome{}, exportInternal(err)
	}
	if inside {
		return Outcome{}, usageError("Choose an output outside any .doan directory: a file there is listed as a canvas")
	}
	r, failure := repository(ctx, f)
	if failure != nil {
		return Outcome{}, failure
	}
	listed, err := repo.Canvases(r.Root)
	if err != nil {
		return Outcome{}, exportInternal(err)
	}
	canvasPath, ok := export.MatchListed(r.Root, listed, args[0])
	if !ok {
		return Outcome{}, &Error{Code: "canvas_not_found", Message: "Canvas not found: " + args[0], NextSteps: []string{"Run `doan ls --json` and pass a path it lists"}}
	}
	stored, err := os.Stat(filepath.Join(r.Root, filepath.FromSlash(canvasPath)))
	if err != nil {
		return Outcome{}, exportReadFailure(err)
	}
	if stored.Size() > export.MaxBytes {
		return Outcome{}, tooLarge([]export.Asset{{Path: canvasPath, Size: stored.Size()}})
	}
	src, err := export.ReadFile(r.Root, canvasPath)
	if err != nil {
		return Outcome{}, exportReadFailure(err)
	}
	model, err := canvas.Parse(canvasPath, src)
	if err != nil {
		return Outcome{}, unreadableCanvas("Doan could not parse this canvas.")
	}
	if !model.HasWidth || model.WidthDup || model.Width < 1 {
		return Outcome{}, unreadableCanvas("The canvas needs exactly one `doan:width` meta in its head with a positive whole number.")
	}
	inlined, err := export.Inline(r.Root, r.Config, canvasPath, src)
	if err != nil {
		return Outcome{}, exportInternal(err)
	}
	// References first, then size, as in the docs. Past the size limit Inline stops early, so the refusals it
	// found are the ones before the stop.
	if len(inlined.Refused) > 0 {
		return Outcome{}, refusedReferences(canvasPath, inlined.Refused)
	}
	self := export.Asset{Path: canvasPath, Size: int64(len(src))}
	if inlined.TooLarge {
		return Outcome{}, tooLarge(append(inlined.Largest, self))
	}
	assets := append(inlined.Assets, self)
	stem := strings.TrimSuffix(path.Base(canvasPath), path.Ext(canvasPath))
	page, err := export.Assemble(export.Meta{Name: stem, Width: model.Width}, inlined.HTML)
	if err != nil {
		return Outcome{}, exportInternal(err)
	}
	if ok, _ := export.SizeCheck(int64(len(page)), nil); !ok {
		return Outcome{}, tooLarge(assets)
	}
	if failure := writeExport(ctx, output, f.Force, page); failure != nil {
		return Outcome{}, failure
	}
	return Outcome{
		Result: map[string]any{"path": canvasPath, "output": output, "bytes": len(page), "frames": len(model.Frames), "external": inlined.External, "links": inlined.Links},
		Text:   fmt.Sprintf("Exported %s to %s (%d bytes)", canvasPath, output, len(page)),
	}, nil
}

func exportReadFailure(err error) *Error {
	if os.IsNotExist(err) {
		return &Error{Code: "canvas_not_found", Message: "The canvas is no longer there", NextSteps: []string{"Run `doan ls --json` and pass a path it lists"}}
	}
	return exportInternal(err)
}

// unreadableCanvas has no reference lines: the app tells "can't read this canvas" from "can't include a file"
// by their absence.
func unreadableCanvas(message string) *Error {
	return &Error{Code: "export_refused", Message: "Doan can't read this canvas. " + message, NextSteps: []string{"Run `doan check --json`, fix the canvas, then export again"}}
}

// The app reads the lines that start with "- " from export_refused and export_too_large messages, each cut at
// its last ": ", so an item may hold ": " and a detail may not (app/src/main/canvasExport.ts `listed`).
func listLine(item, detail string) string {
	item = strings.NewReplacer("\r", " ", "\n", " ").Replace(item)
	detail = strings.NewReplacer("\r", " ", "\n", " ", ": ", " ").Replace(detail)
	return "- " + item + ": " + detail
}

func refusedReferences(canvasPath string, refused []export.Refusal) *Error {
	lines := []string{"The canvas uses files Doan can't include:"}
	for _, r := range refused {
		detail := r.Reason
		if r.From != canvasPath {
			detail += " (in " + r.From + ")"
		}
		lines = append(lines, listLine(r.Href, detail))
	}
	return &Error{
		Code:      "export_refused",
		Message:   strings.Join(lines, "\n"),
		NextSteps: []string{"Fix the listed references (move the file into .doan/assets/, add its folder with `doan config --add-serve`, fix the path, or inline the frame's content), then export again"},
	}
}

func tooLarge(assets []export.Asset) *Error {
	lines := []string{fmt.Sprintf("The export would be over %s. The largest files it includes:", export.FormatSize(export.MaxBytes))}
	for _, a := range export.Largest(assets) {
		lines = append(lines, listLine(a.Path, export.FormatSize(a.Size)))
	}
	return &Error{Code: "export_too_large", Message: strings.Join(lines, "\n"), NextSteps: []string{"Make the largest files smaller or leave them out of the canvas, then export again"}}
}

// writeExport puts data at output through a temporary file in the same directory, so a failure or a competing
// reader never sees a partial page. An existing symbolic link is replaced, not followed.
func writeExport(ctx Context, output string, force bool, data []byte) *Error {
	dir := filepath.Dir(output)
	if info, err := os.Stat(dir); err != nil {
		if os.IsNotExist(err) {
			return usageError("The output directory does not exist")
		}
		return exportInternal(err)
	} else if !info.IsDir() {
		return usageError("The output directory is not a directory")
	}
	if info, err := os.Lstat(output); err == nil {
		if info.IsDir() {
			return usageError("The output path is a directory; name a file")
		}
		if !force {
			return &Error{Code: "destination_exists", Message: "The output file already exists", NextSteps: []string{"Choose another -o path, or pass --force to replace it"}}
		}
	} else if !os.IsNotExist(err) {
		return exportInternal(err)
	}
	random := ctx.Random
	if random == nil {
		random = rand.Reader
	}
	var suffix [6]byte
	if _, err := io.ReadFull(random, suffix[:]); err != nil {
		return exportInternal(err)
	}
	// O_EXCL and O_NOFOLLOW: never write through something already at the temporary name. The mode goes
	// through the umask, which is the 0644 a plain redirect would give.
	temp := filepath.Join(dir, exportTempPrefix(filepath.Base(output))+hex.EncodeToString(suffix[:]))
	file, err := os.OpenFile(temp, os.O_WRONLY|os.O_CREATE|os.O_EXCL|syscallNoFollow, 0o644)
	if err != nil {
		return exportInternal(err)
	}
	_, err = file.Write(data)
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err == nil {
		err = os.Rename(temp, output)
	}
	if err != nil {
		os.Remove(temp)
		return exportInternal(err)
	}
	return nil
}

// exportTempPrefix is `.<name>.doan-`, with the name cut at a character boundary so the whole temporary name
// stays inside the 255 bytes a file name may have.
func exportTempPrefix(name string) string {
	const room = 255 - len(".") - len(".doan-") - 12
	for len(name) > room || !utf8.ValidString(name) {
		name = name[:len(name)-1]
	}
	return "." + name + ".doan-"
}

// exportInternal is an internal error with the system's reason and without the path it came with: a message
// the app shows or an agent relays must hold no absolute path.
func exportInternal(err error) *Error {
	var pe *fs.PathError
	var le *os.LinkError
	switch {
	case errors.As(err, &pe):
		err = pe.Err
	case errors.As(err, &le):
		err = le.Err
	}
	return &Error{Code: "internal_error", Message: "Export failed: " + err.Error(), NextSteps: []string{"Check that the repository and the output directory are readable and writable, then export again"}}
}
