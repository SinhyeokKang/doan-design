package export

import (
	"errors"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
	"golang.org/x/sys/unix"
)

// Refusal reasons, in the order resolveAsset checks them.
const (
	ReasonOutside   = "outside the repository"
	ReasonNotServed = "not in the serving scope"
	ReasonMissing   = "not found"
	ReasonFrame     = "local document in a frame"
	// SVG <use> targets are copied into the document, so they need an id
	// that exists in an SVG file and is not already taken.
	ReasonUseFragment  = "use without a fragment"
	ReasonUseID        = "fragment not in the SVG file"
	ReasonUseCollision = "SVG file id already in the canvas"
	ReasonUseType      = "use target is not an SVG file"
	// A <style> in a copied SVG file would apply to the whole canvas.
	ReasonUseStyle = "SVG file has a style element"
)

type assetState int

const (
	assetInside assetState = iota
	assetMissing
	assetRefused
)

type resolved struct {
	State  assetState
	Real   string // real repo-relative path when inside
	Reason string // when refused
}

// resolveAsset applies the app server's order: real path, inside the
// repository, inside the serving scope, then a regular file. base is the
// repo-relative directory of the referencing file. A missing target is not a
// refusal here because CSS files may name files that do not exist.
func resolveAsset(root string, scope []string, base, href string) (resolved, error) {
	p, ok := canvas.LocalPath(href)
	if !ok {
		return resolved{State: assetMissing}, nil
	}
	state, real, err := repo.Resolve(root, filepath.Join(root, filepath.FromSlash(base)), p)
	if err != nil {
		return resolved{}, err
	}
	switch state {
	case repo.Outside:
		return resolved{State: assetRefused, Reason: ReasonOutside}, nil
	case repo.Missing:
		return resolved{State: assetMissing}, nil
	}
	if !served(real, scope) {
		return resolved{State: assetRefused, Reason: ReasonNotServed}, nil
	}
	info, err := os.Stat(filepath.Join(root, filepath.FromSlash(real)))
	if err != nil {
		if repo.IsMissingPath(err) {
			return resolved{State: assetMissing}, nil
		}
		return resolved{}, err
	}
	if !info.Mode().IsRegular() {
		return resolved{State: assetMissing}, nil
	}
	return resolved{State: assetInside, Real: real}, nil
}

// served is the comparison `doan check` uses for css_not_served: equal to or
// under a scope entry, by path segment.
func served(p string, scope []string) bool {
	for _, s := range scope {
		if p == s || strings.HasPrefix(p, s+"/") {
			return true
		}
	}
	return false
}

var errNotRegular = errors.New("not a regular file")

// ReadFile reads the repo-relative real path rel under root. Every segment
// below "/" is opened with O_NOFOLLOW, so a segment swapped for a symlink
// after resolution fails instead of leading the read outside the scope (the
// same purpose as the app server's O_NOFOLLOW_ANY).
func ReadFile(root, rel string) ([]byte, error) {
	data, _, err := readFile(root, rel, -1)
	return data, err
}

var errOverLimit = errors.New("over the size limit")

// readFile is ReadFile that, when max >= 0, returns errOverLimit with the
// file's size instead of reading a file larger than max bytes.
func readFile(root, rel string, max int64) ([]byte, int64, error) {
	absolute, err := filepath.Abs(root)
	if err != nil {
		return nil, 0, err
	}
	realRoot, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return nil, 0, err
	}
	parts := strings.Split(rel, "/")
	for _, part := range parts {
		if part == "" || part == "." || part == ".." {
			return nil, 0, &os.PathError{Op: "open", Path: rel, Err: os.ErrInvalid}
		}
	}
	dirs := append(strings.Split(strings.TrimPrefix(realRoot, "/"), "/"), parts[:len(parts)-1]...)
	fd, err := unix.Open("/", unix.O_RDONLY|unix.O_DIRECTORY|unix.O_CLOEXEC, 0)
	if err != nil {
		return nil, 0, err
	}
	for _, part := range dirs {
		if part == "" {
			continue
		}
		next, err := unix.Openat(fd, part, unix.O_RDONLY|unix.O_DIRECTORY|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
		unix.Close(fd)
		if err != nil {
			return nil, 0, &os.PathError{Op: "open", Path: rel, Err: err}
		}
		fd = next
	}
	// NONBLOCK keeps a FIFO swapped in for the file from hanging the export.
	last, err := unix.Openat(fd, parts[len(parts)-1], unix.O_RDONLY|unix.O_NOFOLLOW|unix.O_NONBLOCK|unix.O_CLOEXEC, 0)
	unix.Close(fd)
	if err != nil {
		return nil, 0, &os.PathError{Op: "open", Path: rel, Err: err}
	}
	file := os.NewFile(uintptr(last), path.Base(rel))
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, 0, err
	}
	if !info.Mode().IsRegular() {
		return nil, 0, &os.PathError{Op: "open", Path: rel, Err: errNotRegular}
	}
	if max >= 0 && info.Size() > max {
		return nil, info.Size(), errOverLimit
	}
	data := make([]byte, info.Size())
	if _, err := io.ReadFull(file, data); err != nil {
		return nil, 0, &os.PathError{Op: "read", Path: rel, Err: err}
	}
	return data, info.Size(), nil
}
