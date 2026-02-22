#!/bin/bash

# ============================================================
#  SCRAPY by BertUI — Release Builder
#  Creates Linux + Windows release packages
#  Users only need: Python 3 + Bun (no Rust/GCC needed)
# ============================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRAPER_DIR=~/scraper
RELEASES_DIR=$SCRAPER_DIR/releases
LINUX_DIR=$RELEASES_DIR/scrapy-linux-x64
WIN_DIR=$RELEASES_DIR/scrapy-windows-x64

echo ""
echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   🕷️  SCRAPY by BertUI — Releases    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Detect Rust binary name from Cargo.toml ──────────────────
CARGO_TOML=$SCRAPER_DIR/rust_finder/Cargo.toml
RUST_BIN_NAME="finder"
if [ -f "$CARGO_TOML" ]; then
    BIN_NAME=$(grep -A1 '^\[\[bin\]\]' "$CARGO_TOML" 2>/dev/null | grep 'name' | head -1 | sed 's/.*= *"\(.*\)".*/\1/')
    if [ -z "$BIN_NAME" ]; then
        BIN_NAME=$(grep '^name' "$CARGO_TOML" | head -1 | sed 's/.*= *"\(.*\)".*/\1/')
    fi
    [ -n "$BIN_NAME" ] && RUST_BIN_NAME="$BIN_NAME"
fi
echo -e "    Rust binary name: ${BLUE}${RUST_BIN_NAME}${NC}"
echo ""

# ── Clean & prepare ──────────────────────────────────────────
rm -rf $RELEASES_DIR
mkdir -p $RELEASES_DIR

# ============================================================
#  🐧 LINUX RELEASE
# ============================================================
echo -e "${BLUE}🐧  Building Linux release...${NC}"
mkdir -p $LINUX_DIR

# C binaries (pre-compiled — users do NOT need GCC)
echo "    Copying C binaries..."
mkdir -p $LINUX_DIR/c_core/native_host
cp $SCRAPER_DIR/c_core/native_host/debug_host  $LINUX_DIR/c_core/native_host/ \
    && echo "      debug_host ✅" \
    || echo -e "      ${RED}❌ debug_host missing — run: gcc -o debug_host debug_host.c -lpthread${NC}"
cp $SCRAPER_DIR/c_core/native_host/scraper_cli $LINUX_DIR/c_core/native_host/ \
    && echo "      scraper_cli ✅" \
    || echo -e "      ${RED}❌ scraper_cli missing${NC}"

# Rust finder — build it (shows real errors)
echo "    Building Rust finder (may take a minute first time)..."
cd $SCRAPER_DIR/rust_finder
cargo build --release
RUST_BIN=$SCRAPER_DIR/rust_finder/target/release/$RUST_BIN_NAME
if [ -f "$RUST_BIN" ]; then
    mkdir -p $LINUX_DIR/rust_finder/target/release/
    cp "$RUST_BIN" $LINUX_DIR/rust_finder/target/release/finder
    chmod +x $LINUX_DIR/rust_finder/target/release/finder
    echo "      finder ✅"
else
    echo -e "      ${RED}❌ Binary not at $RUST_BIN — checking release dir:${NC}"
    ls $SCRAPER_DIR/rust_finder/target/release/ 2>/dev/null | grep -v '\.d$\|\.rlib$\|incremental\|deps\|build' || echo "      (nothing)"
fi

