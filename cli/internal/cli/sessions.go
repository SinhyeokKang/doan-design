package cli

import (
	"bufio"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
	"golang.org/x/sys/unix"
)

type sessionRecording struct {
	Path, Runtime, ID, ConfigDir string
	directory                    os.FileInfo
}

func sessionFromEnvironment(home string) *sessionRecording {
	return sessionSettings(home, os.Getenv("DOAN_RUNTIME"), os.Getenv("CLAUDE_CODE_SESSION_ID"), os.Getenv("CODEX_THREAD_ID"), os.Getenv("CODEX_SESSION_ID"), os.Getenv("CLAUDE_CONFIG_DIR"), os.Getenv("CODEX_HOME"))
}

func sessionSettings(home, runtimePath, claude, thread, legacy, claudeConfig, codexConfig string) *sessionRecording {
	if (claude != "" && (thread != "" || legacy != "")) || (thread != "" && legacy != "" && thread != legacy) {
		return nil
	}
	runtime, id, config := "claude", claude, claudeConfig
	if claude == "" {
		runtime, id, config = "codex", thread, codexConfig
		if id == "" {
			id = legacy
		}
	}
	if id == "" || strings.HasPrefix(id, "-") || strings.ContainsRune(id, 0) {
		return nil
	}
	if config == "" {
		if !filepath.IsAbs(home) {
			return nil
		}
		config = filepath.Join(home, "."+runtime)
	}
	config, ok := sessionDirectory(config)
	if !ok {
		return nil
	}
	if runtimePath == "" {
		if !filepath.IsAbs(home) {
			return nil
		}
		runtimePath = filepath.Join(home, "Library", "Application Support", "doan", "runtime.json")
	}
	if !filepath.IsAbs(runtimePath) || strings.ContainsRune(runtimePath, 0) {
		return nil
	}
	dir, ok := sessionDirectory(filepath.Dir(runtimePath))
	if !ok {
		return nil
	}
	info, e := os.Lstat(dir)
	if e != nil || !info.IsDir() {
		return nil
	}
	return &sessionRecording{Path: filepath.Join(dir, "sessions.jsonl"), Runtime: runtime, ID: id, ConfigDir: config, directory: info}
}

func sessionDirectory(path string) (string, bool) {
	if !filepath.IsAbs(path) || strings.ContainsRune(path, 0) {
		return "", false
	}
	// Resolve also restores filesystem spelling on case-insensitive macOS volumes.
	state, rel, e := repo.Resolve("/", "/", strings.TrimPrefix(path, "/"))
	if e != nil || state != repo.Inside {
		return "", false
	}
	canonical := filepath.Join("/", rel)
	st, e := os.Stat(canonical)
	if e != nil || !st.IsDir() {
		return "", false
	}
	return canonical, true
}

func sessionCanvasKey(canvas map[string]any) string {
	if id, ok := canvas["id"].(string); ok {
		return "id:" + id
	}
	return "path:" + canvas["path"].(string)
}

type priorSession struct {
	hash string
	at   time.Time
}

// Stream the history one line at a time: malformed lines must not hide later
// valid records, and the format imposes no per-record length limit.
func priorSessions(file *os.File, root string) (map[string]priorSession, bool, error) {
	prior := map[string]priorSession{}
	reader := bufio.NewReader(file)
	for {
		line, e := reader.ReadBytes('\n')
		if e == io.EOF {
			return prior, len(line) > 0, nil
		}
		if e != nil {
			return nil, false, e
		}
		var row map[string]any
		if json.Unmarshal(line, &row) != nil || formats.ValidateSessionRecord(row) != nil || row["root"] != root {
			continue
		}
		at, e := time.Parse(time.RFC3339Nano, row["at"].(string))
		if e != nil {
			continue
		}
		key := sessionCanvasKey(row["canvas"].(map[string]any))
		old, exists := prior[key]
		if !exists || !at.Before(old.at) {
			prior[key] = priorSession{row["hash"].(string), at}
		}
	}
}

