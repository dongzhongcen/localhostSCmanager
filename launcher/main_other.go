//go:build !windows

package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Fprintln(os.Stderr, "ServiceManager 启动器只支持 Windows。其他系统请在 app 目录里用 npm start 启动。")
	os.Exit(1)
}
