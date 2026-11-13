package cli

import (
	"bytes"
	"encoding/json"
	"io"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strings"
	"syscall"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
	"golang.org/x/net/html"
	"golang.org/x/text/unicode/norm"
)

func exportOutput(t *testing.T) string {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return dir
}

// exportRun runs `doan export <args>` against root and returns the envelope.
func exportRun(t *testing.T, root string, want int, args ...string) map[string]any {
	t.Helper()
	return runJSON(t, root, want, append([]string{"export"}, args...)...)
}

func exportFailure(t *testing.T, root, code string, args ...string) *Error {
	t.Helper()
	got := exportRun(t, root, ExitCode(code), args...)
	e := got["error"].(map[string]any)
	if e["code"] != code {
		t.Fatalf("code %v, want %s: %v", e["code"], code, e)
	}
	if len(e["nextSteps"].([]any)) == 0 {
		t.Fatalf("%s has no nextSteps", code)
	}
	return &Error{Code: code, Message: e["message"].(string)}
}

// appLines is the parse `interpretExport` in app/src/main/canvasExport.ts applies to a message:
// the lines that start with "- ", each cut at its last ": ".
func appLines(message string) []string {
	var out []string
	for _, line := range strings.Split(message, "\n") {
		if !strings.HasPrefix(line, "- ") {
			continue
		}
		item := line[2:]
		if cut := strings.LastIndex(item, ": "); cut > 0 {
			item = item[:cut]
		}
		out = append(out, item)
	}
	return out
}

func noOutputFiles(t *testing.T, dir string) {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		t.Errorf("file left in the output directory: %s", e.Name())
	}
}

func TestExportWritesTheViewerPageAndReportsTheResult(t *testing.T) {
	root := exporttest.Seed(t)
	out := filepath.Join(exportOutput(t), "full.html")
	got := exportRun(t, root, 0, exporttest.Full, "-o", out)
	page, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"path":     ".doan/canvases/full.html",
		"output":   out,
		"bytes":    float64(len(page)),
		"frames":   float64(1),
		"external": []any{"//cdn.example.com/bg.png", "//cdn.example.com/lib.js", "https://cdn.example.com/x.css", "https://fonts.example.com/css2?family=Inter"},
		"links":    []any{"other.html#top", "submit.html"},
	}
	if !reflect.DeepEqual(got["result"], want) {
		t.Fatalf("result\n got %v\nwant %v", got["result"], want)
	}
	// The page is the viewer around the canvas.
	shell := parseExportedPage(t, page)
	if shell.title != "full" || !strings.Contains(shell.meta, `"width":1280`) || !strings.Contains(shell.meta, `"name":"full"`) {
		t.Fatalf("title %q meta %q", shell.title, shell.meta)
	}
	// Nothing local is left except the links the result names and what CSS files name that do not exist.
	// missing.css and gone.png sit inside the token CSS, behind a <link> data URI and its @import chain; they are
	// found only if the scan descends there, and every other reference in that CSS has to be a data URI.
	allowed := map[string]bool{"other.html#top": true, "submit.html": true, "missing.css": true, "gone.png": true}
	reached := map[string]bool{}
	for _, ref := range append(localReferences(t, page), localReferences(t, []byte(shell.srcdoc))...) {
		reached[ref] = true
		if !allowed[ref] {
			t.Errorf("local reference left in the page: %q", ref)
		}
	}
	for ref := range allowed {
		if !reached[ref] {
			t.Errorf("the re-scan never reached %q", ref)
		}
	}
	info, err := os.Stat(out)
	if err != nil {
		t.Fatal(err)
	}
	umask := syscall.Umask(0)
	syscall.Umask(umask)
	if info.Mode().Perm() != os.FileMode(0o644)&^os.FileMode(umask) {
		t.Errorf("mode %v, want 0644 under umask %o", info.Mode().Perm(), umask)
	}
}

func TestExportEmptyListsAreArraysInTheRawOutput(t *testing.T) {
	root := exporttest.Seed(t)
	var stdout, stderr bytes.Buffer
	out := filepath.Join(exportOutput(t), "empty.html")
	if code := Run([]string{"export", exporttest.Empty, "-o", out, "--repo", root, "--json"}, strings.NewReader(""), &stdout, &stderr); code != 0 {
		t.Fatal(code, &stdout, &stderr)
	}
	if !strings.Contains(stdout.String(), `"external":[]`) || !strings.Contains(stdout.String(), `"links":[]`) || !strings.Contains(stdout.String(), `"frames":0`) {
		t.Fatalf("raw output: %s", &stdout)
	}
}

func TestExportLeavesNoTemporaryFile(t *testing.T) {
	root := exporttest.Seed(t)
	dir := exportOutput(t)
	exportRun(t, root, 0, exporttest.Empty, "-o", filepath.Join(dir, "a.html"))
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 || entries[0].Name() != "a.html" {
		t.Fatalf("directory holds %v", entries)
	}
}

func TestExportCanvasArgumentForms(t *testing.T) {
	root := exporttest.Seed(t)
	dir := exportOutput(t)
	for name, c := range map[string]struct{ arg, path string }{
		"relative":      {".doan/canvases/empty.html", ".doan/canvases/empty.html"},
		"dot slash":     {"./.doan/canvases/empty.html", ".doan/canvases/empty.html"},
		"absolute":      {filepath.Join(root, ".doan/canvases/empty.html"), ".doan/canvases/empty.html"},
		"ls spelling":   {".doan/canvases/EMPTY.html", ".doan/canvases/empty.html"},
		"subdirectory":  {exporttest.Nested, exporttest.Nested},
		"unicode abs":   {filepath.Join(root, exporttest.Nested), exporttest.Nested},
		"decomposed":    {norm.NFD.String(exporttest.Nested), exporttest.Nested},
		"design system": {".doan/ds/../canvases/empty.html", ".doan/canvases/empty.html"},
	} {
		t.Run(name, func(t *testing.T) {
			got := exportRun(t, root, 0, c.arg, "-o", filepath.Join(dir, strings.ReplaceAll(name, " ", "-")+".html"))
			if got["result"].(map[string]any)["path"] != c.path {
				t.Fatalf("path = %v, want %s", got["result"].(map[string]any)["path"], c.path)
			}
		})
	}
}