// Recording is best effort: failures must never alter check's result or output.
func recordSessions(ctx Context, root string, files []canvasFile) {
	if ctx.Session == nil || len(files) == 0 || ctx.Now == nil {
		return
	}
	canonicalRoot, ok := sessionDirectory(root)
	if !ok {
		return
	}
	cwd, ok := sessionDirectory(ctx.Start)
	if !ok {
		return
	}
	rel, e := filepath.Rel(canonicalRoot, cwd)
	if e != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return
	}
	directory, e := openSessionDirectory(filepath.Dir(ctx.Session.Path), ctx.Session.directory)
	if e != nil {
		return
	}
	defer directory.Close()
	output, e := openSessionLog(directory)
	if e != nil {
		return
	}
	defer output.Close()
	prior, torn, e := priorSessions(output, canonicalRoot)
	if e != nil {
		return
	}
	for _, file := range files {
		c := map[string]any{"path": file.Model.Path}
		if !file.Model.IDDup && kebabID.MatchString(file.Model.ID) {
			c["id"] = file.Model.ID
		}
		hash := fmt.Sprintf("sha256:%x", sha256.Sum256(file.Data))
		if old, ok := prior[sessionCanvasKey(c)]; ok && old.hash == hash {
			continue
		}
		row := map[string]any{"v": 1, "at": ctx.Now().UTC().Format("2006-01-02T15:04:05.000Z"), "root": canonicalRoot, "canvas": c, "hash": hash, "runtime": ctx.Session.Runtime, "sessionId": ctx.Session.ID, "cwd": cwd, "configDir": ctx.Session.ConfigDir}
		if formats.ValidateSessionRecord(row) != nil {
			continue
		}
		data, e := json.Marshal(row)
		if e != nil {
			continue
		}
		data = append(data, '\n')
		// Preserve a torn fragment as an invalid line, never splice a valid record into it.
		if torn {
			data = append([]byte{'\n'}, data...)
			torn = false
		}
		n, e := output.Write(data)
		if e != nil || n != len(data) {
			return
		}
	}
}

// Walk the canonical spelling without following replacement ancestors. The final
// identity must still be the directory validated when settings were captured.
func openSessionDirectory(path string, expected os.FileInfo) (*os.File, error) {
	if expected == nil || !filepath.IsAbs(path) {
		return nil, os.ErrInvalid
	}
	fd, e := unix.Open("/", unix.O_RDONLY|unix.O_DIRECTORY|unix.O_CLOEXEC, 0)
	if e != nil {
		return nil, e
	}
	for _, part := range strings.Split(strings.TrimPrefix(filepath.Clean(path), "/"), "/") {
		if part == "" {
			continue
		}
		next, err := unix.Openat(fd, part, unix.O_RDONLY|unix.O_DIRECTORY|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
		unix.Close(fd)
		if err != nil {
			return nil, err
		}
		fd = next
	}
	dir := os.NewFile(uintptr(fd), path)
	info, e := dir.Stat()
	if e != nil || !info.IsDir() || !os.SameFile(expected, info) {
		dir.Close()
		return nil, os.ErrInvalid
	}
	return dir, nil
}

// One descriptor serves both history and append, so replacing the final name
// cannot redirect either operation. NONBLOCK prevents a FIFO from hanging check.
func openSessionLog(directory *os.File) (*os.File, error) {
	flags := unix.O_RDWR | unix.O_APPEND | unix.O_NOFOLLOW | unix.O_NONBLOCK | unix.O_CLOEXEC
	fd, e := unix.Openat(int(directory.Fd()), "sessions.jsonl", flags, 0)
	if e == unix.ENOENT {
		fd, e = unix.Openat(int(directory.Fd()), "sessions.jsonl", flags|unix.O_CREAT|unix.O_EXCL, 0600)
		if e == unix.EEXIST {
			fd, e = unix.Openat(int(directory.Fd()), "sessions.jsonl", flags, 0)
		}
	}
	if e != nil {
		return nil, e
	}
	file := os.NewFile(uintptr(fd), "sessions.jsonl")
	info, e := file.Stat()
	if e != nil || !info.Mode().IsRegular() {
		file.Close()
		return nil, os.ErrInvalid
	}
	return file, nil
}
