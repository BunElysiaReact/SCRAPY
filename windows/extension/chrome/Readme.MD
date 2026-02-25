# Chrome Extension

> **Chrome uses the same extension as Brave.**
> Both are Chromium-based and support Manifest V3 + Chrome DevTools Protocol.

## Load the Extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `../brave/` folder (NOT this folder)

```
extension/
├── brave/          ← Load THIS folder in Chrome, Brave, and Edge
└── firefox/        ← Load this folder ONLY in Firefox
```

## Why Brave is the Reference Implementation

The Brave extension uses:
- **Manifest V3** (Chrome/Brave/Edge compatible)
- **chrome.debugger API** for full CDP access → captures request bodies, response bodies
- **Stealth injection** to hide automation signals
- **Live event feed** via SSE to the dashboard

Firefox cannot use `chrome.debugger`, so the Firefox extension uses
`webRequest` API instead (headers only, no bodies).

## After Loading

1. Copy the Extension ID shown on `chrome://extensions`
2. Run: `scrapy-register-ext YOUR_EXTENSION_ID`
3. Restart `debug_host`
4. Browse your target sites — everything is captured automatically