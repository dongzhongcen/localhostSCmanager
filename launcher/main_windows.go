//go:build windows

// ServiceManager.exe：服务管理器的 Windows 启动器。
//
// 双击后它会：
//  1. 检查是否已经在运行，在运行就直接打开管理界面然后退出；
//  2. 在后台（没有黑色命令行窗口）用自带的 runtime\node.exe 启动 app\boot.js；
//  3. 等服务就绪后自动打开浏览器；
//  4. 在任务栏右下角放一个托盘图标：打开管理界面 / 查看运行日志 / 退出。
//
// 点“退出”时会先请求后台停止所有服务，再结束自己。
package main

import (
	"crypto/rand"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"fyne.io/systray"
	"golang.org/x/sys/windows"
)

//go:embed assets/icon.ico
var iconData []byte

const (
	appTitle    = "Service Manager"
	mutexName   = "Local\\LocalhostSCManager-Launcher"
	defaultPort = 3000
	maxPort     = 3010
)

var (
	baseDir   string // exe 所在目录
	dataDir   string // 数据目录：services.db 和日志
	logPath   string // 后台运行日志 data\logs\manager.log
	statePath string // 记录当前端口，第二次双击时用来打开已在运行的实例

	port     int
	token    string
	nodeCmd  *exec.Cmd
	nodeDone = make(chan struct{})
	quitting bool
	quitMu   sync.Mutex
)

type state struct {
	Port int `json:"port"`
	Pid  int `json:"pid"`
}

func main() {
	exe, err := os.Executable()
	if err != nil {
		fatal("找不到程序所在目录：" + err.Error())
	}
	baseDir = filepath.Dir(exe)
	dataDir = filepath.Join(baseDir, "data")
	logPath = filepath.Join(dataDir, "logs", "manager.log")
	statePath = filepath.Join(dataDir, "launcher.json")

	// 单实例：已经在运行就打开界面后退出
	name, _ := windows.UTF16PtrFromString(mutexName)
	if _, err := windows.CreateMutex(nil, false, name); err == windows.ERROR_ALREADY_EXISTS {
		if s, ok := readState(); ok {
			openBrowser(s.Port)
		} else {
			messageBox("服务管理器已经在运行，请在任务栏右下角的托盘图标里打开。", windows.MB_ICONINFORMATION)
		}
		return
	}

	if err := os.MkdirAll(filepath.Dir(logPath), 0o755); err != nil {
		fatal("无法创建数据目录 " + dataDir + "：" + err.Error())
	}

	nodeExe := filepath.Join(baseDir, "runtime", "node.exe")
	bootJs := filepath.Join(baseDir, "app", "boot.js")
	for _, p := range []string{nodeExe, bootJs} {
		if _, err := os.Stat(p); err != nil {
			fatal("缺少文件：" + p + "\n\n请把压缩包完整解压后再运行，不要只拷贝 ServiceManager.exe。")
		}
	}

	port = pickPort()
	if port == 0 {
		fatal(fmt.Sprintf("端口 %d 到 %d 都被占用了，请关闭占用端口的程序后再试。", defaultPort, maxPort))
	}
	token = randomToken()

	if err := startNode(nodeExe, bootJs); err != nil {
		fatal("启动失败：" + err.Error())
	}

	if !waitHealthy(30 * time.Second) {
		select {
		case <-nodeDone:
			fatal("后台程序启动后马上退出了。\n\n" + tailLog(15) + "\n\n完整日志：" + logPath)
		default:
			killNode()
			fatal("等了 30 秒后台程序还没就绪，已放弃启动。\n\n完整日志：" + logPath)
		}
	}

	writeState()
	openBrowser(port)

	systray.Run(onReady, onExit)
}

func onReady() {
	systray.SetIcon(iconData)
	systray.SetTitle(appTitle)
	systray.SetTooltip(fmt.Sprintf("%s 正在运行 - http://localhost:%d", appTitle, port))

	mOpen := systray.AddMenuItem("打开管理界面", "在浏览器里打开管理界面")
	mLogs := systray.AddMenuItem("查看运行日志", "打开日志所在文件夹")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("退出（停止所有服务）", "停止所有服务并退出")

	// 左键单击托盘图标也打开管理界面
	systray.SetOnTapped(func() { openBrowser(port) })

	go func() {
		for {
			select {
			case <-mOpen.ClickedCh:
				openBrowser(port)
			case <-mLogs.ClickedCh:
				shellOpen(filepath.Dir(logPath))
			case <-mQuit.ClickedCh:
				setQuitting()
				systray.Quit()
				return
			case <-nodeDone:
				if !isQuitting() {
					messageBox("后台程序意外退出了，服务管理器将关闭。\n\n"+tailLog(15)+"\n\n完整日志："+logPath, windows.MB_ICONERROR)
				}
				systray.Quit()
				return
			}
		}
	}()
}

func onExit() {
	setQuitting()
	shutdownNode()
	_ = os.Remove(statePath)
}

func setQuitting() {
	quitMu.Lock()
	quitting = true
	quitMu.Unlock()
}

func isQuitting() bool {
	quitMu.Lock()
	defer quitMu.Unlock()
	return quitting
}

