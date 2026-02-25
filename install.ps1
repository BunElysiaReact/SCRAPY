# ═══════════════════════════════════════════════════════════════════════
#   SCRAPPER by BertUI — One-Line Installer for Windows
#   Run in PowerShell (Run as Administrator recommended):
#
#   irm https://raw.githubusercontent.com/BunElysiaReact/SCRAPY/main/install.ps1 | iex
#
# ═══════════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

$REPO       = "BunElysiaReact/SCRAPY"
$REPO_RAW   = "https://raw.githubusercontent.com/$REPO/main"
$REPO_API   = "https://api.github.com/repos/$REPO/releases/latest"
$SCRAPPER   = "$env:USERPROFILE\.scrapper"
$BIN        = "$SCRAPPER\bin"
$DATA       = "$SCRAPPER\data"
$LOGS       = "$SCRAPPER\logs"
$EXT_BRAVE  = "$SCRAPPER\extension\brave"
$EXT_FF     = "$SCRAPPER\extension\firefox"
$API        = "$SCRAPPER\python_api"

# ── Colors ────────────────────────────────────────────────────────────────────
function ok($msg)   { Write-Host "  [+] $msg" -ForegroundColor Green }
function info($msg) { Write-Host "  [>] $msg" -ForegroundColor Cyan }
function warn($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }
function fail($msg) { Write-Host "  [X] $msg" -ForegroundColor Red; exit 1 }
function step($n,$msg) { Write-Host "`n  [$n] $msg" -ForegroundColor White }

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
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile($url, $dest)
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
        @{ name="Chrome";  exe="$env:PROGRAMFILES(X86)\Google\Chrome\Application\chrome.exe" },
        @{ name="Chrome";  exe="$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" },
        @{ name="Edge";    exe="$env:PROGRAMFILES(X86)\Microsoft\Edge\Application\msedge.exe" },
        @{ name="Firefox"; exe="$env:PROGRAMFILES\Mozilla Firefox\firefox.exe" },
        @{ name="Firefox"; exe="$env:PROGRAMFILES(X86)\Mozilla Firefox\firefox.exe" }
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
            "Brave"   { $dirs += "$env:APPDATA\BraveSoftware\Brave-Browser\NativeMessagingHosts" }
            "Chrome"  { $dirs += "$env:APPDATA\Google\Chrome\NativeMessagingHosts" }
            "Edge"    { $dirs += "$env:APPDATA\Microsoft\Edge\NativeMessagingHosts" }
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
    $hostPath = "$BIN\debug_host.exe"
    $json = @"
{
  "name": "com.scraper.core",
  "description": "SCRAPPER Native Host - BertUI Framework",
  "path": "$($hostPath -replace '\\','\\\\')",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$extId/"
  ]
}
"@
    $json | Out-File -FilePath "$dir\com.scraper.core.json" -Encoding UTF8
}

