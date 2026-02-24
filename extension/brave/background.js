// background.js - SESSION ISOLATED SCRAPER v3.1 (with popup support + DOM mapping)
const BROWSER = 'brave';
let nativePort = null;
let reconnectAttempts = 0;
let keepAliveInterval = null;

const debuggedTabs    = new Set();
const pendingRequests = new Map();
const siteContexts    = new Map();
const tabContexts     = new Map();

// ── Per-tab stats (for popup) ─────────────────────────────────────────────────
// tabStats[tabId] = { requests, tokens, authCookies, websockets, events[] }
const tabStats = new Map();

function getTabStats(tabId) {
  if (!tabStats.has(tabId)) {
    tabStats.set(tabId, {
      requests: 0, tokens: 0, authCookies: 0, websockets: 0,
      events: []   // last 100 events for live feed
    });
  }
  return tabStats.get(tabId);
}

function recordTabEvent(tabId, event) {
  if (!tabId) return;
  const s = getTabStats(tabId);
  if (event.type === "request")    s.requests++;
  if (event.type === "auth_cookie") s.authCookies++;
  if (event.type === "websocket")  s.websockets++;
  if (event.type === "response_body") {
    // count bearer tokens in body headers
    const auth = event.reqHeaders?.authorization || event.reqHeaders?.Authorization || "";
    if (auth.toLowerCase().startsWith("bearer ")) s.tokens++;
  }
  // prepend to events feed, keep last 100
  s.events.unshift({ ...event, _tabId: tabId });
  if (s.events.length > 100) s.events.length = 100;
}

// ── Resolve active tabId from a CDP source ────────────────────────────────────
function resolveTabId(source) {
  return source?.tabId ?? null;
}

console.log('🦁 Scraper Starting...');

function send(obj) {
  if (nativePort) {
    try { nativePort.postMessage(obj); }
    catch(e) { console.error('send failed', e); }
  }
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return 'unknown'; }
}

// ── DOM Map ───────────────────────────────────────────────────────────────────
function mapDOM(tabId, domain) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const all = document.querySelectorAll('*');
      const tagCount = {}, classCount = {}, ids = [];
      all.forEach(el => {
        const tag = el.tagName.toLowerCase();
        tagCount[tag] = (tagCount[tag] || 0) + 1;
        el.classList.forEach(c => {
          if (c && c.length < 100) classCount[c] = (classCount[c] || 0) + 1;
        });
        if (el.id && el.id.length < 100) ids.push(el.id);
      });
      return {
        url: window.location.href, title: document.title,
        tags:    Object.entries(tagCount).map(([tag,count])=>({tag,count})).sort((a,b)=>b.count-a.count),
        classes: Object.entries(classCount).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count),
        ids: [...new Set(ids)]
      };
    }
  }, (results) => {
    if (chrome.runtime.lastError || !results?.[0]) return;
    const evt = { type: 'dommap', domain, url: results[0].result?.url, dommap: results[0].result, timestamp: Date.now() };
    send(evt);
    recordTabEvent(tabId, evt);
    console.log(`🗺️ DOM mapped for ${domain}`);
  });
}

// ── Session context per domain ────────────────────────────────────────────────
async function getOrCreateContext(domain) {
  if (siteContexts.has(domain)) return siteContexts.get(domain);
  try {
    const ctx = await chrome.contextualIdentities.create({
      name: `scraper:${domain}`, color: 'blue', icon: 'circle'
    });
    siteContexts.set(domain, ctx.cookieStoreId);
    return ctx.cookieStoreId;
  } catch { return null; }
}

