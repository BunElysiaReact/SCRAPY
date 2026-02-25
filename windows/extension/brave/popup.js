// popup.js — Scrapy extension popup
// Talks to background.js via chrome.runtime.sendMessage

const TYPE_META = {
  request:         { icon: "→", label: "REQ",    color: "#00ff88" },
  response:        { icon: "←", label: "RES",    color: "#29d4f5" },
  response_body:   { icon: "⬡", label: "BODY",   color: "#448aff" },
  auth_cookie:     { icon: "⚿", label: "AUTH",   color: "#ffe066" },
  cookies:         { icon: "◈", label: "COOKIE", color: "#ff9500" },
  cookies_changed: { icon: "◌", label: "CK△",    color: "#333355" },
  websocket:       { icon: "⟳", label: "WS",     color: "#b388ff" },
  dommap:          { icon: "⊞", label: "DOM",    color: "#00e5ff" },
  html:            { icon: "⌨", label: "HTML",   color: "#00e676" },
  screenshot:      { icon: "⬜", label: "SHOT",   color: "#ff6090" },
  storage:         { icon: "⊟", label: "STORE",  color: "#ffa040" },
  debugger_status: { icon: "◉", label: "DBG",    color: "#9c60ff" },
};

let currentTabId   = null;
let currentTabUrl  = "";
let isTracking     = false;
let pollInterval   = null;
let lastEventCount = 0;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  currentTabId  = tab.id;
  currentTabUrl = tab.url || "";

  // Show URL
  const urlEl = document.getElementById("tabUrl");
  const domain = getDomain(currentTabUrl);
  urlEl.textContent = domain || currentTabUrl.slice(0, 50);
  document.getElementById("footerDomain").textContent = domain;

  // Check native connection + tracking state
  await refreshState();

  // Poll for live updates every 800ms while popup is open
  pollInterval = setInterval(refreshState, 800);
});

window.addEventListener("unload", () => {
  if (pollInterval) clearInterval(pollInterval);
});

// ── Get state from background.js ──────────────────────────────────────────────
async function refreshState() {
  try {
    const resp = await chrome.runtime.sendMessage({
      command: "popup_get_state",
      tabId: currentTabId
    });

    if (!resp) return;

    // Connection status
    const connDot = document.getElementById("connDot");
    const noConn  = document.getElementById("noConn");
    if (resp.nativeConnected) {
      connDot.className = "conn-dot live";
      noConn.style.display = "none";
    } else {
      connDot.className = "conn-dot dead";
      noConn.style.display = "block";
    }

    // Tracking state
    isTracking = resp.isTracking;
    updateTrackBtn();

    // Stats — animate number bumps when they change
    setStatNum("statReqs",    resp.stats.requests,  lastEventCount !== resp.totalEvents);
    setStatNum("statTokens",  resp.stats.tokens,    false);
    setStatNum("statCookies", resp.stats.authCookies, false);
    setStatNum("statWS",      resp.stats.websockets, false);
    lastEventCount = resp.totalEvents;

    // Live feed
    if (resp.events && resp.events.length > 0) {
      renderFeed(resp.events);
    }

  } catch (e) {
    // background not ready yet
  }
}

function setStatNum(id, val, bump) {
  const el = document.getElementById(id);
  const current = parseInt(el.textContent) || 0;
  if (val !== current) {
    el.textContent = val;
    if (bump || val > current) {
      el.classList.remove("bump");
      void el.offsetWidth; // reflow
      el.classList.add("bump");
      setTimeout(() => el.classList.remove("bump"), 300);
    }
  }
}

// ── Track toggle ──────────────────────────────────────────────────────────────
function updateTrackBtn() {
  const btn   = document.getElementById("trackBtn");
  const label = document.getElementById("trackLabel");

  if (isTracking) {
    btn.className   = "track-btn on";
    label.textContent = "Stop Tracking";
  } else {
    btn.className   = "track-btn off";
    label.textContent = "Track This Tab";
  }
}

async function toggleTrack() {
  if (!currentTabId) return;

  const command = isTracking ? "popup_untrack" : "popup_track";
  const resp = await chrome.runtime.sendMessage({
    command,
    tabId: currentTabId
  });

  if (resp?.success) {
    isTracking = !isTracking;
    updateTrackBtn();
    toast(isTracking ? "✓ Tracking started" : "○ Tracking stopped", "ok");
  } else {
    toast("⚠ Native host not connected", "err");
  }
}

// ── Quick actions ─────────────────────────────────────────────────────────────
async function doAction(action) {
  const btn = document.getElementById("btn-" + action);
  const origText = btn.innerHTML;

  btn.classList.add("loading");

  const commandMap = {
    dom:        "dommap",
    screenshot: "screenshot",
    html:       "get_html",
    cookies:    "get_cookies",
    storage:    "get_storage",
  };

  const resp = await chrome.runtime.sendMessage({
    command: "popup_action",
    action: commandMap[action] || action,
    tabId: currentTabId
  });

  btn.classList.remove("loading");

  if (resp?.success) {
    btn.classList.add("success");
    toast(`✓ ${action} captured`, "ok");
    setTimeout(() => btn.classList.remove("success"), 1500);
  } else {
    toast(`⚠ ${action} failed — is tracking active?`, "err");
  }
}

function openDashboard() {
  chrome.tabs.create({ url: "http://localhost:3000" });
}

async function clearTabData() {
  await chrome.runtime.sendMessage({
    command: "popup_clear_tab",
    tabId: currentTabId
  });
  // Reset stat display
  ["statReqs","statTokens","statCookies","statWS"].forEach(id => {
    document.getElementById(id).textContent = "0";
  });
  document.getElementById("feedList").innerHTML = "";
  document.getElementById("feedCount").textContent = "0 events";
  toast("Tab data cleared", "ok");
}

// ── Feed renderer ─────────────────────────────────────────────────────────────
function renderFeed(events) {
  const list = document.getElementById("feedList");
  const count = document.getElementById("feedCount");

  count.textContent = events.length + " events";

  // Only re-render if top item changed (avoid flicker)
  const firstKey = list.querySelector(".feed-row")?.dataset?.key;
  const newKey   = events[0]?.timestamp + events[0]?.type;
  if (firstKey === newKey) return;

  list.innerHTML = events.slice(0, 30).map(ev => {
    const meta    = TYPE_META[ev.type] || { icon: "·", label: ev.type?.slice(0,5) || "?", color: "#555" };
    const url     = ev.url || ev.domain || "";
    const timeStr = new Date(ev.timestamp || Date.now()).toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
    return `
      <div class="feed-row" data-key="${escHtml(String(ev.timestamp) + ev.type)}">
        <span class="feed-type" style="color:${meta.color};border:1px solid ${meta.color}33;background:${meta.color}0f">
          ${escHtml(meta.label)}
        </span>
        <span class="feed-url">${escHtml(url.replace(/https?:\/\/[^/]+/, "").slice(0, 60) || url.slice(0,60))}</span>
        <span class="feed-time">${timeStr}</span>
      </div>`;
  }).join("");
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

function escHtml(s) {
  return String(s || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

let toastTimer = null;
function toast(msg, type = "ok") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.style.display = "block";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = "none"; }, 2500);
}