#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#   SCRAPY — One-Line Installer (Linux / macOS)
#   Go scrape it — with ease.
#
#   Linux:
#   curl -fsSL https://raw.githubusercontent.com/BunElysiaReact/SCRAPY/main/install.sh | bash
#
#   macOS:
#   curl -fsSL https://raw.githubusercontent.com/BunElysiaReact/SCRAPY/main/install.sh | bash
# ═══════════════════════════════════════════════════════════════════════
set -e

REPO="BunElysiaReact/SCRAPY"
SCRAPY_DIR="$HOME/.scrapy"
DATA_DIR="$HOME/.scrapy/data"
LOGS_DIR="$HOME/.scrapy/logs"
BIN_DIR="$HOME/.scrapy/bin"

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
  echo "  ║   ◈  S C R A P Y  — Installer                  ║"
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
  BINARY_NAME="native_host-${PLATFORM}-${ARCH_TAG}"
  RUST_BIN_NAME="rust_finder-${PLATFORM}-${ARCH_TAG}"
}

# ── Detect installed browsers ─────────────────────────────────────────────────
detect_browsers() {
  BROWSERS=()
  if [[ "$PLATFORM" == "linux" ]]; then
    command -v brave-browser &>/dev/null && BROWSERS+=("brave")
    command -v brave          &>/dev/null && BROWSERS+=("brave")
    command -v google-chrome  &>/dev/null && BROWSERS+=("chrome")
    command -v chromium       &>/dev/null && BROWSERS+=("chromium")
    command -v chromium-browser &>/dev/null && BROWSERS+=("chromium")
  elif [[ "$PLATFORM" == "macos" ]]; then
    [[ -d "/Applications/Brave Browser.app" ]]          && BROWSERS+=("brave")
    [[ -d "/Applications/Google Chrome.app" ]]          && BROWSERS+=("chrome")
    [[ -d "/Applications/Chromium.app" ]]               && BROWSERS+=("chromium")
  fi
  # Deduplicate
  BROWSERS=($(printf '%s\n' "${BROWSERS[@]}" | sort -u))
}

