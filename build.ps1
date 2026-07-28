$ErrorActionPreference = "Stop"
$env:HTTP_PROXY = "http://127.0.0.1:7897"
$env:HTTPS_PROXY = "http://127.0.0.1:7897"

# Configuration
$certSubject = "CN=LLM Wiki Internal CA, O=LLMWiki, C=CN"
$certFriendlyName = "LLM Wiki Code Signing"
$certPassword = "LLMWiki2024"
$certValidityYears = 3

$overall = [System.Diagnostics.Stopwatch]::StartNew()

# [1/4] npm install
Write-Host "`n[1/4] npm install" -ForegroundColor Cyan
$sw = [System.Diagnostics.Stopwatch]::StartNew()
npm install
$sw.Stop()
Write-Host "  -> done in $($sw.Elapsed.TotalSeconds.ToString('0.0'))s"

# [2/4] tauri build
Write-Host "`n[2/4] tauri build" -ForegroundColor Cyan
$sw.Restart()
npm run tauri build
$sw.Stop()
Write-Host "  -> done in $($sw.Elapsed.TotalSeconds.ToString('0.0'))s"

# [3/4] rename artifacts (remove version)
Write-Host "`n[3/4] rename artifacts (remove version)" -ForegroundColor Cyan
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

# [4/4] sign msi & exe
Write-Host "`n[4/4] sign msi & exe" -ForegroundColor Cyan
$sw.Restart()

$msiDir = "$bundleDir\msi"
$nsisDir = "$bundleDir\nsis"
$pfxPath = "$msiDir\llm-wiki-cs.pfx"
$cerPath = "$msiDir\llm-wiki-cs.cer"

# 3a. Generate self-signed code signing cert (first time only)
$existingCert = Get-ChildItem "Cert:\CurrentUser\My" -ErrorAction SilentlyContinue |
    Where-Object { $_.Subject -eq $certSubject } |
    Select-Object -First 1

if ($existingCert) {
    Write-Host "  [cert] Reusing existing cert: $($existingCert.Thumbprint)"
    $cert = $existingCert
} else {
    Write-Host "  [cert] Generating new self-signed certificate..."
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject $certSubject `
        -KeyUsage DigitalSignature `
        -FriendlyName $certFriendlyName `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -HashAlgorithm SHA256 `
        -NotAfter (Get-Date).AddYears($certValidityYears)
    Write-Host "  [cert] Certificate generated: $($cert.Thumbprint)"
}

# 3b. Export PFX and CER
$securePwd = ConvertTo-SecureString -String $certPassword -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePwd -Force | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath -Force | Out-Null
Write-Host "  [cert] PFX -> $pfxPath"
Write-Host "  [cert] CER -> $cerPath"

# 3c. Find signtool
$signtool = @(
    "$env:WindowsSdkVerBinPath\x64\signtool.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $signtool) {
    $sdkRoot = "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows Kits\Installed Roots"
    if (Test-Path $sdkRoot) {
        $kitsRoot = (Get-ItemProperty $sdkRoot).KitsRoot10
        if ($kitsRoot) {
            $signtool = Get-ChildItem "$kitsRoot\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
                Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
        }
    }
}

if (-not $signtool) {
    Write-Warning "  [sign] signtool.exe not found, skipping signing. Install Windows SDK."
} else {
    Write-Host "  [sign] signtool: $signtool"

    # 3d. Sign MSI
    $msiFile = Get-ChildItem "$msiDir\*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($msiFile) {
        Write-Host "  [sign] Signing MSI: $($msiFile.Name)"
        & $signtool sign /f $pfxPath /p $certPassword /fd SHA256 $msiFile.FullName
        if ($LASTEXITCODE -ne 0) { Write-Warning "  [sign] MSI signing failed (exit $LASTEXITCODE)" }
    }

    # 3e. Sign NSIS exe
    $exeFile = Get-ChildItem "$nsisDir\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($exeFile) {
        Write-Host "  [sign] Signing EXE: $($exeFile.Name)"
        & $signtool sign /f $pfxPath /p $certPassword /fd SHA256 $exeFile.FullName
        if ($LASTEXITCODE -ne 0) { Write-Warning "  [sign] EXE signing failed (exit $LASTEXITCODE)" }
    }
}

$sw.Stop()
Write-Host "  -> done in $($sw.Elapsed.TotalSeconds.ToString('0.0'))s"

# Total time
$overall.Stop()
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Build complete in $($overall.Elapsed.TotalSeconds.ToString('0.0'))s" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""