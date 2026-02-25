#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#   SCRAPPER — One-Line Installer (Linux / macOS)
#   Go scrape it — with ease.
#
#   curl -fsSL https://raw.githubusercontent.com/BunElysiaReact/SCRAPY/main/install.sh | bash
# ═══════════════════════════════════════════════════════════════════════
set -e

REPO="BunElysiaReact/SCRAPY"
SCRAPPER_DIR="$HOME/.scrapper"
DATA_DIR="$HOME/.scrapper/data"
LOGS_DIR="$HOME/.scrapper/logs"
BIN_DIR="$HOME/.scrapper/bin"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

ok()    { echo -e "  ${GREEN}✓${RESET}  $1"; }
info()  { echo -e "  ${CYAN}→${RESET}  $1"; }
warn()  { echo -e "  ${YELLOW}⚠${RESET}  $1"; }
fail()  { echo -e "  ${RED}✗${RESET}  $1\n"; exit 1; }
step()  { echo -e "\n${BOLD}  [$1]${RESET} $2"; }
note()  { echo -e "  ${DIM}$1${RESET}"; }

banner() {
  clear 2>/dev/null || true
  echo ""
  echo -e "${GREEN}${BOLD}"
  echo "  ╔══════════════════════════════════════════════════╗"
  echo "  ║   ◈  S C R A P P E R  — Installer              ║"
  echo "  ║   Go scrape it — with ease.                     ║"
  echo "  ║   Built with the BertUI Framework               ║"
  echo "  ╚══════════════════════════════════════════════════╝"
  echo -e "${RESET}"
}

# ── Detect OS + arch ──────────────────────────────────────────────────────────
detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"
  case "$OS" in
    Linux*)  PLATFORM="linux" ;;
    Darwin*) PLATFORM="macos" ;;
    *)       fail "Unsupported OS: $OS. Use Windows installer instead." ;;
  esac
  case "$ARCH" in
    x86_64|amd64) ARCH_TAG="x64" ;;
    aarch64|arm64) ARCH_TAG="arm64" ;;
    *) fail "Unsupported architecture: $ARCH" ;;
  esac
}

# ── Detect installed browsers ─────────────────────────────────────────────────
detect_browsers() {
  BROWSERS=()
  if [[ "$PLATFORM" == "linux" ]]; then
    command -v brave-browser    &>/dev/null && BROWSERS+=("brave")
    command -v brave            &>/dev/null && BROWSERS+=("brave")
    command -v google-chrome    &>/dev/null && BROWSERS+=("chrome")
    command -v chromium         &>/dev/null && BROWSERS+=("chromium")
    command -v chromium-browser &>/dev/null && BROWSERS+=("chromium")
  elif [[ "$PLATFORM" == "macos" ]]; then
    [[ -d "/Applications/Brave Browser.app" ]] && BROWSERS+=("brave")
    [[ -d "/Applications/Google Chrome.app" ]] && BROWSERS+=("chrome")
    [[ -d "/Applications/Chromium.app" ]]      && BROWSERS+=("chromium")
  fi
  BROWSERS=($(printf '%s\n' "${BROWSERS[@]}" | sort -u))
}

