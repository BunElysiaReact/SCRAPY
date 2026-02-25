// SCRAPPER by BertUI - Firefox Background Script
// Captures: cookies, request headers, response headers, localStorage via content script

const API_BASE = 'http://localhost:8080';
const NATIVE_HOST = 'com.scraper.core';
let nativePort = null;
let capturedData = {
  cookies: [],
  requests: [],
  responses: [],
  tokens: []
};

// ─── Native Messaging ──────────────────────────────────────────────────────
function connectNative() {
  try {
    nativePort = browser.runtime.connectNative(NATIVE_HOST);
    nativePort.onMessage.addListener((msg) => {
      console.log('[SCRAPPER] Native host:', msg);
    });
    nativePort.onDisconnect.addListener(() => {
      console.warn('[SCRAPPER] Native host disconnected, retrying in 3s...');
      nativePort = null;
      setTimeout(connectNative, 3000);
    });
  } catch (e) {
    console.warn('[SCRAPPER] Native host not available:', e.message);
  }
}

function sendToNative(data) {
  if (nativePort) {
    try { nativePort.postMessage(data); } catch (e) {}
  }
  // Also push to API directly
  sendToAPI(data);
}

async function sendToAPI(data) {
  try {
    await fetch(`${API_BASE}/api/v1/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (e) {
    // API not running yet - buffer locally
    capturedData[data.type]?.push(data);
  }
}

// ─── Cookie Capture ────────────────────────────────────────────────────────
function captureAllCookies() {
  browser.cookies.getAll({}).then(cookies => {
    const payload = {
      type: 'cookies',
      source: 'firefox_bulk',
      timestamp: Date.now(),
      cookies: cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
        expirationDate: c.expirationDate,
        session: c.session
      }))
    };
    sendToNative(payload);
  });
}

// Watch for cookie changes
browser.cookies.onChanged.addListener(({ removed, cookie, cause }) => {
  sendToNative({
    type: 'cookie_change',
    source: 'firefox_event',
    timestamp: Date.now(),
    removed,
    cause,
    cookie: {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite
    }
  });
});

// ─── Network Request Capture ───────────────────────────────────────────────
const requestMap = new Map();

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const { requestId, url, method, requestHeaders, tabId, timeStamp } = details;
    
    // Extract auth tokens from headers
    const tokens = [];
    const headerMap = {};
    
    for (const h of (requestHeaders || [])) {
      headerMap[h.name.toLowerCase()] = h.value;
      const lower = h.name.toLowerCase();
      if (lower === 'authorization' || lower === 'x-auth-token' || lower === 'cookie') {
        tokens.push({ header: h.name, value: h.value });
      }
    }

    requestMap.set(requestId, {
      url, method, headers: headerMap,
      tabId, timestamp: timeStamp, tokens
    });

    if (tokens.length > 0) {
      sendToNative({
        type: 'tokens',
        source: 'firefox_request_headers',
        timestamp: timeStamp,
        url,
        tokens
      });
    }

    sendToNative({
      type: 'request',
      source: 'firefox_webrequest',
      timestamp: timeStamp,
      requestId, url, method,
      headers: headerMap,
      tabId
    });
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders']
);

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    const { requestId, url, statusCode, responseHeaders, timeStamp } = details;
    const headerMap = {};
    
    for (const h of (responseHeaders || [])) {
      headerMap[h.name.toLowerCase()] = h.value;
    }

    const req = requestMap.get(requestId);
    
    sendToNative({
      type: 'response',
      source: 'firefox_webrequest',
      timestamp: timeStamp,
      requestId, url, statusCode,
      responseHeaders: headerMap,
      requestInfo: req || null
    });

    requestMap.delete(requestId);
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// ─── Message Handler (from content scripts & popup) ───────────────────────
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'localStorage_dump') {
    sendToNative({
      type: 'localStorage',
      source: 'firefox_content_script',
      timestamp: Date.now(),
      url: sender.url || msg.url,
      data: msg.data
    });
    sendResponse({ ok: true });
  }

  if (msg.type === 'fingerprint') {
    sendToNative({
      type: 'fingerprint',
      source: 'firefox_content_script',
      timestamp: Date.now(),
      url: sender.url || msg.url,
      data: msg.data
    });
    sendResponse({ ok: true });
  }

  if (msg.type === 'get_cookies') {
    browser.cookies.getAll({ url: msg.url }).then(cookies => {
      sendResponse({ cookies });
    });
    return true; // async
  }

  if (msg.type === 'dump_all') {
    captureAllCookies();
    // Ask all tabs for localStorage
    browser.tabs.query({}).then(tabs => {
      for (const tab of tabs) {
        browser.tabs.sendMessage(tab.id, { type: 'request_localStorage' }).catch(() => {});
      }
    });
    sendResponse({ ok: true, buffered: capturedData });
  }

  if (msg.type === 'get_status') {
    sendResponse({
      nativeConnected: nativePort !== null,
      buffered: {
        cookies: capturedData.cookies.length,
        requests: capturedData.requests.length,
        responses: capturedData.responses.length,
        tokens: capturedData.tokens.length
      }
    });
  }
});

// ─── Tab Events ───────────────────────────────────────────────────────────
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('about:')) {
    // Ask content script for localStorage after page load
    setTimeout(() => {
      browser.tabs.sendMessage(tabId, { type: 'request_localStorage' }).catch(() => {});
    }, 1000);
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────
connectNative();
captureAllCookies();

// Periodic cookie sync
setInterval(captureAllCookies, 30000);

console.log('[SCRAPPER] Firefox extension started');