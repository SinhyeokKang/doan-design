package cli

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net"
	"os"
	"time"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

// One budget covers dial, write and read, so an app that accepts but never answers still ends the command.
const activeTimeout = 2 * time.Second
const maxResponseLine = 64 << 10

// The app writes about 200 bytes; the cap keeps a device like /dev/zero from filling memory.
const maxRuntimeFile = 64 << 10

type runtimeFile struct{ Socket, Token string }

func appError(code, message string) *Error {
	steps := map[string][]string{
		// A sandbox can deny the socket even while the app is running; the MCP server runs outside that sandbox.
		"app_not_running":       {"Ask the user to open Doan", "If Doan is open, a sandbox may block this shell from its socket: call the MCP `active` tool if it is available", "Otherwise, run `doan` outside the sandbox or request approval; Codex sessions started after Doan opens may run `doan` by name outside the sandbox; restart earlier sessions", "If it still fails with Doan open, ask the user to open Doan from Applications and check Settings… > About"},
		"app_protocol_mismatch": {"Ask the user to update Doan and the doan CLI to matching versions"},
		"project_not_open":      {"Ask the user to add this project in Doan (Add Project…), or work in the worktree that is open in Doan"},
	}[code]
	return &Error{Code: code, Message: message, NextSteps: steps}
}

// decodeVersioned reads exactly one JSON object and normalizes a numeric v,
// so 1.0 reads as 1 (as config does) and any other number is a version mismatch
// regardless of the rest of the shape.
func decodeVersioned(data []byte) (map[string]any, bool, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var value any
	if e := decoder.Decode(&value); e != nil {
		return nil, false, e
	}
	var extra any
	if e := decoder.Decode(&extra); e != io.EOF {
		return nil, false, errors.New("trailing data")
	}
	obj, ok := value.(map[string]any)
	if !ok {
		return nil, false, errors.New("not an object")
	}
	if n, ok := obj["v"].(json.Number); ok {
		v, e := n.Float64()
		if e != nil || v != 1 {
			return obj, true, nil
		}
		obj["v"] = v
	}
	return obj, false, nil
}

func readRuntime(data []byte) (runtimeFile, string) {
	obj, mismatch, e := decodeVersioned(data)
	if mismatch {
		return runtimeFile{}, "app_protocol_mismatch"
	}
	if e != nil || formats.ValidateRuntimeFile(obj) != nil {
		return runtimeFile{}, "app_not_running"
	}
	return runtimeFile{Socket: obj["socket"].(string), Token: obj["token"].(string)}, ""
}

// readResponse returns the selection without its root, which only travels on the wire.
func readResponse(line []byte) (map[string]any, *Error) {
	obj, mismatch, e := decodeVersioned(line)
	if mismatch {
		return nil, appError("app_protocol_mismatch", "Doan answered with another protocol version")
	}
	if e != nil {
		return nil, internal(errors.New("Doan sent a response that is not a JSON object"))
	}
	if e := formats.ValidateSocketResponse(obj); e != nil {
		return nil, internal(errors.New("Doan sent a response that does not match app-socket v1"))
	}
	if obj["ok"] == false {
		switch obj["error"].(map[string]any)["code"] {
		case "bad_token":
			// The runtime file outlived the app that wrote it; a new app has another token.
			return nil, appError("app_not_running", "Doan rejected the token in its runtime file")
		case "project_not_open":
			return nil, appError("project_not_open", "This project is not open in Doan")
		default:
			return nil, internal(errors.New("Doan rejected the request as malformed"))
		}
	}
	selection, ok := obj["result"].(map[string]any)["selection"].(map[string]any)
	if !ok {
		return nil, nil
	}
	delete(selection, "root")
	return selection, nil
}

// readRuntimeBytes runs before the 2 s budget starts, so it must not block:
// opening a FIFO for reading waits for a writer, hence the regular-file check first.
func readRuntimeBytes(path string) ([]byte, bool) {
	info, e := os.Stat(path)
	if e != nil || !info.Mode().IsRegular() {
		return nil, false
	}
	f, e := os.Open(path)
	if e != nil {
		return nil, false
	}
	defer f.Close()
	data, e := io.ReadAll(io.LimitReader(f, maxRuntimeFile+1))
	if e != nil || len(data) > maxRuntimeFile {
		return nil, false
	}
	return data, true
}

func readLine(conn net.Conn) ([]byte, *Error) {
	line, e := bufio.NewReader(io.LimitReader(conn, maxResponseLine+1)).ReadBytes('\n')
	if e == nil {
		return line, nil
	}
	if len(line) > maxResponseLine {
		return nil, internal(errors.New("Doan sent a response longer than 64 KiB"))
	}
	var ne net.Error
	if len(line) == 0 || (errors.As(e, &ne) && ne.Timeout()) {
		return nil, appError("app_not_running", "Doan did not answer")
	}
	return nil, internal(errors.New("Doan closed the connection in the middle of a response"))
}

func Active(ctx Context, f Flags, args []string) (Outcome, *Error) {
	if len(args) != 0 {
		return Outcome{}, usageError("active takes no positional arguments")
	}
	r, failure := repository(ctx, f)
	if failure != nil {
		return Outcome{}, failure
	}
	data, ok := readRuntimeBytes(ctx.RuntimePath)
	if !ok {
		return Outcome{}, appError("app_not_running", "Cannot read the Doan runtime file: "+ctx.RuntimePath)
	}
	rt, code := readRuntime(data)
	if code == "app_protocol_mismatch" {
		return Outcome{}, appError(code, "The Doan runtime file has another protocol version: "+ctx.RuntimePath)
	} else if code != "" {
		return Outcome{}, appError(code, "The Doan runtime file is not valid: "+ctx.RuntimePath)
	}
	deadline := ctx.Now().Add(activeTimeout)
	conn, e := ctx.Dial(rt.Socket, deadline)
	if e != nil {
		return Outcome{}, appError("app_not_running", "Cannot connect to Doan: "+e.Error())
	}
	defer conn.Close()
	if e := conn.SetDeadline(deadline); e != nil {
		return Outcome{}, internal(e)
	}
	request, e := json.Marshal(map[string]any{"v": 1, "token": rt.Token, "root": r.Root})
	if e != nil {
		return Outcome{}, internal(e)
	}
	if _, e := conn.Write(append(request, '\n')); e != nil {
		return Outcome{}, appError("app_not_running", "Cannot send to Doan: "+e.Error())
	}
	line, failure := readLine(conn)
	if failure != nil {
		return Outcome{}, failure
	}
	selection, failure := readResponse(line)
	if failure != nil {
		return Outcome{}, failure
	}
	result := map[string]any{"repo": r.Root}
	if selection != nil {
		result["selection"] = selection
	}
	return Outcome{Result: result}, nil
}