# ── Helper: Firefox native messaging ─────────────────────────────────────────
function Write-Firefox-Manifest {
    $ffDirs = @(
        "$env:APPDATA\Mozilla\NativeMessagingHosts",
        "$env:LOCALAPPDATA\Mozilla\NativeMessagingHosts"
    )
    $hostPath = "$BIN\debug_host.exe"
    $json = @"
{
  "name": "com.scraper.core",
  "description": "SCRAPPER Native Host - BertUI Framework",
  "path": "$($hostPath -replace '\\','\\\\'))",
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
step "1/6" "Creating SCRAPPER directories"
foreach ($d in @($SCRAPPER,$BIN,$DATA,$LOGS,$API,$EXT_BRAVE,$EXT_FF)) {
    if (!(Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}
ok "SCRAPPER home: $SCRAPPER"

# ── Step 2: Download binaries ─────────────────────────────────────────────────
step "2/6" "Downloading binaries"

# Try to get latest release tag
info "Checking latest release..."
try {
    $release = Invoke-RestMethod -Uri $REPO_API -UseBasicParsing
    $tag = $release.tag_name
    $BASE_URL = "https://github.com/$REPO/releases/download/$tag"
    info "Latest release: $tag"
} catch {
    $BASE_URL = "https://github.com/$REPO/releases/latest/download"
    warn "Could not get release tag — using /latest redirect"
}

# Download native host (pre-compiled Windows binary)
info "Downloading native host (debug_host.exe)..."
$got = Download "$BASE_URL/debug_host-windows-x64.exe" "$BIN\debug_host.exe"
if (!$got) {
    # Fallback: try alternate name
    $got = Download "$BASE_URL/native_host.exe" "$BIN\debug_host.exe"
}
if ($got) { ok "debug_host.exe ready" }
else {
    warn "Pre-built binary not found in releases."
    warn "You will need to compile from source:"
    warn "  Install mingw64, then run:"
    warn "  x86_64-w64-mingw32-gcc -o debug_host.exe src\c_core\debug_host_win.c -D_WIN32_WINNT=0x0600"
}

# Download rust finder
info "Downloading rust_finder.exe..."
$got = Download "$BASE_URL/rust_finder-windows-x64.exe" "$BIN\rust_finder.exe"
if (!$got) { $got = Download "$BASE_URL/finder.exe" "$BIN\rust_finder.exe" }
if ($got) { ok "rust_finder.exe ready" }
else { warn "rust_finder.exe not found — Find tab will be disabled. Install Rust and compile manually." }

# ── Step 3: Download extension ───────────────────────────────────────────────
step "3/6" "Downloading browser extension"

$extFiles = @(
    "manifest.json",
    "background.js",
    "content.js",
    "popup.html",
    "popup.js",
    "stealth.js"
)
foreach ($f in $extFiles) {
    $ok = Download "$REPO_RAW/extension/brave/$f" "$EXT_BRAVE\$f"
    if ($ok) { ok "  brave/$f" }
    else      { warn "  Could not download brave/$f" }
}

# Firefox extension
$ffFiles = @("manifest.json","background.js","content.js")
foreach ($f in $ffFiles) {
    $ok = Download "$REPO_RAW/extension/firefox/$f" "$EXT_FF\$f"
    if ($ok) { ok "  firefox/$f" }
}

# ── Step 4: Download Python API ───────────────────────────────────────────────
step "4/6" "Downloading Python API"

$got = Download "$REPO_RAW/python_api/api.py" "$API\api.py"
if ($got) {
    # Patch data path for Windows
    $content = Get-Content "$API\api.py" -Raw
    $content = $content -replace '/home/PeaseErnest/scraper', $SCRAPPER.Replace('\','/')
    $content | Out-File -FilePath "$API\api.py" -Encoding UTF8
    ok "api.py downloaded and patched for Windows"
}

# Try to download dashboard.html
$got = Download "$REPO_RAW/python_api/dashboard.html" "$API\dashboard.html"
if ($got) { ok "dashboard.html downloaded" }
else { warn "dashboard.html not in repo yet — API will show install instructions page" }

# ── Step 5: Register native messaging ─────────────────────────────────────────
step "5/6" "Registering native messaging"

$browsers = Detect-Browsers
if ($browsers.Count -gt 0) { info "Found: $($browsers -join ', ')" }

$manifestDirs = Get-ManifestDirs $browsers
foreach ($dir in $manifestDirs) {
    Write-Manifest $dir
    ok "Manifest installed -> $dir"
}

# Firefox manifest (different format)
if ($browsers -contains "Firefox") {
    Write-Firefox-Manifest
}

# ── Step 6: Create launcher scripts ──────────────────────────────────────────
step "6/6" "Creating launcher scripts"

# scrapper-start.bat
@"
@echo off
title SCRAPPER by BertUI
echo.
echo   [*] Starting SCRAPPER...
echo   [>] API + Dashboard: http://localhost:8080
echo   [>] Press Ctrl+C to stop.
echo.
python "$API\api.py"
"@ | Out-File -FilePath "$BIN\scrapper-start.bat" -Encoding ASCII
ok "scrapper-start.bat"

# scrapper-stop.bat
@"
@echo off
echo Stopping SCRAPPER...
taskkill /F /IM python.exe /FI "WINDOWTITLE eq SCRAPPER*" 2>nul
echo Done.
"@ | Out-File -FilePath "$BIN\scrapper-stop.bat" -Encoding ASCII
ok "scrapper-stop.bat"

# scrapper-register-ext.ps1
@"
param([string]`$ExtId)
if (-not `$ExtId) {
    Write-Host "Usage: scrapper-register-ext.ps1 YOUR_EXTENSION_ID" -ForegroundColor Yellow
    Write-Host "Find your extension ID at brave://extensions or chrome://extensions"
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

# Add BIN to user PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*\.scrapper\bin*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$BIN", "User")
    ok "Added $BIN to user PATH"
}

# ── Check Python ──────────────────────────────────────────────────────────────
if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    warn "Python 3 not found! Download from https://python.org"
}

# ── Check Bun / Node ──────────────────────────────────────────────────────────
if (!(Get-Command bun -ErrorAction SilentlyContinue) -and !(Get-Command node -ErrorAction SilentlyContinue)) {
    warn "Bun or Node.js not found. Dashboard UI requires one of them."
    warn "Install Bun: https://bun.sh  or  Node.js: https://nodejs.org"
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
Write-Host "           brave://extensions (or chrome://extensions)"
Write-Host "           -> Developer mode ON"
Write-Host "           -> 'Load unpacked' -> select:"
Write-Host "           $EXT_BRAVE" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Step 2.  Copy your extension ID, then run:" -ForegroundColor Cyan
Write-Host "           scrapper-register-ext.ps1 YOUR_EXTENSION_ID" -ForegroundColor White
Write-Host ""
Write-Host "  Step 3.  Start SCRAPPER:" -ForegroundColor Cyan
Write-Host "           scrapper-start.bat" -ForegroundColor White
Write-Host "           (or: python $API\api.py)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Step 4.  Open dashboard:" -ForegroundColor Cyan
Write-Host "           http://localhost:8080" -ForegroundColor White
Write-Host ""
Write-Host "  API:  http://localhost:8080/api/v1/session/all" -ForegroundColor DarkGray
Write-Host "  Bulk: http://localhost:8080/api/v1/bulk/all?format=json" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  [*] Go scrape it - with ease." -ForegroundColor Green
Write-Host ""