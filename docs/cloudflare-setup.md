# ย้ายช่องทาง ☁️ จาก Firebase ไป Cloudflare

โค้ดฝั่ง Cloudflare อยู่ในโฟลเดอร์ [`cloudflare-inbox/`](../cloudflare-inbox) เป็น Worker เล็กๆ ที่รับคำสั่งแบบเดียวกับ Firebase ที่ POS Hero ใช้
จึง**ไม่ต้องอัปเดตแอป** แค่เปลี่ยน URL ในแอปและใน MacroDroid

- ฟรีในปริมาณของร้านเดียว (แผนฟรี 100,000 request ต่อวัน ส่วน heartbeat ใช้วันละประมาณ 290 ครั้ง)
- แต่ละ Inbox Key มีที่เก็บข้อมูลแยกกัน key ต้องยาวอย่างน้อย 32 ตัวเหมือนเดิม
- ลบแจ้งเตือนที่เก่ากว่า 3 วันเอง และรับได้สูงสุด 5,000 รายการต่อ key
- ไม่ต้องยุ่งกับกฎของ STOCK MASTER ใน Firebase อีก

---

## ขั้นที่ 1 — สมัครและ deploy (ทำครั้งเดียว บนคอมที่มีโค้ด)

1. สมัคร Cloudflare ฟรีที่ https://dash.cloudflare.com/sign-up
2. เปิด Terminal ที่โฟลเดอร์ `D:\Claude\pos-hero\cloudflare-inbox` แล้วรัน:
   ```
   npm install
   npx wrangler login
   npx wrangler deploy
   ```
   - `wrangler login` จะเปิดเบราว์เซอร์ให้กดอนุญาต
   - ครั้งแรกอาจถามให้ตั้งชื่อ subdomain ของ `workers.dev` ตั้งเป็นชื่อร้านได้
3. ท้ายผลลัพธ์จะมี URL แบบ `https://pos-hero-inbox.<ชื่อของคุณ>.workers.dev` จดเก็บไว้
4. ตรวจว่าทำงาน:
   ```
   set BASE=https://pos-hero-inbox.<ชื่อของคุณ>.workers.dev
   npm test
   ```
   ต้องขึ้น `all passed` (ชุดทดสอบใช้ key สุ่มของตัวเอง ไม่ปนกับข้อมูลร้าน)

## ขั้นที่ 2 — เปลี่ยนในแอป POS Hero

📱 กระทบยอดโอน → กล่อง 📥 → ช่อง **Database URL** ใส่ URL จากขั้นที่ 1 (ไม่มี `/` ท้าย)
Inbox Key ใช้ตัวเดิมได้ แอปจะต่อใหม่เอง ไฟ ☁️ ในกล่องต้องขึ้นว่าต่ออยู่

## ขั้นที่ 3 — เปลี่ยนใน MacroDroid (2 จุด)

แก้เฉพาะส่วนต้นของ URL จาก Firebase เป็น URL ของ Worker ส่วนท้ายเหมือนเดิมทุกตัวอักษร

| Macro | เดิม | ใหม่ |
|---|---|---|
| ส่งเงินเข้า POS (HTTP POST) | `https://xxxx.firebasedatabase.app/pos_hero_inbox/<key>/events.json` | `https://pos-hero-inbox.<ชื่อ>.workers.dev/pos_hero_inbox/<key>/events.json` |
| POS heartbeat (HTTP PUT) | `https://xxxx.firebasedatabase.app/pos_hero_inbox/<key>/heartbeat.json` | `https://pos-hero-inbox.<ชื่อ>.workers.dev/pos_hero_inbox/<key>/heartbeat.json` |

Body JSON และ UDP ไม่ต้องแก้

## ขั้นที่ 4 — ทดสอบแล้วค่อยเลิกใช้ Firebase

1. กด 🧪 โหมดทดสอบ แล้วส่งแจ้งเตือนที่ title ขึ้นต้น `TEST` หรือโอนเข้า 1 บาท ผลต้องขึ้นใต้ปุ่ม
2. ใช้ไปสัก 1–2 วัน ถ้าไฟเขียวและรายการเข้าครบ ค่อยลบก้อน `pos_hero_inbox` ออกจากกฎ Firebase (ไม่ลบก็ไม่เป็นไร)

## ดูข้อมูล / แก้ปัญหา

- ดู log สดของ Worker: `npx wrangler tail`
- หน้า Cloudflare dashboard → Workers & Pages → pos-hero-inbox → Metrics ดูจำนวน request และ error
- แก้โค้ดแล้ว deploy ซ้ำด้วย `npx wrangler deploy` ข้อมูลเดิมไม่หาย
