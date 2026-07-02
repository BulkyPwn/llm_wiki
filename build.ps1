$ErrorActionPreference = "Stop"
$env:HTTP_PROXY = "http://127.0.0.1:7897"
$env:HTTPS_PROXY = "http://127.0.0.1:7897"

$overall = [System.Diagnostics.Stopwatch]::StartNew()

# ── 安装依赖 ──────────────────────────────────────────────
Write-Host "`n[1/3] npm install" -ForegroundColor Cyan
$sw = [System.Diagnostics.Stopwatch]::StartNew()
npm install
$sw.Stop()
Write-Host "  -> done in $($sw.Elapsed.TotalSeconds.ToString('0.0'))s"

# ── 第一步：正常构建 ──────────────────────────────────────
Write-Host "`n[2/3] tauri build" -ForegroundColor Cyan
$sw.Restart()
npm run tauri build
$sw.Stop()
Write-Host "  -> done in $($sw.Elapsed.TotalSeconds.ToString('0.0'))s"

# ── 第二步：去除产物名中的版本号 ──────────────────────────
Write-Host "`n[3/3] rename artifacts (remove version)" -ForegroundColor Cyan
$sw.Restart()

$bundleDir = "$PSScriptRoot\src-tauri\target\release\bundle"
$version = (Get-Content "$PSScriptRoot\src-tauri\tauri.conf.json" | ConvertFrom-Json).version
Get-ChildItem -Path $bundleDir -Recurse -File | Where-Object { $_.Name -match "_$([regex]::Escape($version))" } | ForEach-Object {
    $newName = $_.Name -replace "_$([regex]::Escape($version))", ""
    $newPath = Join-Path $_.Directory.FullName $newName
    if (Test-Path $newPath) { Remove-Item $newPath -Force }
    Rename-Item -Path $_.FullName -NewName $newName
    Write-Host "  $($_.Name)  ->  $newName"
}
$sw.Stop()
Write-Host "  -> done in $($sw.Elapsed.TotalSeconds.ToString('0.0'))s"

# ── 总耗时 ────────────────────────────────────────────────
$overall.Stop()
Write-Host "`n============================================" -ForegroundColor Green
Write-Host "  Build complete in $($overall.Elapsed.TotalSeconds.ToString('0.0'))s" -ForegroundColor Green
Write-Host "============================================`n" -ForegroundColor Green
