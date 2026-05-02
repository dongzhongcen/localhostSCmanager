# 清理个人信息和构建产物，准备发布
$ErrorActionPreference = "SilentlyContinue"

Write-Host "=== 开始清理个人信息 ===" -ForegroundColor Cyan

# 1. 删除环境变量文件（保留 .env.example 作为模板）
Remove-Item -Path "service-manager/app/.env" -Force
Write-Host "[OK] 已删除 service-manager/app/.env"

# 2. 清空数据库（删除后程序启动会自动重建空表）
Remove-Item -Path "service-manager/app/data/services.db" -Force
Write-Host "[OK] 已删除 service-manager/app/data/services.db"

# 3. 删除日志和临时批处理文件
Remove-Item -Path "service-manager/app/data/logs/*.log" -Force
Remove-Item -Path "service-manager/app/data/logs/run_service_*.bat" -Force
Write-Host "[OK] 已删除日志和临时批处理文件"

# 4. 删除构建产物和依赖（使用者自行安装）
$dirsToRemove = @(
    "app/node_modules",
    "app/dist",
    "service-manager/app/node_modules",
    "service-manager/app/dist"
)
foreach ($dir in $dirsToRemove) {
    if (Test-Path $dir) {
        Remove-Item -Path $dir -Recurse -Force
        Write-Host "[OK] 已删除 $dir"
    }
}

# 5. 确认作者名已清理（脚本执行前已通过 StrReplaceFile 完成）
$authorCheck = Select-String -Path "app/src/pages/Home.tsx","service-manager/app/src/pages/Home.tsx" -Pattern "dongzhongcen"
if ($authorCheck) {
    Write-Host "[WARN] 发现残留作者名，请手动检查:" -ForegroundColor Yellow
    $authorCheck | ForEach-Object { Write-Host "  $($_.Path):$($_.LineNumber)" }
} else {
    Write-Host "[OK] 作者名已清理"
}

Write-Host "`n=== 清理完成 ===" -ForegroundColor Green
Write-Host "现在可以运行 .\build-release.ps1 生成发布包"
