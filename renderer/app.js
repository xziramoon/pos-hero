        // ================================================================
        // [FIX #1] ลบสคริปต์ซ้ำซ้อน — รวมโค้ดทุกอย่างไว้ใน script เดียว
        // ================================================================

        // ==========================================
        // ส่วนที่ 1: Global Event Listeners (ไม่เปลี่ยนแปลง)
        // ==========================================
        document.addEventListener('wheel', function(event) {
            if (document.activeElement.type === 'number') document.activeElement.blur();
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                const activeElem = document.activeElement;
                if (activeElem && activeElem.classList.contains('num-input')) {
                    e.preventDefault();
                    const currentModal = activeElem.closest('.modal-content');
                    if (currentModal) {
                        const inputs = Array.from(currentModal.querySelectorAll('.num-input'));
                        const currentIndex = inputs.indexOf(activeElem);
                        if (currentIndex > -1 && currentIndex < inputs.length - 1) inputs[currentIndex + 1].focus();
                        else activeElem.blur();
                    }
                }
            }
        });

        // Escape key closes all modals
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
        });

        // ==========================================
        // ส่วนที่ 2: ตัวแปร Global และ localStorage
        // ==========================================
        let records = [];
        let currentFilter = 'all';
        try { let rawData = JSON.parse(localStorage.getItem('posUltimateRecords')); records = Array.isArray(rawData) ? rawData : []; } catch(e) { records = []; }
        let headerData = {};
        try { headerData = JSON.parse(localStorage.getItem('posUltimateHeader')) || {}; } catch(e) { headerData = {}; }

        document.getElementById('headDate').innerText = new Date().toLocaleDateString('th-TH');
        document.getElementById('headPos').value = headerData.pos || '';
        document.getElementById('headCashier').value = headerData.cashier || '';

        // ✨ v5: ตรวจจับข้อมูลค้างจากวันก่อน (New Day Guard)
        (function newDayGuard() {
            const todayKey = new Date().toLocaleDateString('th-TH');
            const savedDate = localStorage.getItem('posUltimateDate') || '';
            if (records.length > 0 && savedDate && savedDate !== todayKey) {
                if (confirm('⚠️ พบข้อมูลของวันก่อน (' + savedDate + ') ค้างอยู่ ' + records.length + ' รายการ\n\nกด OK = สำรองเป็นไฟล์ + เริ่มวันใหม่\nกด Cancel = ใช้ข้อมูลเดิมต่อ')) {
                    backupData(savedDate);
                    records = [];
                    localStorage.removeItem('posUltimateRecords');
                }
            }
            localStorage.setItem('posUltimateDate', todayKey);
        })();

        function saveHeader() { localStorage.setItem('posUltimateHeader', JSON.stringify({ pos: document.getElementById('headPos').value, cashier: document.getElementById('headCashier').value })); }
        function escapeHTML(str) { return (str||'-').toString().replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)); }

        // ==========================================
        // ส่วนที่ 3: handleTypeChange — [FIX] รวมจาก Override Patch
        // [FIX #2] ช่องกรอกชื่อไม่หายเมื่อเลือก "โอน" + โฟกัสถูกช่อง
        // ==========================================
        function handleTypeChange() {
            const type = document.querySelector('input[name="payType"]:checked').value;
            const nameInput = document.getElementById('inputName');
            const amtInput = document.getElementById('inputAmount');

            // [FIX] บังคับให้ช่องกรอกชื่อแสดงผลเสมอ (เดิมโค้ดเก่าซ่อนตอนเลือก "โอน")
            nameInput.style.display = 'block';

            if (type === 'transfer') {
                nameInput.value = '';
                nameInput.placeholder = "ชื่อผู้โอน / รายการ...";
                amtInput.placeholder = "ยอดเงินโอน...";
            } else if (type === 'thaiplus') {
                nameInput.value = '';
                nameInput.placeholder = "ชื่อลูกค้า (ถ้ามี)...";
                amtInput.placeholder = "ยอดสแกน...";
            } else {
                nameInput.value = '';
                nameInput.placeholder = "ระบุรายการ...";
                amtInput.placeholder = "0";
            }

            // [FIX] โฟกัสไปที่ช่องกรอกชื่อเสมอเพื่อความลื่นไหล
            nameInput.focus();
        }

        document.getElementById('inputAmount').addEventListener("keypress", function(e) { if (e.key === "Enter" && !e.target.classList.contains('num-input')) saveRecord(); });
        document.getElementById('inputName').addEventListener("keypress", function(e) { if (e.key === "Enter" && this.value.trim() !== "") document.getElementById('inputAmount').focus(); });

        // ==========================================
        // ส่วนที่ 4: saveRecord — [FIX] รวมจาก Override Patch
        // [FIX #3] ไม่แทรก Tag "(ไทยพลัส)" ซ้ำในชื่อ + ชื่อสั้นกระชับ
        // ==========================================
        function saveRecord() {
            const amtIn = document.getElementById('inputAmount');
            const nameIn = document.getElementById('inputName');
            const type = document.querySelector('input[name="payType"]:checked').value;
            const amount = parseFloat(amtIn.value);
            let rawName = nameIn.value.trim();

            if (isNaN(amount) || amount <= 0) return;

            // [FIX] ตั้งชื่อรายการให้สั้นกระชับ ไม่ต่อท้ายประเภท
            let finalName = rawName !== "" ? rawName : (type === 'transfer' ? "ลูกค้าโอนเงิน" : "ลูกค้าทั่วไป");

            records.push({
                time: new Date().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}),
                type: type,
                name: finalName,
                amount: amount,
                isEdited: false
            });

            localStorage.setItem('posUltimateDate', new Date().toLocaleDateString('th-TH'));
            localStorage.setItem('posUltimateRecords', JSON.stringify(records));
            renderTable();
            if (typeof celebrateTransaction === 'function') celebrateTransaction(amount, { moneyIn: false });

            amtIn.value = '';
            nameIn.value = '';
            nameIn.focus();
        }

        // ==========================================
        // ส่วนที่ 5: Undo / Delete / Edit
        // ==========================================
        let undoStack = [];
        let undoTimer = null;
        function deleteRecord(index) {
            const removed = records.splice(index, 1)[0];
            if (!removed) return;
            undoStack.push({ record: removed, index: index });
            localStorage.setItem('posUltimateRecords', JSON.stringify(records));
            renderTable();
            document.getElementById('undoToastMsg').innerText = 'ลบ "' + (removed.name || '-') + '" ' + (parseFloat(removed.amount)||0).toLocaleString('en-US') + ' ฿ แล้ว';
            document.getElementById('undoToast').classList.add('show');
            clearTimeout(undoTimer);
            undoTimer = setTimeout(hideUndoToast, 6000);
        }
        function hideUndoToast() { document.getElementById('undoToast').classList.remove('show'); undoStack = []; }
        function undoDelete() {
            const last = undoStack.pop();
            if (last) {
                records.splice(Math.min(last.index, records.length), 0, last.record);
                localStorage.setItem('posUltimateRecords', JSON.stringify(records));
                renderTable();
            }
            clearTimeout(undoTimer);
            hideUndoToast();
        }

        function editAmount(index) {
            const r = records[index];
            if (!r) return;
            const input = prompt('✏️ แก้ไขยอดเงินของ "' + (r.name || '-') + '"', r.amount);
            if (input === null) return;
            const val = parseFloat(input);
            if (isNaN(val) || val <= 0) { alert('⚠️ ยอดเงินไม่ถูกต้อง'); return; }
            r.amount = val;
            r.isEdited = true;
            localStorage.setItem('posUltimateRecords', JSON.stringify(records));
            renderTable();
        }

        function editName(index) {
            const r = records[index];
            if (!r) return;
            const input = prompt('✏️ แก้ไขชื่อรายการ', r.name || '-');
            if (input === null) return;
            let newName = input.trim();
            if (newName === '') newName = '-';
            r.name = newName;
            r.isEdited = true;
            localStorage.setItem('posUltimateRecords', JSON.stringify(records));
            renderTable();
        }

        function resetAll() {
            if (!confirm('⚠️ ล้างข้อมูลเริ่มกะใหม่?')) return;
            if (records.length > 0 && confirm('💾 ต้องการสำรองข้อมูลเป็นไฟล์ก่อนล้างหรือไม่?')) backupData();
            records = [];
            localStorage.removeItem('posUltimateRecords');
            localStorage.removeItem('posUltimateRecon');
            hideUndoToast();
            renderTable();
        }

        // ==========================================
        // ส่วนที่ 6: สำรอง / กู้คืนข้อมูล
        // ==========================================
        function backupData(labelDate) {
            if (records.length === 0) { alert('⚠️ ไม่มีข้อมูลสำหรับสำรอง'); return; }
            const dateLabel = labelDate || document.getElementById('headDate').innerText;
            const payload = {
                app: 'POS-Reconciliations',
                date: dateLabel,
                exportedAt: new Date().toISOString(),
                header: { pos: document.getElementById('headPos').value, cashier: document.getElementById('headCashier').value },
                records: records
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'POS_Backup_' + dateLabel.replace(/\//g, '-') + '_' + new Date().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}).replace(':','') + '.json';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
        function restoreData(ev) {
            const file = ev.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    const recs = Array.isArray(data) ? data : data.records;
                    if (!Array.isArray(recs)) throw new Error('invalid');
                    if (!confirm('📂 พบ ' + recs.length + ' รายการในไฟล์สำรอง\nต้องการแทนที่ข้อมูลปัจจุบัน (' + records.length + ' รายการ) หรือไม่?')) { ev.target.value = ''; return; }
                    records = recs;
                    localStorage.setItem('posUltimateRecords', JSON.stringify(records));
                    if (data.header) {
                        if (data.header.pos) document.getElementById('headPos').value = data.header.pos;
                        if (data.header.cashier) document.getElementById('headCashier').value = data.header.cashier;
                        saveHeader();
                    }
                    renderTable();
                    alert('✅ กู้คืนข้อมูลสำเร็จ ' + records.length + ' รายการ');
                } catch (err) { alert('❌ ไฟล์สำรองไม่ถูกต้อง'); }
                ev.target.value = '';
            };
            reader.readAsText(file);
        }

        // ==========================================
        // ส่วนที่ 7: Filter + Render Table
        // ==========================================
        function setFilter(type) {
            currentFilter = type;
            document.querySelectorAll('.filter-tab').forEach(el => el.classList.remove('active'));
            document.getElementById('tab-' + type).classList.add('active');
            renderTable();
        }

        function renderTable() {
            const tbody = document.getElementById('tableBody');
            let t=0, w=0, tp=0, e=0, cT=0, cW=0, cP=0, cE=0;

            records.forEach(r => {
                const amt = Math.round((parseFloat(r.amount) || 0) * 100);
                if (r.type === 'transfer') { t += amt; cT++; }
                else if (r.type === 'welfare') { w += amt; cW++; }
                else if (r.type === 'thaiplus') { tp += amt; cP++; }
                else { e += amt; cE++; }
            });

            tbody.innerHTML = records.map((r, i) => { return {...r, originalIndex: i}; })
                .filter(r => currentFilter === 'all' || r.type === currentFilter)
                .map((r) => {
                    let badge = r.type==='transfer' ? '<span class="badge bg-tr">โอน</span>' : r.type==='welfare' ? '<span class="badge bg-wel">บัตร</span>' : r.type==='thaiplus' ? '<span class="badge bg-thaiplus">ไทยพลัส</span>' : '<span class="badge bg-exp">จ่าย</span>';
                    let cls = r.type==='transfer' ? 'row-transfer' : r.type==='welfare' ? 'row-welfare' : r.type==='thaiplus' ? 'row-thaiplus' : 'row-expense';
                    let editedMark = r.isEdited ? '<span class="edited-mark">✎</span>' : '';
                    return '<tr class="' + cls + '"><td style="text-align:center; color:#ccc;">' + (r.originalIndex+1) + '</td><td style="font-size:12px; color:#666;">' + r.time + '</td><td style="text-align:center;">' + badge + '</td><td class="name-editable" onclick="editName(' + r.originalIndex + ')" title="แตะเพื่อแก้ไขชื่อ">' + escapeHTML(r.name) + editedMark + '</td><td class="amt-editable" style="text-align:right; font-weight:bold;" onclick="editAmount(' + r.originalIndex + ')" title="แตะเพื่อแก้ไขยอด">' + (parseFloat(r.amount)||0).toLocaleString('en-US') + '</td><td class="no-print" style="text-align:center;"><span class="action-btn" style="color:red;" onclick="deleteRecord(' + r.originalIndex + ')">×</span></td></tr>';
                }).join('');

            document.getElementById('sumTransfer').innerText = (t/100).toLocaleString('en-US');
            document.getElementById('sumWelfare').innerText = (w/100).toLocaleString('en-US');
            document.getElementById('sumThaiPlus').innerText = (tp/100).toLocaleString('en-US');
            document.getElementById('sumExpense').innerText = (e/100).toLocaleString('en-US');
            document.getElementById('sumNet').innerText = ((t+w+tp)/100).toLocaleString('en-US');
            updateTabCounts(cT, cW, cP, cE);
            updateMiniWidget(records, (t+w+tp)/100);
        }

        // เติมข้อมูลให้วิดเจ็ตจิ๋ว (โหมดย่อ) ไม่ว่าจะกำลังโชว์อยู่หรือไม่ก็ตาม
        // เพื่อให้พร้อมข้อมูลล่าสุดทันทีที่ผู้ใช้กดย่อหน้าจอ
        function updateMiniWidget(recs, netTotal) {
            var miniSum = document.getElementById('miniSumNet');
            var miniLast = document.getElementById('miniLastTx');
            if (!miniSum || !miniLast) return;
            miniSum.textContent = netTotal.toLocaleString('en-US');
            if (recs && recs.length > 0) {
                var last = recs[recs.length - 1];
                var amt = (parseFloat(last.amount) || 0).toLocaleString('en-US');
                miniLast.textContent = '+' + amt + ' ฿ ' + escapeHTML(last.name || '-');
            } else {
                miniLast.textContent = '— ยังไม่มีรายการ —';
            }
        }

        function setTabLabel(id, text, count) {
            document.getElementById(id).innerHTML = count > 0 ? text + '<span class="tab-count">' + count + '</span>' : text;
        }
        function updateTabCounts(cT, cW, cP, cE) {
            setTabLabel('tab-all', 'ทั้งหมด', cT + cW + cP + cE);
            setTabLabel('tab-transfer', 'โอน', cT);
            setTabLabel('tab-welfare', 'บัตรรัฐ', cW);
            setTabLabel('tab-thaiplus', 'ไทยพลัส', cP);
            setTabLabel('tab-expense', 'ค่าใช้จ่าย', cE);
        }

        // ==========================================
        // ส่วนที่ 8: นับลิ้นชัก + แลกเงิน + Export
        // ==========================================
        const denoms = [ { val: 1000, label: 'แบงก์ 1000', exLabel: '1000' }, { val: 500, label: 'แบงก์ 500', exLabel: '500' }, { val: 100, label: 'แบงก์ 100', exLabel: '100' }, { val: 50, label: 'แบงก์ 50', exLabel: '50' }, { val: 20, label: 'แบงก์ 20', exLabel: '20' }, { val: 10, label: 'เหรียญ 10', exLabel: 'เหรียญ 10' }, { val: 5, label: 'เหรียญ 5', exLabel: 'เหรียญ 5' }, { val: 2, label: 'เหรียญ 2', exLabel: 'เหรียญ 2' }, { val: 1, label: 'เหรียญ 1', exLabel: 'เหรียญ 1' } ];

        function openManualModal() { document.getElementById('manualModal').style.display = 'flex'; }
        function closeManualModal() { document.getElementById('manualModal').style.display = 'none'; }

        const STARTING_FLOAT = 9700;
        function initDrawerTable() { document.getElementById('drawerTableBody').innerHTML = denoms.map(d => '<tr><td>' + d.label + '</td><td style="text-align:center;"><input type="number" id="dr_qty_' + d.val + '" class="num-input" min="0" oninput="calcDrawer()"></td><td class="val-display" id="dr_val_' + d.val + '">0</td></tr>').join(''); }
        function openDrawerModal() { let totalExpense = 0; records.forEach(r => { if(r.type === 'expense') totalExpense += (parseFloat(r.amount)||0); }); document.getElementById('dsExpense').innerText = '-' + totalExpense.toLocaleString('en-US'); document.getElementById('drawerModal').dataset.expense = totalExpense; document.getElementById('dsCashSales').value = ''; denoms.forEach(d => { document.getElementById('dr_qty_' + d.val).value = ''; document.getElementById('dr_val_' + d.val).innerText = '0'; }); calcDrawer(); document.getElementById('drawerModal').style.display = 'flex'; }
        function closeDrawerModal() { document.getElementById('drawerModal').style.display = 'none'; }

        function calcDrawer() {
            let actualCash = 0;
            denoms.forEach(d => { let qty = parseInt(document.getElementById('dr_qty_' + d.val).value) || 0; let val = qty * d.val; document.getElementById('dr_val_' + d.val).innerText = val.toLocaleString('en-US'); actualCash += val; });
            document.getElementById('dsActual').innerText = actualCash.toLocaleString('en-US');
            let totalExpense = parseFloat(document.getElementById('drawerModal').dataset.expense) || 0;
            let cashSales = parseFloat(document.getElementById('dsCashSales').value) || 0;
            let expectedCash = STARTING_FLOAT + cashSales - totalExpense;
            document.getElementById('dsExpected').innerText = expectedCash.toLocaleString('en-US');
            let diff = actualCash - expectedCash;
            let diffBox = document.getElementById('dsDiffBox');
            let btn = document.getElementById('btnDrSubmit');
            if (actualCash === 0 && cashSales === 0) { diffBox.className = 'ds-diff status-short'; diffBox.innerText = 'รอการนับเงิน...'; btn.disabled = true; }
            else { btn.disabled = false; if (diff === 0) { diffBox.className = 'ds-diff status-ok'; diffBox.innerHTML = '✅ ยอดเงินตรงเป๊ะ (Match)'; } else if (diff > 0) { diffBox.className = 'ds-diff status-over'; diffBox.innerHTML = '🟡 เงินเกิน: +' + diff.toLocaleString('en-US') + ' บาท'; } else { diffBox.className = 'ds-diff status-short'; diffBox.innerHTML = '🔴 เงินขาด: ' + diff.toLocaleString('en-US') + ' บาท'; } }
        }

        function clearPrintClasses() { document.body.classList.remove('printing-drawer', 'printing-exchange', 'print-summary-only', 'printing-recon'); }
        function printMain() { clearPrintClasses(); heroPrint(); }

        function executePrintDrawer() {
            clearPrintClasses();
            const now = new Date();
            document.getElementById('slipDrDate').innerText = document.getElementById('headDate').innerText;
            document.getElementById('slipDrTime').innerText = now.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'});
            document.getElementById('slipDrCashier').innerText = document.getElementById('headCashier').value || 'ไม่ระบุชื่อ';
            let tbody = '';
            denoms.forEach(d => { let qty = parseInt(document.getElementById('dr_qty_' + d.val).value) || 0; if(qty > 0) tbody += '<tr><td>' + d.label + '</td><td>' + qty + '</td><td>' + (qty * d.val).toLocaleString('en-US') + '</td></tr>'; });
            document.getElementById('slipDrBody').innerHTML = tbody;
            let cashSales = parseFloat(document.getElementById('dsCashSales').value) || 0;
            document.getElementById('slipDrSales').innerText = cashSales.toLocaleString('en-US');
            document.getElementById('slipDrExpense').innerText = document.getElementById('dsExpense').innerText;
            document.getElementById('slipDrExpected').innerText = document.getElementById('dsExpected').innerText;
            document.getElementById('slipDrActual').innerText = document.getElementById('dsActual').innerText;
            document.getElementById('slipDrDiff').innerText = document.getElementById('dsDiffBox').innerText.replace(/[✅🟡🔴]/g, '').trim();
            document.body.classList.add('printing-drawer');
            closeDrawerModal();
            heroPrint();
        }

        function initExchangeTable() { document.getElementById('exchangeTableBody').innerHTML = denoms.filter(d=>d.val<1000).map(d => '<tr><td>' + d.exLabel + '</td><td style="text-align:right;"><input type="number" id="ex_' + d.val + '" class="num-input" style="width: 100px; text-align:right;" placeholder="0" oninput="calcExchange()"></td></tr>').join(''); }
        function openExchangeModal() { denoms.filter(d=>d.val<1000).forEach(d => document.getElementById('ex_' + d.val).value = ''); calcExchange(); document.getElementById('exchangeModal').style.display = 'flex'; }
        function closeExchangeModal() { document.getElementById('exchangeModal').style.display = 'none'; }
        function calcExchange() { let total = 0; denoms.filter(d=>d.val<1000).forEach(d => { total += parseFloat(document.getElementById('ex_' + d.val).value) || 0; }); document.getElementById('exTotalTxt').innerText = total.toLocaleString('en-US'); document.getElementById('btnExSubmit').disabled = (total <= 0); }

        function executePrintExchange() {
            clearPrintClasses();
            const now = new Date();
            document.getElementById('slipExDate').innerText = document.getElementById('headDate').innerText;
            document.getElementById('slipExTime').innerText = now.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'});
            document.getElementById('slipExCashier').innerText = document.getElementById('headCashier').value || 'ไม่ระบุชื่อ';
            let tbody = ''; let totalAmount = 0;
            denoms.filter(d=>d.val<1000).forEach(d => { let val = parseFloat(document.getElementById('ex_' + d.val).value) || 0; if(val > 0) { tbody += '<tr><td>' + d.exLabel + '</td><td style="text-align:right;">' + val.toLocaleString('en-US') + '</td></tr>'; totalAmount += val; } });
            document.getElementById('slipExBody').innerHTML = tbody;
            document.getElementById('slipExTotalVal').innerText = totalAmount.toLocaleString('en-US');
            document.body.classList.add('printing-exchange');
            closeExchangeModal();
            heroPrint();
        }

        function exportToExcel() {
            if(records.length === 0) { alert('⚠️ ไม่มีข้อมูลสำหรับ Export'); return; }
            let t = 0, w = 0, tp = 0, e = 0;
            records.forEach(r => { let amt = Math.round((parseFloat(r.amount) || 0) * 100); if(r.type === 'transfer') t += amt; else if(r.type === 'welfare') w += amt; else if(r.type === 'thaiplus') tp += amt; else e += amt; });
            let dateStr = document.getElementById('headDate').innerText, cashier = document.getElementById('headCashier').value || 'ไม่ระบุชื่อ';
            let html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><style>table{border-collapse:collapse;}th{background:#eee;border:1px solid #000;}td{border:1px solid #ccc;padding:5px;}.bg-g{background:#d1fae5;}.bg-b{background:#e0f2fe;}.bg-tp{background:#E4F4EC;}.bg-r{background:#fee2e2;}</style></head><body><h3>รายงานยอดขาย ' + dateStr + ' (แคชเชียร์: ' + escapeHTML(cashier) + ')</h3><table><thead><tr><th>เวลา</th><th>ประเภท</th><th>รายการ</th><th>ยอดเงิน</th></tr></thead><tbody>';
            records.forEach(rec => { let bg = rec.type === 'transfer' ? 'bg-g' : (rec.type === 'welfare' ? 'bg-b' : (rec.type === 'thaiplus' ? 'bg-tp' : 'bg-r')); let typeText = rec.type === 'thaiplus' ? 'ไทยพลัส' : rec.type; html += '<tr><td class="' + bg + '">' + rec.time + '</td><td class="' + bg + '">' + typeText + '</td><td class="' + bg + '">' + escapeHTML(rec.name) + '</td><td class="' + bg + '" style="text-align:right;">' + (parseFloat(rec.amount) || 0).toLocaleString('en-US') + '</td></tr>'; });
            html += '</tbody></table><br><table border="1"><tr><td>โอน:</td><td>' + (t/100).toLocaleString('en-US') + '</td></tr><tr><td>บัตร:</td><td>' + (w/100).toLocaleString('en-US') + '</td></tr><tr><td>ไทยพลัส:</td><td>' + (tp/100).toLocaleString('en-US') + '</td></tr><tr><td>ค่าใช้จ่าย:</td><td>' + (e/100).toLocaleString('en-US') + '</td></tr><tr><td>สุทธิ:</td><td>' + ((t+w+tp)/100).toLocaleString('en-US') + '</td></tr></table></body></html>';
            const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'POS_Report_' + dateStr.replace(/\//g, '-') + '.xls';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }

        // ==========================================
        // ส่วนที่ 9: กระทบยอดเงินดิจิทัล (Reconciliation)
        // ==========================================
        // [FIX #12] ค่าที่กรอกในช่องกระทบยอด (รวมถึงยอดที่มือถือเติมให้อัตโนมัติผ่าน relay)
        // ไม่เคยถูกบันทึกไว้ที่ไหนเลย พอปิด/เปิด Modal ใหม่ค่าที่เคยเติมไว้เลยหายหมด
        // → บันทึกลง localStorage ทุกครั้งที่มีการคำนวณ แล้วโหลดกลับมาตอนเปิด Modal (เฉพาะวันเดียวกัน)
        function saveReconInputs() {
            localStorage.setItem('posUltimateRecon', JSON.stringify({
                date: new Date().toLocaleDateString('th-TH'),
                pos2: document.getElementById('reconPos2').value,
                bank1: document.getElementById('reconBank1').value,
                bank2: document.getElementById('reconBank2').value,
                paotang: document.getElementById('reconPaotang').value
            }));
        }
        function loadReconInputs() {
            try {
                const data = JSON.parse(localStorage.getItem('posUltimateRecon'));
                if (data && data.date === new Date().toLocaleDateString('th-TH')) return data;
            } catch(e) {}
            return null;
        }

        function openReconModal() {
            let t = 0;
            records.forEach(r => { if(r.type === 'transfer') { t += Math.round((parseFloat(r.amount) || 0) * 100); } });
            let currentPosTransfer = t / 100;
            document.getElementById('reconPos1Transfer').value = currentPosTransfer > 0 ? currentPosTransfer : '';
            const saved = loadReconInputs();
            document.getElementById('reconPos2').value = saved ? saved.pos2 : '';
            document.getElementById('reconBank1').value = saved ? saved.bank1 : '';
            document.getElementById('reconBank2').value = saved ? saved.bank2 : '';
            document.getElementById('reconPaotang').value = saved ? saved.paotang : '';
            calcRecon();
            document.getElementById('reconModal').style.display = 'flex';
        }
        function closeReconModal() { document.getElementById('reconModal').style.display = 'none'; }

        function calcRecon() {
            saveReconInputs();
            let p1 = parseFloat(document.getElementById('reconPos1Transfer').value) || 0;
            let p2 = parseFloat(document.getElementById('reconPos2').value) || 0;
            let totalPos = p1 + p2;
            document.getElementById('reconPosTotal').innerText = totalPos.toLocaleString('en-US');
            let b1 = parseFloat(document.getElementById('reconBank1').value) || 0;
            let b2 = parseFloat(document.getElementById('reconBank2').value) || 0;
            let pt = parseFloat(document.getElementById('reconPaotang').value) || 0;
            let totalBank = b1 + b2 + pt;
            document.getElementById('reconBankTotal').innerText = totalBank.toLocaleString('en-US');
            let diff = totalBank - totalPos;
            let diffBox = document.getElementById('reconDiffBox');
            let btn = document.getElementById('btnReconSubmit');
            if (totalPos === 0 && totalBank === 0) { diffBox.className = 'ds-diff status-short'; diffBox.innerText = 'รอป้อนข้อมูล...'; btn.disabled = true; }
            else { btn.disabled = false; if (diff === 0) { diffBox.className = 'ds-diff status-ok'; diffBox.innerHTML = '✅ ยอดเงินเข้าบัญชี <b>ตรงเป๊ะ</b> (Match)'; } else if (diff > 0) { diffBox.className = 'ds-diff status-over'; diffBox.innerHTML = '🟡 เงินเข้าเกิน: เข้าบัญชีมากกว่า POS <b>+' + diff.toLocaleString('en-US') + '</b> บาท'; } else { diffBox.className = 'ds-diff status-short'; diffBox.innerHTML = '🔴 เงินเข้าขาด: เข้าบัญชีน้อยกว่า POS <b>' + diff.toLocaleString('en-US') + '</b> บาท'; } }
        }

        function executePrintRecon() {
            clearPrintClasses();
            const now = new Date();
            document.getElementById('slipRcDate').innerText = document.getElementById('headDate').innerText;
            document.getElementById('slipRcTime').innerText = now.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'});
            document.getElementById('slipRcCashier').innerText = document.getElementById('headCashier').value || 'ไม่ระบุชื่อ';
            document.getElementById('slipRcPos1Transfer').innerText = (parseFloat(document.getElementById('reconPos1Transfer').value) || 0).toLocaleString('en-US');
            document.getElementById('slipRcPos2').innerText = (parseFloat(document.getElementById('reconPos2').value) || 0).toLocaleString('en-US');
            document.getElementById('slipRcPosTotal').innerText = document.getElementById('reconPosTotal').innerText;
            document.getElementById('slipRcBank1').innerText = (parseFloat(document.getElementById('reconBank1').value) || 0).toLocaleString('en-US');
            document.getElementById('slipRcBank2').innerText = (parseFloat(document.getElementById('reconBank2').value) || 0).toLocaleString('en-US');
            document.getElementById('slipRcPaotang').innerText = (parseFloat(document.getElementById('reconPaotang').value) || 0).toLocaleString('en-US');
            document.getElementById('slipRcBankTotal').innerText = document.getElementById('reconBankTotal').innerText;
            document.getElementById('slipRcDiff').innerText = document.getElementById('reconDiffBox').innerText.replace(/[✅🟡🔴]/g, '').trim();
            document.body.classList.add('printing-recon');
            closeReconModal();
            heroPrint();
        }

        function printSummaryOnly() {
            clearPrintClasses();
            const now = new Date();
            document.getElementById('slipSumDate').innerText = document.getElementById('headDate').innerText;
            document.getElementById('slipSumTime').innerText = now.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'});
            document.getElementById('slipSumPos').innerText = document.getElementById('headPos').value || '01';
            document.getElementById('slipSumCashier').innerText = document.getElementById('headCashier').value || 'ไม่ระบุชื่อ';
            document.getElementById('slipSumCount').innerText = records.length;
            document.getElementById('slipSumTransfer').innerText = document.getElementById('sumTransfer').innerText;
            document.getElementById('slipSumWelfare').innerText = document.getElementById('sumWelfare').innerText;
            document.getElementById('slipSumThaiplus').innerText = document.getElementById('sumThaiPlus').innerText;
            document.getElementById('slipSumNet').innerText = document.getElementById('sumNet').innerText;
            document.getElementById('slipSumExpense').innerText = document.getElementById('sumExpense').innerText;
            document.body.classList.add('print-summary-only');
            heroPrint();
        }

        window.addEventListener('afterprint', function() { clearPrintClasses(); });

        // ==========================================
        // ส่วนที่ 10: คำนวณ 60:40 ไทยพลัส
        // ==========================================
        var currentMode60 = 'price';
        function open6040Modal() {
            document.getElementById('calc6040Modal').style.display = 'flex';
            document.getElementById('c60Price').value = '';
            document.getElementById('c60Used').value = '';
            document.getElementById('c60Remaining').value = '';
            document.getElementById('c60Wallet').value = '';
            document.getElementById('c60WantPrice').value = '';
            document.getElementById('c60HavePrice').value = '';
            document.getElementById('c60TopupAmt').textContent = '0.00 ฿';
            document.getElementById('c60TopupSub').textContent = 'กรอกเงินตัวเองในกระเป๋าตังก่อน';
            setMode60('price');
            calc60();
            setTimeout(function(){ document.getElementById('c60Price').focus(); }, 150);
        }
        function close6040Modal() { document.getElementById('calc6040Modal').style.display = 'none'; }
        function toggleEg60() { var head = document.getElementById('eg60Head'), body = document.getElementById('eg60Body'); head.classList.toggle('open'); body.classList.toggle('open'); }
        function setRemaining60(val) { document.getElementById('c60Remaining').value = val; document.getElementById('c60Used').value = 200 - val; recalc60(); }
        function setUsed60(val) { document.getElementById('c60Used').value = val; document.getElementById('c60Remaining').value = 200 - val; recalc60(); }
        function setWallet60(val) { document.getElementById('c60Wallet').value = val; recalc60(); }
        function fmt60(n) { return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
        function setMode60(mode) {
            currentMode60 = mode;
            document.getElementById('m60-price').classList.toggle('active', mode === 'price');
            document.getElementById('m60-money').classList.toggle('active', mode === 'money');
            document.getElementById('m60-topup').classList.toggle('active', mode === 'topup');
            document.getElementById('m60-exact').classList.toggle('active', mode === 'exact');
            document.querySelectorAll('.mode60-field').forEach(function(el) { el.classList.toggle('show', el.getAttribute('data-field') === mode); });
            var oldPanel = document.querySelector('#calc6040Modal .calc-result-panel');
            if (oldPanel) oldPanel.style.display = (mode === 'price') ? 'block' : 'none';
            var btn = document.getElementById('btnSave6040');
            btn.style.display = (mode === 'price') ? 'block' : 'none';
            recalc60();
            setTimeout(function() {
                var focusId = mode === 'price' ? 'c60Price' : mode === 'money' ? 'c60Wallet' : mode === 'topup' ? 'c60WantPrice' : 'c60Remaining';
                var el = document.getElementById(focusId); if (el) el.focus();
            }, 100);
        }
        function recalc60() {
            var remaining = parseFloat(document.getElementById('c60Remaining').value);
            if (!isNaN(remaining) && remaining >= 0 && remaining <= 200) { document.getElementById('c60Used').value = 200 - remaining; }
            if (currentMode60 === 'price') calc60(); else if (currentMode60 === 'money') calcMoney60(); else if (currentMode60 === 'topup') calcTopup60(); else if (currentMode60 === 'exact') calcExact60();
            updateQuotaBar60();
        }
        function updateQuotaBar60() {
            var used = Math.max(0, Math.min(200, parseFloat(document.getElementById('c60Used').value) || 0));
            var remaining = 200 - used;
            var pct = Math.min(100, (used / 200) * 100);
            document.getElementById('c60Bar').style.width = pct + '%';
            document.getElementById('c60Bar').className = 'bar-fill-sm' + (remaining <= 0 ? ' empty' : remaining <= 60 ? ' low' : '');
            document.getElementById('c60UsedLbl').textContent = fmt60(used);
            var remLbl = document.getElementById('c60RemLbl');
            if (remaining <= 0) { remLbl.textContent = 'หมดสิทธิวันนี้'; remLbl.className = 'qrem empty'; }
            else { remLbl.textContent = 'สิทธิคงเหลือ ' + fmt60(remaining) + ' ฿'; remLbl.className = 'qrem' + (remaining <= 60 ? ' low' : ''); }
        }
        function calcMoney60() {
            var W = Math.max(0, parseFloat(document.getElementById('c60Wallet').value) || 0);
            var used = Math.max(0, Math.min(200, parseFloat(document.getElementById('c60Used').value) || 0));
            var Q = 200 - used;
            var alertBox = document.getElementById('c60Alert'), alertMsg = document.getElementById('c60AlertMsg'), alertIcon = document.getElementById('c60AlertIcon');
            if (W <= 0) { document.getElementById('c60MaxBuy').textContent = '0.00 ฿'; document.getElementById('c60MoneySub').textContent = 'กรอกเงินตัวเองในกระเป๋าตังก่อน'; document.getElementById('c60TopupAmt').textContent = '0.00 ฿'; document.getElementById('c60TopupSub').textContent = 'กรอกเงินตัวเองในกระเป๋าตังก่อน'; alertBox.className = 'alert60'; return; }
            var needToCap = (0.6 / 0.4) * W;
            if (needToCap <= Q) { var Pmax = W + needToCap; var govUsed = needToCap; }
            else { var Pmax = W + Q; var govUsed = Q; }
            document.getElementById('c60MaxBuy').textContent = fmt60(Pmax) + ' ฿';
            document.getElementById('c60MoneySub').textContent = 'เงินตัวเอง ' + fmt60(W) + ' + รัฐช่วย ' + fmt60(govUsed) + ' = ของได้สูงสุด ' + fmt60(Pmax) + ' บาท';
            document.getElementById('c60TopupAmt').textContent = fmt60(Pmax - W) + ' ฿';
            document.getElementById('c60TopupSub').textContent = 'ยอดที่ต้องเติม พช = ของที่ซื้อได้สูงสุด - เงินตัวเอง';
            if (Pmax <= 200) { alertBox.className = 'alert60 ok show'; alertIcon.textContent = '✅'; alertMsg.textContent = 'ยังอยู่ในสิทธิ 200 บาท/วัน ไม่มีปัญหา'; }
            else if (govUsed >= Q) { alertBox.className = 'alert60 warn show'; alertIcon.textContent = '⚠️'; alertMsg.textContent = 'สิทธิตันแล้ว! ใช้สิทธิครบ ' + fmt60(used + govUsed) + ' บาท จากวงเงิน 200 บาท'; }
            else { alertBox.className = 'alert60'; }
        }
        function calcTopup60() {
            var wantPrice = Math.max(0, parseFloat(document.getElementById('c60WantPrice').value) || 0);
            var havePrice = Math.max(0, parseFloat(document.getElementById('c60HavePrice').value) || 0);
            var used = Math.max(0, Math.min(200, parseFloat(document.getElementById('c60Used').value) || 0));
            var Q = 200 - used;
            var alertBox = document.getElementById('c60Alert'), alertMsg = document.getElementById('c60AlertMsg'), alertIcon = document.getElementById('c60AlertIcon');
            if (wantPrice <= 0) { document.getElementById('c60TopupAmt2').textContent = '0.00 ฿'; document.getElementById('c60TopupSub2').textContent = 'กรอกราคาสินค้าก่อน'; alertBox.className = 'alert60'; return; }
            var govHelp = Math.min(wantPrice * 0.6, Q);
            var custPay = wantPrice - govHelp;
            var topupNeed = Math.max(0, custPay - havePrice);
            document.getElementById('c60TopupAmt2').textContent = fmt60(topupNeed) + ' ฿';
            document.getElementById('c60TopupSub2').textContent = 'ราคา ' + fmt60(wantPrice) + ' - รัฐช่วย ' + fmt60(govHelp) + ' - มีอยู่แล้ว ' + fmt60(havePrice) + ' = ต้องเติมอีก ' + fmt60(topupNeed) + ' บาท';
            if (topupNeed <= 0) { alertBox.className = 'alert60 ok show'; alertIcon.textContent = '✅'; alertMsg.textContent = 'ไม่ต้องเติมเพิ่ม! เงินที่มีพอจ่ายแล้ว'; }
            else if (govHelp >= Q) { alertBox.className = 'alert60 warn show'; alertIcon.textContent = '⚠️'; alertMsg.textContent = 'สิทธิตันแล้ว รัฐช่วยได้แค่ ' + fmt60(govHelp) + ' บาท'; }
            else { alertBox.className = 'alert60'; }
        }
        // โหมด "ใช้สิทธิพอดี" — ลูกค้าเติมเงินเป๋าตังไว้เยอะแต่ไม่อยากใช้ อยากรู้ราคาสินค้า
        // ขั้นต่ำที่ดึงสิทธิรัฐที่เหลือ (Q) ออกมาใช้ให้หมดพอดี โดยจ่ายผ่านเป๋าตังน้อยที่สุด
        // เท่าที่เป็นไปได้ (govHelp ถูกตรึงที่ Q ทันทีที่ price >= Q/0.6 จุดนั้นคือราคาขั้นต่ำ)
        function calcExact60() {
            var used = Math.max(0, Math.min(200, parseFloat(document.getElementById('c60Used').value) || 0));
            var Q = 200 - used;
            var alertBox = document.getElementById('c60Alert'), alertMsg = document.getElementById('c60AlertMsg'), alertIcon = document.getElementById('c60AlertIcon');
            if (Q <= 0) {
                document.getElementById('c60ExactPrice').textContent = '0.00 ฿';
                document.getElementById('c60ExactSub').textContent = 'สิทธิวันนี้หมดแล้ว ไม่ต้องผ่านระบบนี้ จ่ายด้วยเงินสด/โอนปกติได้เลย';
                alertBox.className = 'alert60';
                return;
            }
            var custMin = Q * (0.4 / 0.6);
            var priceMin = Q + custMin;
            document.getElementById('c60ExactPrice').textContent = fmt60(priceMin) + ' ฿';
            document.getElementById('c60ExactSub').textContent = 'รัฐช่วย ' + fmt60(Q) + ' + จ่ายเอง (พช) ขั้นต่ำ ' + fmt60(custMin) + ' = ราคาขั้นต่ำ ' + fmt60(priceMin) + ' บาท';
            alertBox.className = 'alert60 ok show';
            alertIcon.textContent = '🎯';
            alertMsg.textContent = 'เลือกของราคา ' + fmt60(priceMin) + ' บาทขึ้นไป แล้วกด "ใช้ราคานี้" ด้านล่าง จะดึงสิทธิที่เหลือออกมาใช้หมดพอดี จ่ายผ่านเป๋าตังแค่ ' + fmt60(custMin) + ' บาท — ถ้าอยากได้ของแพงกว่านี้ ส่วนเกินจ่ายแยกด้วยเงินสด/โอนปกติได้เลย ไม่ต้องผ่านเป๋าตังเพิ่ม';
        }
        function useExactPrice60() {
            var used = Math.max(0, Math.min(200, parseFloat(document.getElementById('c60Used').value) || 0));
            var Q = 200 - used;
            if (Q <= 0) return;
            var priceMin = Q + Q * (0.4 / 0.6);
            setMode60('price');
            document.getElementById('c60Price').value = priceMin.toFixed(2);
            calc60();
        }
        function calc60() {
            var price = parseFloat(document.getElementById('c60Price').value) || 0;
            var used = Math.max(0, Math.min(200, parseFloat(document.getElementById('c60Used').value) || 0));
            var Q = 200 - used;
            var govHelp = Math.min(price * 0.6, Q);
            var custPay = price - govHelp;
            var remainingAfter = Q - govHelp;
            document.getElementById('c60CustPay').textContent = fmt60(custPay) + ' ฿';
            document.getElementById('c60RemAfter').textContent = fmt60(remainingAfter) + ' ฿';
            document.getElementById('c60RPrice').textContent = fmt60(price) + ' ฿';
            document.getElementById('c60RGov').textContent = fmt60(govHelp) + ' ฿';
            document.getElementById('c60RCust').textContent = fmt60(custPay) + ' ฿';
            document.getElementById('c60GovNote').textContent = govHelp < price * 0.6 ? '(สิทธิตัน) เหลือ ' + fmt60(remainingAfter) + ' บาท' : '';
            document.getElementById('c60TopupPanel').textContent = fmt60(custPay) + ' ฿';
            var btn = document.getElementById('btnSave6040');
            if (btn) btn.disabled = (price <= 0);
            var formulaBox = document.getElementById('c60Formula');
            if (formulaBox) { if (price > 0) { formulaBox.className = 'formula60 show'; } else { formulaBox.className = 'formula60'; } }
            var alertBox = document.getElementById('c60Alert'), alertMsg = document.getElementById('c60AlertMsg'), alertIcon = document.getElementById('c60AlertIcon');
            if (price <= 0) { alertBox.className = 'alert60'; return; }
            if (govHelp >= Q) { alertBox.className = 'alert60 warn show'; alertIcon.textContent = '⚠️'; alertMsg.textContent = 'สิทธิตันแล้ว! รัฐช่วยได้แค่ ' + fmt60(govHelp) + ' บาท จากวงเงิน 200 บาท (ใช้ไป ' + fmt60(used) + ' บาทแล้ว)'; }
            else { alertBox.className = 'alert60'; }
        }
        function apply6040ToPOS() {
            var price = parseFloat(document.getElementById('c60Price').value) || 0;
            if (price <= 0) { alert('⚠️ กรุณากรอกราคาสินค้าก่อน'); return; }
            var used = Math.max(0, Math.min(200, parseFloat(document.getElementById('c60Used').value) || 0));
            var Q = 200 - used;
            var govHelp = Math.min(price * 0.6, Q);
            var custPay = price - govHelp;
            records.push({ time: new Date().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}), type: 'thaiplus', name: 'ลูกค้า (ไทยพลัส)', amount: price, isEdited: false });
            localStorage.setItem('posUltimateRecords', JSON.stringify(records));
            localStorage.setItem('posUltimateDate', new Date().toLocaleDateString('th-TH'));
            document.getElementById('c60Used').value = used + govHelp;
            document.getElementById('c60Remaining').value = 200 - (used + govHelp);
            renderTable();
            if (typeof celebrateTransaction === 'function') celebrateTransaction(price, { moneyIn: false });
            close6040Modal();
        }

        // ==========================================
        // ส่วนที่ 11: 📱 มือถือดักแจ้งเตือน (LAN Relay) — แทนที่ Pushbullet
        // ==========================================
        // android-app/ (โปรเจกต์แยก คนละ repo — ดู README ของมันเอง) พาร์สแจ้งเตือนธนาคาร/วอลเล็ต
        // บนตัวมือถือเอง แล้ว POST เฉพาะ payment event ที่เป็นโครงสร้างชัดเจน (amount/source/เวลา —
        // ไม่มีข้อความแจ้งเตือนดิบ ไม่มีชื่อผู้โอน) มาที่ relay server ที่ embed อยู่ใน main.js ของ
        // แอปนี้เอง (ดู main.js's startRelayServer()) จากนั้น main process ส่งต่อมาที่นี่ผ่าน IPC —
        // ไม่มี WebSocket ให้ต่อ/reconnect อีกต่อไป ฝั่งนี้แค่ "รับฟัง" event ที่ validate มาแล้ว

        // dedup ฝั่ง client เป็นเกราะสำรอง (server ฝั่ง main.js dedupe ด้วย event_id เป็นหลักอยู่แล้ว)
        var _seenPaymentEventIds = (function() {
            try { return JSON.parse(localStorage.getItem('seenPaymentEventIds')) || []; } catch(e) { return []; }
        })();
        function isPaymentEventProcessed(eventId) { return !!eventId && _seenPaymentEventIds.indexOf(eventId) > -1; }
        function markPaymentEventProcessed(eventId) {
            if (!eventId) return;
            _seenPaymentEventIds.push(eventId);
            if (_seenPaymentEventIds.length > 500) _seenPaymentEventIds = _seenPaymentEventIds.slice(-500);
            localStorage.setItem('seenPaymentEventIds', JSON.stringify(_seenPaymentEventIds));
        }

        function setPbStatus(html, cls) {
            const el = document.getElementById('pbStatus');
            if (el) {
                el.innerHTML = html;
                el.className = 'pb-status ' + (cls || '');
            }
            // Glanceable LED echoing the same state — one in the full titlebar,
            // one in the mini HUD — so the connection can be read without
            // opening the reconciliation modal that #pbStatus lives in.
            const plainText = html.replace(/<[^>]*>/g, '');
            const led = document.getElementById('pbLed');
            if (led) { led.className = 'pb-led ' + (cls || ''); led.title = 'มือถือ: ' + plainText; }
            const miniLed = document.getElementById('miniPbLed');
            if (miniLed) { miniLed.className = 'mini-pb-led ' + (cls || ''); miniLed.title = 'มือถือ: ' + plainText; }
        }

        function pbLog(msg, type) {
            const box = document.getElementById('pbLog');
            if (!box) return;
            const now = new Date().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
            const div = document.createElement('div');
            div.className = type ? 'pb-' + type : 'pb-i';
            div.innerHTML = '<span style="color:#bbb;">[' + now + ']</span> ' + msg;
            if (box.children.length === 1 && box.children[0].textContent.indexOf('รอการ') > -1) box.innerHTML = '';
            box.insertBefore(div, box.firstChild);
            if (box.children.length > 30) box.removeChild(box.lastChild);
        }

        // ==========================================
        // ⚙️ CONFIG: ปรับแต่ง mapping แหล่งที่มา → ประเภท POS (ไม่เกี่ยวกับ Pushbullet — คงเดิมทั้งหมด)
        // ==========================================
        function savePbConfig() {
            const cfg = {
                bank:     document.getElementById('pbMapBank')     ? document.getElementById('pbMapBank').value     : 'transfer',
                paotang:  document.getElementById('pbMapPaotang')  ? document.getElementById('pbMapPaotang').value  : 'thaiplus',
                maemanee: document.getElementById('pbMapMaemanee') ? document.getElementById('pbMapMaemanee').value : 'transfer',
                fallback: document.getElementById('pbMapFallback') ? document.getElementById('pbMapFallback').value : 'transfer',
                reconBank:     document.getElementById('pbReconBank')     ? document.getElementById('pbReconBank').checked     : true,
                reconPaotang:  document.getElementById('pbReconPaotang')  ? document.getElementById('pbReconPaotang').checked  : false,
                reconMaemanee: document.getElementById('pbReconMaemanee') ? document.getElementById('pbReconMaemanee').checked : false,
                reconFallback: document.getElementById('pbReconFallback') ? document.getElementById('pbReconFallback').checked : true
            };
            localStorage.setItem('pbConfig', JSON.stringify(cfg));
        }

        function loadPbConfig() {
            try {
                const cfg = JSON.parse(localStorage.getItem('pbConfig'));
                if (!cfg) return;
                if (document.getElementById('pbMapBank')     && cfg.bank)     document.getElementById('pbMapBank').value     = cfg.bank;
                if (document.getElementById('pbMapPaotang')  && cfg.paotang)  document.getElementById('pbMapPaotang').value  = cfg.paotang;
                if (document.getElementById('pbMapMaemanee') && cfg.maemanee) document.getElementById('pbMapMaemanee').value = cfg.maemanee;
                if (document.getElementById('pbMapFallback') && cfg.fallback) document.getElementById('pbMapFallback').value = cfg.fallback;
                if (document.getElementById('pbReconBank')     && cfg.reconBank !== undefined)     document.getElementById('pbReconBank').checked     = cfg.reconBank;
                if (document.getElementById('pbReconPaotang')  && cfg.reconPaotang !== undefined)  document.getElementById('pbReconPaotang').checked  = cfg.reconPaotang;
                if (document.getElementById('pbReconMaemanee') && cfg.reconMaemanee !== undefined) document.getElementById('pbReconMaemanee').checked = cfg.reconMaemanee;
                if (document.getElementById('pbReconFallback') && cfg.reconFallback !== undefined) document.getElementById('pbReconFallback').checked = cfg.reconFallback;
            } catch(e) {}
        }

        function getPbConfig() {
            try { const saved = JSON.parse(localStorage.getItem('pbConfig')); if (saved) return saved; } catch(e) {}
            return { bank: 'transfer', paotang: 'thaiplus', maemanee: 'transfer', fallback: 'transfer', reconBank: true, reconPaotang: false, reconMaemanee: false, reconFallback: true };
        }

        document.addEventListener('DOMContentLoaded', function() {
            loadPbConfig();
            setPbStatus('⏸️ รอมือถือเชื่อมต่อครั้งแรก', '');
        });

        // แปลง source ที่มือถือส่งมา (ต้องตรงกับ android-app/parser-spec/patterns.json sources[])
        // ให้เป็นกลุ่ม/ป้ายชื่อที่ POS Hero ใช้อยู่แล้ว — bank1/bank2 คือสองบัญชีธนาคารจริงของร้าน
        // (แยกช่องกระทบยอด reconBank1/reconBank2 คนละช่อง) ไม่ใช่ "กลุ่มธนาคาร 1 vs 2" ทั่วไป
        var SOURCE_TO_GROUP = {
            scb: 'bank1', krungsri: 'bank1', ktb: 'bank1',
            kplus: 'bank2', bbl: 'bank2', ttb: 'bank2',
            paotang: 'paotang', truemoney: 'paotang', thungngern: 'paotang',
            maemanee: 'maemanee',
            unknown: 'fallback'
        };
        var SOURCE_LABELS = {
            scb: 'SCB', krungsri: 'กรุงศรี', ktb: 'กรุงไทย',
            kplus: 'K PLUS', bbl: 'กรุงเทพ', ttb: 'ttb',
            paotang: 'เป๋าตัง', truemoney: 'TrueMoney', thungngern: 'ถุงเงิน',
            maemanee: 'แม่มณี', unknown: 'ไม่ทราบแหล่งที่มา'
        };

        // ==========================================
        // injectPaymentEvent — บันทึกยอดเข้าตาราง POS + autofill ช่องกระทบยอด
        // (เดิมคือ pbInject) — android-app ตอนนี้ส่งชื่อผู้โอนมาด้วยแบบ best-effort (ไม่ใช่ทุกแหล่งที่มา
        // จะมี) ถ้ามี senderName ใช้ชื่อจริงในรายการ ถ้าไม่มีก็ fallback กลับไปเป็น "โอนผ่าน <แหล่งที่มา>"
        // เหมือนเดิม — ไม่ว่ากรณีไหน ค่าที่มาจากภายนอก (network) จะถูก escapeHTML ตอน render เสมอ (renderTable)
        // ==========================================
        function injectPaymentEvent(amount, group, sourceLabel, senderName) {
            var cfg = getPbConfig();
            var toTable = document.getElementById('pbToTable') ? document.getElementById('pbToTable').checked : true;

            var mapKey = (group === 'bank1' || group === 'bank2') ? 'bank' : group;
            var recType = cfg[mapKey] || 'transfer';
            var doRecon = cfg['recon' + mapKey.charAt(0).toUpperCase() + mapKey.slice(1)];
            if (doRecon === undefined) doRecon = true;

            var recordName = senderName ? ('โอนจาก ' + senderName) : ('โอนผ่าน ' + sourceLabel);

            // 1. ใส่เข้าตารางหลัก POS
            if (toTable) {
                var timeStr = new Date().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'});
                records.push({
                    time: timeStr,
                    type: recType,
                    name: recordName,
                    amount: amount,
                    isEdited: false
                });
                localStorage.setItem('posUltimateRecords', JSON.stringify(records));
                localStorage.setItem('posUltimateDate', new Date().toLocaleDateString('th-TH'));
                renderTable();
                pbLog('✅ บันทึก: +' + amount.toLocaleString('en-US') + ' ฿ (' + recordName + ')', 'm');
                if (window.heroWindow && window.heroWindow.notifyMoneyIn) {
                    window.heroWindow.notifyMoneyIn(amount, recordName, recType);
                }
                if (typeof celebrateTransaction === 'function') celebrateTransaction(amount, { moneyIn: true });
            }

            // 2. ใส่เข้าช่องกระทบยอด
            if (doRecon && document.getElementById('reconModal') && document.getElementById('reconModal').style.display === 'flex') {
                var fieldId = null;
                if (group === 'paotang') fieldId = 'reconPaotang';
                else if (group === 'bank1') fieldId = 'reconBank1';
                else if (group === 'bank2') fieldId = 'reconBank2';
                else if (group === 'maemanee') fieldId = 'reconBank1';
                else fieldId = 'reconBank1';

                var el = document.getElementById(fieldId);
                if (el) {
                    var oldVal = parseFloat(el.value) || 0;
                    var newVal = oldVal + amount;
                    el.value = newVal;
                    calcRecon();
                    el.style.background = '#dcfce7';
                    el.style.borderColor = '#16a34a';
                    setTimeout(function() { el.style.background = ''; el.style.borderColor = ''; }, 900);
                    pbLog('📱 กระทบยอด: +' + amount.toLocaleString('en-US') + ' ฿ → ' + fieldId, 'i');
                }
            }
        }

        // ==========================================
        // handlePaymentEvent — event ที่ main.js validate แล้วส่งเข้ามาผ่าน IPC (ดู preload.js
        // onPaymentEvent) รูปร่างคงที่เสมอ (v1/event_id/amount/currency/source/occurred_at/is_test)
        // ไม่ต้องเดา/พาร์สข้อความอีกต่อไป (ต่างจาก handlePbPush เดิม)
        // ==========================================
        function handlePaymentEvent(payload) {
            if (!payload || typeof payload.amount !== 'number') return;
            if (payload.event_id && isPaymentEventProcessed(payload.event_id)) {
                pbLog('⏭️ ข้าม (ประมวลผลแล้ว): ' + payload.event_id, 'i');
                return;
            }
            if (payload.event_id) markPaymentEventProcessed(payload.event_id);

            // รายการทดสอบ (จากปุ่ม "ทดสอบส่งรายการโอนจำลอง" ในแอปมือถือ) — แค่ยืนยันว่าเส้นทาง
            // มือถือ → server → ที่นี่ทำงานจริง ไม่บันทึกลงรายการขายจริง
            if (payload.is_test) {
                pbLog('🧪 ทดสอบสำเร็จ: +' + payload.amount.toLocaleString('en-US') + ' ฿ (ไม่บันทึกเข้าตารางจริง)', 'm');
                return;
            }

            var group = SOURCE_TO_GROUP[payload.source] || 'fallback';
            var label = SOURCE_LABELS[payload.source] || 'ไม่ทราบแหล่งที่มา';
            injectPaymentEvent(payload.amount, group, label, payload.sender_name);
        }

        if (window.heroWindow && window.heroWindow.onPaymentEvent) {
            window.heroWindow.onPaymentEvent(handlePaymentEvent);
        }

        // สถานะ "มือถือยังส่งสัญญาณอยู่ไหม" — main.js เป็นคนตัดสิน (นับจาก /ping และ /notify ที่ผ่าน
        // token ถูก, ดู main.js's watchdog) แล้วส่งมาทาง IPC ทีเดียว ไม่ต้องมี timer ฝั่งนี้อีกต่อไป
        if (window.heroWindow && window.heroWindow.onRelayStatus) {
            window.heroWindow.onRelayStatus(function(status) {
                if (!status) return;
                if (status.state === 'ok') setPbStatus('🟢 มือถือเชื่อมต่อปกติ', 'ok');
                else if (status.state === 'err') setPbStatus('🔴 ไม่ได้ยินจากมือถือ', 'err');
                else setPbStatus('⏸️ รอมือถือเชื่อมต่อครั้งแรก', '');
            });
        }

        // ปุ่ม "📶 ดูข้อมูลเชื่อมต่อ" ใน pb-box — เอา IP/Token ที่ main.js สุ่มไว้ให้ไปตั้งค่าในแอปมือถือ
        function showRelayInfo() {
            if (!window.heroWindow || !window.heroWindow.getRelayInfo) return;
            window.heroWindow.getRelayInfo().then(function(info) {
                if (!info) return;
                var ipText = info.ips && info.ips.length ? info.ips.join(' หรือ ') : 'ไม่พบ IP วง LAN (เช็ค WiFi)';
                alert('ตั้งค่าในแอป "POS Relay" บนมือถือ:\n\nServer: ' + ipText + ':' + info.port + '\nToken: ' + info.token);
            });
        }

        // ==========================================
        // Initialize App
        // ==========================================
        initDrawerTable();
        initExchangeTable();
        handleTypeChange();
        renderTable();

