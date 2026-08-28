(function () {
    function applyPinVisual(pinned) {
        var btn = document.getElementById('btnPin');
        if (!btn) return;
        btn.classList.toggle('is-pinned', !!pinned);
        btn.title = pinned ? 'กำลังลอยบนสุด (แตะเพื่อปลด)' : 'ไม่ได้ลอยบนสุด (แตะเพื่อปักหมุด)';
    }

    // ---------------------------------------------------------------
    // Feedback animations for "saved" (manual entry) vs. "money in"
    // (auto-detected via Pushbullet) — pure visual polish, called from
    // app.js's saveRecord / pbInject / apply6040ToPOS.
    //
    // Declared before the mini-mode block below since that block also
    // relies on restartAnim (function declarations are hoisted, but
    // keeping the shared helper up top is easier to follow).
    // ---------------------------------------------------------------
    function restartAnim(el, cls) {
        if (!el) return;
        el.classList.remove(cls);
        void el.offsetWidth; // force reflow so the animation restarts
        el.classList.add(cls);
    }

    if (window.heroWindow) {
        window.heroWindow.getPinState().then(applyPinVisual).catch(function () {});
        window.heroWindow.onPinStateChanged(applyPinVisual);

        // -----------------------------------------------------------
        // Mini-mode transition — see renderer/theme-hero.css's
        // #modeShutter / .mode-anim rules and main.js's
        // enterMiniMode/exitMiniMode/commitEnterMini for the rest of
        // this sequence. Summary: entering mini animates the full UI
        // out + closes a full-viewport shutter *before* the native
        // window resize happens (Windows has no smooth-resize API, so
        // the resize itself is masked behind the closed shutter);
        // exiting mini resizes immediately (the target size is already
        // known) and then animates the full UI assembling back in.
        // -----------------------------------------------------------
        var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        var modeCleanupTimer = null;

        function clearModeAnimClasses() {
            document.body.classList.remove('mode-anim', 'to-mini', 'to-full');
            var hud = document.getElementById('miniWidget');
            if (hud) hud.classList.remove('land', 'press');
        }

        if (window.heroWindow.onModeTransition) {
            window.heroWindow.onModeTransition(function (payload) {
                // Only "entering mini" has a pre-resize animation phase to wait
                // on — exiting resizes immediately (see onModeChanged below) and
                // never sends this event.
                if (!payload || payload.to !== 'mini') return;

                if (modeCleanupTimer) { clearTimeout(modeCleanupTimer); modeCleanupTimer = null; }
                clearModeAnimClasses();
                document.body.classList.add('mode-anim', 'to-mini');

                var acked = false;
                var ack = function () {
                    if (acked) return;
                    acked = true;
                    if (window.heroWindow.collapseReady) window.heroWindow.collapseReady();
                };
                var shutter = document.getElementById('modeShutter');
                if (reducedMotion || !shutter) {
                    // theme-hero.css's reduced-motion block kills every animation
                    // globally, so the shutter's animationend would never fire —
                    // ack on the next frame instead and let main.js's window
                    // actually just jump (no motion = an instant cut is correct).
                    requestAnimationFrame(ack);
                } else {
                    shutter.addEventListener('animationend', ack, { once: true });
                    // belt-and-braces: commit even if the animationend event is
                    // ever missed, rather than depending solely on main.js's own
                    // watchdog for every case.
                    setTimeout(ack, 280);
                }
            });
        }

        if (window.heroWindow.onModeChanged) {
            window.heroWindow.onModeChanged(function (mode) {
                var hud = document.getElementById('miniWidget');
                if (modeCleanupTimer) { clearTimeout(modeCleanupTimer); modeCleanupTimer = null; }

                if (mode === 'mini') {
                    document.body.classList.add('mini-mode');
                    // Timed off this event (the real resize commit) rather than a
                    // hardcoded CSS delay, so it lands correctly even if the
                    // watchdog/ack path took a little longer than the nominal 230ms.
                    if (hud) restartAnim(hud, 'land');
                    restartAnim(document.querySelector('.mini-coin'), 'bump');
                    modeCleanupTimer = setTimeout(clearModeAnimClasses, 190);
                } else {
                    document.body.classList.remove('mini-mode');
                    document.body.classList.add('mode-anim', 'to-full');
                    modeCleanupTimer = setTimeout(clearModeAnimClasses, 340);
                }
            });
        }

    }

    // Bound to #miniWidget's onclick in index.html instead of calling
    // heroWindow.exitMini() directly, so there's an instant tactile
    // response (press bump) even though the real IPC call — and the
    // resize it triggers — is deliberately deferred a beat behind it.
    // Declared unconditionally (unlike the block above) so the onclick
    // handler never throws even if window.heroWindow somehow isn't there.
    var exitMiniPending = false;
    window.heroExitMini = function () {
        if (exitMiniPending) return;
        exitMiniPending = true;
        var hud = document.getElementById('miniWidget');
        restartAnim(hud, 'press');
        restartAnim(document.querySelector('.mini-coin'), 'bump');
        setTimeout(function () {
            exitMiniPending = false;
            if (window.heroWindow && window.heroWindow.exitMini) window.heroWindow.exitMini();
        }, 100);
    };

    function showCoinPop(amount, opts) {
        opts = opts || {};
        var amt = (parseFloat(amount) || 0).toLocaleString('en-US');
        var pop = document.createElement('div');
        pop.className = 'coin-pop' + (opts.moneyIn ? ' money-in' : '');
        pop.textContent = (opts.moneyIn ? '💰 +' : '✅ +') + amt + ' ฿' + (opts.moneyIn ? ' เงินเข้า!' : ' บันทึกแล้ว');
        document.body.appendChild(pop);
        var cleanup = function () { if (pop.parentNode) pop.parentNode.removeChild(pop); };
        pop.addEventListener('animationend', cleanup);
        setTimeout(cleanup, 2500);
    }

    function flashLatestRow() {
        var tbody = document.getElementById('tableBody');
        if (!tbody) return;
        var rows = tbody.querySelectorAll('tr');
        if (rows.length) restartAnim(rows[rows.length - 1], 'row-flash');
    }

    window.celebrateTransaction = function (amount, opts) {
        showCoinPop(amount, opts);
        restartAnim(document.getElementById('sumNet'), 'sum-pulse');
        restartAnim(document.querySelector('.mini-coin'), 'bump');
        restartAnim(document.getElementById('miniSumNet'), 'flash');
        flashLatestRow();
    };

    // ---------------------------------------------------------------
    // Theme picker — 5 palettes, persisted in localStorage, applied via
    // a data-theme attribute on <html> (see the head script in
    // index.html that applies it before first paint, and the
    // :root[data-theme="..."] blocks in theme-hero.css).
    // ---------------------------------------------------------------
    var DEFAULT_THEME = 'amber';

    function currentTheme() {
        return document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
    }

    function markActiveSwatch() {
        var active = currentTheme();
        document.querySelectorAll('.theme-swatch').forEach(function (el) {
            el.classList.toggle('active', el.getAttribute('data-theme') === active);
        });
    }

    window.openThemeModal = function () {
        markActiveSwatch();
        document.getElementById('themeModal').style.display = 'flex';
    };
    window.closeThemeModal = function () {
        document.getElementById('themeModal').style.display = 'none';
    };
    // ---------------------------------------------------------------
    // Silent receipt printing — replaces window.print() so the CSS
    // @page 80mm size actually gets used (the native print dialog
    // ignores it and just uses the driver's own paper-size setting).
    //
    // The printer prints exactly the page height it's told — it does not
    // auto-trim leading or trailing blank space — so the height sent to
    // silentPrint() needs to match the real rendered content closely. The
    // relevant #print*Area element is display:none on screen (only shown
    // under @media print), and @media print's font sizes don't apply
    // outside an actual print pass either — so a plain scrollHeight read
    // here would both see 0 height AND, if forced visible, use the larger
    // on-screen font sizes. body.print-scale (in base.css, deliberately
    // NOT scoped to @media print) mirrors the exact print typography so
    // this measurement matches what will actually be printed.
    // ---------------------------------------------------------------
    window.measurePrintHeightMicrons = function measurePrintHeightMicrons() {
        var body = document.body;
        var el = body.classList.contains('printing-drawer') ? document.getElementById('printDrawerArea')
            : body.classList.contains('printing-exchange') ? document.getElementById('printExchangeArea')
            : body.classList.contains('printing-recon') ? document.getElementById('printReconArea')
            : body.classList.contains('print-summary-only') ? document.getElementById('printSummaryArea')
            : document.querySelector('.paper');
        if (!el) return 3276000;

        var prevCssText = el.style.cssText;
        el.style.cssText = prevCssText + '; display: block !important; position: fixed !important; ' +
            'left: -9999px !important; top: 0 !important; visibility: hidden !important; ' +
            'width: 72mm !important; max-width: 72mm !important; height: auto !important; max-height: none !important;';
        var pxHeight = el.scrollHeight;
        el.style.cssText = prevCssText;

        if (!pxHeight) return 3276000;
        var mm = (pxHeight * 25.4 / 96) + 8; // content height + a small safety buffer (top/bottom @page margins are 3mm each)
        var microns = Math.round(mm * 1000);
        return Math.max(35000, Math.min(microns, 3276000));
    }

    window.heroPrint = function () {
        if (window.heroWindow && window.heroWindow.silentPrint) {
            document.body.classList.add('print-scale');
            var heightMicrons = measurePrintHeightMicrons();
            window.heroWindow.silentPrint(heightMicrons).then(function (res) {
                if (!res || !res.success) {
                    alert('⚠️ พิมพ์ไม่สำเร็จ: ' + ((res && res.reason) || 'ไม่ทราบสาเหตุ') + '\nตรวจสอบว่าเครื่องพิมพ์เปิดอยู่และเชื่อมต่อดีหรือไม่');
                }
                document.body.classList.remove('print-scale');
                if (typeof clearPrintClasses === 'function') clearPrintClasses();
            }).catch(function () {
                document.body.classList.remove('print-scale');
                if (typeof clearPrintClasses === 'function') clearPrintClasses();
            });
        } else {
            window.print();
        }
    };

    // The native window's backgroundColor (set at BrowserWindow construction
    // in main.js) briefly shows through the newly-exposed region whenever the
    // window grows — most visibly right after exiting mini mode. Keep it
    // synced to whichever theme is actually active instead of leaving it
    // hardcoded to one palette's color.
    function pushBackgroundColor() {
        if (!window.heroWindow || !window.heroWindow.setBackgroundColor) return;
        var hex = getComputedStyle(document.documentElement).getPropertyValue('--hero-bg-1').trim();
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) window.heroWindow.setBackgroundColor(hex);
    }
    pushBackgroundColor();

    window.selectTheme = function (name) {
        if (name === DEFAULT_THEME) {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', name);
        }
        try { localStorage.setItem('heroTheme', name); } catch (e) {}
        markActiveSwatch();
        pushBackgroundColor();
    };
})();