// ── Navigate + track ──────────────────────────────────────────────────────────
async function navigateAndTrack(url) {
  const domain = getDomain(url);
  let cookieStoreId;
  try { cookieStoreId = await getOrCreateContext(domain); } catch { cookieStoreId = null; }
  const props = { url, active: true };
  if (cookieStoreId) props.cookieStoreId = cookieStoreId;
  chrome.tabs.create(props, (tab) => {
    tabContexts.set(tab.id, domain);
    const listener = (tabId, info) => {
      if (tabId !== tab.id) return;
      if (info.status === 'loading') {
        chrome.tabs.onUpdated.removeListener(listener);
        attachDebugger(tabId);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    send({ type: 'nav_started', url, domain, tabId: tab.id, timestamp: Date.now() });
  });
}

// ── Debugger ──────────────────────────────────────────────────────────────────
function attachDebugger(tabId) {
  if (debuggedTabs.has(tabId)) return;
  chrome.debugger.attach({ tabId }, '1.3', () => {
    if (chrome.runtime.lastError) {
      console.error('Attach failed:', chrome.runtime.lastError.message); return;
    }
    debuggedTabs.add(tabId);
    const evt = { type: 'debugger_status', status: 'attached', tabId, timestamp: Date.now() };
    send(evt);
    recordTabEvent(tabId, evt);
    chrome.debugger.sendCommand({ tabId }, 'Network.enable', {
      maxTotalBufferSize: 10000000, maxResourceBufferSize: 5000000
    });
    chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', {
      patterns: [{ urlPattern: '*', requestStage: 'Response' }]
    });
  });
}

function detachDebugger(tabId) {
  if (!debuggedTabs.has(tabId)) return;
  chrome.debugger.detach({ tabId }, () => {
    debuggedTabs.delete(tabId);
    tabContexts.delete(tabId);
    pendingRequests.forEach((v, k) => { if (v.tabId === tabId) pendingRequests.delete(k); });
    send({ type: 'debugger_status', status: 'detached', tabId, timestamp: Date.now() });
  });
}

// ── Auto DOM map on page load ─────────────────────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && debuggedTabs.has(tabId)) {
    const domain = tabContexts.get(tabId) || getDomain(tab.url || '');
    setTimeout(() => mapDOM(tabId, domain), 1500);
  }
});

// ── CDP events ────────────────────────────────────────────────────────────────
chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId  = source.tabId;
  const domain = tabContexts.get(tabId) || 'unknown';

  if (method === 'Network.requestWillBeSent') {
    const req = params.request;
    pendingRequests.set(params.requestId, {
      tabId, domain, url: req.url, method: req.method,
      headers: req.headers, postData: req.postData || null
    });
    const flags = isInteresting(req);
    if (flags.length > 0) {
      const evt = {
        type: 'request', domain, url: req.url, method: req.method,
        headers: req.headers, postData: req.postData || null,
        reqType: params.type, flags, requestId: params.requestId,
        timestamp: Date.now()
      };
      send(evt);
      recordTabEvent(tabId, evt);
    }
  }

  else if (method === 'Network.responseReceived') {
    const res     = params.response;
    const pending = pendingRequests.get(params.requestId);
    const flags   = isInteresting({ url: res.url, headers: res.headers, method: pending?.method });
    const isJson  = (res.mimeType || '').includes('json') || (res.headers?.['content-type'] || '').includes('json');
    const isHtml  = (res.mimeType || '').includes('html');

    if (flags.length > 0 || isJson || isHtml) {
      const evt = {
        type: 'response', domain, url: res.url, status: res.status,
        statusText: res.statusText, headers: res.headers,
        mimeType: res.mimeType, requestId: params.requestId,
        reqMethod: pending?.method, reqHeaders: pending?.headers,
        reqPostData: pending?.postData, flags, timestamp: Date.now()
      };
      send(evt);
      recordTabEvent(tabId, evt);
    }
    pendingRequests.delete(params.requestId);
  }

  else if (method === 'Fetch.requestPaused') {
    const req    = params.request;
    const flags  = isInteresting(req);
    const mime   = params.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type')?.value || '';
    const isJson = mime.includes('json') || mime.includes('javascript');
    const isHtml = mime.includes('html');

    if (isJson || isHtml || flags.length > 0) {
      chrome.debugger.sendCommand({ tabId }, 'Fetch.getResponseBody',
        { requestId: params.requestId }, (body) => {
          if (!chrome.runtime.lastError && body?.body) {
            const evt = {
              type: 'response_body', domain, url: req.url,
              method: req.method, status: params.responseStatusCode,
              body: body.body, base64: body.base64Encoded,
              mimeType: mime,
              reqHeaders: req.headers, resHeaders: params.responseHeaders,
              requestId: params.requestId,
              flags, timestamp: Date.now()
            };
            send(evt);
            recordTabEvent(tabId, evt);
          }
          chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest',
            { requestId: params.requestId });
        });
    } else {
      chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest',
        { requestId: params.requestId });
    }
  }

  else if (method === 'Network.webSocketFrameReceived') {
    const evt = { type: 'websocket', direction: 'recv', domain, tabId,
                  payload: params.response.payloadData, timestamp: Date.now() };
    send(evt);
    recordTabEvent(tabId, evt);
  }
  else if (method === 'Network.webSocketFrameSent') {
    const evt = { type: 'websocket', direction: 'sent', domain, tabId,
                  payload: params.response.payloadData, timestamp: Date.now() };
    send(evt);
    recordTabEvent(tabId, evt);
  }
});

