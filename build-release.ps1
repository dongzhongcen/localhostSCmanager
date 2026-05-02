# 生成发布 zip 包到主目录
$ErrorActionPreference = "Stop"

$version = "v1.0.0"
$zipName = "ServiceManager-$version.zip"
$tempDir = "temp-release-$version"

Write-Host "=== 开始构建发布包: $zipName ===" -ForegroundColor Cyan

# 先执行清理
if (Test-Path ".\clean-for-release.ps1") {
    Write-Host "执行清理脚本..."
    & ".\clean-for-release.ps1"
}

# 创建临时目录
if (Test-Path $tempDir) {
    Remove-Item -Path $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

# 使用 robocopy 复制文件并排除 node_modules 和 dist
Write-Host "复制 app/ ..."
robocopy "app" "$tempDir\app" /E /XD node_modules dist /R:0 /W:0 | Out-Null

Write-Host "复制 service-manager/ ..."
robocopy "service-manager" "$tempDir\service-manager" /E /XD node_modules dist /R:0 /W:0 | Out-Null

# 复制根目录说明文档
if (Test-Path "使用说明.md") {
    Copy-Item "使用说明.md" "$tempDir\" -Force
    Write-Host "[OK] 复制 使用说明.md"
}

# 删除临时目录中的 .env（双重保险）
Remove-Item -Path "$tempDir\service-manager\app\.env" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$tempDir\app\.env" -Force -ErrorAction SilentlyContinue

# 删除临时目录中的数据库和日志
Remove-Item -Path "$tempDir\service-manager\app\data\services.db" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$tempDir\service-manager\app\data\logs\*" -Recurse -Force -ErrorAction SilentlyContinue

# 生成 zip
$zipPath = Join-Path (Get-Location) $zipName
if (Test-Path $zipPath) {
    Remove-Item -Path $zipPath -Force
}

Write-Host "正在生成 zip 文件..."
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -Force

# 清理临时目录
Remove-Item -Path $tempDir -Recurse -Force

Write-Host "`n=== 发布包构建完成 ===" -ForegroundColor Green
Write-Host "文件路径: $zipPath" -ForegroundColor Yellow
Write-Host "文件大小: $([math]::Round((Get-Item $zipPath).Length / 1MB, 2)) MB"