func TestExportNestedUnicodeCanvasNamesThePageAfterItsStem(t *testing.T) {
	root := exporttest.Seed(t)
	out := filepath.Join(exportOutput(t), "n.html")
	exportRun(t, root, 0, exporttest.Nested, "-o", out)
	page, _ := os.ReadFile(out)
	if shell := parseExportedPage(t, page); shell.title != "공백 화면" {
		t.Fatalf("title %q", shell.title)
	}
}

func TestExportRelativeOutputIsReadFromTheCurrentDirectory(t *testing.T) {
	root := exporttest.Seed(t)
	dir := exportOutput(t)
	t.Chdir(dir)
	got := exportRun(t, root, 0, exporttest.Empty, "-o", "here.html")
	if got["result"].(map[string]any)["output"] != filepath.Join(dir, "here.html") {
		t.Fatalf("output %v", got["result"])
	}
	if _, err := os.Stat(filepath.Join(dir, "here.html")); err != nil {
		t.Fatal(err)
	}
}

func TestExportUsageErrors(t *testing.T) {
	root := exporttest.Seed(t)
	dir := exportOutput(t)
	out := filepath.Join(dir, "x.html")
	exportFailure(t, root, "usage_error")
	exportFailure(t, root, "usage_error", exporttest.Empty)
	exportFailure(t, root, "usage_error", exporttest.Empty, "-o", "")
	exportFailure(t, root, "usage_error", exporttest.Empty, exporttest.Full, "-o", out)
	exportFailure(t, root, "usage_error", exporttest.Empty, "-o", filepath.Join(dir, "missing", "x.html"))
	exportFailure(t, root, "usage_error", exporttest.Empty, "-o", dir)
	exportFailure(t, root, "usage_error", exporttest.Empty, "-o", dir, "--force")
	failure(t, root, "usage_error", "ls", "-o", out)
	failure(t, root, "usage_error", "ls", "--force")
	noOutputFiles(t, dir)
}

func TestExportRefusesAnOutputInsideADoanDirectory(t *testing.T) {
	root := exporttest.Seed(t)
	other := exportOutput(t)
	exporttest.Put(t, other, "elsewhere/.doan/canvases/keep.txt", "")
	for name, out := range map[string]string{
		"this repo":      filepath.Join(root, ".doan/canvases/out.html"),
		"another repo":   filepath.Join(other, "elsewhere/.doan/out.html"),
		"deeper":         filepath.Join(other, "elsewhere/.doan/canvases/out.html"),
		"through a link": filepath.Join(exportLinkTo(t, filepath.Join(other, "elsewhere/.doan/canvases")), "out.html"),
	} {
		t.Run(name, func(t *testing.T) {
			exportFailure(t, root, "usage_error", exporttest.Empty, "-o", out)
			if _, err := os.Stat(out); err == nil {
				t.Fatal("the file was written")
			}
		})
	}
	// A directory that only looks like it is fine.
	exporttest.Put(t, other, "dot-doan-copy/keep.txt", "")
	exportRun(t, root, 0, exporttest.Empty, "-o", filepath.Join(other, "dot-doan-copy/out.html"))
}

func exportLinkTo(t *testing.T, target string) string {
	t.Helper()
	link := filepath.Join(exportOutput(t), "link")
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
	return link
}

func TestExportCanvasNotFound(t *testing.T) {
	root := exporttest.Seed(t)
	other := exporttest.SeedLinkedAssets(t)
	out := filepath.Join(exportOutput(t), "x.html")
	for name, arg := range map[string]string{
		"unknown":          ".doan/canvases/none.html",
		"config":           ".doan/config.json",
		"not a canvas dir": "styles/tokens.css",
		"directory":        ".doan/canvases",
		"another repo":     filepath.Join(other, exporttest.Linked),
		"outside":          "../x.html",
	} {
		t.Run(name, func(t *testing.T) {
			e := exportFailure(t, root, "canvas_not_found", arg, "-o", out)
			if strings.Contains(e.Message, other) && name != "another repo" {
				t.Fatal(e.Message)
			}
		})
	}
	if _, err := os.Stat(out); err == nil {
		t.Fatal("a file was written")
	}
	failure(t, t.TempDir(), "repo_not_found", "export", exporttest.Empty, "-o", out)
}

// The message names what was asked for without an absolute path: repo-relative inside the repository, also
// through a link to the root, and only the file name outside it.
func TestExportCanvasNotFoundNamesNoAbsolutePath(t *testing.T) {
	root := exporttest.Seed(t)
	other := exporttest.SeedLinkedAssets(t)
	alias := exportLinkTo(t, root)
	out := filepath.Join(exportOutput(t), "x.html")
	for name, c := range map[string]struct{ arg, want string }{
		"absolute inside":       {filepath.Join(root, ".doan/canvases/zz.html"), "Canvas not found: .doan/canvases/zz.html"},
		"absolute through link": {filepath.Join(alias, ".doan/canvases/zz.html"), "Canvas not found: .doan/canvases/zz.html"},
		"absolute outside":      {filepath.Join(other, exporttest.Linked), "Canvas not found: " + filepath.Base(exporttest.Linked)},
		"relative":              {".doan/canvases/zz.html", "Canvas not found: .doan/canvases/zz.html"},
	} {
		t.Run(name, func(t *testing.T) {
			e := exportFailure(t, root, "canvas_not_found", c.arg, "-o", out)
			if e.Message != c.want {
				t.Fatalf("message %q, want %q", e.Message, c.want)
			}
		})
	}
}

