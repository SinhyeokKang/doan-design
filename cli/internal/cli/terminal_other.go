//go:build !darwin && !linux

package cli

import "os"

// Interactive initialization targets the platforms supported by this CLI.
func isTerminal(*os.File) bool { return false }
