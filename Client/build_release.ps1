param (
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
Set-Location $scriptDir

# Validate version format (e.g. 1.1, 1.2, 2.0)
if ($Version -notmatch "^\d+\.\d+$") {
    Write-Host "[ERROR] Invalid version format. Must be like '1.1' or '2.0'." -ForegroundColor Red
    exit 1
}

$releaseDir = Join-Path $scriptDir "releases\v$Version"
if (Test-Path $releaseDir) {
    Write-Host "[ERROR] Release directory already exists: $releaseDir" -ForegroundColor Red
    Write-Host "Do not silently replace it. Explicit deletion required if you want to rebuild." -ForegroundColor Yellow
    exit 1
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Building UltrON Release v$Version" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Update version_info.txt to match the new version (Version.0.0)
$versionInfoPath = Join-Path $scriptDir "backend\ultron_backend\version_info.txt"
if (Test-Path $versionInfoPath) {
    Write-Host "Updating version_info.txt to ${Version}.0.0..."
    $vParts = $Version.Split('.')
    $major = $vParts[0]
    $minor = $vParts[1]
    
    $content = Get-Content $versionInfoPath
    $content = $content -replace "filevers=\(\d+, \d+, 0, 0\)", "filevers=($major, $minor, 0, 0)"
    $content = $content -replace "prodvers=\(\d+, \d+, 0, 0\)", "prodvers=($major, $minor, 0, 0)"
    $content = $content -replace "StringStruct\('FileVersion', '\d+\.\d+\.0\.0'\)", "StringStruct('FileVersion', '${Version}.0.0')"
    $content = $content -replace "StringStruct\('ProductVersion', '\d+\.\d+\.0\.0'\)", "StringStruct('ProductVersion', '${Version}.0.0')"
    
    $content | Set-Content $versionInfoPath
}

Write-Host "`n[1] Running build_installer.ps1 -Version $Version..."
& .\build_installer.ps1 -Version $Version
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] build_installer.ps1 failed." -ForegroundColor Red
    exit 1
}

Write-Host "`n[2] Creating release directory: releases\v$Version"
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

$setupExeName = "UltrON_Setup_v${Version}.exe"
$srcExe = Join-Path $scriptDir "dist\$setupExeName"
$destExe = Join-Path $releaseDir $setupExeName

Write-Host "[3] Copying installer to release directory..."
Copy-Item -Path $srcExe -Destination $destExe

if (-not (Test-Path $destExe)) {
    Write-Host "[ERROR] Failed to copy installer to release folder." -ForegroundColor Red
    exit 1
}

Write-Host "[4] Generating SHA256.txt..."
$hash = (Get-FileHash -Algorithm SHA256 -Path $destExe).Hash
$date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$shaContent = @"
Filename: $setupExeName
SHA256: $hash
Version: $Version
Build Date: $date
"@
Set-Content -Path (Join-Path $releaseDir "SHA256.txt") -Value $shaContent

Write-Host "[5] Copying documentation if available..."
$docsRoot = Join-Path $scriptDir ".."
$installGuide = Join-Path $docsRoot "UltrON_Installation_Guide.pdf"
if (Test-Path $installGuide) {
    Copy-Item $installGuide -Destination (Join-Path $releaseDir "Installation_Guide.pdf")
}
# Will use markdown if PDF doesn't exist
$releaseNotes = Join-Path $docsRoot "RELEASE_NOTES.md"
if (Test-Path $releaseNotes) {
    Copy-Item $releaseNotes -Destination (Join-Path $releaseDir "Release_Notes.pdf")
}

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "RELEASE CREATED" -ForegroundColor Green
Write-Host "Version: v$Version"
Write-Host "Installer:"
Write-Host "client\releases\v$Version\$setupExeName"
Write-Host "`nSHA256:"
Write-Host "$hash"
Write-Host "`nPrevious releases:"
Write-Host "PRESERVED"
Write-Host "============================================================" -ForegroundColor Green