func TestExportCanvasBehindALinkedDoanIsNotListed(t *testing.T) {
	root := exporttest.Seed(t)
	moved := filepath.Join(filepath.Dir(root), "real-doan")
	if err := os.Rename(filepath.Join(root, ".doan"), moved); err != nil {
		t.Fatal(err)
	}
	exporttest.Link(t, moved, filepath.Join(root, ".doan"))
	exportFailure(t, root, "canvas_not_found", exporttest.Empty, "-o", filepath.Join(exportOutput(t), "x.html"))
}

func TestExportRefusalsListEveryReferenceAndNameNoAbsolutePath(t *testing.T) {
	for _, c := range []struct {
		canvas string
		lines  []string
		reason string
	}{
		{exporttest.RefuseParent, []string{"../../../outside.png"}, "outside the repository"},
		{exporttest.RefuseRoot, []string{"/logo.png"}, "outside the repository"},
		{exporttest.RefuseScope, []string{"../../src/secret.png"}, "not in the serving scope"},
		{exporttest.RefuseCSSScope, []string{"../src/secret.png"}, "not in the serving scope (in styles/leak.css)"},
		{exporttest.RefuseMeta, []string{"../config.json", "../comments/full.jsonl"}, "not in the serving scope"},
		{exporttest.RefuseMissing, []string{"../assets/images/none.png"}, "not found"},
		{exporttest.RefuseFrame, nil, "local document in a frame"},
		{exporttest.RefuseLink, []string{"../assets/escape.png"}, ""},
		{exporttest.RefuseBase, []string{"images/hero.png"}, "relative to a base element"},
		{exporttest.RefuseUse, []string{"../assets/sprite.svg#icon"}, "the app does not draw an external use; inline the sprite"},
	} {
		t.Run(c.canvas, func(t *testing.T) {
			root := exporttest.Seed(t)
			dir := exportOutput(t)
			e := exportFailure(t, root, "export_refused", c.canvas, "-o", filepath.Join(dir, "x.html"))
			lines := appLines(e.Message)
			if len(lines) == 0 {
				t.Fatalf("no reference lines: %q", e.Message)
			}
			if c.lines != nil && !reflect.DeepEqual(lines, c.lines) {
				t.Errorf("references %q, want %q", lines, c.lines)
			}
			if c.reason != "" && !strings.Contains(e.Message, ": "+c.reason) {
				t.Errorf("reason %q missing from %q", c.reason, e.Message)
			}
			for _, line := range strings.Split(e.Message, "\n") {
				if strings.HasPrefix(line, "- ") && strings.Count(line, ": ") != 1 && !strings.Contains(line, "(in ") {
					t.Errorf("reference line with an extra separator: %q", line)
				}
			}
			if strings.Contains(e.Message, root) || strings.Contains(e.Message, dir) {
				t.Errorf("absolute path in the message: %q", e.Message)
			}
			if strings.HasPrefix(e.Message, "- ") {
				t.Errorf("the first line looks like a reference: %q", e.Message)
			}
			noOutputFiles(t, dir)
		})
	}
}

func TestExportRefusalOfAReferenceInsideACSSFileNamesTheFile(t *testing.T) {
	root := exporttest.Seed(t)
	e := exportFailure(t, root, "export_refused", exporttest.RefuseCSSScope, "-o", filepath.Join(exportOutput(t), "x.html"))
	if !strings.Contains(e.Message, "- ../src/secret.png: not in the serving scope (in styles/leak.css)") {
		t.Fatal(e.Message)
	}
}

