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
})();
