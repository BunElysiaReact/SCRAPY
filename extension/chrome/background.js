// background.js - Runs INSIDE Chrome, talks to C
let nativePort = null;
let pendingRequests = new Map();

console.log('🚀 Scraper Extension Starting...');

// Connect to C native host
function connectToNative() {
    try {
        nativePort = chrome.runtime.connectNative('com.scraper.core');
        console.log('✅ Connected to C core');
        
        nativePort.onMessage.addListener((msg) => {
            console.log('📨 From C:', msg);
            
            // Handle commands from C
            if (msg.command === 'navigate') {
                chrome.tabs.create({ url: msg.url, active: false });
            }
            
            if (msg.command === 'getCookies') {
                chrome.cookies.getAll({ url: msg.url }, (cookies) => {
                    nativePort.postMessage({
                        type: 'cookies',
                        url: msg.url,
                        cookies: cookies
                    });
                });
            }
        });
        
        nativePort.onDisconnect.addListener(() => {
            console.log('❌ Disconnected from C, reconnecting...');
            setTimeout(connectToNative, 1000);
        });
        
        // Send test message
        nativePort.postMessage({
            command: 'hello',
            browser: 'chrome',
            version: chrome.runtime.getManifest().version
        });
        
    } catch (e) {
        console.error('Failed to connect:', e);
        setTimeout(connectToNative, 5000);
    }
}

// Intercept ALL network requests
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        // Send to C core
        if (nativePort) {
            nativePort.postMessage({
                type: 'request',
                url: details.url,
                method: details.method,
                requestId: details.requestId,
                timeStamp: details.timeStamp
            });
        }
        return { cancel: false };
    },
    { urls: ["<all_urls>"] },
    ["requestBody"]
);

// Capture responses
chrome.webRequest.onCompleted.addListener(
    (details) => {
        if (nativePort) {
            nativePort.postMessage({
                type: 'response',
                url: details.url,
                statusCode: details.statusCode,
                requestId: details.requestId,
                timeStamp: details.timeStamp
            });
        }
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
);

// Start connection
connectToNative();

// Keep service worker alive
setInterval(() => {
    if (nativePort) {
        nativePort.postMessage({ type: 'heartbeat' });
    }
}, 25000);