func TestExportCollectsAllRefusalsInDocumentOrder(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/canvases/many.html", `<!doctype html><html><head><meta name="doan:canvas" content="many"><meta name="doan:width" content="800"></head><body>
<img src="../assets/images/none.png"><img src="/logo.png"><img src="../assets/images/none.png"><img src="../../src/secret.png"><iframe src="inner.html"></iframe>
</body></html>`)
	e := exportFailure(t, root, "export_refused", ".doan/canvases/many.html", "-o", filepath.Join(exportOutput(t), "x.html"))
	if got, want := appLines(e.Message), []string{"../assets/images/none.png", "/logo.png", "../../src/secret.png", "inner.html"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("references %q, want %q", got, want)
	}
}

// A newline in a reference would split its line, and ": " inside it is cut at its last occurrence only.
func TestExportRefusalLinesSurviveOddReferences(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/canvases/odd.html", "<!doctype html><html><head><meta name=\"doan:canvas\" content=\"odd\"><meta name=\"doan:width\" content=\"800\"></head><body>"+
		"<img src=\"../assets/a: b.png\"><img src=\"../assets/x\ny.png\"></body></html>")
	e := exportFailure(t, root, "export_refused", ".doan/canvases/odd.html", "-o", filepath.Join(exportOutput(t), "x.html"))
	got := appLines(e.Message)
	if len(got) != 2 || got[0] != "../assets/a: b.png" || strings.Contains(got[1], "\n") {
		t.Fatalf("references %q in %q", got, e.Message)
	}
}

func TestExportRefusesACanvasItCannotReadWithoutReferenceLines(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/canvases/deep.html", validCanvas+strings.Repeat("<div>", 600))
	// The width is checked before any reference, so a moving base adds no lines.
	exporttest.Put(t, root, ".doan/canvases/base-no-width.html", `<!doctype html><html><head><base href="../assets/"></head><body><img src="images/hero.png"></body></html>`)
	for _, canvasPath := range []string{exporttest.NoWidth, exporttest.BadWidth, ".doan/canvases/deep.html", ".doan/canvases/base-no-width.html"} {
		t.Run(canvasPath, func(t *testing.T) {
			dir := exportOutput(t)
			e := exportFailure(t, root, "export_refused", canvasPath, "-o", filepath.Join(dir, "x.html"))
			if len(appLines(e.Message)) != 0 || strings.HasPrefix(e.Message, "- ") {
				t.Fatalf("reference lines for an unreadable canvas: %q", e.Message)
			}
			noOutputFiles(t, dir)
		})
	}
}

func TestExportRefusesDuplicateWidthMeta(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/canvases/dup.html", `<!doctype html><html><head><meta name="doan:canvas" content="dup"><meta name="doan:width" content="800"><meta name="doan:width" content="900"></head><body></body></html>`)
	exportFailure(t, root, "export_refused", ".doan/canvases/dup.html", "-o", filepath.Join(exportOutput(t), "x.html"))
}

func TestExportDestinationExists(t *testing.T) {
	root := exporttest.Seed(t)
	dir := exportOutput(t)
	out := filepath.Join(dir, "x.html")
	if err := os.WriteFile(out, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	exportFailure(t, root, "destination_exists", exporttest.Empty, "-o", out)
	if b, _ := os.ReadFile(out); string(b) != "keep" {
		t.Fatalf("the file was changed: %q", b)
	}
	exportRun(t, root, 0, exporttest.Empty, "-o", out, "--force")
	if b, _ := os.ReadFile(out); !strings.HasPrefix(string(b), "<!doctype html>") {
		t.Fatalf("the file was not replaced: %.40q", b)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("directory holds %v", entries)
	}
}

func TestExportForceReplacesASymbolicLinkWithoutFollowingIt(t *testing.T) {
	root := exporttest.Seed(t)
	dir := exportOutput(t)
	target := filepath.Join(dir, "target.txt")
	if err := os.WriteFile(target, []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(dir, "link.html")
	if err := os.Symlink(target, out); err != nil {
		t.Fatal(err)
	}
	exportFailure(t, root, "destination_exists", exporttest.Empty, "-o", out)
	exportRun(t, root, 0, exporttest.Empty, "-o", out, "--force")
	if b, _ := os.ReadFile(target); string(b) != "keep" {
		t.Fatalf("the link target was written: %q", b)
	}
	if info, err := os.Lstat(out); err != nil || info.Mode()&os.ModeSymlink != 0 {
		t.Fatalf("the link was not replaced: %v %v", info, err)
	}
}

func TestExportRefusalComesBeforeAnExistingDestination(t *testing.T) {
	root := exporttest.Seed(t)
	out := filepath.Join(exportOutput(t), "x.html")
	if err := os.WriteFile(out, []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	exportFailure(t, root, "export_refused", exporttest.RefuseMissing, "-o", out)
}

func sparse(t *testing.T, root, rel string, size int64) {
	t.Helper()
	p := filepath.Join(root, rel)
	if err := os.WriteFile(p, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Truncate(p, size); err != nil {
		t.Fatal(err)
	}
}

func tooLargeItems(message string) []string {
	var items []string
	for _, line := range strings.Split(message, "\n") {
		if strings.HasPrefix(line, "- ") {
			items = append(items, line)
		}
	}
	return items
}

// The files add up to more than the limit: the message names them largest first, repo-relative.
func TestExportTooLargeFromFileSizesNamesTheLargestFirst(t *testing.T) {
	root := exporttest.Seed(t)
	sparse(t, root, ".doan/assets/a.bin", 30<<20)
	sparse(t, root, ".doan/assets/b.bin", 25<<20)
	sparse(t, root, ".doan/assets/small.bin", 10)
	exporttest.Put(t, root, ".doan/canvases/huge.html", `<!doctype html><html><head><meta name="doan:canvas" content="huge"><meta name="doan:width" content="800"></head><body>
<img src="../assets/small.bin"><img src="../assets/a.bin"><img src="../assets/b.bin"></body></html>`)
	dir := exportOutput(t)
	e := exportFailure(t, root, "export_too_large", ".doan/canvases/huge.html", "-o", filepath.Join(dir, "x.html"))
	items := tooLargeItems(e.Message)
	if len(items) < 2 || len(items) > 5 || items[0] != "- .doan/assets/a.bin: 30.0 MiB" || items[1] != "- .doan/assets/b.bin: 25.0 MiB" {
		t.Fatalf("largest first: %q", items)
	}
	if got := appLines(e.Message); got[0] != ".doan/assets/a.bin" {
		t.Fatalf("the app reads the largest as %q", got[0])
	}
	if strings.HasPrefix(e.Message, "- ") || strings.Contains(e.Message, root) {
		t.Fatal(e.Message)
	}
	noOutputFiles(t, dir)
}

// One file over the limit is refused from its size: it is never loaded.
func TestExportTooLargeDoesNotLoadTheFile(t *testing.T) {
	root := exporttest.Seed(t)
	sparse(t, root, ".doan/assets/big.bin", 300<<20)
	exporttest.Put(t, root, ".doan/canvases/huge.html", `<!doctype html><html><head><meta name="doan:canvas" content="huge"><meta name="doan:width" content="800"></head><body><img src="../assets/big.bin"></body></html>`)
	dir := exportOutput(t)
	var before, after runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&before)
	e := exportFailure(t, root, "export_too_large", ".doan/canvases/huge.html", "-o", filepath.Join(dir, "x.html"))
	runtime.ReadMemStats(&after)
	if grown := after.TotalAlloc - before.TotalAlloc; grown > 64<<20 {
		t.Fatalf("allocated %d MiB for a file that is over the limit", grown>>20)
	}
	if items := tooLargeItems(e.Message); len(items) == 0 || items[0] != "- .doan/assets/big.bin: 300.0 MiB" {
		t.Fatalf("items %q", items)
	}
	noOutputFiles(t, dir)
}

// A refusal before the size limit still comes first.
func TestExportRefusalBeatsTheSizeLimit(t *testing.T) {
	root := exporttest.Seed(t)
	sparse(t, root, ".doan/assets/big.bin", 60<<20)
	exporttest.Put(t, root, ".doan/canvases/both.html", `<!doctype html><html><head><meta name="doan:canvas" content="both"><meta name="doan:width" content="800"></head><body><img src="../assets/none.png"><img src="../assets/big.bin"></body></html>`)
	e := exportFailure(t, root, "export_refused", ".doan/canvases/both.html", "-o", filepath.Join(exportOutput(t), "x.html"))
	if got := appLines(e.Message); !reflect.DeepEqual(got, []string{"../assets/none.png"}) {
		t.Fatalf("references %q", got)
	}
}

// The files fit, the page does not: base64 makes 40 MiB of bytes more than 50 MiB.
func TestExportTooLargeAfterEncoding(t *testing.T) {
	root := exporttest.Seed(t)
	if err := os.WriteFile(filepath.Join(root, ".doan/assets/blob.bin"), bytes.Repeat([]byte{0}, 40<<20), 0o644); err != nil {
		t.Fatal(err)
	}
	exporttest.Put(t, root, ".doan/canvases/blob.html", `<!doctype html><html><head><meta name="doan:canvas" content="blob"><meta name="doan:width" content="800"></head><body><img src="../assets/blob.bin"></body></html>`)
	dir := exportOutput(t)
	e := exportFailure(t, root, "export_too_large", ".doan/canvases/blob.html", "-o", filepath.Join(dir, "x.html"))
	if got := appLines(e.Message); len(got) == 0 || got[0] != ".doan/assets/blob.bin" {
		t.Fatalf("lines %q in %q", got, e.Message)
	}
	noOutputFiles(t, dir)
}

func TestExportTooLargeCanvasItself(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/canvases/fat.html", `<!doctype html><html><head><meta name="doan:canvas" content="fat"><meta name="doan:width" content="800"></head><body><!--`+strings.Repeat("x", 51<<20)+`--></body></html>`)
	dir := exportOutput(t)
	e := exportFailure(t, root, "export_too_large", ".doan/canvases/fat.html", "-o", filepath.Join(dir, "x.html"))
	if got := appLines(e.Message); !reflect.DeepEqual(got, []string{".doan/canvases/fat.html"}) {
		t.Fatalf("lines %q in %q", got, e.Message)
	}
	noOutputFiles(t, dir)
}

func TestExportWriteFailureLeavesNothingAndNamesNoAbsolutePath(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root writes anywhere")
	}
	root := exporttest.Seed(t)
	dir := exportOutput(t)
	if err := os.Chmod(dir, 0o555); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(dir, 0o755)
	e := exportFailure(t, root, "internal_error", exporttest.Empty, "-o", filepath.Join(dir, "x.html"))
	if strings.Contains(e.Message, dir) {
		t.Fatalf("absolute path in the message: %q", e.Message)
	}
	noOutputFiles(t, dir)
}

func TestExportTemporaryFileNameFitsTheFileSystem(t *testing.T) {
	long := strings.Repeat("가", 120) + ".html"
	prefix := exportTempPrefix(long)
	if len(prefix)+12 > 255 {
		t.Fatalf("%d bytes", len(prefix))
	}
	if !strings.HasPrefix(prefix, ".") || !strings.Contains(strings.TrimPrefix(prefix, "."), "가") {
		t.Fatalf("prefix %q", prefix)
	}
	if got := exportTempPrefix("a.html"); got != ".a.html.doan-" {
		t.Fatalf("prefix %q", got)
	}
}

func TestExportExitCodesAndUsage(t *testing.T) {
	for _, code := range []string{"export_refused", "export_too_large"} {
		if ExitCode(code) != 2 {
			t.Errorf("%s exits %d", code, ExitCode(code))
		}
	}
	usage := result(t, t.TempDir(), 0, "help")["usage"].(string)
	if !strings.Contains(usage, "export <canvas path> [--frame <id> --prototype] -o <file> [--force]") {
		t.Fatal(usage)
	}
	if result(t, t.TempDir(), 0, "export", "--help")["usage"] == nil {
		t.Fatal("export --help has no usage")
	}
}

func TestExportPlainOutputNamesTheFile(t *testing.T) {
	root := exporttest.Seed(t)
	out := filepath.Join(exportOutput(t), "x.html")
	var stdout, stderr bytes.Buffer
	if code := Run([]string{"export", exporttest.Empty, "-o", out, "--repo", root}, strings.NewReader(""), &stdout, &stderr); code != 0 || stderr.Len() != 0 {
		t.Fatal(code, &stdout, &stderr)
	}
	if !strings.HasPrefix(stdout.String(), "Exported "+exporttest.Empty+" to "+out) {
		t.Fatalf("stdout %q", &stdout)
	}
	var errout bytes.Buffer
	if code := Run([]string{"export", exporttest.RefuseMissing, "-o", out, "--repo", root, "--force"}, strings.NewReader(""), io.Discard, &errout); code != 2 || !strings.HasPrefix(errout.String(), "error: ") {
		t.Fatal(code, &errout)
	}
}

type exportedPage struct{ title, meta, srcdoc string }

func parseExportedPage(t *testing.T, page []byte) exportedPage {
	t.Helper()
	doc, err := html.Parse(bytes.NewReader(page))
	if err != nil {
		t.Fatal(err)
	}
	var p exportedPage
	var visit func(*html.Node)
	visit = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch n.Data {
			case "iframe":
				for _, a := range n.Attr {
					if a.Key == "srcdoc" {
						p.srcdoc = a.Val
					}
				}
			case "script":
				for _, a := range n.Attr {
					if a.Key == "id" && a.Val == "doan-meta" {
						p.meta = n.FirstChild.Data
					}
				}
			case "title":
				if p.title == "" && n.FirstChild != nil {
					p.title = n.FirstChild.Data
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			visit(c)
		}
	}
	visit(doc)
	if p.srcdoc == "" || p.meta == "" {
		t.Fatalf("not a viewer page: srcdoc %d bytes, meta %q", len(p.srcdoc), p.meta)
	}
	return p
}

// localReferences is an independent scan of a document: every reference that is not a data URI, an
// internet URL or a fragment, descending into inlined stylesheets and skipping <template>.
func localReferences(t *testing.T, doc []byte) []string {
	t.Helper()
	var out []string
	var cssRefs func(text string, mode canvas.Mode)
	note := func(href string) {
		href = strings.TrimSpace(href)
		switch {
		case href == "", strings.HasPrefix(href, "#"), strings.HasPrefix(href, "https:"), strings.HasPrefix(href, "http:"):
		case strings.HasPrefix(href, "data:"):
			// Any inlined stylesheet: a <link> or an @import, nested as deep as the imports go.
			if strings.HasPrefix(href, "data:text/css") {
				_, body, _ := strings.Cut(href, ",")
				text, err := url.PathUnescape(body)
				if err != nil {
					t.Fatal(err)
				}
				cssRefs(text, canvas.Stylesheet)
			}
		default:
			out = append(out, href)
		}
	}
	cssRefs = func(text string, mode canvas.Mode) {
		for _, r := range canvas.CSSRefs(text, mode) {
			note(r.Value)
		}
	}
	z := html.NewTokenizer(bytes.NewReader(doc))
	template, inStyle := 0, false
	for {
		switch z.Next() {
		case html.ErrorToken:
			sort.Strings(out)
			return out
		case html.TextToken:
			if inStyle && template == 0 {
				cssRefs(string(z.Text()), canvas.Stylesheet)
			}
		case html.EndTagToken:
			name, _ := z.TagName()
			switch string(name) {
			case "template":
				template--
			case "style":
				inStyle = false
			}
		case html.StartTagToken, html.SelfClosingTagToken:
			name, hasAttr := z.TagName()
			switch string(name) {
			case "template":
				template++
			case "style":
				inStyle = true
			}
			for hasAttr && template == 0 {
				var key, val []byte
				key, val, hasAttr = z.TagAttr()
				switch string(key) {
				case "src", "href", "xlink:href", "poster", "data", "action":
					note(string(val))
				case "srcset":
					// A URL may hold commas (data:), so candidates are told apart by the comma that ends
					// the token before a URL.
					wantURL := true
					for _, field := range strings.Fields(string(val)) {
						if wantURL {
							note(strings.TrimRight(field, ","))
						}
						wantURL = strings.HasSuffix(field, ",")
					}
				case "style":
					cssRefs(string(val), canvas.Declarations)
				}
			}
		}
	}
}

func TestExportReferenceScanSeesWhatItShould(t *testing.T) {
	got := localReferences(t, []byte(`<img src="a.png" srcset="b.png 1x, data:image/png;base64,AA== 2x"><a href="#x"></a><link href="https://x/y.css"><template><img src="t.png"></template><div style="background:url(c.png)"></div><style>@import "d.css"; .a{background:url('e.png')}</style><img src="data:text/plain,hi">`))
	if want := []string{"a.png", "b.png", "c.png", "d.css", "e.png"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("got %q", got)
	}
}

// The scan has to fail when a repo-relative reference is left inside inlined CSS: in a linked stylesheet, in
// an @import inside it, and in the second level of imports.
func TestExportReferenceScanDescendsIntoInlinedCSS(t *testing.T) {
	css := func(text string) string { return "data:text/css;charset=utf-8," + url.PathEscape(text) }
	inner := css(".c{background:url(leak.png)}")
	middle := css("@import url(\"" + inner + "\"); .b{background:url(data:image/png;base64,AA==)}")
	for name, doc := range map[string]string{
		"link":         `<link rel="stylesheet" href="` + css("a{background:url(leak.png)}") + `">`,
		"link import":  `<link rel="stylesheet" href="` + css("@import url(\""+css("a{background:url(leak.png)}")+"\");") + `">`,
		"two levels":   `<link rel="stylesheet" href="` + css("@import url(\""+middle+"\");") + `">`,
		"style import": `<style>@import url("` + inner + `");</style>`,
	} {
		t.Run(name, func(t *testing.T) {
			if got := localReferences(t, []byte(doc)); !reflect.DeepEqual(got, []string{"leak.png"}) {
				t.Fatalf("got %q", got)
			}
		})
	}
	if got := localReferences(t, []byte(`<link rel="stylesheet" href="`+css("a{background:url(data:image/png;base64,AA==)}")+`">`)); len(got) != 0 {
		t.Fatalf("a clean stylesheet reported %q", got)
	}
}

