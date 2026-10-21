package main

import (
	"github.com/SinhyeokKang/doan-design/cli/internal/cli"
	"os"
)

func main() { os.Exit(cli.Run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr)) }
