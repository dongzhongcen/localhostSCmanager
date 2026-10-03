## 📢 v1.1.0：双击 exe 就能用，告别命令行

**下载**下面的 `ServiceManager-v1.1.0-win-x64.zip`，解压到任意目录（比如 `D:\Tools\ServiceManager`），双击 `ServiceManager.exe` 即可。不需要安装 Node.js，也不用打开命令行。

启动后浏览器会自动打开管理界面，任务栏右下角会出现托盘图标，右键可以打开界面、查看日志、退出（退出时会停止所有服务）。

### 主要变化

- 新增免安装 exe 和系统托盘图标
- 日志每行带时间和 INFO / STDOUT / STDERR / ERROR 标签，界面里按标签着色、筛选，GBK 输出不再乱码
- 修复停止服务后进程仍在后台运行、停止后状态显示“错误”、带空格的路径无法启动等问题
- 默认只允许本机访问管理界面

完整内容见 [CHANGELOG.md](https://github.com/dongzhongcen/localhostSCmanager/blob/main/CHANGELOG.md)。

### 从 v1.0.0 升级

v1.0.0 的配置在 `service-manager\app\data\services.db`。把整个 `data` 文件夹复制到新版本的 `ServiceManager.exe` 旁边，就能保留原来的服务配置。
