// content.js - Runs on every page
console.log('📄 Scraper content script loaded on:', window.location.href);

// Listen for messages from background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Content script received:', message);
    
    if (message.command === 'getDOM') {
        sendResponse({
            html: document.documentElement.outerHTML,
            title: document.title,
            url: window.location.href,
            cookies: document.cookie
        });
    }
    
    if (message.command === 'ping') {
        sendResponse({ status: 'pong' });
    }
});

// Notify background that content script is loaded
browser.runtime.sendMessage({
    type: 'content_script_loaded',
    url: window.location.href
}).catch(() => {
    // Background might not be ready, that's ok
});