# ── Native messaging manifest directories ────────────────────────────────────
get_manifest_dirs() {
  MANIFEST_DIRS=()
  if [[ "$PLATFORM" == "linux" ]]; then
    [[ " ${BROWSERS[@]} " =~ " brave " ]]    && MANIFEST_DIRS+=("$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts")
    [[ " ${BROWSERS[@]} " =~ " chrome " ]]   && MANIFEST_DIRS+=("$HOME/.config/google-chrome/NativeMessagingHosts")
    [[ " ${BROWSERS[@]} " =~ " chromium " ]] && MANIFEST_DIRS+=("$HOME/.config/chromium/NativeMessagingHosts")
    if [[ ${#BROWSERS[@]} -eq 0 ]]; then
      warn "No Brave/Chrome detected — installing manifest in all common locations"
      MANIFEST_DIRS+=(
        "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
        "$HOME/.config/google-chrome/NativeMessagingHosts"
        "$HOME/.config/chromium/NativeMessagingHosts"
      )
    fi
  elif [[ "$PLATFORM" == "macos" ]]; then
    [[ " ${BROWSERS[@]} " =~ " brave " ]]    && MANIFEST_DIRS+=("$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts")
    [[ " ${BROWSERS[@]} " =~ " chrome " ]]   && MANIFEST_DIRS+=("$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts")
    [[ " ${BROWSERS[@]} " =~ " chromium " ]] && MANIFEST_DIRS+=("$HOME/Library/Application Support/Chromium/NativeMessagingHosts")
    if [[ ${#BROWSERS[@]} -eq 0 ]]; then
      MANIFEST_DIRS+=("$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts")
      MANIFEST_DIRS+=("$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts")
    fi
  fi
}

# ── Download helper ───────────────────────────────────────────────────────────
download() {
  local url="$1" dest="$2"
  if command -v curl &>/dev/null; then
    curl -fsSL --progress-bar "$url" -o "$dest"
  elif command -v wget &>/dev/null; then
    wget -q --show-progress "$url" -O "$dest"
  else
    fail "Neither curl nor wget found. Install one and retry."
  fi
}

# ── Write native messaging manifest ──────────────────────────────────────────
write_manifest() {
  local dir="$1" ext_id="${2:-YOUR_EXTENSION_ID_HERE}"
  mkdir -p "$dir"
  cat > "$dir/com.scraper.core.json" <<EOF
{
  "name": "com.scraper.core",
  "description": "SCRAPPER Native Host — BertUI Framework",
  "path": "$BIN_DIR/native_host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${ext_id}/"
  ]
}
EOF
}

# ═══════════════════════════════════════════════════════════════════════════════
banner
detect_platform
detect_browsers

echo -e "  ${DIM}Platform  : $PLATFORM-$ARCH_TAG${RESET}"
if [[ ${#BROWSERS[@]} -gt 0 ]]; then
  echo -e "  ${DIM}Browsers  : ${BROWSERS[*]}${RESET}"
else
  echo -e "  ${YELLOW}  No Brave/Chrome found — will install manifest everywhere${RESET}"
fi
echo ""

# ── Step 1: Create directories ────────────────────────────────────────────────
step "1/5" "Creating SCRAPPER directories"
mkdir -p "$SCRAPPER_DIR" "$DATA_DIR" "$LOGS_DIR" "$BIN_DIR"
ok "SCRAPPER home: $SCRAPPER_DIR"

# ── Step 2: Download & extract tarball ───────────────────────────────────────
step "2/5" "Downloading SCRAPPER"

TARBALL_URL="https://github.com/${REPO}/raw/main/linux.tar.gz"
TARBALL="/tmp/scrapper-linux.tar.gz"

info "Downloading linux bundle..."
download "$TARBALL_URL" "$TARBALL" || fail "Failed to download linux.tar.gz from repo."
ok "Downloaded"

info "Extracting..."
tar -xzf "$TARBALL" -C "$SCRAPPER_DIR" --strip-components=1
ok "Extracted to $SCRAPPER_DIR"

rm -f "$TARBALL"
ok "Cleaned up temp files"

# Patch hardcoded paths in api.py
if [[ -f "$SCRAPPER_DIR/python_api/api.py" ]]; then
  sed -i "s|/home/PeaseErnest/scraper|$SCRAPPER_DIR|g" "$SCRAPPER_DIR/python_api/api.py"
  ok "api.py paths patched"
fi

# ── Step 3: Set permissions ───────────────────────────────────────────────────
step "3/5" "Setting permissions"
[[ -f "$SCRAPPER_DIR/c_core/native_host/debug_host" ]] && \
  cp "$SCRAPPER_DIR/c_core/native_host/debug_host" "$BIN_DIR/native_host" && \
  chmod +x "$BIN_DIR/native_host" && \
  ok "native_host: executable"

[[ -f "$SCRAPPER_DIR/rust_finder/target/release/rust_finder" ]] && \
  cp "$SCRAPPER_DIR/rust_finder/target/release/rust_finder" "$BIN_DIR/rust_finder" && \
  chmod +x "$BIN_DIR/rust_finder" && \
  ok "rust_finder: executable"

# ── Step 4: Register native messaging ─────────────────────────────────────────
step "4/5" "Registering native messaging host"
get_manifest_dirs
for dir in "${MANIFEST_DIRS[@]}"; do
  write_manifest "$dir"
  ok "Manifest installed → $dir"
done

# ── Step 5: Create launcher scripts ───────────────────────────────────────────
step "5/5" "Creating launchers"

cat > "$BIN_DIR/scrapper-start" << 'LAUNCHER'
#!/usr/bin/env bash
SCRAPPER_DIR="$HOME/.scrapper"
DIST="$SCRAPPER_DIR/ui/scrapperui/dist"
DEV_MODE="${1:-}"

echo ""
echo "  ◈ Starting SCRAPPER..."
echo ""

if [[ "$DEV_MODE" == "--dev" ]]; then
  echo "  [dev] Starting API server..."
  python3 "$SCRAPPER_DIR/python_api/api.py" &
  API_PID=$!
  echo "  [>] API → http://localhost:8080"

  echo "  [dev] Starting Vite dev server..."
  cd "$SCRAPPER_DIR/ui/scrapperui"
  if command -v bun &>/dev/null; then
    bun run dev &
  else
    npm run dev &
  fi
  DEV_PID=$!
  echo "  [>] Bun dashboard (hot reload) → http://localhost:3000"
  trap "kill $API_PID $DEV_PID 2>/dev/null; echo 'SCRAPPER stopped.'" EXIT
  wait
else
  if [[ ! -d "$DIST" ]]; then
    echo "  [!] No build found. Building dashboard..."
    cd "$SCRAPPER_DIR/ui/scrapperui"
    command -v bun &>/dev/null && bun run build || npm run build
  fi
  echo "  [>] API + built-in UI → http://localhost:8080"
  echo "  [>] Press Ctrl+C to stop."
  echo ""
  trap "echo ''; echo '  ○ SCRAPPER stopped.'" EXIT
  python3 "$SCRAPPER_DIR/python_api/api.py"
fi
LAUNCHER
chmod +x "$BIN_DIR/scrapper-start"
ok "scrapper-start created  (usage: scrapper-start | scrapper-start --dev)"

cat > "$BIN_DIR/scrapper-stop" << 'STOPPER'
#!/usr/bin/env bash
pkill -f "python_api/api.py" 2>/dev/null && echo "  ✓ API server stopped" || echo "  ○ API was not running"
pkill -f "scrapperui"        2>/dev/null && echo "  ✓ Dashboard stopped"  || true
STOPPER
chmod +x "$BIN_DIR/scrapper-stop"
ok "scrapper-stop created"

cat > "$BIN_DIR/scrapper-update" << 'UPDATER'
#!/usr/bin/env bash
echo "◈ Updating SCRAPPER..."
curl -fsSL https://raw.githubusercontent.com/BunElysiaReact/SCRAPY/main/install.sh | bash
UPDATER
chmod +x "$BIN_DIR/scrapper-update"
ok "scrapper-update created"

cat > "$BIN_DIR/scrapper-register-ext" << 'REGSCRIPT'
#!/usr/bin/env bash
EXT_ID="${1:-}"
if [[ -z "$EXT_ID" ]]; then
  echo "Usage: scrapper-register-ext <extension-id>"
  echo "Find your ID at brave://extensions or chrome://extensions"
  exit 1
fi
SCRAPPER_DIR="$HOME/.scrapper"
BIN="$SCRAPPER_DIR/bin/native_host"
MANIFEST_DIRS=(
  "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  "$HOME/.config/google-chrome/NativeMessagingHosts"
  "$HOME/.config/chromium/NativeMessagingHosts"
  "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
)
COUNT=0
for dir in "${MANIFEST_DIRS[@]}"; do
  [[ -d "$dir" ]] || continue
  cat > "$dir/com.scraper.core.json" << EOF
{
  "name": "com.scraper.core",
  "description": "SCRAPPER Native Host — BertUI Framework",
  "path": "$BIN",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF
  echo "  ✓ Updated: $dir"
  COUNT=$((COUNT+1))
done
if [[ $COUNT -eq 0 ]]; then
  echo "  ✗ No manifest dirs found. Run install.sh first."
  exit 1
fi
echo ""
echo "  ✓ Done. Reload your extension in the browser."
REGSCRIPT
chmod +x "$BIN_DIR/scrapper-register-ext"
ok "scrapper-register-ext created"

# ── PATH ──────────────────────────────────────────────────────────────────────
SHELL_RC=""
[[ "$SHELL" == *"zsh"* ]]  && SHELL_RC="$HOME/.zshrc"
[[ "$SHELL" == *"bash"* ]] && SHELL_RC="$HOME/.bashrc"
if [[ -n "$SHELL_RC" ]] && ! grep -q "\.scrapper/bin" "$SHELL_RC" 2>/dev/null; then
  echo "" >> "$SHELL_RC"
  echo '# SCRAPPER' >> "$SHELL_RC"
  echo 'export PATH="$HOME/.scrapper/bin:$PATH"' >> "$SHELL_RC"
  ok "PATH updated in $SHELL_RC"
fi
export PATH="$HOME/.scrapper/bin:$PATH"

# ── Final output ──────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  ═══════════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  ✓  SCRAPPER installed to $SCRAPPER_DIR${RESET}"
echo -e "${GREEN}${BOLD}  ═══════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "${BOLD}  HOW TO COMPLETE SETUP:${RESET}"
echo ""
echo -e "  ${CYAN}Step 1.${RESET} Load the extension in Brave:"
echo "           brave://extensions → Developer mode ON"
echo "           → 'Load unpacked' → select:"
echo -e "           ${DIM}$SCRAPPER_DIR/extension/brave/${RESET}"
echo ""
echo -e "  ${CYAN}Step 2.${RESET} Copy your extension ID, then run:"
echo -e "           ${BOLD}scrapper-register-ext <your-extension-id>${RESET}"
echo ""
echo -e "  ${CYAN}Step 3.${RESET} Start SCRAPPER:"
echo -e "           ${BOLD}scrapper-start${RESET}"
echo ""
echo -e "  ${CYAN}Step 4.${RESET} Open dashboard: ${BOLD}http://localhost:8080${RESET}"
echo ""
echo -e "  ${DIM}API:  http://localhost:8080/api/v1/session/all${RESET}"
echo -e "  ${DIM}Bulk: http://localhost:8080/api/v1/bulk/all?format=json${RESET}"
echo ""
echo -e "  ${GREEN}◈ Go scrape it — with ease.${RESET}"
echo ""

[[ -n "$SHELL_RC" ]] && source "$SHELL_RC" 2>/dev/null || true