// startNode 在后台启动 node，不弹出命令行窗口，输出写到 manager.log。
func startNode(nodeExe, bootJs string) error {
	rotateLog()
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	fmt.Fprintf(logFile, "\n========== %s 启动器启动，端口 %d ==========\n", time.Now().Format("2006-01-02 15:04:05"), port)

	cmd := exec.Command(nodeExe, bootJs)
	cmd.Dir = filepath.Dir(bootJs)
	cmd.Env = append(os.Environ(),
		"NODE_ENV=production",
		"PORT="+strconv.Itoa(port),
		"HOST=127.0.0.1",
		"SM_DATA_DIR="+dataDir,
		"SM_SHUTDOWN_TOKEN="+token,
	)
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: windows.CREATE_NO_WINDOW,
	}
	if err := cmd.Start(); err != nil {
		logFile.Close()
		return err
	}
	nodeCmd = cmd
	attachKillOnCloseJob(cmd.Process.Pid)

	go func() {
		_ = cmd.Wait()
		logFile.Close()
		close(nodeDone)
	}()
	return nil
}

// attachKillOnCloseJob 把 node 放进一个 Job：启动器被强制结束时，系统会顺带结束 node 和它启动的服务，
// 不会留下没人管的后台进程。
func attachKillOnCloseJob(pid int) {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return
	}
	info := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	info.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, err := windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info))); err != nil {
		windows.CloseHandle(job)
		return
	}
	h, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, uint32(pid))
	if err != nil {
		windows.CloseHandle(job)
		return
	}
	defer windows.CloseHandle(h)
	if err := windows.AssignProcessToJobObject(job, h); err != nil {
		windows.CloseHandle(job)
	}
	// job 句柄故意不关闭：启动器进程结束时系统关闭它，触发 KILL_ON_JOB_CLOSE
}

// shutdownNode 先请求后台自己停止所有服务并退出，10 秒没退出就强制结束。
func shutdownNode() {
	if nodeCmd == nil {
		return
	}
	select {
	case <-nodeDone:
		return
	default:
	}
	req, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("http://127.0.0.1:%d/api/shutdown", port), nil)
	req.Header.Set("x-shutdown-token", token)
	client := &http.Client{Timeout: 3 * time.Second}
	if resp, err := client.Do(req); err == nil {
		resp.Body.Close()
	}
	select {
	case <-nodeDone:
	case <-time.After(10 * time.Second):
		killNode()
	}
}

func killNode() {
	if nodeCmd == nil || nodeCmd.Process == nil {
		return
	}
	kill := exec.Command("taskkill", "/PID", strconv.Itoa(nodeCmd.Process.Pid), "/T", "/F")
	kill.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	_ = kill.Run()
	select {
	case <-nodeDone:
	case <-time.After(3 * time.Second):
	}
}

func waitHealthy(timeout time.Duration) bool {
	client := &http.Client{Timeout: time.Second}
	url := fmt.Sprintf("http://127.0.0.1:%d/api/health", port)
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		select {
		case <-nodeDone:
			return false
		default:
		}
		if resp, err := client.Get(url); err == nil {
			ok := resp.StatusCode == http.StatusOK
			resp.Body.Close()
			if ok {
				return true
			}
		}
		time.Sleep(300 * time.Millisecond)
	}
	return false
}

// pickPort 优先用 3000，被占用就依次试 3001～3010。
func pickPort() int {
	if v, err := strconv.Atoi(os.Getenv("PORT")); err == nil && v > 0 {
		return v
	}
	for p := defaultPort; p <= maxPort; p++ {
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p))
		if err == nil {
			ln.Close()
			return p
		}
	}
	return 0
}

func randomToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func writeState() {
	b, _ := json.Marshal(state{Port: port, Pid: os.Getpid()})
	_ = os.WriteFile(statePath, b, 0o644)
}

func readState() (state, bool) {
	var s state
	b, err := os.ReadFile(statePath)
	if err != nil || json.Unmarshal(b, &s) != nil || s.Port == 0 {
		return s, false
	}
	return s, true
}

// rotateLog 日志超过 5MB 就改名为 manager.log.old，避免越来越大。
func rotateLog() {
	if fi, err := os.Stat(logPath); err == nil && fi.Size() > 5<<20 {
		_ = os.Remove(logPath + ".old")
		_ = os.Rename(logPath, logPath+".old")
	}
}

func tailLog(n int) string {
	b, err := os.ReadFile(logPath)
	if err != nil {
		return ""
	}
	lines := strings.Split(strings.TrimRight(string(b), "\r\n"), "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return "最近的日志：\n" + strings.Join(lines, "\n")
}

func openBrowser(p int) {
	shellOpen(fmt.Sprintf("http://localhost:%d/", p))
}

func shellOpen(target string) {
	verb, _ := windows.UTF16PtrFromString("open")
	file, _ := windows.UTF16PtrFromString(target)
	_ = windows.ShellExecute(0, verb, file, nil, nil, windows.SW_SHOWNORMAL)
}

func messageBox(text string, flags uint32) {
	t, _ := windows.UTF16PtrFromString(text)
	c, _ := windows.UTF16PtrFromString(appTitle)
	windows.MessageBox(0, t, c, flags|windows.MB_SETFOREGROUND)
}

func fatal(text string) {
	messageBox(text, windows.MB_ICONERROR)
	os.Exit(1)
}
