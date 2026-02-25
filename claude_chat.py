#!/usr/bin/env python3
"""
Claude.ai Chat - WORKING VERSION
Uses simple payload and correct SSE parsing
"""
import json, sys
from curl_cffi import requests

API = "http://localhost:8080"

def get_session():
    """Get session with cookies and device info from captured data"""
    cookies = requests.get(f"{API}/api/v1/session/cookies?domain=claude.ai").json()
    fp = requests.get(f"{API}/api/v1/fingerprint?domain=claude.ai").json()
    recent = requests.get(f"{API}/api/v1/requests/recent?limit=50&domain=claude.ai").json()
    
    device_id = None
    for r in reversed(recent):
        for k, v in r.get("headers", {}).items():
            if k.lower() == "anthropic-device-id":
                device_id = v
                break
        if device_id:
            break

    session = requests.Session(impersonate="chrome120")
    
    for c in cookies:
        domain = c.get("domain", "claude.ai").lstrip(".")
        session.cookies.set(c["name"], c["value"], domain=domain, path=c.get("path", "/"))

    session.headers.update({
        "User-Agent": fp.get("userAgent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"),
        "accept": "text/event-stream",
        "content-type": "application/json",
        "anthropic-client-platform": "web_claude_ai",
        "anthropic-device-id": device_id,
        "Origin": "https://claude.ai",
        "Referer": "https://claude.ai/",
    })

    print(f"[*] Device ID: {device_id}")
    print(f"[*] Cookies: {len(cookies)}")
    return session

def get_org_and_conv(session):
    """Get organization ID and existing conversation"""
    org_r = session.get("https://claude.ai/api/organizations")
    org_r.raise_for_status()
    org_id = org_r.json()[0]["uuid"]
    
    conv_r = session.get(f"https://claude.ai/api/organizations/{org_id}/chat_conversations?limit=1")
    conv_r.raise_for_status()
    convs = conv_r.json()
    
    if convs:
        conv_id = convs[0]["uuid"]
        return org_id, conv_id
    
    return org_id, None

def send_message(session, org_id, conv_id, message):
    """Send message using the SIMPLE payload that works"""
    url = f"https://claude.ai/api/organizations/{org_id}/chat_conversations/{conv_id}/completion"
    
    # SIMPLE payload - this actually works!
    payload = {
        "prompt": message,
        "parent_message_uuid": "00000000-0000-4000-8000-000000000000",
        "timezone": "Africa/Nairobi",
        "model": "claude-sonnet-4-6",
        "tools": []
    }
    
    r = session.post(url, json=payload, stream=True)
    
    if r.status_code != 200:
        print(f"[!] Error {r.status_code}: {r.text[:500]}")
        return None
    
    # Parse SSE stream - format is:
    # event: completion
    # data: {"type":"completion","completion":"...text..."}
    
    full_text = ""
    buffer = ""
    
    for line in r.iter_lines():
        if not line:
            continue
            
        line = line.decode("utf-8") if isinstance(line, bytes) else line
        
        if line.startswith("data:"):
            try:
                data = json.loads(line[5:].strip())
                
                # Check for completion type
                if data.get("type") == "completion":
                    text = data.get("completion", "")
                    if text:
                        print(text, end="", flush=True)
                        full_text += text
                    
                    # Check if done
                    if data.get("stop_reason") == "stop_sequence":
                        break
                        
                # Also handle the other format just in case
                elif data.get("type") == "content_block_delta":
                    text = data.get("delta", {}).get("text", "")
                    if text:
                        print(text, end="", flush=True)
                        full_text += text
                        
            except json.JSONDecodeError:
                pass
    
    print()
    return full_text

if __name__ == "__main__":
    message = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "Hello! What is 2+2?"
    
    session = get_session()
    
    print("\n[*] Getting org and conversation...")
    org_id, conv_id = get_org_and_conv(session)
    print(f"[*] Org: {org_id}")
    print(f"[*] Conv: {conv_id}")
    
    if not conv_id:
        print("[!] No conversation found!")
        sys.exit(1)
    
    session.headers["Referer"] = f"https://claude.ai/chat/{conv_id}"
    
    print(f"\n[Claude]: ", end="", flush=True)
    response = send_message(session, org_id, conv_id, message)