func TestExportInternalErrorsDropThePath(t *testing.T) {
	for _, err := range []error{
		&fs.PathError{Op: "stat", Path: "/Users/someone/repo/.doan/x.html", Err: syscall.EACCES},
		&os.LinkError{Op: "rename", Old: "/Users/someone/.x.doan-1", New: "/Users/someone/x.html", Err: syscall.EXDEV},
	} {
		e := exportInternal(err)
		if e.Code != "internal_error" || strings.Contains(e.Message, "/Users") || len(e.NextSteps) == 0 {
			t.Errorf("%v became %+v", err, e)
		}
	}
	if e := exportInternal(syscall.EACCES); !strings.Contains(e.Message, "permission denied") {
		t.Errorf("the reason was lost: %q", e.Message)
	}
}

// The next steps must not lead an agent past the guide's rules: no moving files or changing the served folders
// on its own, no replacing a file the user did not choose.
func exportNextSteps(t *testing.T, root string, code string, args ...string) string {
	t.Helper()
	got := exportRun(t, root, ExitCode(code), args...)
	steps := got["error"].(map[string]any)["nextSteps"].([]any)
	var all []string
	for _, step := range steps {
		all = append(all, step.(string))
	}
	return strings.Join(all, "\n")
}

func TestExportNextStepsStayWithinTheGuide(t *testing.T) {
	root := exporttest.Seed(t)
	dir := exportOutput(t)
	refused := exportNextSteps(t, root, "export_refused", exporttest.RefuseScope, "-o", filepath.Join(dir, "x.html"))
	for _, want := range []string{"Fix the listed references", "needs the user's approval first"} {
		if !strings.Contains(refused, want) {
			t.Errorf("export_refused next steps lack %q: %s", want, refused)
		}
	}
	for _, banned := range []string{"move the file", "add its folder", "--add-serve"} {
		if strings.Contains(refused, banned) {
			t.Errorf("export_refused next steps tell the agent to %q: %s", banned, refused)
		}
	}
	out := filepath.Join(dir, "y.html")
	if err := os.WriteFile(out, []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	exists := exportNextSteps(t, root, "destination_exists", exporttest.Empty, "-o", out)
	if !strings.Contains(exists, "Ask the user") || !strings.Contains(exists, "only if the user agreed") {
		t.Errorf("destination_exists next steps: %s", exists)
	}
}

// prototypeExportSeed adds canvases for the prototype export to the export seed.
func prototypeExportSeed(t *testing.T) string {
	t.Helper()
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/canvases/proto.html", `<!doctype html><html><head><meta name="doan:canvas" content="proto"><meta name="doan:width" content="800"></head><body>`+
		`<div data-doan-frame="checkout" data-doan-title="Checkout" data-doan-prototype="390x844"></div>`+
		`<div data-doan-frame="plain"></div>`+
		`<div data-doan-frame="padded" data-doan-prototype="390x844 "></div>`+
		`<div data-doan-frame="twice" data-doan-prototype="390x844"></div><div data-doan-frame="twice"></div>`+
		`<div data-doan-frame="`+strings.Repeat("\U0001F98A", 200)+`" data-doan-prototype="390x844"></div>`+
		`<div data-doan-frame="bare &amp; <raw>" data-doan-prototype="320x480"></div>`+
		`</body></html>`)
	// A marked frame in a canvas whose references export refuses.
	exporttest.Put(t, root, ".doan/canvases/proto-refused.html", `<!doctype html><html><head><meta name="doan:canvas" content="proto-refused"><meta name="doan:width" content="800"></head><body>`+
		`<div data-doan-frame="checkout" data-doan-prototype="390x844"><img src="../../src/hero.png"></div></body></html>`)
	exporttest.Put(t, root, ".doan/canvases/deep.html", validCanvas+strings.Repeat("<div>", 600))
	// A marked frame in a canvas with no board width.
	exporttest.Put(t, root, ".doan/canvases/proto-nowidth.html", `<!doctype html><html><head><meta name="doan:canvas" content="proto-nowidth"></head><body>`+
		`<div data-doan-frame="checkout" data-doan-prototype="390x844"></div></body></html>`)
	return root
}

