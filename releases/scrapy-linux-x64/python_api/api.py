#!/usr/bin/env python3
"""
python_api/api.py - Scraper orchestrator API
All stdlib — no pip, no venv needed.
Run: python3 api.py
"""

import json
import random
import io
import os
import socket
import subprocess
import threading
import time
import zipfile
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from pathlib import Path
from urllib.parse import urlparse, parse_qs

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

# ── Config ────────────────────────────────────────────────────────────────────

BASE         = Path("/home/PeaseErnest/scraper")
DATA_DIR     = BASE / "data"
LOGS_DIR     = BASE / "logs"
RUST_BIN     = BASE / "rust_finder" / "target" / "release" / "rust_finder"
C_SOCKET     = "/tmp/scraper.sock"
API_PORT     = 8080

DATA_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# ── In-memory store ───────────────────────────────────────────────────────────

store = {
    "requests":  defaultdict(list),
    "responses": defaultdict(list),
    "bodies":    defaultdict(list),
    "auth":      defaultdict(list),
    "cookies":   defaultdict(list),
    "websockets":defaultdict(list),
    "dommaps":   defaultdict(list),   # NEW: DOM structure per domain
}
store_lock = threading.Lock()

live_feed      = []
live_feed_lock = threading.Lock()
MAX_LIVE       = 500


# ── URL Queue ─────────────────────────────────────────────────────────────────

url_queue      = []
queue_lock     = threading.Lock()
queue_running  = False
queue_thread   = None

def queue_worker():
    global queue_running
    while True:
        with queue_lock:
            if not url_queue:
                queue_running = False
                return
            item = url_queue.pop(0)

        url     = item.get("url")
        delay   = item.get("delay", 5)
        warmup  = item.get("warmup", True)

        print(f"[Queue] Processing: {url}")
        cmd = "nav" if warmup else "nav_nowarmup"
        send_to_c({"command": cmd, "args": url})

        # Random delay between requests (human-like)
        sleep_time = delay + (random.random() * delay * 0.5)
        print(f"[Queue] Waiting {sleep_time:.1f}s before next...")
        time.sleep(sleep_time)

def queue_add(urls, delay=6, warmup=True):
    global queue_running, queue_thread
    with queue_lock:
        for url in urls:
            url_queue.append({"url": url, "delay": delay, "warmup": warmup})
    if not queue_running:
        queue_running = True
        queue_thread  = threading.Thread(target=queue_worker, daemon=True)
        queue_thread.start()
    return len(url_queue)

def queue_status():
    with queue_lock:
        return {"pending": len(url_queue), "running": queue_running, "items": list(url_queue)}

def queue_clear():
    with queue_lock:
        url_queue.clear()
    return {"cleared": True}

# ── File → store key mapping ──────────────────────────────────────────────────

FILE_TO_KEY = {
    "requests.jsonl":   "requests",
    "responses.jsonl":  "responses",
    "bodies.jsonl":     "bodies",
    "auth.jsonl":       "auth",
    "cookies.jsonl":    "cookies",
    "websockets.jsonl": "websockets",
    "dommaps.jsonl":    "dommaps",
}

# ── Load existing data ────────────────────────────────────────────────────────

def load_existing():
    for fname, key in FILE_TO_KEY.items():
        path = DATA_DIR / fname
        if not path.exists():
            continue
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj    = json.loads(line)
                    domain = obj.get("domain", "unknown")
                    with store_lock:
                        store[key][domain].append(obj)
                except Exception:
                    pass
    print(f"[API] Loaded existing data from {DATA_DIR}")

# ── File watcher ──────────────────────────────────────────────────────────────

file_positions = {}

def watch_files():
    while True:
        for fname, key in FILE_TO_KEY.items():
            path = DATA_DIR / fname
            if not path.exists():
                continue
            pos = file_positions.get(fname, 0)
            try:
                with open(path) as f:
                    f.seek(pos)
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            obj    = json.loads(line)
                            domain = obj.get("domain", "unknown")
                            with store_lock:
                                store[key][domain].append(obj)
                            with live_feed_lock:
                                live_feed.append(obj)
                                if len(live_feed) > MAX_LIVE:
                                    live_feed.pop(0)
                        except Exception:
                            pass
                    file_positions[fname] = f.tell()
            except Exception:
                pass
        time.sleep(0.5)

# ── Send command to C host ────────────────────────────────────────────────────

def send_to_c(command_dict):
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.connect(C_SOCKET)
        cmd  = command_dict.get("command", "")
        args = command_dict.get("args", "")
        line = f"{cmd} {args}\n" if args else f"{cmd}\n"
        sock.sendall(line.encode())
        sock.settimeout(3)
        try:    resp = sock.recv(4096).decode(errors="replace")
        except: resp = ""
        sock.close()
        return resp
    except Exception as e:
        return f"ERROR: {e}"

# ── Rust finder ───────────────────────────────────────────────────────────────

def rust_find(selector, domain=None, limit=100):
    if not RUST_BIN.exists():
        return {"error": "rust_finder not built. Run: cd rust_finder && cargo build --release"}
    html_files = list(DATA_DIR.glob("html_*.json"))
    if domain:
        filtered = []
        for hf in html_files:
            try:
                obj = json.loads(hf.read_text())
                if domain in obj.get("data", {}).get("url", ""):
                    filtered.append(str(hf))
            except Exception:
                pass
        html_files = filtered
    else:
        html_files = [str(f) for f in html_files]
    if not html_files:
        return {"error": "No HTML files. Run 'html' command first."}
    results = []
    for hf in html_files[:10]:
        try:
            proc = subprocess.run(
                [str(RUST_BIN), "--selector", selector, "--file", hf, "--limit", str(limit)],
                capture_output=True, text=True, timeout=10
            )
            if proc.stdout:
                results.append({"file": hf, "matches": json.loads(proc.stdout)})
        except Exception as e:
            results.append({"file": hf, "error": str(e)})
    return {"selector": selector, "results": results}


