/**
 * 版本号与更新公告。
 * 发新版本时：改 APP_VERSION，在 RELEASE_NOTES 最前面加一条，同时更新仓库根目录的 CHANGELOG.md。
 * 界面右上角的版本号、首次打开新版本时弹出的“更新公告”都读这里。
 */
export const APP_VERSION = "1.1.0";

export type ReleaseNote = {
  version: string;
  date: string;
  title: string;
  items: string[];
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "1.1.0",
    date: "2026-10-03",
    title: "双击 exe 就能用，告别命令行",
    items: [
      "新增 ServiceManager.exe：自带 Node 运行环境，双击即启动并自动打开浏览器，不用再装 Node、敲命令",
      "新增系统托盘图标：可以打开管理界面、查看运行日志、退出（退出时会停止所有服务）",
      "修复：停止服务后 mysqld / redis-server / nginx 还在后台运行的问题（现在会结束整个进程树）",
      "修复：主动停止服务后状态显示为“错误”的问题",
      "修复：命令里带空格的路径（如 \"C:\\Program Files\\...\"）无法启动的问题",
      "修复：打包后的版本启动就崩溃（数据库驱动被错误打包、缺少无用的环境变量）",
      "修复：数据和日志位置跟着启动目录走，换个地方启动就“丢配置”的问题",
      "日志标注：每行日志都带时间和标签（INFO / STDOUT / STDERR / ERROR），界面里按标签着色，中文 Windows 的 GBK 输出不再乱码",
      "安全：只监听本机 127.0.0.1，局域网里的其他电脑无法访问管理界面执行命令",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-05-02",
    title: "首个版本",
    items: ["网页界面管理 MySQL、Redis、Nginx 等本地服务：添加、启动、停止、重启、查看日志", "支持开机自启、管理员权限启动、自定义环境变量"],
  },
];