func TestExportPrototypeReportsPrototype(t *testing.T) {
	root := prototypeExportSeed(t)
	out := filepath.Join(exportOutput(t), "proto-checkout.html")
	got := exportRun(t, root, 0, ".doan/canvases/proto.html", "--frame", "checkout", "--prototype", "-o", out)
	page, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"path":      ".doan/canvases/proto.html",
		"output":    out,
		"bytes":     float64(len(page)),
		"frames":    float64(7),
		"external":  []any{},
		"links":     []any{},
		"prototype": true,
	}
	if !reflect.DeepEqual(got["result"], want) {
		t.Fatalf("result\n got %v\nwant %v", got["result"], want)
	}
	var stdout, stderr bytes.Buffer
	plain := filepath.Join(exportOutput(t), "x.html")
	if code := Run([]string{"export", ".doan/canvases/proto.html", "--prototype", "--frame", "checkout", "-o", plain, "--repo", root}, strings.NewReader(""), &stdout, &stderr); code != 0 || stderr.Len() != 0 {
		t.Fatal(code, &stdout, &stderr)
	}
	if !strings.HasPrefix(stdout.String(), "Exported .doan/canvases/proto.html frame checkout to "+plain+" (") {
		t.Fatalf("stdout %q", &stdout)
	}
}

