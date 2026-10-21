//go:build darwin || linux

package cli

import (
	"os"
	"syscall"
	"unsafe"
)

func isTerminal(file *os.File) bool {
	var termios syscall.Termios
	conn, err := file.SyscallConn()
	if err != nil {
		return false
	}
	terminal := false
	err = conn.Control(func(fd uintptr) {
		_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, fd, terminalGet, uintptr(unsafe.Pointer(&termios)))
		terminal = errno == 0
	})
	return err == nil && terminal
}
