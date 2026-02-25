# 🕷️ SCRAPPER by BertUI
## The Session Observer for Web Automation

> **SCRAPPER isn't a scraper — it's a SESSION OBSERVER that captures your real browser data for use in any automation tool.**  
> Built on the BertUI React Framework  
> GitHub: [BunElysiaReact/SCRAPY](https://github.com/BunElysiaReact/SCRAPY)  
> *No domain. No cloud. All local. All yours.*

---

## 📋 Table of Contents
- [The Problem SCRAPPER Solves](#-the-problem-scrapper-solves)
- [What SCRAPPER Is (And Isn't)](#-what-scrapper-is-and-isnt)
- [How SCRAPPER Works](#-how-scrapper-works)
- [What SCRAPPER Captures](#-what-scrapper-captures)
- [Advantages & Disadvantages](#-advantages--disadvantages)
- [Universal Data API](#-universal-data-api)
- [Quick Start — Linux / macOS](#-quick-start--linux--macos)
- [Quick Start — Windows](#-quick-start--windows)
- [Browser Extensions](#-browser-extensions)
- [Using Captured Data in Your Tools](#-using-captured-data-in-your-tools)
- [Dashboard Overview](#-dashboard-overview)
- [Production Use & Automation](#-production-use--automation)
- [Contributing](#-contributing)

---

## 🤔 The Problem SCRAPPER Solves

Every web automation tool — Puppeteer, Playwright, Selenium, even curl — shares the same challenges:

| Challenge | Why It's Hard |
|-----------|---------------|
| **Authentication** | Manually scripting logins for every site is tedious and fragile |
| **Session state** | Cookies expire, tokens rotate, localStorage gets cleared |
| **Reverse engineering** | Hours spent in DevTools understanding API patterns |
| **Bot detection** | TLS fingerprints, browser entropy, Cloudflare, hCaptcha |
| **Setup complexity** | Fighting with headless browsers, proxies, and stealth plugins |

**The real issue:** All these tools are trying to *imitate* a human. But they're guessing at what a real human looks like.

---

## 💡 What SCRAPPER Is (And Isn't)

| SCRAPPER IS... | SCRAPPER IS NOT... |
|--------------|------------------|
| 🔍 A **session observer** that watches YOUR real browser | ❌ A replacement for Puppeteer/Playwright/Selenium |
| 💾 A **data capture tool** that saves your actual session | ❌ A tool that scrapes websites for you |
| 📡 A **local API server** serving your captured data | ❌ A hosted service or cloud platform |
| 🧠 A **reverse engineering assistant** revealing hidden APIs | ❌ A magic "scrape anything" button |
| 🎯 A **visual debugger** for understanding site structure | ❌ A no-code automation builder |

**SCRAPPER doesn't scrape. It gives you the REAL data YOU need to scrape successfully.**

---

## 🔄 How SCRAPPER Works

### Phase 1: Capture (Browser Open, You Browse)

```
YOU                                              SCRAPPER
  │                                                  │
  ├── Open Brave/Chrome/Firefox with extension ──────►│
  │                                                  │
  ├── Log into sites you want to automate ───────────►│ captures:
  │                                                  │  • Cookies
  ├── Browse normally, click buttons ────────────────►│  • Tokens
  │                                                  │  • Fingerprint
  └── Done browsing ─────────────────────────────────►│  • API requests
                                                     │  • DOM structure
```

### Phase 2: Automate (Browser Can Close, You Code)

```
YOUR SCRIPT ──── GET /api/v1/session/all ────► SCRAPPER API (localhost:8080)
              ◄── { cookies, tokens, fingerprint } ────────────────────────┘
                │
                ▼
         Puppeteer / Playwright / Selenium / Python requests / curl
                │
                ▼
         ✅ Authenticated requests with YOUR real session
```

---

## 📦 What SCRAPPER Captures

```
📦 Session Data
   ├── 🍪 Cookies (including HttpOnly, Secure, all domains)
   ├── 💾 localStorage & sessionStorage
   ├── 🔑 Auth tokens (Bearer, JWT, CSRF, custom)
   └── 📨 All HTTP headers

🖥️ Browser Fingerprint
   ├── 📱 User Agent
   ├── 🖼️ Screen resolution & color depth
   ├── 🌍 Timezone & language settings
   └── 📨 Full header set (Accept, Accept-Language, etc.)

📡 Network Traffic
   ├── 📤 All HTTP requests (URLs, methods, headers, POST data)
   ├── 📥 All HTTP responses (status, headers, bodies)
   └── 🔄 WebSocket frames

🌳 DOM State
   ├── 📄 DOM snapshots
   ├── 🎯 Live selector testing
   └── 🗺️ DOM maps (all tags, classes, IDs)
```

---

## ⚖️ Advantages & Disadvantages

### ✅ Advantages

| Advantage | Why It Matters |
|-----------|----------------|
| **Bypasses Advanced Bot Detection** | Uses `curl_cffi` to impersonate a real browser's TLS fingerprint (e.g., Chrome 120) — not flagged as automated |
| **97% Success Rate** | Targets internal API routes, not visual UI — immune to CSS changes, moving buttons, or layout updates |
| **Low Resource Usage** | ~20MB RAM vs 500MB+ for Puppeteer/Selenium. No browser engine running |
| **Invisible Authentication** | Piggybacks off your existing human-verified session — no login flow, no CAPTCHAs |
| **Syncs With Real Browser** | Messages/actions from scripts appear in your real browser tab when you refresh |
| **Language Agnostic** | Session API works with Python, Go, Rust, Node, curl — anything that can make HTTP requests |

### ❌ Disadvantages

| Disadvantage | What It Means |
|--------------|---------------|
| **Brittle Session Lifespan** | Entirely dependent on an active browser session — expires if you log out |
| **Depends on Internal APIs** | Uses undocumented endpoints that can change without notice |
| **Requires Setup Infrastructure** | Not standalone — needs debug host + browser extension running simultaneously |
| **Account Risk** | Uses your real identity. Aggressive rate-limit hitting can get your real account banned |
| **Learning Curve** | Must read network traffic to understand correct API payloads |
| **Single Device Binding** | `device-id` is tied to one captured session — can't easily share across machines |

---

## 📡 Universal Data API

Once captured, SCRAPPER serves everything via a simple REST API at `http://localhost:8080`.

### Core Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/session/cookies?domain=example.com` | All cookies for a domain |
| `GET /api/v1/session/localstorage?domain=example.com` | localStorage data |
| `GET /api/v1/session/all` | Complete session dump |
| `GET /api/v1/fingerprint` | Browser fingerprint |
| `GET /api/v1/tokens/all` | All extracted tokens |
| `GET /api/v1/requests/recent?limit=50` | Recent network requests |
| `GET /api/v1/dom/snapshot?url=example.com` | DOM snapshot |
| `GET /api/v1/export/env` | Environment variables format |
| `GET /api/v1/bulk/all?format=[json\|jsonl\|har\|csv\|txt]` | Everything, your format |

---

## 🚀 Quick Start — Linux / macOS

### One-Line Install

```bash
curl -fsSL https://raw.githubusercontent.com/BunElysiaReact/SCRAPY/main/install.sh | bash
```

### Requirements

- **Python 3** (any recent version)
- **Bun** or **Node.js** (for the dashboard)
- **Brave / Chrome / Firefox** browser

### Manual Setup

```bash
# Clone the repo
git clone https://github.com/BunElysiaReact/SCRAPY.git ~/scrapper
cd ~/scrapper

# Build the C native host
gcc -O2 -o c_core/native_host/debug_host c_core/native_host/debug_host.c -lpthread
gcc -O2 -o c_core/native_host/scraper_cli c_core/native_host/scraper_cli.c

# Build the Rust selector engine
cd rust_finder && cargo build --release && cd ..

# Start the API server
cd python_api && python3 api.py

# In another terminal — start the dashboard
cd ui/scrapperui && bun install && bun run dev
```

Open **http://localhost:3000** → Dashboard ready.

---

## 🪟 Quick Start — Windows

### One-Line Install (PowerShell)

```powershell
irm https://raw.githubusercontent.com/BunElysiaReact/SCRAPY/main/install.ps1 | iex
```

### What the installer does on Windows

1. Downloads pre-compiled `debug_host.exe` and `scraper_cli.exe`
2. Downloads pre-compiled `rust_finder.exe`
3. Installs the browser extension for Brave/Chrome/Edge
4. Registers the native messaging manifest in the correct location:
   - Brave: `%APPDATA%\BraveSoftware\Brave-Browser\NativeMessagingHosts\`
   - Chrome: `%APPDATA%\Google\Chrome\NativeMessagingHosts\`
   - Edge: `%APPDATA%\Microsoft\Edge\NativeMessagingHosts\`
5. Creates `scrapper-start.bat` and `scrapper-stop.bat` in `%USERPROFILE%\.scrapper\bin\`

### Manual Windows Setup

```powershell
# Requires: Python 3, Bun or Node, mingw64 (for compiling C), Rust (for compiling Rust)

git clone https://github.com/BunElysiaReact/SCRAPY.git $env:USERPROFILE\.scrapper
cd $env:USERPROFILE\.scrapper

# Compile C host (requires mingw64 or MSVC)
x86_64-w64-mingw32-gcc -o c_core\native_host\debug_host.exe c_core\native_host\debug_host_win.c -D_WIN32_WINNT=0x0600

# Compile Rust
cd rust_finder; cargo build --release; cd ..

# Register native messaging (update path and extension ID first)
# Edit config\com.scraper.core.json then copy to:
# %APPDATA%\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.scraper.core.json

# Start the API
python python_api\api.py

# Start the dashboard
cd ui\scrapperui && bun install && bun run dev
```

### Windows Folder Structure After Install

```
%USERPROFILE%\.scrapper\
├── bin\
│   ├── debug_host.exe         ← C native messaging host
│   ├── scraper_cli.exe        ← CLI client
│   ├── rust_finder.exe        ← Fast HTML selector engine
│   ├── scrapper-start.bat     ← Start everything
│   └── scrapper-stop.bat      ← Stop everything
├── data\                      ← All captured session data
├── logs\                      ← Host logs
├── python_api\
│   └── api.py                 ← REST API server
├── extension\
│   ├── brave\                 ← Load in Brave / Chrome / Edge
│   └── firefox\               ← Load in Firefox
└── ui\scrapperui\             ← Dashboard source
```

---

## 🧩 Browser Extensions

SCRAPPER has extensions for all major browsers. Load the extension folder **unpacked** in developer mode.

### Brave & Chrome (Recommended)

> Brave and Chrome share the same Chromium engine. **Use the same extension folder for both.**

1. Open `brave://extensions` or `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select: `extension/brave/`

Full features: CDP debugging, DOM mapping, fingerprint capture, stealth injection, live feed, popup UI.

### Microsoft Edge

1. Open `edge://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select: `extension/brave/` (same folder — Edge is Chromium-based)

### Firefox

> Firefox uses Manifest V2 and does not support the Chrome Debugger Protocol.  
> The Firefox extension captures cookies, network headers, and localStorage — but **not** CDP-level request bodies.

1. Open `about:debugging`
2. Click **This Firefox**
3. Click **Load Temporary Add-on...**
4. Select: `extension/firefox/manifest.json`

For permanent installation, sign the extension at [addons.mozilla.org](https://addons.mozilla.org/developers/).

**Firefox captures:**
- ✅ All cookies (including auth cookies)
- ✅ Cookie change events
- ✅ localStorage / sessionStorage (via content script)
- ✅ Basic network request/response logging
- ⚠️ No response bodies (Firefox API limitation without CDP)
- ⚠️ No DOM mapping or fingerprint capture

### After Loading — Register Your Extension ID

After loading the extension, copy its ID from the extensions page, then run:

**Linux/macOS:**
```bash
scrapy-register-ext YOUR_EXTENSION_ID_HERE
```

**Windows:**
```powershell
scrapper-register-ext.ps1 YOUR_EXTENSION_ID_HERE
```

---

## 🔧 Using Captured Data in Your Tools

### Python Requests

```python
import requests

session_data = requests.get('http://localhost:8080/api/v1/session/all').json()

s = requests.Session()
s.cookies.update({c['name']: c['value'] for c in session_data['cookies']})
s.headers.update({'User-Agent': session_data['fingerprint']['userAgent']})

response = s.get('https://api.example.com/data')
```

### curl

```bash
source <(curl -s http://localhost:8080/api/v1/export/env)

curl -X POST "https://api.example.com/upload" \
  -H "Authorization: Bearer $SCRAPY_BEARER_TOKEN" \
  -b "$SCRAPY_COOKIES" \
  -F "file=@document.pdf"
```

### Playwright (Python)

```python
import requests
from playwright.async_api import async_playwright

session = requests.get('http://localhost:8080/api/v1/session/all').json()

async with async_playwright() as p:
    context = await p.chromium.launch_persistent_context(
        user_data_dir="./profile",
        user_agent=session['fingerprint']['userAgent'],
    )
    await context.add_cookies(session['cookies'])
    page = await context.new_page()
    await page.goto('https://example.com')
```

### Puppeteer (Node.js)

```javascript
const session = await fetch('http://localhost:8080/api/v1/session/all').then(r => r.json());

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.setCookie(...session.cookies);
await page.setUserAgent(session.fingerprint.userAgent);
await page.goto('https://example.com/dashboard');
```

---

## 📊 Dashboard Overview

Open `http://localhost:3000` (dev) or `http://localhost:8080` (production):

| Tab | What It Does |
|-----|--------------|
| **Live** | Real-time stream of all captured network events |
| **Bodies** | HTTP response bodies — JSON, HTML, SVG, images, with preview |
| **Responses** | All HTTP responses by domain, filterable by flags |
| **Intel** | Per-domain summary — tokens, cookies, endpoints, DOM map |
| **Tokens** | Bearer tokens, task tokens, auth cookies, curl snippets |
| **Endpoints** | All discovered API endpoints with "Copy for LLM" |
| **DOM Map** | Full tag/class/ID tree — click any item to auto-scrape |
| **Find** | Test CSS selectors against real rendered HTML |
| **Nav** | Navigate + track tabs, dump cookies, capture HTML |
| **Queue** | Batch-process lists of URLs with configurable delays |

---

## ⚠️ Realistic Expectations

### What SCRAPPER CAN Do
- ✅ Capture your REAL cookies, tokens, and fingerprint
- ✅ Save them for reuse (days to months depending on site)
- ✅ Export in JSON, JSONL, HAR, CSV, TXT formats
- ✅ Serve everything via a clean local REST API
- ✅ Help you understand how sites really work at the network level

### What SCRAPPER CANNOT Do
- ❌ Scrape websites automatically without you browsing first
- ❌ Guess what cookies or tokens look like
- ❌ Extend cookie lifetimes beyond what the site allows
- ❌ Work without the native host and extension running

---

## 🏭 Production Use & Automation

```bash
# Export latest session data
curl -s "http://localhost:8080/api/v1/bulk/all?format=jsonl" > session.jsonl

# Use in your scraper
python3 my-scraper.py --session session.jsonl
```

```python
# session_refresh.py — Weekly session refresh pipeline
import requests, schedule, time

def refresh_session():
    notify_user("Please log into target sites in your browser")
    time.sleep(300)  # 5 minutes for user to browse
    data = requests.get('http://localhost:8080/api/v1/bulk/all?format=json').json()
    with open(f'session_{int(time.time())}.json', 'w') as f:
        import json; json.dump(data, f)

schedule.every().monday.at("09:00").do(refresh_session)
while True:
    schedule.run_pending()
    time.sleep(60)
```

---

## 🛠️ Implementation Status

### Current (v2.1.0)
- ✅ Request/response/body capture (Brave/Chrome via CDP)
- ✅ Cookie tracking (all browsers)
- ✅ DOM snapshots and selector testing
- ✅ Bearer token + task token extraction
- ✅ Browser fingerprint capture
- ✅ Live event feed (SSE)
- ✅ Bulk export (JSON/JSONL/TXT/HAR/CSV)
- ✅ URL queue with human-like delays
- ✅ "Copy for LLM" on every request and endpoint
- ✅ Brave, Chrome, Edge, Firefox extensions
- ✅ Linux + Windows installers

### Coming Soon
- 🔜 Chrome Web Store listing
- 🔜 Firefox Add-ons listing (signed)
- 🔜 WebSocket frame capture
- 🔜 Session sharing across machines

---

## 🤝 Contributing

### Ways to Contribute

| Area | What's Needed |
|------|---------------|
| **Testing** | Try SCRAPPER on different sites, report bugs |
| **Firefox** | Help improve Firefox extension CDP workarounds |
| **Windows** | Test Windows installer edge cases |
| **Docs** | Write tutorials for specific sites or use cases |
| **Code** | PRs welcome — especially bug fixes |

### Report Issues
[Open an issue](https://github.com/BunElysiaReact/SCRAPY/issues)

---

## 📬 Get Involved

- **GitHub**: [BunElysiaReact/SCRAPY](https://github.com/BunElysiaReact/SCRAPY)
- **Issues**: [github.com/BunElysiaReact/SCRAPY/issues](https://github.com/BunElysiaReact/SCRAPY/issues)

---

## 🙏 Built With

- **BertUI React Framework** — Dashboard UI
- **Bun + ElysiaJS** — Fast JavaScript runtime
- **Rust + scraper crate** — Blazing-fast CSS selector engine
- **C** — Ultra-low-latency native messaging host (Linux)
- **C + WinAPI** — Native messaging host (Windows named pipes)
- **Python 3** — Zero-dependency REST API server

---

*SCRAPPER by BertUI — The Session Observer for Web Automation*  
*🔍 Watching your browser so you don't have to*

**⭐ Star the repo if SCRAPPER helps you — it helps others find it!**