// Without --prototype the result keeps its shape: no prototype key.
func TestExportWithoutPrototypeHasNoPrototypeKey(t *testing.T) {
	root := prototypeExportSeed(t)
	got := exportRun(t, root, 0, ".doan/canvases/proto.html", "-o", filepath.Join(exportOutput(t), "x.html"))
	if _, ok := got["result"].(map[string]any)["prototype"]; ok {
		t.Fatal(got["result"])
	}
}

func TestExportPrototypeFlagPairing(t *testing.T) {
	root := prototypeExportSeed(t)
	dir := exportOutput(t)
	out := filepath.Join(dir, "x.html")
	for _, args := range [][]string{
		{".doan/canvases/proto.html", "--frame", "checkout", "-o", out},
		{".doan/canvases/proto.html", "--prototype", "-o", out},
		{".doan/canvases/proto.html", "--frame", "checkout", "--frame", "plain", "--prototype", "-o", out},
		{".doan/canvases/proto.html", "--frame", "", "--prototype", "-o", out},
		{".doan/canvases/proto.html", "--frame", "checkout", "--prototype"},
	} {
		exportFailure(t, root, "usage_error", args...)
	}
	noOutputFiles(t, dir)
}

func TestExportPrototypeFrameRefusals(t *testing.T) {
	root := prototypeExportSeed(t)
	for _, tt := range []struct {
		name, frame, code string
	}{
		{"no such frame", "nope", "frame_not_found"},
		{"shared frame id", "twice", "frame_not_found"},
		{"id over 200 UTF-16 units", strings.Repeat("\U0001F98A", 200), "frame_not_found"},
		{"unmarked frame", "plain", "not_prototype"},
		{"mark outside the grammar", "padded", "not_prototype"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			dir := exportOutput(t)
			e := exportFailure(t, root, tt.code, ".doan/canvases/proto.html", "--frame", tt.frame, "--prototype", "-o", filepath.Join(dir, "x.html"))
			if ExitCode(tt.code) != 2 || !strings.Contains(e.Message, ".doan/canvases/proto.html") {
				t.Fatalf("exit %d message %q", ExitCode(tt.code), e.Message)
			}
			noOutputFiles(t, dir)
		})
	}
}

