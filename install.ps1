# ═══════════════════════════════════════════════════════════════════════
#   SCRAPPER by BertUI — One-Line Installer for Windows
#   Run in PowerShell (Run as Administrator recommended):
#
#   irm https://raw.githubusercontent.com/BunElysiaReact/SCRAPY/main/install.ps1 | iex
#
# ═══════════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

$REPO      = "BunElysiaReact/SCRAPY"
$SCRAPPER  = "$env:USERPROFILE\.scrapper"
$BIN       = "$SCRAPPER\bin"
$DATA      = "$SCRAPPER\data"
$LOGS      = "$SCRAPPER\logs"
$API       = "$SCRAPPER\python_api"
$EXT_BRAVE = "$SCRAPPER\extension\brave"
$EXT_FF    = "$SCRAPPER\extension\firefox"

# ── Colors ────────────────────────────────────────────────────────────────────
function ok($msg)       { Write-Host "  [+] $msg" -ForegroundColor Green }
function info($msg)     { Write-Host "  [>] $msg" -ForegroundColor Cyan }
function warn($msg)     { Write-Host "  [!] $msg" -ForegroundColor Yellow }
function fail($msg)     { Write-Host "  [X] $msg" -ForegroundColor Red; exit 1 }
function step($n, $msg) { Write-Host "`n  [$n] $msg" -ForegroundColor White }

# ── Banner ────────────────────────────────────────────────────────────────────
Clear-Host
Write-Host ""
Write-Host "  +==================================================+" -ForegroundColor Green
Write-Host "  |   [*]  S C R A P P E R  by BertUI              |" -ForegroundColor Green
Write-Host "  |   Windows Installer                             |" -ForegroundColor Green
Write-Host "  |   Go scrape it - with ease.                     |" -ForegroundColor Green
Write-Host "  +==================================================+" -ForegroundColor Green
Write-Host ""

# ── Helper: download file ─────────────────────────────────────────────────────
function Download($url, $dest) {
    $dir = Split-Path $dest
    if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    try {
        Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
        return $true
    } catch {
        return $false
    }
}

# ── Helper: detect installed browsers ────────────────────────────────────────
function Detect-Browsers {
    $found = @()
    $paths = @(
        @{ name="Brave";   exe="$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe" },
        @{ name="Chrome";  exe="$env:PROGRAMFILES\Google\Chrome\Application\chrome.exe" },
        @{ name="Chrome";  exe="${env:PROGRAMFILES(X86)}\Google\Chrome\Application\chrome.exe" },
        @{ name="Chrome";  exe="$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" },
        @{ name="Edge";    exe="${env:PROGRAMFILES(X86)}\Microsoft\Edge\Application\msedge.exe" },
        @{ name="Firefox"; exe="$env:PROGRAMFILES\Mozilla Firefox\firefox.exe" },
        @{ name="Firefox"; exe="${env:PROGRAMFILES(X86)}\Mozilla Firefox\firefox.exe" }
    )
    foreach ($b in $paths) {
        if (Test-Path $b.exe) { $found += $b.name }
    }
    return ($found | Sort-Object -Unique)
}

# ── Helper: native messaging manifest paths ───────────────────────────────────
function Get-ManifestDirs($browsers) {
    $dirs = @()
    foreach ($b in $browsers) {
        switch ($b) {
            "Brave"  { $dirs += "$env:APPDATA\BraveSoftware\Brave-Browser\NativeMessagingHosts" }
            "Chrome" { $dirs += "$env:APPDATA\Google\Chrome\NativeMessagingHosts" }
            "Edge"   { $dirs += "$env:APPDATA\Microsoft\Edge\NativeMessagingHosts" }
        }
    }
    if ($dirs.Count -eq 0) {
        warn "No Brave/Chrome/Edge detected — installing manifests in all common locations"
        $dirs += "$env:APPDATA\BraveSoftware\Brave-Browser\NativeMessagingHosts"
        $dirs += "$env:APPDATA\Google\Chrome\NativeMessagingHosts"
        $dirs += "$env:APPDATA\Microsoft\Edge\NativeMessagingHosts"
    }
    return $dirs
}

