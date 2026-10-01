// Smoke test against a running worker (default: wrangler dev on http://127.0.0.1:8787).
//   BASE=https://pos-hero-inbox.<you>.workers.dev node test/smoke.js
const BASE = (process.env.BASE || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const KEY = 'SmokeTest' + Math.random().toString(36).slice(2).padEnd(30, 'x');
const root = `${BASE}/pos_hero_inbox/${KEY}`;
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || detail === undefined ? '' : '  → ' + JSON.stringify(detail))); };
const q = (o) => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function openSse(url) {
  const events = [];
  const ac = new AbortController();
  (async () => {
    try {
      const res = await fetch(url, { headers: { Accept: 'text/event-stream' }, signal: ac.signal });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) > -1) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = (block.match(/^event: (.*)$/m) || [])[1];
          const data = (block.match(/^data: (.*)$/m) || [])[1];
          events.push({ ev, data: data ? JSON.parse(data) : null });
        }
      }
    } catch (e) { /* aborted */ }
  })();
  return { events, close: () => ac.abort() };
}

(async () => {
  const post = (body) => fetch(root + '/events.json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const ev = (eventId, text) => ({ eventId, title: 'K PLUS', text, app: 'K PLUS', ts: { '.sv': 'timestamp' }, via: 'fb' });

  check('health', (await fetch(BASE + '/health')).ok);
  check('short key rejected', (await fetch(`${BASE}/pos_hero_inbox/short/events.json`)).status === 401);
  check('empty inbox is null', (await (await fetch(root + '/events.json')).json()) === null);

  const r1 = await (await post(ev('e1', 'เงินเข้า 150.00 บาท จาก นาย ก'))).json();
  check('POST returns push id', /^[-\w]{20}$/.test(r1.name), r1);
  const r1b = await (await post(ev('e1b', 'เงินเข้า 1 บาท'))).json();
  check('push ids sort by time', r1b.name > r1.name, [r1.name, r1b.name]);
  check('missing fields rejected', (await post({ title: 'x' })).status === 400);
  check('bad JSON rejected', (await fetch(root + '/events.json', { method: 'POST', body: '{"broken' })).status === 400);

  const all = await (await fetch(root + '/events.json?' + q({ orderBy: '"$key"', startAt: '"-"' }))).json();
  check('backfill returns stored events with server ts', all && all[r1.name] && typeof all[r1.name].ts === 'number' && all[r1.name].text.includes('นาย ก'), all);
  const after = await (await fetch(root + '/events.json?' + q({ orderBy: '"$key"', startAt: JSON.stringify(r1b.name) }))).json();
  check('startAt is inclusive and filters older', after && Object.keys(after).join() === r1b.name, after);

  const sse = openSse(root + '/events.json?' + q({ orderBy: '"$key"', startAt: JSON.stringify(r1b.name) }));
  await sleep(800);
  check('SSE initial put snapshot', sse.events[0] && sse.events[0].ev === 'put' && sse.events[0].data.path === '/' && sse.events[0].data.data[r1b.name], sse.events[0]);
  const r2 = await (await post(ev('e2', 'เงินเข้า 99.00 บาท จาก น.ส. ข'))).json();
  await sleep(800);
  const live = sse.events.find(e => e.data && e.data.path === '/' + r2.name);
  check('SSE live put for new event', live && live.data.data.eventId === 'e2', sse.events);

  const hbSse = openSse(root + '/heartbeat.json');
  await sleep(500);
  await fetch(root + '/heartbeat.json', { method: 'PUT', body: JSON.stringify({ ts: { '.sv': 'timestamp' }, battery: 77 }) });
  await sleep(800);
  const hb = hbSse.events.find(e => e.data && e.data.data && e.data.data.battery === 77);
  check('heartbeat PUT reaches SSE with server ts', hb && typeof hb.data.data.ts === 'number', hbSse.events);

  const old = await (await fetch(root + '/events.json?' + q({ orderBy: '"ts"', endAt: Date.now() + 1000 }))).json();
  check('orderBy ts endAt query', old && Object.keys(old).length === 3, old);
  check('PATCH non-null rejected', (await fetch(root + '/events.json', { method: 'PATCH', body: JSON.stringify({ [r1.name]: { text: 'x' } }) })).status === 400);
  await fetch(root + '/events.json', { method: 'PATCH', body: JSON.stringify({ [r1.name]: null }) });
  const left = await (await fetch(root + '/events.json')).json();
  check('PATCH null deletes', left && !left[r1.name] && left[r2.name], left);

  const other = await (await fetch(`${BASE}/pos_hero_inbox/${KEY.replace(/.$/, 'Q')}/events.json`)).json();
  check('different key sees nothing', other === null, other);

  sse.close(); hbSse.close();
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