// The frame is judged after the canvas checks and before references, size and output.
func TestExportPrototypeRefusalOrder(t *testing.T) {
	root := prototypeExportSeed(t)
	sparse(t, root, ".doan/canvases/proto-huge.html", 50<<20+1)
	dir := exportOutput(t)
	existing := filepath.Join(dir, "exists.html")
	if err := os.WriteFile(existing, []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	fresh := filepath.Join(dir, "x.html")
	for _, tt := range []struct {
		name, canvas, frame, output, code string
	}{
		// The canvas is checked first: an unreadable canvas stays export_refused, as without --prototype.
		{"canvas without a width", ".doan/canvases/proto-nowidth.html", "nope", fresh, "export_refused"},
		{"unparsable canvas", ".doan/canvases/deep.html", "nope", fresh, "export_refused"},
		{"canvas over the size limit", ".doan/canvases/proto-huge.html", "nope", fresh, "export_too_large"},
		{"missing canvas", ".doan/canvases/missing.html", "nope", fresh, "canvas_not_found"},
		// Then the frame, before the references, the size of what it includes and the output.
		{"refused references", ".doan/canvases/proto-refused.html", "nope", fresh, "frame_not_found"},
		{"existing output", ".doan/canvases/proto.html", "plain", existing, "not_prototype"},
		{"refused references, marked frame", ".doan/canvases/proto-refused.html", "checkout", fresh, "export_refused"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			exportFailure(t, root, tt.code, tt.canvas, "--frame", tt.frame, "--prototype", "-o", tt.output)
		})
	}
	if data, err := os.ReadFile(existing); err != nil || string(data) != "keep" {
		t.Fatal(string(data), err)
	}
	if _, err := os.Stat(fresh); !os.IsNotExist(err) {
		t.Fatal(err)
	}
}

type prototypePage struct{ title, frameTitle, sandbox, srcdoc string }

// parsePrototypePage reads the outer page `doan export --prototype` writes: its tab title and the one iframe.
func parsePrototypePage(t *testing.T, page []byte) prototypePage {
	t.Helper()
	doc, err := html.Parse(bytes.NewReader(page))
	if err != nil {
		t.Fatal(err)
	}
	var p prototypePage
	frames := 0
	var visit func(*html.Node)
	visit = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch n.Data {
			case "iframe":
				frames++
				for _, a := range n.Attr {
					switch a.Key {
					case "srcdoc":
						p.srcdoc = a.Val
					case "title":
						p.frameTitle = a.Val
					case "sandbox":
						p.sandbox = a.Val
					}
				}
			case "script":
				for _, a := range n.Attr {
					if a.Key == "id" && a.Val == "doan-meta" {
						t.Fatal("the prototype file is the canvas viewer page")
					}
				}
			case "title":
				if p.title == "" && n.FirstChild != nil {
					p.title = n.FirstChild.Data
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			visit(c)
		}
	}
	visit(doc)
	if frames != 1 {
		t.Fatalf("%d iframes", frames)
	}
	return p
}

func TestExportPrototypeWritesThePrototypePage(t *testing.T) {
	root := prototypeExportSeed(t)
	for _, tt := range []struct {
		name, frameArg, frame, label string
	}{
		{"titled frame", "checkout", "checkout", "Checkout"},
		// A frame without data-doan-title is named by its id; the id's markup characters stay text.
		{"untitled frame", "bare & <raw>", "bare & <raw>", "bare & <raw>"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			out := filepath.Join(exportOutput(t), "p.html")
			exportRun(t, root, 0, ".doan/canvases/proto.html", "--frame", tt.frameArg, "--prototype", "-o", out)
			data, err := os.ReadFile(out)
			if err != nil {
				t.Fatal(err)
			}
			page := parsePrototypePage(t, data)
			if page.title != tt.label+" — Prototype" || page.frameTitle != tt.label {
				t.Fatalf("title %q, iframe title %q", page.title, page.frameTitle)
			}
			if page.sandbox != "allow-scripts allow-forms" {
				t.Fatalf("sandbox %q", page.sandbox)
			}
			frame, _ := json.Marshal(tt.frame)
			if !strings.Contains(page.srcdoc, "const FRAME = "+string(frame)+";") {
				t.Fatalf("srcdoc does not name frame %s", frame)
			}
			// The whole canvas is in the file: the other frames are hidden by the page, not removed.
			if !strings.Contains(page.srcdoc, `data-doan-frame="plain"`) {
				t.Fatal("the srcdoc lost the rest of the canvas")
			}
		})
	}
}

// The app's Export runs the CLI with --frame=<id>, so the attached form must reach the same page.
func TestExportPrototypeFrameFlagWithEquals(t *testing.T) {
	root := prototypeExportSeed(t)
	out := filepath.Join(exportOutput(t), "p.html")
	got := exportRun(t, root, 0, ".doan/canvases/proto.html", "--frame=checkout", "--prototype", "-o", out)
	if got["result"].(map[string]any)["prototype"] != true {
		t.Fatal(got)
	}
	data, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	if page := parsePrototypePage(t, data); page.title != "Checkout — Prototype" {
		t.Fatal(page.title)
	}
}

// The assembled prototype page is checked against the size limit like the canvas page.
func TestExportPrototypeTooLargeAfterEncoding(t *testing.T) {
	root := exporttest.Seed(t)
	if err := os.WriteFile(filepath.Join(root, ".doan/assets/blob.bin"), bytes.Repeat([]byte{0}, 40<<20), 0o644); err != nil {
		t.Fatal(err)
	}
	exporttest.Put(t, root, ".doan/canvases/blob.html", `<!doctype html><html><head><meta name="doan:canvas" content="blob"><meta name="doan:width" content="800"></head><body><div data-doan-frame="a" data-doan-prototype="390x844"><img src="../assets/blob.bin"></div></body></html>`)
	dir := exportOutput(t)
	e := exportFailure(t, root, "export_too_large", ".doan/canvases/blob.html", "--frame", "a", "--prototype", "-o", filepath.Join(dir, "x.html"))
	if got := appLines(e.Message); len(got) == 0 || got[0] != ".doan/assets/blob.bin" {
		t.Fatalf("lines %q in %q", got, e.Message)
	}
	noOutputFiles(t, dir)
}
