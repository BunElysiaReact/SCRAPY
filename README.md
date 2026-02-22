# 🕷️ SCRAPY by BertUI
> **The browser-native web scraper that actually works.**  
> Built on the BertUI React Framework · v2.1.0  
> GitHub: [BunElysiaReact/SCRAPY](https://github.com/BunElysiaReact/SCRAPY)

---

Scrapy isn't just another scraper. It runs **inside your browser** — meaning it inherits your login session, your cookies, your identity — and looks exactly like a real human to every anti-bot system ever built. No IP bans. No CAPTCHAs. No rate limits from hell. Just pure, unfiltered data.

While every other scraper is out there faking HTTP headers and getting blocked instantly, Scrapy is sitting inside your browser silently capturing everything — API responses, auth tokens, WebSocket frames, cookies, DOM maps — in real time, with zero configuration.

---

## ✨ What Makes Scrapy Different

- **Runs inside your actual browser session** — it IS you, to every website
- **Captures everything** — requests, responses, JSON bodies, cookies, localStorage tokens, WebSocket frames
- **Stealth by default** — fingerprint jitter, human scroll/mouse simulation, canvas noise, WebGL spoofing
- **CSS selector extraction** — powered by a blazing-fast Rust engine
- **Beautiful React dashboard** — live event stream, token extraction, DOM map, batch queue
- **C native host backend** — ultra-low latency, zero overhead, saves everything to disk as JSONL

---

## 🖥️ Platform Support

| Platform | Status |
|----------|--------|
| 🐧 Linux (MX Linux, Ubuntu 18+, Debian) | ✅ Fully tested |
| 🪟 Windows 10/11 | ⚠️ Compiled — not yet tested (contributions welcome!) |
| 🍎 macOS | ❌ Not supported (no Mac to test on — PRs welcome!) |

> Windows support is theoretically complete — the `.exe` binaries are cross-compiled from Linux. It has not been tested on a real Windows machine. If you're on Windows, try it and open an issue!

---

## 🌐 Browser Compatibility

| Browser | Status |
|---------|--------|
| Brave | ✅ Tested |
| Google Chrome | ✅ Should work |
| Microsoft Edge | ✅ Should work |
| Opera / Vivaldi | ✅ Should work |
| Firefox | 🔜 Coming soon — Firefox support is in active development |
| Safari | ❌ Not supported |

> **macOS note:** No Mac available for testing so macOS support isn't something that can be guaranteed or maintained. If you're on macOS and want to try it, you're welcome to — but you're on your own. PRs with macOS fixes are welcome.

---

## ⚔️ Scrapy vs Puppeteer (+ plugins)

Everyone reaches for Puppeteer first. Here's why that's the wrong call for serious scraping:

| Feature | Puppeteer + Plugins | Scrapy |
|---------|-------------------|--------|
| **Runs in real browser session** | ❌ Spawns a separate browser, no existing session | ✅ Runs inside YOUR browser — you're already logged in |
| **Auth / login state** | ❌ You have to script the login every time | ✅ Inherited automatically — it IS your session |
| **Bot detection bypass** | ⚠️ Needs puppeteer-extra-plugin-stealth + constant maintenance as sites update | ✅ Undetectable by design — same fingerprint as you |
| **Anti-bot / Cloudflare** | ❌ Frequently blocked, needs proxies + residential IPs | ✅ You're a real user — no blocks |
| **Setup complexity** | ❌ Node.js + puppeteer + stealth plugin + proxy config + sometimes a full headless server | ✅ Load extension + run two commands |
| **Captures WebSocket frames** | ⚠️ Possible but complex | ✅ Built-in, automatic |
| **Captures auth tokens** | ⚠️ Requires intercepting requests manually | ✅ Automatic — saved to auth.jsonl |
| **CSS selector extraction** | ✅ Yes | ✅ Yes — via Rust engine (faster) |
| **Live data stream** | ❌ No dashboard | ✅ Real-time dashboard at localhost:3000 |
| **Resource usage** | ❌ Heavy — launches a full browser process | ✅ Lightweight — piggybacks your existing browser |
| **Maintained session cookies** | ❌ Expires, needs re-authentication scripts | ✅ Stays logged in as long as you are |
| **JavaScript-heavy SPAs** | ⚠️ Works but requires waiting for network idle | ✅ You browse it like a human — it just records |
| **Language** | JavaScript / Node.js | Any — API is HTTP, CLI is a terminal |

### The real difference

Puppeteer pretends to be a human. Scrapy **is** a human — you. No amount of stealth plugins will make Puppeteer as undetectable as an actual browser with an actual session that's been logged into a site for months. Sites check cookie age, session history, behavioral patterns, TLS fingerprints, and dozens of other signals. Puppeteer fakes all of them. Scrapy doesn't need to fake any of them.

For scraping sites that don't require auth and don't have serious bot detection, Puppeteer is fine. For anything serious — paywalled content, sites behind Cloudflare, anything that requires being logged in — Scrapy is in a completely different league.

---

## 📦 What's in the Release

```
scrapy-[platform]/
├── c_core/native_host/     ← Pre-compiled C binaries (debug_host, scraper_cli)
├── rust_finder/            ← Pre-compiled Rust element extractor (finder)
├── extension/brave/        ← Browser extension (load unpacked)
├── python_api/             ← API server — api.py (no pip deps needed!)
├── ui/scrapperui/          ← React dashboard (BertUI framework)
├── config/                 ← Native messaging manifest
├── src/                    ← Source code (for developers)
├── data/                   ← Captured data goes here (.jsonl files)
└── logs/                   ← Debug logs
```

> **Users do NOT need Rust or GCC.** Binaries are pre-compiled and included. You only need **Python 3** and **Bun**.

---

## 1. Installation

> ⏱️ **The setup is a one-time process.** Yes, it takes 10–15 minutes. But you only ever do it once — after that, Scrapy just works every time you open your browser.

---

### i) 🐧 Linux Installation

#### Step 1 — Extract the release

```bash
tar -xzf scrapy-linux-x64.tar.gz
cd scrapy-linux-x64
```

#### Step 2 — Make binaries executable

```bash
chmod +x c_core/native_host/debug_host
chmod +x c_core/native_host/scraper_cli
chmod +x rust_finder/target/release/finder
```

#### Step 3 — Register the Native Messaging Host

Edit the config:
```bash
nano config/com.scraper.core.json
```

Set the `path` to the absolute path of `debug_host` on your machine:
```json
{
  "name": "com.scraper.core",
  "description": "Scraper Core Native Host",
  "path": "/home/YOUR_USERNAME/scrapy-linux-x64/c_core/native_host/debug_host",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://YOUR_EXTENSION_ID_HERE/"]
}
```

> ⚠️ Replace `YOUR_USERNAME` with your Linux username. Extension ID comes in Step 5.

Copy to your browser's native messaging folder:

**Brave:**
```bash
mkdir -p ~/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/
cp config/com.scraper.core.json ~/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/
```

**Chrome:**
```bash
mkdir -p ~/.config/google-chrome/NativeMessagingHosts/
cp config/com.scraper.core.json ~/.config/google-chrome/NativeMessagingHosts/
```

**Edge:**
```bash
mkdir -p ~/.config/microsoft-edge/NativeMessagingHosts/
cp config/com.scraper.core.json ~/.config/microsoft-edge/NativeMessagingHosts/
```

#### Step 4 — Load the Extension

1. Open `brave://extensions`
2. Toggle ON **Developer mode** (top-right)
3. Click **Load unpacked** → select `extension/brave/`
4. Copy the **Extension ID** (long string under the extension name)

#### Step 5 — Update Config with Extension ID

```bash
nano config/com.scraper.core.json
```

Replace `YOUR_EXTENSION_ID_HERE` with your copied ID:
```json
"allowed_origins": ["chrome-extension://iodcmibmbgancdcommocomjgalgdmpml/"]
```

> ⚠️ The trailing slash is required.

Re-copy the manifest, then reload the extension:
```bash
cp config/com.scraper.core.json ~/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/
```

Go to `brave://extensions` → click **Reload** on the Scrapy card.

---

### ii) 🪟 Windows Installation

> ⚠️ **Windows support is theoretical — the `.exe` binaries are cross-compiled from Linux but have not been tested on a real Windows machine.** Try it and open an issue on GitHub with results!

#### Step 1 — Extract

Extract `scrapy-windows-x64.zip` to a permanent location, e.g.:
```
C:\scrapy\scrapy-windows-x64\
```

#### Step 2 — Register the Native Messaging Host

Edit `config\com.scraper.core.json`:
```json
{
  "name": "com.scraper.core",
  "description": "Scraper Core Native Host",
  "path": "C:\\scrapy\\scrapy-windows-x64\\c_core\\native_host\\debug_host.exe",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://YOUR_EXTENSION_ID_HERE/"]
}
```

Copy it (run PowerShell as Administrator):

**Brave:**
```powershell
mkdir "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\NativeMessagingHosts\" -Force
copy config\com.scraper.core.json "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\NativeMessagingHosts\"
```

**Chrome:**
```powershell
mkdir "$env:LOCALAPPDATA\Google\Chrome\User Data\NativeMessagingHosts\" -Force
copy config\com.scraper.core.json "$env:LOCALAPPDATA\Google\Chrome\User Data\NativeMessagingHosts\"
```

#### Step 3 — Load the Extension

1. Open `brave://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `extension\brave\`
4. Copy the **Extension ID**
5. Paste it into `com.scraper.core.json`, re-copy the manifest, reload the extension

---

### iii) 🧪 Tester / Quick Start

If you just want to run and test Scrapy — no compilers needed.

**Requirements: Python 3 and Bun. That's it.**

Install Bun (one-time):
```bash
# Linux/macOS
curl -fsSL https://bun.sh/install | bash

# Windows: download from https://bun.sh
```

Run Scrapy with 3 terminals:

**Terminal 1 — API server:**
```bash
cd python_api
python3 api.py          # Linux
python api.py           # Windows
```

**Terminal 2 — Dashboard:**
```bash
cd ui/scrapperui
bun install             # first time only
bun run dev
```

**Terminal 3 — CLI (optional live feed):**
```bash
./c_core/native_host/scraper_cli        # Linux
.\c_core\native_host\scraper_cli.exe    # Windows
```

Open **http://localhost:3000** — you're in.

Quick test to verify everything works:
1. Go to the **Find** tab
2. URL: `https://books.toscrape.com`
3. Selector: `p.price_color`
4. Hit **Scrape** → you'll get prices back as JSON instantly

---

### iv) 🛠️ Developer Setup

Build from source, modify, or contribute.

**Requirements:** GCC · Rust + Cargo · Python 3 · Bun

```bash
# Install all build tools (Linux/Debian)
sudo apt install gcc build-essential -y
curl https://sh.rustup.rs -sSf | sh && source ~/.cargo/env
curl -fsSL https://bun.sh/install | bash

# Clone the repo
git clone git@github.com:BunElysiaReact/SCRAPY.git
cd SCRAPY
```

**Build the C native host:**
```bash
cd c_core/native_host
gcc -o debug_host  debug_host.c  -lpthread
gcc -o scraper_cli scraper_cli.c
```

**Build the Rust finder:**
```bash
cd rust_finder
cargo build --release
# Binary → target/release/finder (or name in Cargo.toml)
```

**Run the UI in dev mode:**
```bash
cd ui/scrapperui
bun install
bun run dev
```

**Build release packages (Linux + Windows):**
```bash
chmod +x create_releases.sh
./create_releases.sh
```

> Cross-compile for Windows requires: `sudo apt install mingw-w64 -y`

---

## ▶️ Running Scrapy

Three terminals, always running together:

| Terminal | Command (Linux) |
|----------|-----------------|
| 1 — API | `cd python_api && python3 api.py` |
| 2 — Dashboard | `cd ui/scrapperui && bun run dev` |
| 3 — CLI (optional) | `./c_core/native_host/scraper_cli` |

Open **http://localhost:3000**

---

## 🎯 Using Scrapy

**Track a Tab — capture everything live:**
1. Open any website in Brave
2. Navigate tab → click **Track Tab**
3. Browse normally — all requests, responses, tokens, cookies captured

**Scrape Elements — instant, no tracking needed:**
1. Find tab → enter URL + CSS selector → **Scrape**
2. Results come back as JSON

**Example selectors:**
```
h3 a                 → link titles
p.price_color        → prices on books.toscrape.com
span.titleline a     → Hacker News post titles
article.product_pod  → full product cards
```

---

## 📊 Dashboard Tabs

| Tab | Description |
|-----|-------------|
| Live | Real-time event stream |
| Responses | All HTTP responses by domain |
| Intel | Tokens, cookies, API endpoints summary |
| Tokens | Extracted bearer tokens + auth cookies |
| Endpoints | All discovered API endpoints |
| DOM Map | Full tag/class/ID map of the page |
| Find | CSS selector scraper → JSON |
| Navigate | Track tabs, dump cookies, get HTML |
| Queue | Batch-process a list of URLs |

---

## 💾 Data Files

Saved to `data/` as `.jsonl` (one JSON object per line):

```
requests.jsonl      → Flagged HTTP requests
responses.jsonl     → All HTTP responses
bodies.jsonl        → Response bodies
auth.jsonl          → Auth cookies + localStorage tokens
cookies.jsonl       → All cookies
websockets.jsonl    → WebSocket frames
dommaps.jsonl       → DOM snapshots
```

---

## 🔧 Troubleshooting

**Extension not connecting:**
- Check Extension ID in manifest matches exactly
- Verify `path` points to real binary
- Manifest must be in the correct NativeMessagingHosts folder
- Reload extension after every manifest change
- Check: `tail -f logs/debug_host.log`

**Dashboard OFFLINE:**
- Make sure `api.py` is running
- `lsof -i :8080` to check port

**Port conflict:**
```bash
pkill -f api.py && python3 api.py
```

**No events in Live tab:**
- Click **Track Tab** before browsing
- Old HTML sites have no API calls — use **Find** tab instead

---

## 📬 Contributing

PRs welcome! Tested it on Windows or macOS? Open an issue with your results.

[https://github.com/BunElysiaReact/SCRAPY](https://github.com/BunElysiaReact/SCRAPY)

---

*Scrapy — Made by BertUI · BertUI React Framework · v2.1.0*  
*Tested on Brave v145 (Chromium) on MX Linux / Ubuntu*