// background.js - FIREFOX VERSION
const BROWSER = 'firefox';
let nativePort = null;
let reconnectAttempts = 0;
let keepAliveInterval = null;

console.log('🦊 Firefox Scraper Extension Starting...');

function connectToNative() {
    try {
        console.log('Connecting to native host...');
        
        // Firefox uses browser.runtime.connectNative
        nativePort = browser.runtime.connectNative('com.scraper.core');
        
        nativePort.onMessage.addListener((msg) => {
            console.log('📨 From C:', msg);
            reconnectAttempts = 0;
            
            // Handle commands FROM C
            if (msg.command === 'navigate') {
                console.log('🌐 Navigating to:', msg.url);
                browser.tabs.create({ url: msg.url, active: true });
            }
            else if (msg.command === 'get_cookies') {
                console.log('🍪 Getting cookies for:', msg.url);
                let url = msg.url;
                if (url === 'current') {
                    // Get current tab URL
                    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
                        if (tabs[0]) {
                            url = tabs[0].url;
                            getCookiesForUrl(url);
                        }
                    });
                } else {
                    getCookiesForUrl(url);
                }
                
                function getCookiesForUrl(url) {
                    browser.cookies.getAll({ url: url }).then((cookies) => {
                        if (nativePort) {
                            nativePort.postMessage({
                                type: 'cookies',
                                cookies: cookies,
                                url: url,
                                timestamp: Date.now()
                            });
                            console.log('🍪 Sent', cookies.length, 'cookies');
                        }
                    }).catch(error => {
                        console.error('Error getting cookies:', error);
                    });
                }
            }
            else if (msg.command === 'get_html') {
                console.log('📄 Getting HTML');
                browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
                    if (tabs[0] && nativePort) {
                        browser.tabs.executeScript(tabs[0].id, {
                            code: '(' + function() {
                                return {
                                    html: document.documentElement.outerHTML,
                                    title: document.title,
                                    url: window.location.href
                                };
                            } + ')()'
                        }).then((results) => {
                            if (nativePort && results && results[0]) {
                                nativePort.postMessage({
                                    type: 'html',
                                    data: results[0],
                                    timestamp: Date.now()
                                });
                                console.log('📄 HTML sent');
                            }
                        }).catch(error => {
                            console.error('Error executing script:', error);
                        });
                    }
                });
            }
        });
        
        nativePort.onDisconnect.addListener(() => {
            console.log('❌ Disconnected from native host');
            stopKeepAlive();
            
            const error = browser.runtime.lastError;
            if (error) {
                console.error('Disconnect error:', error.message);
            }
            
            // Reconnect with backoff
            setTimeout(() => {
                reconnectAttempts++;
                const delay = Math.min(30000, reconnectAttempts * 5000);
                console.log(`Reconnecting in ${delay/1000}s... (attempt ${reconnectAttempts})`);
                connectToNative();
            }, 5000);
        });
        
        // Send registration message
        nativePort.postMessage({
            command: 'register',
            browser: BROWSER,
            timestamp: Date.now()
        });
        
        console.log('Registration sent');
        startKeepAlive();
        
    } catch (e) {
        console.error('Failed to connect:', e);
        setTimeout(connectToNative, 5000);
    }
}

function startKeepAlive() {
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    
    keepAliveInterval = setInterval(() => {
        if (nativePort) {
            try {
                nativePort.postMessage({ 
                    command: 'ping',
                    timestamp: Date.now()
                });
                console.log('📤 Ping sent');
            } catch (e) {
                console.log('Ping failed');
                stopKeepAlive();
            }
        }
    }, 25000);
}

function stopKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
}

// Listen for cookies automatically
browser.cookies.onChanged.addListener((changeInfo) => {
    if (nativePort) {
        nativePort.postMessage({
            type: 'cookies_changed',
            cookie: {
                name: changeInfo.cookie.name,
                domain: changeInfo.cookie.domain,
                value: changeInfo.cookie.value
            },
            cause: changeInfo.cause,
            removed: changeInfo.removed,
            timestamp: Date.now()
        });
        console.log('🍪 Cookie change detected');
    }
});

// Start connection
connectToNative();
console.log('✅ Extension loaded');