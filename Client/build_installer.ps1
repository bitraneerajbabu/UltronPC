param (
    [string]$Version = "1.1"
)
$ErrorActionPreference = "Stop"

$isccPath = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $isccPath)) {
    $isccPath = "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
}
if (-not (Test-Path $isccPath)) {
    Write-Host "[ERROR] Inno Setup is not installed. Searched Program Files and LocalAppData." -ForegroundColor Red
    Write-Host "Please install Inno Setup 6 to build the installer."
    exit 1
}

$scriptDir = $PSScriptRoot
Set-Location $scriptDir

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  UltrON Windows Installer Build Script" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[STEP 1] Building UltrON.exe using build_exe.bat..." -ForegroundColor Yellow
cmd.exe /c "build_exe.bat"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] build_exe.bat failed." -ForegroundColor Red
    exit 1
}

$exePath = Join-Path $scriptDir "backend\ultron_backend\dist\UltrON.exe"
if (-not (Test-Path $exePath)) {
    Write-Host "[ERROR] UltrON.exe not found at $exePath" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] UltrON.exe successfully built." -ForegroundColor Green

Write-Host "`n[STEP 2] Building Windows Installer (UltrON_Setup_v${Version}.exe)..." -ForegroundColor Yellow
& $isccPath "/dAppVersion=$Version" "installer.iss"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Inno Setup compilation failed." -ForegroundColor Red
    exit 1
}

$setupExePath = Join-Path $scriptDir "dist\UltrON_Setup_v${Version}.exe"
if (-not (Test-Path $setupExePath)) {
    Write-Host "[ERROR] Setup executable not found at $setupExePath" -ForegroundColor Red
    exit 1
}

Write-Host "`n[SUCCESS] Installer built successfully!" -ForegroundColor Green
Write-Host "Installer Location: $setupExePath"

$hash = Get-FileHash -Algorithm SHA256 -Path $setupExePath
Write-Host "SHA256: $($hash.Hash)" -ForegroundColor Cyan