// ── isInteresting ─────────────────────────────────────────────────────────────
function isInteresting(req) {
  const flags   = [];
  const url     = (req.url      || '').toLowerCase();
  const headers =  req.headers  || {};
  const post    = (req.postData || '').toLowerCase();

  const authHeaders = ['authorization','x-auth-token','x-access-token','x-api-key',
                       'api-key','token','x-token','x-csrf-token','csrf-token'];
  for (const h of authHeaders) {
    if (headers[h] || headers[h.toLowerCase()]) flags.push('AUTH:' + h);
  }
  const auth = headers['authorization'] || headers['Authorization'] || '';
  if (auth.toLowerCase().startsWith('bearer ')) flags.push('BEARER_TOKEN');
  if (auth.toLowerCase().startsWith('basic '))  flags.push('BASIC_AUTH');

  if (headers['cf-ray'] || headers['CF-Ray'])             flags.push('CLOUDFLARE');
  if (headers['cf-clearance'] || headers['CF-Clearance']) flags.push('CF_CLEARANCE');
  if (url.includes('cloudflare') || url.includes('/cdn-cgi/')) flags.push('CF_URL');
  if (headers['__cf_bm'] || post.includes('__cf_bm'))     flags.push('CF_BOT_MGMT');
  if (url.includes('turnstile') || post.includes('cf-turnstile')) flags.push('CF_TURNSTILE');
  if (url.includes('hcaptcha'))  flags.push('HCAPTCHA');
  if (url.includes('recaptcha')) flags.push('RECAPTCHA');

  if (url.includes('/api/') || url.includes('/graphql') ||
      url.includes('/v1/')  || url.includes('/v2/') || url.includes('/v3/')) flags.push('API');
  if (url.includes('login') || url.includes('signin') || url.includes('oauth') ||
      url.includes('token') || url.includes('auth')   || url.includes('session')) flags.push('AUTH_FLOW');

  if (req.method === 'POST' && req.postData) flags.push('POST_DATA');
  if (headers['cookie'] || headers['Cookie']) flags.push('HAS_COOKIES');
  if (url.startsWith('ws://') || url.startsWith('wss://')) flags.push('WEBSOCKET');

  return flags;
}