# ── Helper: write native messaging manifest ───────────────────────────────────
function Write-Manifest($dir, $extId = "YOUR_EXTENSION_ID_HERE") {
    if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $hostPath = "$BIN\debug_host.exe" -replace '\\', '\\\\'
    @"
{
  "name": "com.scraper.core",
  "description": "SCRAPPER Native Host - BertUI Framework",
  "path": "$hostPath",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$extId/"
  ]
}
"@ | Out-File -FilePath "$dir\com.scraper.core.json" -Encoding UTF8
}

# ── Helper: Firefox native messaging ─────────────────────────────────────────
function Write-Firefox-Manifest {
    $ffDirs = @(
        "$env:APPDATA\Mozilla\NativeMessagingHosts",
        "$env:LOCALAPPDATA\Mozilla\NativeMessagingHosts"
    )
    $hostPath = "$BIN\debug_host.exe" -replace '\\', '\\\\'
    $json = @"
{
  "name": "com.scraper.core",
  "description": "SCRAPPER Native Host - BertUI Framework",
  "path": "$hostPath",
  "type": "stdio",
  "allowed_extensions": ["scrapper@bertui.dev"]
}
"@
    foreach ($dir in $ffDirs) {
        if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        $json | Out-File -FilePath "$dir\com.scraper.core.json" -Encoding UTF8
        ok "Firefox manifest → $dir"
    }
}

# ════════════════════════════════════════════════════════════════════════════════

# ── Step 1: Create directories ────────────────────────────────────────────────
step "1/5" "Creating SCRAPPER directories"
foreach ($d in @($SCRAPPER, $BIN, $DATA, $LOGS, $API, $EXT_BRAVE, $EXT_FF)) {
    if (!(Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}
ok "SCRAPPER home: $SCRAPPER"

# ── Step 2: Download & extract tarball ───────────────────────────────────────
step "2/5" "Downloading SCRAPPER"

$TARBALL_URL = "https://github.com/$REPO/raw/main/windows.tar.gz"
$TARBALL     = "$env:TEMP\scrapper-windows.tar.gz"

info "Downloading windows bundle..."
$got = Download $TARBALL_URL $TARBALL
if (!$got) { fail "Failed to download windows.tar.gz from repo." }
ok "Downloaded"

info "Extracting..."
tar -xzf $TARBALL -C $SCRAPPER --strip-components=1
ok "Extracted to $SCRAPPER"

Remove-Item $TARBALL -Force
ok "Cleaned up temp files"

# Patch hardcoded paths in api.py
if (Test-Path "$API\api.py") {
    $content = Get-Content "$API\api.py" -Raw
    $content = $content -replace '/home/PeaseErnest/scraper', ($SCRAPPER -replace '\\', '/')
    $content | Out-File -FilePath "$API\api.py" -Encoding UTF8
    ok "api.py paths patched"
}

# Copy binaries to bin/
if (Test-Path "$SCRAPPER\c_core\native_host\debug_host.exe") {
    Copy-Item "$SCRAPPER\c_core\native_host\debug_host.exe" "$BIN\debug_host.exe" -Force
    ok "debug_host.exe ready"
} else {
    warn "debug_host.exe not found in archive — native messaging won't work"
}

if (Test-Path "$SCRAPPER\rust_finder\rust_finder.exe") {
    Copy-Item "$SCRAPPER\rust_finder\rust_finder.exe" "$BIN\rust_finder.exe" -Force
    ok "rust_finder.exe ready"
} else {
    warn "rust_finder.exe not found — Find tab will be disabled"
}

# ── Step 3: Register native messaging ─────────────────────────────────────────
step "3/5" "Registering native messaging"

$browsers = Detect-Browsers
if ($browsers.Count -gt 0) { info "Found: $($browsers -join ', ')" }

$manifestDirs = Get-ManifestDirs $browsers
foreach ($dir in $manifestDirs) {
    Write-Manifest $dir
    ok "Manifest installed → $dir"
}

if ($browsers -contains "Firefox") {
    Write-Firefox-Manifest
}

# ── Step 4: Create launcher scripts ──────────────────────────────────────────
step "4/5" "Creating launcher scripts"

@"
@echo off
title SCRAPPER by BertUI
echo.
echo   [*] Starting SCRAPPER...
echo   [>] API + built-in UI: http://localhost:8080
echo   [>] Press Ctrl+C to stop.
echo.
python "$API\api.py"
"@ | Out-File -FilePath "$BIN\scrapper-start.bat" -Encoding ASCII
ok "scrapper-start.bat"

@"
@echo off
echo Stopping SCRAPPER...
taskkill /F /IM python.exe /FI "WINDOWTITLE eq SCRAPPER*" 2>nul
echo Done.
"@ | Out-File -FilePath "$BIN\scrapper-stop.bat" -Encoding ASCII
ok "scrapper-stop.bat"

@"
param([string]`$ExtId)
if (-not `$ExtId) {
    Write-Host "Usage: scrapper-register-ext.ps1 YOUR_EXTENSION_ID" -ForegroundColor Yellow
    Write-Host "Find your ID at brave://extensions or chrome://extensions"
    exit 1
}
`$dirs = @(
    "`$env:APPDATA\BraveSoftware\Brave-Browser\NativeMessagingHosts",
    "`$env:APPDATA\Google\Chrome\NativeMessagingHosts",
    "`$env:APPDATA\Microsoft\Edge\NativeMessagingHosts"
)
`$hostPath = "$($BIN -replace '\\','\\\\')\\debug_host.exe"
`$json = @"
{
  "name": "com.scraper.core",
  "description": "SCRAPPER Native Host - BertUI Framework",
  "path": "`$hostPath",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://`$ExtId/"]
}
"@
foreach (`$dir in `$dirs) {
    if (Test-Path `$dir) {
        `$json | Out-File "`$dir\com.scraper.core.json" -Encoding UTF8
        Write-Host "  [+] Updated: `$dir" -ForegroundColor Green
    }
}
Write-Host ""
Write-Host "  [+] Extension ID registered. Reload your extension." -ForegroundColor Green
"@ | Out-File -FilePath "$BIN\scrapper-register-ext.ps1" -Encoding UTF8
ok "scrapper-register-ext.ps1"

# ── Step 5: PATH ──────────────────────────────────────────────────────────────
step "5/5" "Updating PATH"
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*\.scrapper\bin*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$BIN", "User")
    ok "Added $BIN to user PATH"
}

