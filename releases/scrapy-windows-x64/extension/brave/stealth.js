// stealth.js - Injected into tracked tabs for human behavior simulation

(function() {
    if (window.__stealthInjected) return;
    window.__stealthInjected = true;

    // ── Fingerprint jitter ────────────────────────────────────────────────────

    // Randomize hardwareConcurrency (2, 4, 8, 12, 16)
    const cores = [2, 4, 8, 12, 16][Math.floor(Math.random() * 5)];
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => cores });

    // Randomize deviceMemory (2, 4, 8)
    const mem = [2, 4, 8][Math.floor(Math.random() * 3)];
    try { Object.defineProperty(navigator, 'deviceMemory', { get: () => mem }); } catch {}

    // Spoof platform subtly (keep OS real, vary minor details)
    const platforms = ['Win32', 'Win32', 'Linux x86_64', 'MacIntel'];
    // Only spoof if not already detected as mobile
    if (!navigator.userAgent.includes('Mobile')) {
        try {
            const plat = platforms[Math.floor(Math.random() * platforms.length)];
            Object.defineProperty(navigator, 'platform', { get: () => plat });
        } catch {}
    }

    // Canvas fingerprint noise — add imperceptible random pixel noise
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type) {
        const ctx = this.getContext('2d');
        if (ctx) {
            const imageData = ctx.getImageData(0, 0, this.width || 1, this.height || 1);
            for (let i = 0; i < imageData.data.length; i += 100) {
                imageData.data[i] = imageData.data[i] ^ (Math.random() * 2 | 0);
            }
            ctx.putImageData(imageData, 0, 0);
        }
        return origToDataURL.apply(this, arguments);
    };

    // WebGL vendor noise
    const origGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
        if (param === 37445) return 'Intel Inc.';   // UNMASKED_VENDOR
        if (param === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER
        return origGetParameter.call(this, param);
    };

    // ── Human scroll simulation ───────────────────────────────────────────────

    function easeInOutCubic(t) {
        return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
    }

    function humanScroll(targetY, duration) {
        const startY    = window.scrollY;
        const distance  = targetY - startY;
        const startTime = performance.now();

        function step(now) {
            const elapsed  = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease     = easeInOutCubic(progress);
            // Add micro-jitter to scroll position
            const jitter   = (Math.random() - 0.5) * 2;
            window.scrollTo(0, startY + distance * ease + jitter);
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function randomScrollSession() {
        const pageH   = document.body.scrollHeight;
        const viewH   = window.innerHeight;
        if (pageH <= viewH) return;

        const scrolls = 3 + Math.floor(Math.random() * 5);
        let   delay   = 1200 + Math.random() * 2000;

        for (let i = 0; i < scrolls; i++) {
            const targetPct = 0.1 + Math.random() * 0.8;
            const targetY   = Math.floor((pageH - viewH) * targetPct);
            const duration  = 600 + Math.random() * 1200;

            setTimeout(() => humanScroll(targetY, duration), delay);
            delay += 1500 + Math.random() * 3000;
        }

        // Scroll back toward top at end (humans often do this)
        setTimeout(() => humanScroll(Math.random() * 200, 800 + Math.random() * 400),
                   delay + 1000);
    }

    // ── Human mouse simulation ────────────────────────────────────────────────

    function bezierPoint(p0, p1, p2, p3, t) {
        const cx = 3*(p1.x-p0.x), cy = 3*(p1.y-p0.y);
        const bx = 3*(p2.x-p1.x)-cx, by = 3*(p2.y-p1.y)-cy;
        const ax = p3.x-p0.x-cx-bx, ay = p3.y-p0.y-cy-by;
        return {
            x: ax*t*t*t + bx*t*t + cx*t + p0.x,
            y: ay*t*t*t + by*t*t + cy*t + p0.y
        };
    }

    let lastMouseX = Math.random() * window.innerWidth;
    let lastMouseY = Math.random() * window.innerHeight;

    function moveMouseTo(targetX, targetY, duration) {
        const steps   = Math.floor(duration / 16);
        const start   = { x: lastMouseX, y: lastMouseY };
        const end     = { x: targetX,    y: targetY    };

        // Random bezier control points for natural curve
        const cp1 = {
            x: start.x + (Math.random() - 0.5) * 200,
            y: start.y + (Math.random() - 0.5) * 200
        };
        const cp2 = {
            x: end.x + (Math.random() - 0.5) * 200,
            y: end.y + (Math.random() - 0.5) * 200
        };

        for (let i = 0; i <= steps; i++) {
            const t   = i / steps;
            const pos = bezierPoint(start, cp1, cp2, end, t);
            const delay = (duration / steps) * i;
            setTimeout(() => {
                document.dispatchEvent(new MouseEvent('mousemove', {
                    clientX: Math.round(pos.x),
                    clientY: Math.round(pos.y),
                    bubbles: true
                }));
            }, delay);
        }
        lastMouseX = targetX;
        lastMouseY = targetY;
    }

    function randomMouseSession() {
        const moves   = 4 + Math.floor(Math.random() * 6);
        let   delay   = 800 + Math.random() * 1500;

        for (let i = 0; i < moves; i++) {
            const targetX  = 50 + Math.random() * (window.innerWidth  - 100);
            const targetY  = 50 + Math.random() * (window.innerHeight - 100);
            const duration = 400 + Math.random() * 800;

            setTimeout(() => moveMouseTo(targetX, targetY, duration), delay);
            delay += 700 + Math.random() * 2000;

            // Occasionally hover over a random element
            if (Math.random() < 0.3) {
                setTimeout(() => {
                    const els = document.querySelectorAll('a, button, img, p, h1, h2, h3');
                    if (els.length) {
                        const el   = els[Math.floor(Math.random() * els.length)];
                        const rect = el.getBoundingClientRect();
                        if (rect.width && rect.height) {
                            el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                            setTimeout(() => el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })),
                                       300 + Math.random() * 700);
                        }
                    }
                }, delay + duration);
                delay += 500;
            }
        }
    }

    // ── Start simulations after page settles ─────────────────────────────────

    function startSim() {
        // Stagger start so it feels natural
        const scrollDelay = 2000 + Math.random() * 3000;
        const mouseDelay  = 1000 + Math.random() * 2000;

        setTimeout(randomScrollSession, scrollDelay);
        setTimeout(randomMouseSession,  mouseDelay);

        // Repeat scroll session occasionally
        setTimeout(randomScrollSession, scrollDelay + 8000 + Math.random() * 5000);
    }

    if (document.readyState === 'complete') {
        startSim();
    } else {
        window.addEventListener('load', startSim);
    }

    console.log(`[stealth] injected — cores:${cores} mem:${mem}GB`);
})();