// ── Cookie stream ─────────────────────────────────────────────────────────────
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (!nativePort) return;
  const c      = changeInfo.cookie;
  const domain = c.domain.replace(/^\./, '');
  const name   = c.name.toLowerCase();
  const authNames = ['session','auth','token','jwt','csrf','cf_clearance',
                     '__cf_bm','login','sid','user','account','access'];
  if (authNames.some(k => name.includes(k))) {
    const evt = {
      type: 'auth_cookie', domain,
      cookie: { name: c.name, domain: c.domain, value: c.value,
                httpOnly: c.httpOnly, secure: c.secure },
      cause: changeInfo.cause, removed: changeInfo.removed, timestamp: Date.now()
    };
    send(evt);
    // record on whatever tab is active for this domain
    debuggedTabs.forEach(tabId => {
      if (tabContexts.get(tabId) === domain) recordTabEvent(tabId, evt);
    });
  }
  send({
    type: 'cookies_changed', domain,
    cookie: { name: c.name, domain: c.domain, value: c.value },
    cause: changeInfo.cause, removed: changeInfo.removed, timestamp: Date.now()
  });
});

// ── Tab cleanup ───────────────────────────────────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  if (debuggedTabs.has(tabId)) debuggedTabs.delete(tabId);
  tabContexts.delete(tabId);
  pendingRequests.forEach((v, k) => { if (v.tabId === tabId) pendingRequests.delete(k); });
  // Keep tabStats for a bit so popup can still show final counts
  setTimeout(() => tabStats.delete(tabId), 60000);
});

// ── Popup message handlers ────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const { command, tabId, action } = msg;

  if (command === 'popup_get_state') {
    const stats    = getTabStats(tabId);
    const isTracking = debuggedTabs.has(tabId);
    sendResponse({
      nativeConnected: !!nativePort,
      isTracking,
      stats: {
        requests:    stats.requests,
        tokens:      stats.tokens,
        authCookies: stats.authCookies,
        websockets:  stats.websockets,
      },
      totalEvents: stats.events.length,
      events: stats.events.slice(0, 30),
    });
    return true;
  }

  if (command === 'popup_track') {
    if (!nativePort) { sendResponse({ success: false }); return true; }
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) { sendResponse({ success: false }); return; }
      tabContexts.set(tabId, getDomain(tab.url || ''));
      attachDebugger(tabId);
      sendResponse({ success: true });
    });
    return true;
  }

  if (command === 'popup_untrack') {
    detachDebugger(tabId);
    sendResponse({ success: true });
    return true;
  }

  if (command === 'popup_action') {
    if (!nativePort) { sendResponse({ success: false }); return true; }

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) { sendResponse({ success: false }); return; }
      const domain = tabContexts.get(tabId) || getDomain(tab.url || '');

      if (action === 'dommap') {
        mapDOM(tabId, domain);
        sendResponse({ success: true });

      } else if (action === 'screenshot') {
        chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, (dataUrl) => {
          if (chrome.runtime.lastError) { sendResponse({ success: false }); return; }
          const evt = { type: 'screenshot', domain, dataUrl, url: tab.url, timestamp: Date.now() };
          send(evt);
          recordTabEvent(tabId, evt);
          sendResponse({ success: true });
        });

      } else if (action === 'get_html') {
        chrome.scripting.executeScript({
          target: { tabId },
          func: () => ({ html: document.documentElement.outerHTML, title: document.title, url: window.location.href })
        }, (r) => {
          if (chrome.runtime.lastError || !r?.[0]) { sendResponse({ success: false }); return; }
          const evt = { type: 'html', domain, data: r[0].result, timestamp: Date.now() };
          send(evt);
          recordTabEvent(tabId, evt);
          sendResponse({ success: true });
        });

      } else if (action === 'get_cookies') {
        chrome.cookies.getAll({ url: tab.url }, (cookies) => {
          const evt = { type: 'cookies', domain, cookies, url: tab.url, timestamp: Date.now() };
          send(evt);
          recordTabEvent(tabId, evt);
          sendResponse({ success: true });
        });

      } else if (action === 'get_storage') {
        chrome.scripting.executeScript({
          target: { tabId },
          func: () => ({ localStorage: { ...localStorage }, sessionStorage: { ...sessionStorage }, url: window.location.href })
        }, (r) => {
          if (chrome.runtime.lastError || !r?.[0]) { sendResponse({ success: false }); return; }
          const evt = { type: 'storage', domain, data: r[0].result, timestamp: Date.now() };
          send(evt);
          recordTabEvent(tabId, evt);
          sendResponse({ success: true });
        });

      } else {
        sendResponse({ success: false });
      }
    });
    return true; // async
  }

  if (command === 'popup_clear_tab') {
    tabStats.delete(tabId);
    sendResponse({ success: true });
    return true;
  }

  // ── Legacy commands from dashboard/CLI ──────────────────────────────────────
  if (command === 'navigate') { navigateAndTrack(msg.url); }
  if (command === 'track') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        tabContexts.set(tabs[0].id, getDomain(tabs[0].url));
        attachDebugger(tabs[0].id);
      }
    });
  }
  if (command === 'untrack') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) detachDebugger(tabs[0].id);
    });
  }
  if (command === 'dommap') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const domain = tabContexts.get(tabs[0].id) || getDomain(tabs[0].url);
        mapDOM(tabs[0].id, domain);
      }
    });
  }
  if (command === 'get_cookies') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.cookies.getAll({ url: tabs[0].url }, (cookies) => {
        send({ type: 'cookies', domain: getDomain(tabs[0].url), cookies, url: tabs[0].url, timestamp: Date.now() });
      });
    });
  }
  if (command === 'get_storage') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => ({ localStorage: { ...localStorage }, sessionStorage: { ...sessionStorage }, url: window.location.href })
      }, (r) => {
        if (r?.[0]) send({ type: 'storage', domain: getDomain(tabs[0].url), data: r[0].result, timestamp: Date.now() });
      });
    });
  }
  if (command === 'get_html') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => ({ html: document.documentElement.outerHTML, title: document.title, url: window.location.href })
      }, (r) => {
        if (r?.[0]) send({ type: 'html', domain: getDomain(tabs[0].url), data: r[0].result, timestamp: Date.now() });
      });
    });
  }
  if (command === 'screenshot') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.tabs.captureVisibleTab(tabs[0].windowId, { format: 'png' }, (dataUrl) => {
        send({ type: 'screenshot', domain: getDomain(tabs[0].url), dataUrl, url: tabs[0].url, timestamp: Date.now() });
      });
    });
  }
  if (command === 'ping') { /* keepalive */ }
});