# ── Native messaging manifest directories ────────────────────────────────────
get_manifest_dirs() {
  MANIFEST_DIRS=()
  if [[ "$PLATFORM" == "linux" ]]; then
    [[ " ${BROWSERS[@]} " =~ " brave " ]]    && MANIFEST_DIRS+=("$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts")
    [[ " ${BROWSERS[@]} " =~ " chrome " ]]   && MANIFEST_DIRS+=("$HOME/.config/google-chrome/NativeMessagingHosts")
    [[ " ${BROWSERS[@]} " =~ " chromium " ]] && MANIFEST_DIRS+=("$HOME/.config/chromium/NativeMessagingHosts")
    # Install everywhere if no browsers detected
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

# ── Get latest release tag ────────────────────────────────────────────────────
get_latest_release() {
  local api_url="https://api.github.com/repos/${REPO}/releases/latest"
  if command -v curl &>/dev/null; then
    curl -fsSL "$api_url" 2>/dev/null | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\(.*\)".*/\1/'
  else
    wget -qO- "$api_url" 2>/dev/null | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\(.*\)".*/\1/'
  fi
}

# ── Write native messaging manifest ──────────────────────────────────────────
write_manifest() {
  local dir="$1" ext_id="${2:-YOUR_EXTENSION_ID_HERE}"
  mkdir -p "$dir"
  cat > "$dir/com.scraper.core.json" <<EOF
{
  "name": "com.scraper.core",
  "description": "SCRAPY Native Host — BertUI Framework",
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
  echo -e "  ${YELLOW}  No Brave/Chrome found — install manifest everywhere${RESET}"
fi
echo ""

# ── Step 1: Create directories ────────────────────────────────────────────────
step "1/5" "Creating SCRAPY directories"
mkdir -p "$SCRAPY_DIR" "$DATA_DIR" "$LOGS_DIR" "$BIN_DIR"
ok "SCRAPY home: $SCRAPY_DIR"

# ── Step 2: Download repo ─────────────────────────────────────────────────────
step "2/5" "Downloading SCRAPY"

LATEST=$(get_latest_release 2>/dev/null || echo "main")
info "Latest version: $LATEST"

RELEASE_BASE="https://github.com/${REPO}/releases/latest/download"
FALLBACK_BASE="https://raw.githubusercontent.com/${REPO}/main"

# Download native host binary
info "Downloading native host binary..."
if download "${RELEASE_BASE}/${BINARY_NAME}" "$BIN_DIR/native_host" 2>/dev/null; then
  ok "native_host downloaded"
else
  # Fallback: try to compile from source if gcc available
  warn "Pre-built binary not found in releases — attempting to compile from source"
  if command -v gcc &>/dev/null; then
    info "Downloading source..."
    download "${FALLBACK_BASE}/c_core/native_host/debug_host.c" "/tmp/debug_host.c"
    sed -i "s|/home/PeaseErnest/scraper|$SCRAPY_DIR|g" /tmp/debug_host.c
    gcc -O2 -o "$BIN_DIR/native_host" /tmp/debug_host.c -lpthread
    ok "native_host compiled from source"
  else
    fail "No pre-built binary available and gcc not found.\nPlease install gcc: sudo apt install build-essential\nThen re-run this installer."
  fi
fi

# Download rust_finder
info "Downloading rust_finder..."
if download "${RELEASE_BASE}/${RUST_BIN_NAME}" "$BIN_DIR/rust_finder" 2>/dev/null; then
  ok "rust_finder downloaded"
else
  warn "Pre-built rust_finder not found — attempting to compile"
  if command -v cargo &>/dev/null; then
    TMP_RUST="/tmp/scrapy_rust"
    mkdir -p "$TMP_RUST/src"
    download "${FALLBACK_BASE}/rust_finder/src/main.rs" "$TMP_RUST/src/main.rs"
    download "${FALLBACK_BASE}/rust_finder/Cargo.toml"  "$TMP_RUST/Cargo.toml"
    cd "$TMP_RUST"
    cargo build --release --quiet
    cp target/release/rust_finder "$BIN_DIR/rust_finder"
    cd "$SCRAPY_DIR"
    ok "rust_finder compiled from source"
  else
    warn "rust_finder unavailable — Find tab will be disabled. Install Rust to enable it."
  fi
fi

# Download Python API
info "Downloading Python API..."
mkdir -p "$SCRAPY_DIR/python_api"
download "${FALLBACK_BASE}/python_api/api.py" "$SCRAPY_DIR/python_api/api.py"
# Patch paths
sed -i "s|/home/PeaseErnest/scraper|$SCRAPY_DIR|g" "$SCRAPY_DIR/python_api/api.py"
ok "Python API ready"

# Download dashboard
info "Downloading dashboard..."
if download "${FALLBACK_BASE}/python_api/dashboard.html" "$SCRAPY_DIR/python_api/dashboard.html" 2>/dev/null; then
  ok "dashboard.html downloaded"
elif download "${RELEASE_BASE}/dashboard.html" "$SCRAPY_DIR/python_api/dashboard.html" 2>/dev/null; then
  ok "dashboard.html downloaded from release"
else
  warn "dashboard.html not found in repo yet — API will show install instructions page"
  warn "Place dashboard.html in $SCRAPY_DIR/python_api/ to enable the UI"
fi

# Download + setup dashboard
info "Downloading dashboard..."
mkdir -p "$SCRAPY_DIR/ui"
if command -v bun &>/dev/null || command -v node &>/dev/null; then
  # Clone or download UI
  if command -v git &>/dev/null; then
    if [[ -d "$SCRAPY_DIR/.git" ]]; then
      git -C "$SCRAPY_DIR" pull --quiet 2>/dev/null || true
    else
      git clone --quiet --depth=1 "https://github.com/${REPO}.git" "/tmp/scrapy_repo" 2>/dev/null || true
      if [[ -d "/tmp/scrapy_repo" ]]; then
        cp -r /tmp/scrapy_repo/ui "$SCRAPY_DIR/"
        cp -r /tmp/scrapy_repo/extension "$SCRAPY_DIR/"
        ok "Source downloaded via git"
      fi
    fi
  fi
# Install dashboard deps
if [[ -f "$SCRAPY_DIR/ui/scrapperui/package.json" ]]; then
  cd "$SCRAPY_DIR/ui/scrapperui"
  if command -v bun &>/dev/null; then
    bun install --silent 2>/dev/null && ok "Dashboard deps installed (bun)"
    info "Building dashboard..."
    bun run build 2>/dev/null && ok "Dashboard built → dist/" || warn "Build failed — will use fallback UI"
  else
    npm install --silent 2>/dev/null && ok "Dashboard deps installed (npm)"
    info "Building dashboard..."
    npm run build 2>/dev/null && ok "Dashboard built → dist/" || warn "Build failed — will use fallback UI"
  fi
fi
else
  warn "Node/Bun not found — dashboard UI won't be available. API still works."
fi

# ── Step 3: Set permissions ───────────────────────────────────────────────────
step "3/5" "Setting permissions"
[[ -f "$BIN_DIR/native_host"   ]] && chmod +x "$BIN_DIR/native_host"   && ok "native_host: executable"
[[ -f "$BIN_DIR/rust_finder"   ]] && chmod +x "$BIN_DIR/rust_finder"   && ok "rust_finder: executable"

# ── Step 4: Register native messaging ─────────────────────────────────────────
step "4/5" "Registering native messaging host"
get_manifest_dirs
for dir in "${MANIFEST_DIRS[@]}"; do
  write_manifest "$dir"
  ok "Manifest installed → $dir"
done

# ── Step 5: Create launcher scripts ───────────────────────────────────────────
step "5/5" "Creating launchers"

# scrapy-start: starts API (which also serves the dashboard)
cat > "$BIN_DIR/scrapy-start" << 'LAUNCHER'
#!/usr/bin/env bash
SCRAPY_DIR="$HOME/.scrapy"
DIST="$SCRAPY_DIR/ui/scrapperui/dist"
DEV_MODE="${1:-}"

echo ""
echo "  ◈ Starting SCRAPY..."
echo ""

if [[ "$DEV_MODE" == "--dev" ]]; then
  # Dev mode: hot-reload Vite + api.py separately
  echo "  [dev] Starting API server..."
  python3 "$SCRAPY_DIR/python_api/api.py" &
  API_PID=$!
  echo "  [>] API → http://localhost:8080"

  echo "  [dev] Starting Vite dev server..."
  cd "$SCRAPY_DIR/ui/scrapperui"
  if command -v bun &>/dev/null; then
    bun run dev &
  else
    npm run dev &
  fi
  DEV_PID=$!
  echo "  [>] Dashboard (hot reload) → http://localhost:3000"
  trap "kill $API_PID $DEV_PID 2>/dev/null; echo 'SCRAPY stopped.'" EXIT
  wait

else
  # Production mode: api.py serves everything on port 8080
  if [[ ! -d "$DIST" ]]; then
    echo "  [!] No build found. Building dashboard..."
    cd "$SCRAPY_DIR/ui/scrapperui"
    command -v bun &>/dev/null && bun run build || npm run build
  fi

  echo "  [>] Dashboard + API → http://localhost:8080"
  echo "  [>] Press Ctrl+C to stop."
  echo ""
  trap "echo ''; echo '  ○ SCRAPY stopped.'" EXIT
  python3 "$SCRAPY_DIR/python_api/api.py"
fi
LAUNCHER
chmod +x "$BIN_DIR/scrapy-start"
ok "scrapy-start launcher created"
ok "  Usage: scrapy-start          → production (api.py serves everything)"
ok "  Usage: scrapy-start --dev    → dev mode (hot reload on :3000)"

# scrapy-stop
cat > "$BIN_DIR/scrapy-stop" << 'STOPPER'
#!/usr/bin/env bash
pkill -f "python_api/api.py" 2>/dev/null && echo "  ✓ API server stopped" || echo "  ○ API server was not running"
pkill -f "scrapperui" 2>/dev/null && echo "  ✓ Dashboard stopped" || true
STOPPER
chmod +x "$BIN_DIR/scrapy-stop"
ok "scrapy-stop created"

# scrapy-update
cat > "$BIN_DIR/scrapy-update" << 'UPDATER'
#!/usr/bin/env bash
echo "◈ Updating SCRAPY..."
curl -fsSL https://raw.githubusercontent.com/BunElysiaReact/SCRAPY/main/install.sh | bash
UPDATER
chmod +x "$BIN_DIR/scrapy-update"
ok "scrapy-update created"

# Add to PATH hint
SHELL_RC=""
[[ "$SHELL" == *"zsh"* ]]  && SHELL_RC="$HOME/.zshrc"
[[ "$SHELL" == *"bash"* ]] && SHELL_RC="$HOME/.bashrc"
if [[ -n "$SHELL_RC" ]] && ! grep -q "\.scrapy/bin" "$SHELL_RC" 2>/dev/null; then
  echo "" >> "$SHELL_RC"
  echo '# SCRAPY' >> "$SHELL_RC"
  echo 'export PATH="$HOME/.scrapy/bin:$PATH"' >> "$SHELL_RC"
  ok "PATH updated in $SHELL_RC"
fi
export PATH="$HOME/.scrapy/bin:$PATH"

# ── Extension ID prompt ───────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}${BOLD}  ⚠  ACTION REQUIRED — Extension ID${RESET}"
echo -e "${YELLOW}  ────────────────────────────────────────────────────────────${RESET}"
echo -e "  After loading the extension in Brave/Chrome, you must"
echo -e "  update the extension ID in the native messaging manifest."
echo ""
echo -e "  ${CYAN}Run this command with your extension ID:${RESET}"
echo -e "  ${BOLD}scrapy-register-ext <YOUR_EXTENSION_ID>${RESET}"
echo ""

# Create the register helper
cat > "$BIN_DIR/scrapy-register-ext" << 'REGSCRIPT'
#!/usr/bin/env bash
EXT_ID="${1:-}"
if [[ -z "$EXT_ID" ]]; then
  echo "Usage: scrapy-register-ext <extension-id>"
  echo "Find your extension ID at brave://extensions or chrome://extensions"
  exit 1
fi
SCRAPY_DIR="$HOME/.scrapy"
BIN="$SCRAPY_DIR/bin/native_host"

# Update all installed manifests
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
  "description": "SCRAPY Native Host — BertUI Framework",
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
  echo "  ✗ No manifest directories found. Run install.sh first."
  exit 1
fi
echo ""
echo "  ✓ Extension ID registered. Reload your extension in the browser."
REGSCRIPT
chmod +x "$BIN_DIR/scrapy-register-ext"

# ── Final output ──────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  ═══════════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  ✓  SCRAPY installed to $SCRAPY_DIR${RESET}"
echo -e "${GREEN}${BOLD}  ═══════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "${BOLD}  HOW TO COMPLETE SETUP:${RESET}"
echo ""
echo -e "  ${CYAN}Step 1.${RESET} Load the extension in Brave:"
echo "           brave://extensions → Developer mode ON"
echo "           → 'Load unpacked' → select:"
echo -e "           ${DIM}$SCRAPY_DIR/extension/brave/${RESET}"
echo ""
echo -e "  ${CYAN}Step 2.${RESET} Copy your extension ID, then run:"
echo -e "           ${BOLD}scrapy-register-ext <paste-extension-id-here>${RESET}"
echo ""
echo -e "  ${CYAN}Step 3.${RESET} Start SCRAPY:"
echo -e "           ${BOLD}scrapy-start${RESET}"
echo ""
echo -e "  ${CYAN}Step 4.${RESET} Open dashboard: ${BOLD}http://localhost:3000${RESET}"
echo ""
echo -e "  ${DIM}API:  http://localhost:8080/api/v1/session/all${RESET}"
echo -e "  ${DIM}Bulk: http://localhost:8080/api/v1/bulk/all?format=json${RESET}"
echo ""
echo -e "  ${GREEN}◈ Go scrape it — with ease.${RESET}"
echo ""

# Source new PATH immediately
[[ -n "$SHELL_RC" ]] && source "$SHELL_RC" 2>/dev/null || true