# ── Checks ────────────────────────────────────────────────────────────────────
if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    warn "Python 3 not found! Download from https://python.org"
}
if (!(Get-Command bun -ErrorAction SilentlyContinue) -and !(Get-Command node -ErrorAction SilentlyContinue)) {
    warn "Bun or Node.js not found. Bun dashboard requires one. https://bun.sh"
}

# ── Final output ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  +==================================================+" -ForegroundColor Green
Write-Host "  |  SCRAPPER installed to $SCRAPPER" -ForegroundColor Green
Write-Host "  +==================================================+" -ForegroundColor Green
Write-Host ""
Write-Host "  HOW TO COMPLETE SETUP:" -ForegroundColor White
Write-Host ""
Write-Host "  Step 1.  Load the extension in Brave/Chrome:" -ForegroundColor Cyan
Write-Host "           brave://extensions → Developer mode ON"
Write-Host "           → 'Load unpacked' → select:"
Write-Host "           $EXT_BRAVE" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Step 2.  Copy your extension ID, then run:" -ForegroundColor Cyan
Write-Host "           scrapper-register-ext.ps1 YOUR_EXTENSION_ID" -ForegroundColor White
Write-Host ""
Write-Host "  Step 3.  Start SCRAPPER:" -ForegroundColor Cyan
Write-Host "           scrapper-start.bat" -ForegroundColor White
Write-Host ""
Write-Host "  Step 4.  Open dashboard:" -ForegroundColor Cyan
Write-Host "           http://localhost:8080" -ForegroundColor White
Write-Host ""
Write-Host "  API:  http://localhost:8080/api/v1/session/all" -ForegroundColor DarkGray
Write-Host "  Bulk: http://localhost:8080/api/v1/bulk/all?format=json" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  [*] Go scrape it - with ease." -ForegroundColor Green
Write-Host ""