// ── Native messaging ──────────────────────────────────────────────────────────
function connectToNative() {
  try {
    nativePort = chrome.runtime.connectNative('com.scraper.core');

    nativePort.onMessage.addListener((msg) => {
      reconnectAttempts = 0;
      // Route native messages to the appropriate handler
      if (msg.command) {
        chrome.runtime.sendMessage(msg).catch(() => {});
      }
    });

    nativePort.onDisconnect.addListener(() => {
      console.error('❌ Disconnected:', chrome.runtime.lastError?.message);
      stopKeepAlive(); nativePort = null;
      setTimeout(() => { reconnectAttempts++; connectToNative(); },
        Math.min(30000, reconnectAttempts * 5000 + 2000));
    });

    nativePort.postMessage({ command: 'register', browser: BROWSER, timestamp: Date.now() });
    startKeepAlive();
    console.log('✅ Native port open');
  } catch(e) {
    console.error('connect failed:', e);
    setTimeout(connectToNative, 5000);
  }
}

function startKeepAlive() {
  stopKeepAlive();
  keepAliveInterval = setInterval(() => {
    if (nativePort) {
      try { nativePort.postMessage({ command: 'ping', timestamp: Date.now() }); }
      catch(e) { stopKeepAlive(); }
    }
  }, 25000);
}
function stopKeepAlive() {
  if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
}

connectToNative();