# ── On-demand scrape ──────────────────────────────────────────────────────────

def scrape_url(url, selector, limit=50):
    """Fetch URL directly and extract elements matching selector via rust_finder."""
    import urllib.request
    if not RUST_BIN.exists():
        return {"error": "rust_finder not built. Run: cd rust_finder && cargo build --release"}
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        return {"error": f"Fetch failed: {e}"}

    try:
        proc = subprocess.run(
            [str(RUST_BIN), "--selector", selector, "--html", html, "--limit", str(limit)],
            capture_output=True, text=True, timeout=15
        )
        if proc.returncode != 0 or not proc.stdout.strip():
            return {"error": proc.stderr or "No output from rust_finder"}
        matches = json.loads(proc.stdout)
        return {"url": url, "selector": selector, "count": len(matches), "matches": matches}
    except Exception as e:
        return {"error": f"rust_finder failed: {e}"}

# ── Data queries ──────────────────────────────────────────────────────────────

def get_bearer_tokens(domain=None):
    tokens = []
    with store_lock:
        domains = [domain] if domain else list(store["requests"].keys())
        for d in domains:
            for req in store["requests"][d]:
                headers = req.get("headers", {})
                auth = headers.get("authorization") or headers.get("Authorization", "")
                if auth.lower().startswith("bearer "):
                    tokens.append({
                        "domain":    d,
                        "token":     auth[7:],
                        "url":       req.get("url"),
                        "timestamp": req.get("timestamp")
                    })
    seen = set(); unique = []
    for t in tokens:
        if t["token"] not in seen:
            seen.add(t["token"]); unique.append(t)
    return unique

def get_auth_cookies(domain=None):
    with store_lock:
        domains = [domain] if domain else list(store["auth"].keys())
        return {d: store["auth"][d] for d in domains}

def get_api_endpoints(domain=None):
    with store_lock:
        domains = [domain] if domain else list(store["requests"].keys())
        endpoints = defaultdict(list)
        for d in domains:
            for req in store["requests"][d]:
                flags = req.get("flags", [])
                if "API" in flags or "AUTH_FLOW" in flags:
                    endpoints[d].append({
                        "method":    req.get("method"),
                        "url":       req.get("url"),
                        "flags":     flags,
                        "postData":  req.get("postData"),
                        "timestamp": req.get("timestamp")
                    })
        return dict(endpoints)

def get_domains():
    with store_lock:
        all_domains = set()
        for key in store:
            all_domains.update(store[key].keys())
        return sorted(all_domains)

def get_stats():
    with store_lock:
        stats = {}
        for key in store:
            total = sum(len(v) for v in store[key].values())
            stats[key] = {"total": total, "domains": list(store[key].keys())}
        return stats

# NEW: Site intel — all tokens, cookies, endpoints, DOM for one domain
def get_site_intel(domain):
    tokens    = get_bearer_tokens(domain)
    auth      = get_auth_cookies(domain)
    endpoints = get_api_endpoints(domain)
    with store_lock:
        dommap = store["dommaps"].get(domain, [])
        # Latest DOM map only
        latest_dom = dommap[-1] if dommap else None
    return {
        "domain":    domain,
        "tokens":    tokens,
        "auth":      auth.get(domain, []),
        "endpoints": endpoints.get(domain, []),
        "dommap":    latest_dom,
    }

# NEW: Export all data as zip
def export_zip(domain=None):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if domain:
            # Export single domain
            with store_lock:
                for key in store:
                    items = store[key].get(domain, [])
                    if items:
                        zf.writestr(f"{domain}/{key}.json",
                                    json.dumps(items, indent=2))
            # HTML files for this domain
            for hf in DATA_DIR.glob("html_*.json"):
                try:
                    obj = json.loads(hf.read_text())
                    if domain in obj.get("data", {}).get("url", ""):
                        zf.write(str(hf), f"{domain}/{hf.name}")
                except Exception:
                    pass
        else:
            # Export everything
            for fname in DATA_DIR.glob("*.jsonl"):
                zf.write(str(fname), fname.name)
            for fname in DATA_DIR.glob("html_*.json"):
                zf.write(str(fname), fname.name)
            for fname in DATA_DIR.glob("screenshot_*.json"):
                zf.write(str(fname), fname.name)
    buf.seek(0)
    return buf.read()

# ── HTTP handler ──────────────────────────────────────────────────────────────

