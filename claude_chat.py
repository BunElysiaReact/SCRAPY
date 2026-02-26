#!/usr/bin/env python3
"""
Claude.ai Chat via SCRAPPER
────────────────────────────────────────────────────────
REQUIREMENTS:
  1. SCRAPPER installed and running — https://scrapper-docs.pages.dev/
  2. Open claude.ai in your browser, log in, click around for ~30 seconds
  3. Come back and run this script

INSTALL DEPS:
  pip install curl_cffi

USAGE:
  python3 claude_chat.py "your message here"
  python3 claude_chat.py                      ← defaults to a test message

SCRAPPER repo : https://github.com/BunElysiaReact/SCRAPY
Script repo   : https://github.com/BunElysiaReact/SCRAPPER/blob/main/claude_chat.py
────────────────────────────────────────────────────────
"""

import json
import sys
import time
from curl_cffi import requests

# ── Config ────────────────────────────────────────────────────────────────────
SCRAPPER_API = "http://localhost:8080"
TARGET_DOMAIN = "claude.ai"
DEFAULT_MESSAGE = "Hello! What is 2+2?"
DEFAULT_MODEL = "claude-sonnet-4-5"  # change if you have a different plan


# ── Helpers ───────────────────────────────────────────────────────────────────
def scrapper_get(path):
    """Fetch from local SCRAPPER API with a helpful error if it's not running."""
    try:
        r = requests.get(f"{SCRAPPER_API}{path}", timeout=5)
        r.raise_for_status()
        return r.json()
    except Exception:
        print("\n[!] Could not reach SCRAPPER at http://localhost:8080")
        print("    Make sure it's running:  scrapper-start")
        print("    Docs: https://scrapper-docs.pages.dev/\n")
        sys.exit(1)


def get_timezone():
    """Return the system's IANA timezone string."""
    try:
        import zoneinfo
        import datetime
        return str(datetime.datetime.now().astimezone().tzinfo)
    except Exception:
        return "UTC"


# ── Session builder ───────────────────────────────────────────────────────────
def build_session():
    """Pull cookies, fingerprint, and device ID from SCRAPPER and build a curl_cffi session."""
    print("[*] Fetching session from SCRAPPER...")

    cookies = scrapper_get(f"/api/v1/session/cookies?domain={TARGET_DOMAIN}")
    fp      = scrapper_get(f"/api/v1/fingerprint?domain={TARGET_DOMAIN}")
    recent  = scrapper_get(f"/api/v1/requests/recent?limit=100&domain={TARGET_DOMAIN}")

    if not cookies:
        print(f"\n[!] No cookies found for {TARGET_DOMAIN}.")
        print(f"    Open {TARGET_DOMAIN} in your browser, log in, click around, then retry.\n")
        sys.exit(1)

    # Hunt for anthropic-device-id in recent captured requests
    device_id = None
    for req in reversed(recent):
        for key, val in req.get("headers", {}).items():
            if key.lower() == "anthropic-device-id":
                device_id = val
                break
        if device_id:
            break

    if not device_id:
        print("\n[!] Could not find anthropic-device-id in captured requests.")
        print(f"    Browse claude.ai for a bit longer, then retry.\n")
        sys.exit(1)

    user_agent = fp.get(
        "userAgent",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    session = requests.Session(impersonate="chrome120")

    for c in cookies:
        domain = c.get("domain", TARGET_DOMAIN).lstrip(".")
        session.cookies.set(
            c["name"], c["value"],
            domain=domain,
            path=c.get("path", "/")
        )

    session.headers.update({
        "User-Agent":                 user_agent,
        "accept":                     "text/event-stream",
        "content-type":               "application/json",
        "anthropic-client-platform":  "web_claude_ai",
        "anthropic-device-id":        device_id,
        "Origin":                     f"https://{TARGET_DOMAIN}",
        "Referer":                    f"https://{TARGET_DOMAIN}/",
    })

    print(f"[*] Device ID : {device_id}")
    print(f"[*] Cookies   : {len(cookies)}")
    print(f"[*] User-Agent: {user_agent[:60]}...")
    return session


# ── Claude.ai API helpers ─────────────────────────────────────────────────────
def get_org_id(session):
    r = session.get("https://claude.ai/api/organizations")
    r.raise_for_status()
    orgs = r.json()
    if not orgs:
        print("\n[!] No organizations found. Are you logged in to claude.ai?\n")
        sys.exit(1)
    return orgs[0]["uuid"]


def get_conversation(session, org_id):
    r = session.get(
        f"https://claude.ai/api/organizations/{org_id}/chat_conversations?limit=1"
    )
    r.raise_for_status()
    convs = r.json()
    if not convs:
        print("\n[!] No conversations found.")
        print("    Open claude.ai, start a conversation, then retry.\n")
        sys.exit(1)
    return convs[0]["uuid"]


def send_message(session, org_id, conv_id, message, model, timezone):
    url = (
        f"https://claude.ai/api/organizations/{org_id}"
        f"/chat_conversations/{conv_id}/completion"
    )
    payload = {
        "prompt":               message,
        "parent_message_uuid":  "00000000-0000-4000-8000-000000000000",
        "timezone":             timezone,
        "model":                model,
        "tools":                [],
    }

    r = session.post(url, json=payload, stream=True)

    if r.status_code == 403:
        print("\n[!] 403 Forbidden — your session may have expired.")
        print(f"    Browse {TARGET_DOMAIN} again and retry.\n")
        return
    if r.status_code == 401:
        print("\n[!] 401 Unauthorized — not logged in or session invalid.\n")
        return
    if r.status_code != 200:
        print(f"\n[!] Unexpected {r.status_code}: {r.text[:300]}\n")
        return

    for line in r.iter_lines():
        if not line:
            continue

        line = line.decode("utf-8") if isinstance(line, bytes) else line

        if not line.startswith("data:"):
            continue

        try:
            data = json.loads(line[5:].strip())
        except json.JSONDecodeError:
            continue

        # Standard SSE completion format
        if data.get("type") == "completion":
            print(data.get("completion", ""), end="", flush=True)
            if data.get("stop_reason") == "stop_sequence":
                break

        # Content block delta format (fallback)
        elif data.get("type") == "content_block_delta":
            print(data.get("delta", {}).get("text", ""), end="", flush=True)

    print()


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    message  = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else DEFAULT_MESSAGE
    timezone = get_timezone()

    print("\n" + "─" * 50)
    print("  Claude.ai via SCRAPPER")
    print("─" * 50)

    session = build_session()

    print("\n[*] Fetching org and conversation...")
    org_id  = get_org_id(session)
    conv_id = get_conversation(session, org_id)
    print(f"[*] Org  : {org_id}")
    print(f"[*] Conv : {conv_id}")
    print(f"[*] TZ   : {timezone}")
    print(f"[*] Model: {DEFAULT_MODEL}")

    session.headers["Referer"] = f"https://{TARGET_DOMAIN}/chat/{conv_id}"

    print(f"\n[You]    : {message}")
    print(f"[Claude] : ", end="", flush=True)

    send_message(session, org_id, conv_id, message, DEFAULT_MODEL, timezone)

    print("\n" + "─" * 50 + "\n")