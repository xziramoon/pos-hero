(function () {
    function applyPinVisual(pinned) {
        var btn = document.getElementById('btnPin');
        if (!btn) return;
        btn.classList.toggle('is-pinned', !!pinned);
        btn.title = pinned ? 'กำลังลอยบนสุด (แตะเพื่อปลด)' : 'ไม่ได้ลอยบนสุด (แตะเพื่อปักหมุด)';
    }

    if (window.heroWindow) {
        window.heroWindow.getPinState().then(applyPinVisual).catch(function () {});
        window.heroWindow.onPinStateChanged(applyPinVisual);

        if (window.heroWindow.onModeChanged) {
            window.heroWindow.onModeChanged(function (mode) {
                document.body.classList.toggle('mini-mode', mode === 'mini');
            });
        }
    }

    // ---------------------------------------------------------------
    // Feedback animations for "saved" (manual entry) vs. "money in"
    // (auto-detected via Pushbullet) — pure visual polish, called from
    // app.js's saveRecord / pbInject / apply6040ToPOS.
    // ---------------------------------------------------------------
    function restartAnim(el, cls) {
        if (!el) return;
        el.classList.remove(cls);
        void el.offsetWidth; // force reflow so the animation restarts
        el.classList.add(cls);
    }

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

    window.selectTheme = function (name) {
        if (name === DEFAULT_THEME) {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', name);
        }
        try { localStorage.setItem('heroTheme', name); } catch (e) {}
        markActiveSwatch();
    };
})();
