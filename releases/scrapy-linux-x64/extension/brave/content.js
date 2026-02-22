// content.js - Runs on every page
console.log('📄 Scraper content script loaded on:', window.location.href);

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.command === 'getDOM') {
        sendResponse({
            html: document.documentElement.outerHTML,
            title: document.title,
            url: window.location.href,
            cookies: document.cookie
        });
    }
});