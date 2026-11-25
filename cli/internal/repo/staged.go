package repo

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
)

// WriteStaged writes data to a temporary file in dir for publish to rename into place; publish must return an error only if
// it did not rename. The file is removed on failure, and on SIGINT/SIGTERM before publish returns, then the process exits 128+signal.
func WriteStaged(dir, pattern string, perm os.FileMode, data []byte, publish func(temp string) error) error {
	return writeStagedWith(dir, pattern, perm, data, (*os.File).Write, publish)
}

func writeStagedWith(dir, pattern string, perm os.FileMode, data []byte, write func(*os.File, []byte) (int, error), publish func(string) error) error {
	// Subscribe before creation so a signal cannot land between owning the file and watching it.
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(signals)
	file, err := os.CreateTemp(dir, pattern)
	if err != nil {
		return err
	}
	temp := file.Name()
	var mu sync.Mutex
	owned := true
	done, stopped := make(chan struct{}), make(chan struct{})
	go func() {
		defer close(stopped)
		select {
		case sig := <-signals:
			mu.Lock()
			if owned {
				if err := os.Remove(temp); err != nil && !os.IsNotExist(err) {
					// The base name only: CLI messages carry no absolute path.
					var pe *fs.PathError
					if errors.As(err, &pe) {
						err = pe.Err
					}
					fmt.Fprintln(os.Stderr, "Cannot remove temporary file "+filepath.Base(temp)+": "+err.Error())
				}
			}
			os.Exit(128 + int(sig.(syscall.Signal)))
		case <-done:
		}
	}()
	defer func() {
		signal.Stop(signals)
		close(done)
		<-stopped
	}()
	err = file.Chmod(perm)
	if err == nil {
		_, err = write(file, data)
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	// Publication and releasing ownership are atomic to the signal cleanup: after the rename another writer may
	// already own the same temporary name.
	mu.Lock()
	defer mu.Unlock()
	if err == nil {
		err = publish(temp)
	}
	if err != nil {
		os.Remove(temp)
	}
	owned = false
	return err
}