class ScraperAPI(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass

    def send_json(self, data, status=200):
        body = json.dumps(data, indent=2).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, html):
        body = html.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def send_sse_stream(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        last_idx = max(0, len(live_feed) - 20)
        try:
            while True:
                with live_feed_lock:
                    current  = live_feed[last_idx:]
                    last_idx = len(live_feed)
                for item in current:
                    data = f"data: {json.dumps(item)}\n\n"
                    self.wfile.write(data.encode())
                    self.wfile.flush()
                time.sleep(0.5)
        except Exception:
            pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip("/")
        qs     = parse_qs(parsed.query)
        domain = qs.get("domain", [None])[0]

        if path in ("", "/"):
            self.send_html(DASHBOARD_HTML)
        elif path == "/live":
            self.send_sse_stream()
        elif path == "/stats":
            self.send_json(get_stats())
        elif path == "/domains":
            self.send_json(get_domains())
        elif path == "/tokens":
            self.send_json(get_bearer_tokens(domain))
        elif path == "/auth":
            self.send_json(get_auth_cookies(domain))
        elif path == "/endpoints":
            self.send_json(get_api_endpoints(domain))
        elif path == "/requests":
            with store_lock:
                self.send_json(store["requests"][domain] if domain else dict(store["requests"]))
        elif path == "/bodies":
            limit = int(qs.get("limit", [50])[0])
            with store_lock:
                if domain:
                    self.send_json(store["bodies"][domain][-limit:])
                else:
                    self.send_json({d: v[-limit:] for d, v in store["bodies"].items()})
        elif path == "/cookies":
            with store_lock:
                self.send_json(store["cookies"][domain] if domain else dict(store["cookies"]))
        elif path == "/dommaps":
            with store_lock:
                self.send_json(store["dommaps"][domain] if domain else dict(store["dommaps"]))
        elif path == "/intel":
            if not domain:
                self.send_json({"error": "?domain= required"}, 400)
            else:
                self.send_json(get_site_intel(domain))
        elif path == "/find":
            selector = qs.get("selector", ["div"])[0]
            limit    = int(qs.get("limit", [100])[0])
            self.send_json(rust_find(selector, domain, limit))
        elif path == "/responses":
            with store_lock:
                if domain:
                    reqs  = store["requests"].get(domain, [])
                    resps = store["responses"].get(domain, [])
                    bods  = store["bodies"].get(domain, [])
                else:
                    reqs  = [r for v in store["requests"].values()  for r in v]
                    resps = [r for v in store["responses"].values() for r in v]
                    bods  = [r for v in store["bodies"].values()    for r in v]
            # merge responses with their bodies by requestId
            body_map = {b.get("requestId"): b.get("body") for b in bods if b.get("requestId")}
            merged = []
            for r in resps:
                entry = dict(r)
                entry["body"] = body_map.get(r.get("requestId"))
                merged.append(entry)
            self.send_json(merged)
        elif path == "/scrape":
            url      = qs.get("url", [""])[0]
            selector = qs.get("selector", ["div"])[0]
            limit    = int(qs.get("limit", [50])[0])
            if not url:
                self.send_json({"error": "?url= required"}, 400)
            else:
                self.send_json(scrape_url(url, selector, limit))
        elif path == "/feed":
            with live_feed_lock:
                limit = int(qs.get("limit", [100])[0])
                self.send_json(live_feed[-limit:])
        elif path == "/queue":
            self.send_json(queue_status())

        elif path == "/export":
            # Download zip of all data (or ?domain= for one site)
            data = export_zip(domain)
            fname = f"{domain or 'all_data'}.zip"
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Disposition", f"attachment; filename={fname}")
            self.send_header("Content-Length", len(data))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)
        else:
            self.send_json({"error": "Not found"}, 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip("/")
        length = int(self.headers.get("Content-Length", 0))
        body   = json.loads(self.rfile.read(length)) if length > 0 else {}

        if path == "/queue/add":
            urls   = body.get("urls", [])
            delay  = body.get("delay", 6)
            warmup = body.get("warmup", True)
            if not urls and body.get("url"):
                urls = [body["url"]]
            if not urls:
                self.send_json({"error": "no urls"}, 400); return
            count = queue_add(urls, delay, warmup)
            self.send_json({"queued": len(urls), "total_pending": count})

        elif path == "/queue/clear":
            self.send_json(queue_clear())

        elif path == "/cmd":
            command = body.get("command")
            args    = body.get("args", "")
            if not command:
                self.send_json({"error": "no command"}, 400); return
            resp = send_to_c({"command": command, "args": args})
            self.send_json({"sent": command, "response": resp})
        elif path == "/navigate":
            url = body.get("url")
            if not url:
                self.send_json({"error": "no url"}, 400); return
            resp = send_to_c({"command": "nav", "args": url})
            self.send_json({"navigating": url, "response": resp})
        elif path == "/clear":
            domain = body.get("domain")
            if domain:
                with store_lock:
                    for key in store: store[key].pop(domain, None)
                self.send_json({"cleared": domain})
            else:
                self.send_json({"error": "no domain"}, 400)
        else:
            self.send_json({"error": "Not found"}, 404)

# ── Dashboard HTML ────────────────────────────────────────────────────────────

DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Scraper Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Courier New',monospace;background:#0d0d0d;color:#e0e0e0;height:100vh;display:flex;flex-direction:column;overflow:hidden}
header{background:#111;border-bottom:1px solid #2a2a2a;padding:10px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0}
header h1{font-size:15px;color:#00ff88;letter-spacing:2px}
.badge{font-size:10px;padding:2px 7px;border-radius:3px;background:#1a1a1a;border:1px solid #333}
.badge.green{border-color:#00ff88;color:#00ff88}
#status{font-size:11px;color:#555;margin-left:auto}
nav{display:flex;background:#111;border-bottom:1px solid #2a2a2a;flex-shrink:0}
nav button{background:none;border:none;color:#666;padding:8px 16px;cursor:pointer;font-size:12px;font-family:inherit;border-right:1px solid #1a1a1a;transition:.15s}
nav button:hover,nav button.active{background:#161616;color:#00ff88}
.main{display:flex;flex:1;overflow:hidden}
.sidebar{width:190px;background:#111;border-right:1px solid #1a1a1a;display:flex;flex-direction:column;flex-shrink:0;overflow:hidden}
.sidebar-head{padding:10px 12px;font-size:10px;color:#444;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;justify-content:space-between}
.sidebar-head button{background:none;border:1px solid #333;color:#555;font-size:9px;padding:1px 6px;cursor:pointer;border-radius:2px;font-family:inherit}
.sidebar-head button:hover{border-color:#00ff88;color:#00ff88}
#domain-list{flex:1;overflow-y:auto;padding:6px}
.domain-item{font-size:11px;padding:5px 8px;cursor:pointer;border-radius:3px;margin-bottom:2px;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden}
.domain-item:hover{background:#161616;color:#e0e0e0}
.domain-item.active{background:#0a1f12;color:#00ff88;border-left:2px solid #00ff88}
.domain-dot{width:5px;height:5px;border-radius:50%;background:#333;flex-shrink:0}
.domain-item.active .domain-dot{background:#00ff88}
.content{flex:1;overflow:hidden;display:flex;flex-direction:column}
.toolbar{padding:7px 12px;background:#111;border-bottom:1px solid #1a1a1a;display:flex;gap:7px;align-items:center;flex-shrink:0}
.toolbar input{flex:1;background:#161616;border:1px solid #2a2a2a;color:#e0e0e0;padding:5px 10px;font-family:inherit;font-size:12px;border-radius:3px}
.toolbar input:focus{outline:none;border-color:#00ff88}
.toolbar button,.btn{background:#0a1f12;border:1px solid #00ff88;color:#00ff88;padding:4px 13px;cursor:pointer;font-family:inherit;font-size:11px;border-radius:3px;transition:.15s}
.toolbar button:hover,.btn:hover{background:#00ff88;color:#000}
.btn.red{background:#1f0a0a;border-color:#ff4444;color:#ff4444}
.btn.red:hover{background:#ff4444;color:#000}
.btn.yellow{background:#1f1a0a;border-color:#ffcc00;color:#ffcc00}
.btn.yellow:hover{background:#ffcc00;color:#000}
.panel{flex:1;overflow-y:auto;padding:10px}
.panel.hidden{display:none}
.section-title{font-size:10px;color:#444;text-transform:uppercase;letter-spacing:1px;margin:12px 0 6px;padding-bottom:4px;border-bottom:1px solid #1a1a1a}
.card{background:#111;border:1px solid #1e1e1e;border-radius:4px;margin-bottom:6px;overflow:hidden}
.card-header{padding:7px 11px;display:flex;align-items:center;gap:7px;cursor:pointer;user-select:none}
.card-header:hover{background:#141414}
.method{font-size:10px;padding:1px 5px;border-radius:2px;font-weight:bold;min-width:36px;text-align:center}
.GET{background:#0a1f0a;color:#00cc44;border:1px solid #00cc4466}
.POST{background:#1f1a0a;color:#ff8800;border:1px solid #ff880066}
.PUT{background:#0a0a1f;color:#4488ff;border:1px solid #4488ff66}
.DELETE{background:#1f0a0a;color:#ff4444;border:1px solid #ff444466}
.card-url{font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#ccc}
.flags{display:flex;gap:3px;flex-wrap:wrap}
.flag{font-size:9px;padding:1px 4px;border-radius:2px}
.BEARER_TOKEN{background:#1f1f00;color:#ffff44;border:1px solid #ffff4466}
.API{background:#001a2f;color:#44aaff;border:1px solid #44aaff66}
.AUTH_FLOW{background:#1f0000;color:#ff6666;border:1px solid #ff666666}
.CF_CLEARANCE{background:#1a0f00;color:#ff9900;border:1px solid #ff990066}
.POST_DATA{background:#0f001a;color:#cc44ff;border:1px solid #cc44ff66}
.flag-other{background:#1a1a1a;color:#888;border:1px solid #333}
.card-body{padding:9px 11px;display:none;border-top:1px solid #1a1a1a}
.card-body.open{display:block}
pre{background:#0a0a0a;padding:7px;border-radius:3px;overflow-x:auto;font-size:10px;white-space:pre-wrap;word-break:break-all;max-height:250px;overflow-y:auto;line-height:1.5}
.token-card{background:#111;border:1px solid #1f1f00;border-radius:4px;padding:9px 13px;margin-bottom:7px}
.token-meta{font-size:10px;color:#555;margin-bottom:5px;display:flex;gap:10px}
.token-value{font-size:11px;color:#ffff44;word-break:break-all;background:#0c0c00;padding:6px 8px;border-radius:3px;cursor:pointer;border:1px solid #2a2a00;position:relative}
.token-value:hover{border-color:#ffff44}
.copy-hint{position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:9px;color:#555}
.cookie-card{background:#111;border:1px solid #1a1200;border-radius:4px;padding:8px 12px;margin-bottom:5px}
.cookie-name{font-size:11px;color:#ffcc44;margin-bottom:4px}
.cookie-val{font-size:10px;color:#888;word-break:break-all;cursor:pointer}
.cookie-val:hover{color:#ccc}
.live-row{font-size:11px;padding:3px 8px;border-bottom:1px solid #141414;display:flex;gap:7px;align-items:center}
.live-row:hover{background:#121212}
.ltype{font-size:9px;padding:1px 5px;border-radius:2px;min-width:80px;text-align:center;flex-shrink:0}
.t-request{background:#0a1f0a;color:#00cc44}
.t-response_body{background:#001a2f;color:#44aaff}
.t-auth_cookie{background:#1f1f00;color:#ffff44}
.t-cookies_changed{background:#111;color:#444}
.t-debugger_status{background:#1a0030;color:#aa44ff}
.t-dommap{background:#001a1a;color:#00ffcc}
.t-default{background:#1a1a1a;color:#666}
.live-domain{font-size:10px;color:#444;min-width:110px;overflow:hidden;text-overflow:ellipsis;flex-shrink:0}
.live-url{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#aaa}
.live-time{font-size:9px;color:#333;flex-shrink:0}
/* DOM map */
.dom-section{margin-bottom:12px}
.dom-tag{display:inline-block;font-size:10px;padding:1px 5px;border-radius:2px;background:#001a1a;color:#00ffcc;border:1px solid #00ffcc44;margin:2px;cursor:pointer}
.dom-tag:hover{background:#00ffcc;color:#000}
.dom-class{display:inline-block;font-size:10px;padding:1px 5px;border-radius:2px;background:#001a0a;color:#44ff88;border:1px solid #44ff8844;margin:2px;cursor:pointer}
.dom-class:hover{background:#44ff88;color:#000}
.dom-id{display:inline-block;font-size:10px;padding:1px 5px;border-radius:2px;background:#1a1a00;color:#ffff44;border:1px solid #ffff4444;margin:2px;cursor:pointer}
.dom-id:hover{background:#ffff44;color:#000}
/* Intel page */
.intel-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
@media(max-width:800px){.intel-grid{grid-template-columns:1fr}}
.intel-box{background:#111;border:1px solid #1e1e1e;border-radius:4px;padding:10px}
.intel-box h3{font-size:10px;color:#444;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.count-badge{font-size:18px;color:#00ff88;font-weight:bold}
::-webkit-scrollbar{width:3px}
::-webkit-scrollbar-track{background:#0d0d0d}
::-webkit-scrollbar-thumb{background:#2a2a2a}
</style>
</head>
<body>
<header>
  <h1>◈ SCRAPER</h1>
  <span class="badge green" id="conn-badge">LIVE</span>
  <span id="status">connecting...</span>
  <div style="margin-left:auto;display:flex;gap:7px">
    <button class="btn yellow" onclick="exportData()">⬇ Export All</button>
    <button class="btn" onclick="exportData(activeDomain)" id="export-domain-btn" style="display:none">⬇ Export Domain</button>
  </div>
</header>
<nav>
  <button class="active" onclick="showTab('live')">Live</button>
  <button onclick="showTab('intel')">Site Intel</button>
  <button onclick="showTab('tokens')">Tokens</button>
  <button onclick="showTab('endpoints')">Endpoints</button>
  <button onclick="showTab('dommap')">DOM Map</button>
  <button onclick="showTab('find')">Find</button>
  <button onclick="showTab('nav')">Navigate</button>
  <button onclick="showTab('queue')">Queue</button>
</nav>
<div class="main">
  <div class="sidebar">
    <div class="sidebar-head">
      Domains
      <button onclick="loadDomains()">↻</button>
    </div>
    <div id="domain-list"></div>
  </div>
  <div class="content">

    <!-- Live -->
    <div class="panel" id="panel-live">
      <div class="toolbar">
        <span style="font-size:11px;color:#555">Real-time event stream</span>
        <button onclick="clearLive()">Clear</button>
      </div>
      <div id="live-feed"></div>
    </div>

    <!-- Site Intel -->
    <div class="panel hidden" id="panel-intel">
      <div class="toolbar">
        <span style="font-size:11px;color:#555" id="intel-label">Select a domain →</span>
        <button onclick="loadIntel()">Refresh</button>
        <button class="btn yellow" onclick="exportData(activeDomain)" id="intel-export" style="display:none">⬇ Export</button>
      </div>
      <div id="intel-content" style="padding:10px"></div>
    </div>

    <!-- Tokens -->
    <div class="panel hidden" id="panel-tokens">
      <div class="toolbar">
        <span style="font-size:11px;color:#555">Bearer tokens + auth cookies</span>
        <button onclick="loadTokens()">Refresh</button>
      </div>
      <div id="tokens-list" style="padding:10px"></div>
    </div>

    <!-- Endpoints -->
    <div class="panel hidden" id="panel-endpoints">
      <div class="toolbar">
        <span style="font-size:11px;color:#555">API endpoints</span>
        <button onclick="loadEndpoints()">Refresh</button>
      </div>
      <div id="endpoints-list" style="padding:10px"></div>
    </div>

    <!-- DOM Map -->
    <div class="panel hidden" id="panel-dommap">
      <div class="toolbar">
        <span style="font-size:11px;color:#555">All tags / classes / IDs on page</span>
        <button onclick="loadDomMap()">Refresh</button>
      </div>
      <div id="dommap-content" style="padding:10px"></div>
    </div>

    <!-- Find -->
    <div class="panel hidden" id="panel-find">
      <div class="toolbar">
        <input id="selector-input" placeholder="CSS selector: div.price, h1, a[href], #main" />
        <button onclick="runFind()">Find</button>
      </div>
      <div id="find-results" style="padding:10px"></div>
    </div>

    <!-- Navigate -->
    <div class="panel hidden" id="panel-nav">
      <div class="toolbar">
        <input id="nav-input" placeholder="https://..." />
        <button onclick="doNav()">Navigate + Track</button>
      </div>
      <div style="padding:12px">
        <div class="section-title">Active Tab Commands</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:8px">
          <button class="btn" onclick="sendCmd('track')">Track Tab</button>
          <button class="btn" onclick="sendCmd('cookies')">Dump Cookies</button>
          <button class="btn" onclick="sendCmd('storage')">Dump Storage</button>
          <button class="btn" onclick="sendCmd('html')">Get HTML</button>
          <button class="btn" onclick="sendCmd('screenshot')">Screenshot</button>
        </div>
      </div>
    </div>

  <!-- Queue -->
    <div class="panel hidden" id="panel-queue">
      <div class="toolbar">
        <span style="font-size:11px;color:#555">URL Queue — processes with delays + warmup</span>
        <button onclick="loadQueue()">Refresh</button>
        <button class="btn red" onclick="clearQueue()">Clear</button>
      </div>
      <div style="padding:10px">
        <div class="section-title">Add URLs</div>
        <textarea id="queue-urls" style="width:100%;height:80px;background:#161616;border:1px solid #2a2a2a;color:#e0e0e0;padding:8px;font-family:inherit;font-size:11px;border-radius:3px;resize:vertical;margin:6px 0" placeholder="One URL per line&#10;https://example.com/page1&#10;https://example.com/page2"></textarea>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
          <label style="font-size:11px;color:#888">Delay (sec):</label>
          <input id="queue-delay" type="number" value="6" min="1" max="60" style="width:60px;background:#161616;border:1px solid #2a2a2a;color:#e0e0e0;padding:4px 8px;font-family:inherit;font-size:11px;border-radius:3px">
          <label style="font-size:11px;color:#888">
            <input type="checkbox" id="queue-warmup" checked style="margin-right:4px">Warmup
          </label>
          <button onclick="addToQueue()">Add to Queue</button>
        </div>
        <div class="section-title">Status</div>
        <div id="queue-status" style="font-size:12px;color:#888;padding:8px 0">Loading...</div>
        <div id="queue-items" style="margin-top:8px"></div>
      </div>
    </div>

  </div>
</div>

<script>
let activeDomain = null;
let activeTab    = 'live';

// ── Tab switching ──
function showTab(tab) {
  document.querySelectorAll('[id^="panel-"]').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.remove('hidden');
  document.querySelector(`nav button[onclick="showTab('${tab}')"]`).classList.add('active');
  activeTab = tab;
  if (tab === 'intel')     loadIntel();
  if (tab === 'tokens')    loadTokens();
  if (tab === 'endpoints') loadEndpoints();
  if (tab === 'dommap')    loadDomMap();
  if (tab === 'queue')     loadQueue();
}

// ── Domain sidebar ──
function setDomain(d) {
  activeDomain = d === activeDomain ? null : d;
  document.querySelectorAll('.domain-item').forEach(el => el.classList.remove('active'));
  if (activeDomain) {
    document.querySelector(`[data-domain="${CSS.escape(activeDomain)}"]`)?.classList.add('active');
    document.getElementById('export-domain-btn').style.display = '';
    document.getElementById('intel-export').style.display = '';
  } else {
    document.getElementById('export-domain-btn').style.display = 'none';
    document.getElementById('intel-export').style.display = 'none';
  }
  if (activeTab === 'intel')     loadIntel();
  if (activeTab === 'tokens')    loadTokens();
  if (activeTab === 'endpoints') loadEndpoints();
  if (activeTab === 'dommap')    loadDomMap();
}

async function loadDomains() {
  const domains = await api('/domains');
  const list = document.getElementById('domain-list');
  list.innerHTML = domains.map(d =>
    `<div class="domain-item${d===activeDomain?' active':''}" data-domain="${esc(d)}" onclick="setDomain('${esc(d)}')">
      <div class="domain-dot"></div>${esc(d)}
    </div>`
  ).join('');
}

// ── API ──
async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok && r.headers.get('content-type')?.includes('json')) return r.json();
  if (r.headers.get('content-type')?.includes('json')) return r.json();
  return {};
}
const dqs = (d) => d ? `?domain=${encodeURIComponent(d)}` : '';

// ── Site Intel ──
async function loadIntel() {
  const el = document.getElementById('intel-content');
  if (!activeDomain) {
    el.innerHTML = '<div style="color:#555;padding:20px;text-align:center">Select a domain from the sidebar</div>';
    document.getElementById('intel-label').textContent = 'Select a domain →';
    return;
  }
  document.getElementById('intel-label').textContent = activeDomain;
  el.innerHTML = '<div style="color:#555;padding:10px">Loading...</div>';
  const data = await api('/intel?domain=' + encodeURIComponent(activeDomain));

  let html = `<div class="intel-grid">
    <div class="intel-box"><h3>Bearer Tokens</h3><div class="count-badge">${data.tokens?.length||0}</div></div>
    <div class="intel-box"><h3>Auth Cookies</h3><div class="count-badge">${data.auth?.length||0}</div></div>
    <div class="intel-box"><h3>API Endpoints</h3><div class="count-badge">${data.endpoints?.length||0}</div></div>
    <div class="intel-box"><h3>DOM Map</h3><div class="count-badge" style="color:${data.dommap?'#00ffcc':'#333'}">${data.dommap?'✓':'—'}</div></div>
  </div>`;

  // Tokens
  if (data.tokens?.length) {
    html += '<div class="section-title">Bearer Tokens</div>';
    data.tokens.forEach(t => {
      html += `<div class="token-card">
        <div class="token-meta"><span>${esc(t.url?.slice(0,70)||'')}</span></div>
        <div class="token-value" onclick="copy('Bearer ${esc(t.token)}')">Bearer ${esc(t.token)}<span class="copy-hint">click to copy</span></div>
      </div>`;
    });
  }

  // Auth cookies
  if (data.auth?.length) {
    html += '<div class="section-title">Auth Cookies</div>';
    data.auth.forEach(item => {
      const c = item.cookie; if (!c) return;
      html += `<div class="cookie-card">
        <div class="cookie-name">${esc(c.name)} <span style="color:#444;font-size:9px">${c.httpOnly?'httpOnly ':''} ${c.secure?'secure':''}</span></div>
        <div class="cookie-val" onclick="copy('${esc(c.value||'')}')">${esc(c.value||'')}</div>
      </div>`;
    });
  }

  // Endpoints
  if (data.endpoints?.length) {
    html += '<div class="section-title">API Endpoints</div>';
    data.endpoints.forEach(e => { html += renderReq(e); });
  }

  el.innerHTML = html;
}

// ── Tokens ──
async function loadTokens() {
  const tokens = await api('/tokens' + dqs(activeDomain));
  const auth   = await api('/auth'   + dqs(activeDomain));
  const el     = document.getElementById('tokens-list');
  let html = `<div class="section-title">Bearer Tokens (${tokens.length})</div>`;
  if (!tokens.length) html += '<div style="color:#444;font-size:12px">None found yet.</div>';
  tokens.forEach(t => {
    html += `<div class="token-card">
      <div class="token-meta"><span style="color:#00ff88">${esc(t.domain)}</span><span>${esc(t.url?.slice(0,60)||'')}</span></div>
      <div class="token-value" onclick="copy('Bearer ${esc(t.token)}')">Bearer ${esc(t.token)}<span class="copy-hint">click to copy</span></div>
    </div>`;
  });
  html += '<div class="section-title">Auth Cookies</div>';
  let ccount = 0;
  for (const [domain, items] of Object.entries(auth)) {
    items.forEach(item => {
      const c = item.cookie; if (!c) return; ccount++;
      html += `<div class="cookie-card">
        <div class="token-meta"><span style="color:#00ff88">${esc(domain)}</span><span>${esc(c.name)}</span></div>
        <div class="cookie-val" onclick="copy('${esc(c.value||'')}')">${esc(c.value||'')}</div>
      </div>`;
    });
  }
  if (!ccount) html += '<div style="color:#444;font-size:12px">None found yet.</div>';
  el.innerHTML = html;
}

// ── Endpoints ──
async function loadEndpoints() {
  const data = await api('/endpoints' + dqs(activeDomain));
  const el   = document.getElementById('endpoints-list');
  let html   = '';
  for (const [domain, endpoints] of Object.entries(data)) {
    html += `<div class="section-title">${esc(domain)} (${endpoints.length})</div>`;
    endpoints.forEach(e => { html += renderReq(e); });
  }
  el.innerHTML = html || '<div style="color:#444;padding:20px">No API endpoints yet. Navigate to a site and track it.</div>';
}

// ── DOM Map ──
async function loadDomMap() {
  const el = document.getElementById('dommap-content');
  el.innerHTML = '<div style="color:#555;padding:10px">Loading...</div>';
  const data = await api('/dommaps' + dqs(activeDomain));

  // Get latest dommap for domain or all
  let maps = activeDomain ? (data || []) : Object.values(data).flat();
  if (!maps.length) {
    el.innerHTML = '<div style="color:#444;padding:20px">No DOM maps yet.<br><br>Navigate to a site then click <b style="color:#00ff88">Track Tab</b> — the extension auto-maps every page load.</div>';
    return;
  }
  const latest = maps[maps.length - 1];
  const map    = latest.dommap || latest;
  const tags    = map.tags    || [];
  const classes = map.classes || [];
  const ids     = map.ids     || [];

  let html = `<div style="font-size:11px;color:#555;margin-bottom:10px">
    ${esc(map.url||'')} — ${tags.length} tags · ${classes.length} classes · ${ids.length} IDs
    <button class="btn" style="margin-left:10px;font-size:10px" onclick="document.getElementById('selector-input').value='';showTab('find')">→ Use in Find</button>
  </div>`;

  html += '<div class="section-title">Tags</div><div class="dom-section">';
  tags.forEach(t => {
    html += `<span class="dom-tag" onclick="useSel('${esc(t.tag)}')" title="${t.count} occurrences">${esc(t.tag)} <span style="opacity:.5">${t.count}</span></span>`;
  });
  html += '</div>';

  html += '<div class="section-title">Classes</div><div class="dom-section">';
  classes.slice(0, 200).forEach(c => {
    html += `<span class="dom-class" onclick="useSel('.${esc(c.name)}')" title="${c.count} occurrences">.${esc(c.name)} <span style="opacity:.5">${c.count}</span></span>`;
  });
  if (classes.length > 200) html += `<span style="color:#555;font-size:11px"> +${classes.length-200} more</span>`;
  html += '</div>';

  html += '<div class="section-title">IDs</div><div class="dom-section">';
  ids.forEach(i => {
    html += `<span class="dom-id" onclick="useSel('#${esc(i)}')">#${esc(i)}</span>`;
  });
  html += '</div>';

  el.innerHTML = html;
}

function useSel(selector) {
  document.getElementById('selector-input').value = selector;
  showTab('find');
  runFind();
}

// ── Find (Rust) ──
async function runFind() {
  const selector = document.getElementById('selector-input').value.trim();
  if (!selector) return;
  const el = document.getElementById('find-results');
  el.innerHTML = '<div style="color:#555;padding:10px">Searching...</div>';
  const data = await api('/find?selector=' + encodeURIComponent(selector) + dqs(activeDomain));
  if (data.error) { el.innerHTML = `<div style="color:#f44;padding:10px">${esc(data.error)}</div>`; return; }
  let html = `<div class="section-title">Results for: <span style="color:#00ff88">${esc(selector)}</span></div>`;
  let total = 0;
  (data.results || []).forEach(r => {
    if (r.error) { html += `<div style="color:#f44;font-size:11px;margin-bottom:4px">${esc(r.file)}: ${esc(r.error)}</div>`; return; }
    (r.matches || []).forEach(m => {
      total++;
      const attrs = (m.attrs||[]).map(([k,v]) => `<span style="color:#888">${esc(k)}</span>=<span style="color:#aaa">"${esc(v)}"</span>`).join(' ');
      html += `<div class="card">
        <div class="card-header" onclick="this.nextElementSibling.classList.toggle('open')">
          <span style="color:#00ffcc;font-size:11px">&lt;${esc(m.tag||'')}&gt;</span>
          <span class="card-url">${esc((m.text||'').slice(0,100))}</span>
        </div>
        <div class="card-body">
          <div style="margin-bottom:5px;font-size:10px;color:#555">Attributes: ${attrs||'none'}</div>
          <pre>${esc(m.html?.slice(0,500)||'')}</pre>
        </div>
      </div>`;
    });
  });
  if (!total) html += '<div style="color:#444;padding:10px">No matches found.</div>';
  else html = `<div style="font-size:11px;color:#555;margin-bottom:8px">${total} match${total!==1?'es':''}</div>` + html;
  el.innerHTML = html;
}

// ── Navigate ──
async function doNav() {
  const url = document.getElementById('nav-input').value.trim();
  if (!url) return;
  await api('/navigate', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url})});
  document.getElementById('nav-input').value = '';
}
async function sendCmd(cmd) {
  await api('/cmd', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({command:cmd})});
}

// ── Export ──
function exportData(domain) {
  const url = domain ? `/export?domain=${encodeURIComponent(domain)}` : '/export';
  const a = document.createElement('a');
  a.href = url; a.download = (domain||'all_data') + '.zip';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ── Live feed ──
function startLiveFeed() {
  const el  = document.getElementById('live-feed');
  const src = new EventSource('/live');
  src.onmessage = (e) => {
    const item   = JSON.parse(e.data);
    const type   = item.type || 'unknown';
    const url    = item.url || item.cookie?.name || '';
    const domain = item.domain || '';
    const row    = document.createElement('div');
    row.className = 'live-row';
    row.innerHTML = `
      <span class="ltype t-${type}">${type}</span>
      <span class="live-domain">${esc(domain)}</span>
      <span class="live-url">${esc(url)}</span>
      <span class="live-time">${new Date(item.timestamp||Date.now()).toLocaleTimeString()}</span>`;
    el.insertBefore(row, el.firstChild);
    if (el.children.length > 300) el.lastChild.remove();
    // Refresh domain list periodically
    if (type === 'dommap' || type === 'debugger_status') loadDomains();
  };
  src.onerror = () => {
    document.getElementById('status').textContent = 'reconnecting...';
    document.getElementById('conn-badge').textContent = 'OFFLINE';
    document.getElementById('conn-badge').classList.remove('green');
  };
  src.onopen = () => {
    document.getElementById('status').textContent = 'connected';
    document.getElementById('conn-badge').textContent = 'LIVE';
    document.getElementById('conn-badge').classList.add('green');
  };
}
function clearLive() { document.getElementById('live-feed').innerHTML = ''; }

// ── Request card renderer ──
function renderReq(r) {
  const m = r.method || 'GET';
  const flags = (r.flags||[]).map(f => {
    const cls = ['BEARER_TOKEN','API','AUTH_FLOW','CF_CLEARANCE','POST_DATA'].includes(f) ? f : 'flag-other';
    return `<span class="flag ${cls}">${esc(f)}</span>`;
  }).join('');
  const hdrs = JSON.stringify(r.headers||r.reqHeaders||{}, null, 2);
  const post = r.postData||r.reqPostData ? JSON.stringify(r.postData||r.reqPostData) : '';
  return `<div class="card">
    <div class="card-header" onclick="this.nextElementSibling.classList.toggle('open')">
      <span class="method ${m}">${m}</span>
      <span class="card-url">${esc(r.url||'')}</span>
      <div class="flags">${flags}</div>
    </div>
    <div class="card-body">
      <pre>${esc(hdrs)}</pre>
      ${post ? `<div style="color:#555;font-size:10px;margin-top:6px">Post Data:</div><pre>${esc(post)}</pre>` : ''}
    </div>
  </div>`;
}

// ── Helpers ──
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function copy(t) { navigator.clipboard.writeText(t).catch(()=>{}); }

// ── Queue ──
async function addToQueue() {
  const raw    = document.getElementById('queue-urls').value.trim();
  const delay  = parseInt(document.getElementById('queue-delay').value) || 6;
  const warmup = document.getElementById('queue-warmup').checked;
  if (!raw) return;
  const urls = raw.split('\n').map(u => u.trim()).filter(Boolean);
  const res  = await api('/queue/add', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ urls, delay, warmup })
  });
  document.getElementById('queue-urls').value = '';
  loadQueue();
}

async function loadQueue() {
  const data = await api('/queue');
  const status = document.getElementById('queue-status');
  const items  = document.getElementById('queue-items');
  status.innerHTML = `<span style="color:${data.running?'#00ff88':'#888'}">${data.running?'● Running':'○ Idle'}</span>  ${data.pending} URL${data.pending!==1?'s':''} pending`;
  if (data.items?.length) {
    items.innerHTML = data.items.map((item,i) =>
      `<div style="font-size:11px;padding:4px 8px;border-bottom:1px solid #1a1a1a;color:#aaa">
        <span style="color:#555">${i+1}.</span> ${esc(item.url)}
        <span style="color:#444;font-size:10px;margin-left:8px">${item.delay}s delay${item.warmup?' +warmup':''}</span>
      </div>`
    ).join('');
  } else {
    items.innerHTML = '<div style="color:#444;font-size:12px;padding:4px 0">Queue empty</div>';
  }
}

async function clearQueue() {
  await api('/queue/clear', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'});
  loadQueue();
}

// ── Init ──
loadDomains();
setInterval(loadDomains, 8000);
startLiveFeed();
</script>
</body>
</html>"""

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("[API] Loading existing data...")
    load_existing()
    threading.Thread(target=watch_files, daemon=True).start()
    print("[API] File watcher started")
    server = ThreadedHTTPServer(("0.0.0.0", API_PORT), ScraperAPI)
    print(f"[API] Dashboard → http://localhost:{API_PORT}")
    print(f"[API] Endpoints: /tokens /auth /endpoints /intel /dommaps /find /export /live")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[API] Stopped")