# Extension
echo "    Copying extension..."
mkdir -p $LINUX_DIR/extension/brave
cp -r $SCRAPER_DIR/extension/brave/* $LINUX_DIR/extension/brave/
cp -r $SCRAPER_DIR/extension/chrome   $LINUX_DIR/extension/ 2>/dev/null || true
cp -r $SCRAPER_DIR/extension/firefox  $LINUX_DIR/extension/ 2>/dev/null || true

# Python API (no requirements needed)
echo "    Copying Python API..."
mkdir -p $LINUX_DIR/python_api
cp $SCRAPER_DIR/python_api/api.py $LINUX_DIR/python_api/

# React dashboard (exclude node_modules — users run bun install)
echo "    Copying UI..."
mkdir -p $LINUX_DIR/ui/scrapperui
rsync -a --exclude='node_modules' --exclude='.next' --exclude='dist' \
    $SCRAPER_DIR/ui/scrapperui/ $LINUX_DIR/ui/scrapperui/

# Config
echo "    Copying config..."
mkdir -p $LINUX_DIR/config
cp $SCRAPER_DIR/config/com.scraper.core.json $LINUX_DIR/config/

# Source files (developer section)
echo "    Copying source files..."
mkdir -p $LINUX_DIR/src/c_core $LINUX_DIR/src/rust_finder/src
cp $SCRAPER_DIR/c_core/native_host/debug_host.c  $LINUX_DIR/src/c_core/
cp $SCRAPER_DIR/c_core/native_host/scraper_cli.c $LINUX_DIR/src/c_core/
cp $SCRAPER_DIR/rust_finder/Cargo.toml           $LINUX_DIR/src/rust_finder/
cp $SCRAPER_DIR/rust_finder/Cargo.lock           $LINUX_DIR/src/rust_finder/ 2>/dev/null || true
cp $SCRAPER_DIR/rust_finder/src/main.rs          $LINUX_DIR/src/rust_finder/src/

# Empty data & logs
mkdir -p $LINUX_DIR/data $LINUX_DIR/logs
touch $LINUX_DIR/data/.gitkeep $LINUX_DIR/logs/.gitkeep

# README
cp $SCRAPER_DIR/README.md $LINUX_DIR/README.md 2>/dev/null || true

# Permissions
chmod +x $LINUX_DIR/c_core/native_host/debug_host  2>/dev/null || true
chmod +x $LINUX_DIR/c_core/native_host/scraper_cli 2>/dev/null || true

echo -e "${GREEN}    ✅ Linux release ready${NC}"
echo ""

# ============================================================
#  🪟  WINDOWS RELEASE (cross-compiled from Linux)
# ============================================================
echo -e "${BLUE}🪟  Building Windows release (cross-compile)...${NC}"
echo -e "${YELLOW}    ⚠️  Theoretical — compiled but not tested on Windows.${NC}"
echo ""

mkdir -p $WIN_DIR

# Cross-compile C for Windows (shows real errors)
echo "    Cross-compiling C for Windows..."
cd $SCRAPER_DIR/c_core/native_host
if command -v x86_64-w64-mingw32-gcc &>/dev/null; then
    # Windows uses named pipes — separate source files
    WIN_SRC_HOST=$SCRAPER_DIR/c_core/native_host/debug_host_win.c
    WIN_SRC_CLI=$SCRAPER_DIR/c_core/native_host/scraper_cli_win.c

    echo "      Compiling debug_host.exe..."
    x86_64-w64-mingw32-gcc -o debug_host.exe "$WIN_SRC_HOST" \
        -D_WIN32_WINNT=0x0600 -static \
        && echo "      debug_host.exe ✅" || {
        echo -e "      ${YELLOW}Retrying without -static...${NC}"
        x86_64-w64-mingw32-gcc -o debug_host.exe "$WIN_SRC_HOST" \
            -D_WIN32_WINNT=0x0600 \
            && echo "      debug_host.exe ✅ (dynamic)" \
            || echo -e "      ${RED}❌ debug_host.exe failed${NC}"
    }

    echo "      Compiling scraper_cli.exe..."
    x86_64-w64-mingw32-gcc -o scraper_cli.exe "$WIN_SRC_CLI" \
        -D_WIN32_WINNT=0x0600 -static \
        && echo "      scraper_cli.exe ✅" || {
        echo -e "      ${YELLOW}Retrying without -static...${NC}"
        x86_64-w64-mingw32-gcc -o scraper_cli.exe "$WIN_SRC_CLI" \
            -D_WIN32_WINNT=0x0600 \
            && echo "      scraper_cli.exe ✅ (dynamic)" \
            || echo -e "      ${RED}❌ scraper_cli.exe failed${NC}"
    }
else
    echo -e "    ${RED}❌ mingw32 not found: sudo apt install mingw-w64 -y${NC}"
fi

mkdir -p $WIN_DIR/c_core/native_host
cp $SCRAPER_DIR/c_core/native_host/debug_host.exe  $WIN_DIR/c_core/native_host/ 2>/dev/null \
    || echo "      (debug_host.exe not copied)"
cp $SCRAPER_DIR/c_core/native_host/scraper_cli.exe $WIN_DIR/c_core/native_host/ 2>/dev/null \
    || echo "      (scraper_cli.exe not copied)"

# Cross-compile Rust for Windows (shows real errors)
echo "    Cross-compiling Rust for Windows..."
rustup target add x86_64-pc-windows-gnu
cd $SCRAPER_DIR/rust_finder
cargo build --release --target x86_64-pc-windows-gnu
WIN_RUST_BIN=$SCRAPER_DIR/rust_finder/target/x86_64-pc-windows-gnu/release/${RUST_BIN_NAME}.exe
if [ -f "$WIN_RUST_BIN" ]; then
    mkdir -p $WIN_DIR/rust_finder/target/release/
    cp "$WIN_RUST_BIN" $WIN_DIR/rust_finder/target/release/finder.exe
    echo "      finder.exe ✅"
else
    echo -e "      ${RED}❌ finder.exe not found — checking dir:${NC}"
    ls $SCRAPER_DIR/rust_finder/target/x86_64-pc-windows-gnu/release/*.exe 2>/dev/null || echo "      (no .exe found)"
fi

# Extension
echo "    Copying extension..."
mkdir -p $WIN_DIR/extension/brave
cp -r $SCRAPER_DIR/extension/brave/* $WIN_DIR/extension/brave/
cp -r $SCRAPER_DIR/extension/chrome   $WIN_DIR/extension/ 2>/dev/null || true
cp -r $SCRAPER_DIR/extension/firefox  $WIN_DIR/extension/ 2>/dev/null || true

# Python API
echo "    Copying Python API..."
mkdir -p $WIN_DIR/python_api
cp $SCRAPER_DIR/python_api/api.py $WIN_DIR/python_api/

# React dashboard
echo "    Copying UI..."
mkdir -p $WIN_DIR/ui/scrapperui
rsync -a --exclude='node_modules' --exclude='.next' --exclude='dist' \
    $SCRAPER_DIR/ui/scrapperui/ $WIN_DIR/ui/scrapperui/

# Windows config
echo "    Creating Windows config..."
mkdir -p $WIN_DIR/config
cat > $WIN_DIR/config/com.scraper.core.json << 'WINCFG'
{
  "name": "com.scraper.core",
  "description": "Scraper Core Native Host",
  "path": "C:\\PATH\\TO\\scrapy-windows-x64\\c_core\\native_host\\debug_host.exe",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://YOUR_EXTENSION_ID_HERE/"]
}
WINCFG

# Source files
mkdir -p $WIN_DIR/src/c_core $WIN_DIR/src/rust_finder/src
cp $SCRAPER_DIR/c_core/native_host/debug_host_win.c  $WIN_DIR/src/c_core/
cp $SCRAPER_DIR/c_core/native_host/scraper_cli_win.c $WIN_DIR/src/c_core/
cp $SCRAPER_DIR/rust_finder/Cargo.toml               $WIN_DIR/src/rust_finder/
cp $SCRAPER_DIR/rust_finder/src/main.rs              $WIN_DIR/src/rust_finder/src/

# Empty data & logs
mkdir -p $WIN_DIR/data $WIN_DIR/logs
touch $WIN_DIR/data/.gitkeep $WIN_DIR/logs/.gitkeep

# README
cp $SCRAPER_DIR/README.md $WIN_DIR/README.md 2>/dev/null || true

echo -e "${GREEN}    ✅ Windows release ready${NC}"
echo ""

# ============================================================
#  📦  ARCHIVES
# ============================================================
echo -e "${BLUE}📦  Creating archives...${NC}"
cd $RELEASES_DIR

tar -czf scrapy-linux-x64.tar.gz  scrapy-linux-x64/ \
    && echo -e "${GREEN}    ✅ scrapy-linux-x64.tar.gz${NC}"
zip -r scrapy-windows-x64.zip scrapy-windows-x64/ > /dev/null 2>&1 \
    && echo -e "${GREEN}    ✅ scrapy-windows-x64.zip${NC}"

# ============================================================
#  🎉  SUMMARY
# ============================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   🎉  RELEASES CREATED SUCCESSFULLY!    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  📁 Linux:   ${BLUE}$LINUX_DIR/${NC}"
echo -e "     Archive: $RELEASES_DIR/scrapy-linux-x64.tar.gz"
echo ""
echo -e "  📁 Windows: ${BLUE}$WIN_DIR/${NC}"
echo -e "     Archive: $RELEASES_DIR/scrapy-windows-x64.zip"
echo -e "     ${YELLOW}⚠️  Windows: cross-compiled, not tested${NC}"
echo ""
echo -e "${BLUE}Sizes:${NC}"
ls -lh $RELEASES_DIR/ | grep -E "\.tar\.gz|\.zip"
echo ""
echo -e "${BLUE}Contents check:${NC}"
echo "  Linux binaries:"
ls -lh $LINUX_DIR/c_core/native_host/ 2>/dev/null
ls -lh $LINUX_DIR/rust_finder/target/release/ 2>/dev/null || echo "    (no rust binary)"
echo "  Windows binaries:"
ls -lh $WIN_DIR/c_core/native_host/ 2>/dev/null
ls -lh $WIN_DIR/rust_finder/target/release/ 2>/dev/null || echo "    (no rust binary)"
echo ""
echo -e "${GREEN}Ready to ship! 🚀${NC}"
echo ""