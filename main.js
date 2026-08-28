const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, Notification, powerMonitor } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

app.setAppUserModelId('com.xziramoon.poshero');

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

const WIN_WIDTH = 400;
const WIN_HEIGHT = 700;
const WIN_MIN_WIDTH = 340;
const WIN_MIN_HEIGHT = 480;
const MINI_WIDTH = 210;
const MINI_HEIGHT = 86;
const EDGE_MARGIN = 12;
// Must match the moment renderer/theme-hero.css's #modeShutter finishes closing
// (shutter-close keyframe) — the native setBounds() for entering mini mode is
// deliberately deferred until this shutter is fully opaque, so the resize jump
// is masked instead of visible. If you retime the CSS, retime this too.
const COLLAPSE_MS = 230;

let mainWindow = null;
let tray = null;
let isPinned = true;
let isQuitting = false;
let isMiniMode = false;
let lastFullBounds = null;
let isTransitioning = false;
let transitionToken = 0;

function getDockedPosition(width, height) {
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;
  const x = wa.x + wa.width - width - EDGE_MARGIN;
  const y = wa.y + wa.height - height - EDGE_MARGIN;
  return { x, y };
}

function createWindow() {
  const { x, y } = getDockedPosition(WIN_WIDTH, WIN_HEIGHT);

  mainWindow = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    minWidth: WIN_MIN_WIDTH,
    minHeight: WIN_MIN_HEIGHT,
    x,
    y,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    show: false,
    // Matches the amber theme's --hero-bg-1 (the default theme, renderer/theme-hero.css)
    // rather than an arbitrary purple — this is what briefly shows through on the
    // newly-exposed region during a window resize, so it needs to track whatever
    // theme is actually active (renderer pushes the real value via ui:bg-color once
    // it knows the saved theme; see enterMiniMode/exitMiniMode below).
    backgroundColor: '#120d09',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // This widget must keep its Pushbullet WebSocket alive and its
      // reconnect/health-check timers on schedule even while hidden in
      // the tray — Chromium's default background throttling would slow
      // both down and widen the window where an incoming transfer could
      // be missed.
      backgroundThrottling: false
    }
  });

  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function createTray() {
  const trayIconPath = path.join(__dirname, 'build', 'tray.png');
  let trayIcon = nativeImage.createFromPath(trayIconPath);
  if (!trayIcon.isEmpty()) {
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  }
  tray = new Tray(trayIcon);
  tray.setToolTip('POS Hero — แตะเพื่อเปิด/ปิด');
  refreshTrayMenu();

  tray.on('click', () => {
    toggleWindow();
  });
}

function refreshTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    { label: mainWindow && mainWindow.isVisible() ? '🫥 ซ่อนหน้าต่าง' : '👁️ แสดงหน้าต่าง', click: () => toggleWindow() },
    { label: '📌 ลอยอยู่บนสุดเสมอ', type: 'checkbox', checked: isPinned, click: (menuItem) => {
      isPinned = menuItem.checked;
      if (mainWindow) mainWindow.setAlwaysOnTop(isPinned, 'floating');
      mainWindow?.webContents.send('pin-state-changed', isPinned);
    } },
    { label: '↩️ กลับไปมุมจอ', click: () => dockToCorner() },
    { type: 'separator' },
    { label: '🔄 ตรวจสอบอัปเดต', click: () => {
      autoUpdater.checkForUpdates().catch(() => {});
    } },
    { type: 'separator' },
    { label: '❌ ออกจากโปรแกรม', click: () => {
      isQuitting = true;
      app.quit();
    } }
  ]);
  tray.setContextMenu(contextMenu);
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
  refreshTrayMenu();
}

function dockToCorner() {
  if (!mainWindow) return;
  const [w, h] = mainWindow.getSize();
  const { x, y } = getDockedPosition(w, h);
  mainWindow.setPosition(x, y);
  mainWindow.show();
  mainWindow.focus();
}

// "Mini mode" is the TBH-style tiny widget: instead of vanishing to the
// tray, minimizing shrinks the window down to a small always-on-top HUD
// docked in the corner (coin mascot + today's net total). All the app
// logic (records, Pushbullet socket) keeps running underneath — this is
// purely a window-bounds + renderer-CSS state, nothing is unloaded.
// Entering mini mode is staged in two IPC round-trips instead of one:
// 1) 'mode-transition' tells the renderer to start its shrink animation
//    (titlebar/paper/controls animate out, then a full-viewport shutter
//    closes over the content).
// 2) Only once that shutter is fully opaque — signalled by
//    'window:collapse-ready', or a COLLAPSE_MS watchdog if the renderer
//    never acks (reduced-motion, a wedged renderer, etc.) — do we actually
//    call setBounds(). Windows has no animated-resize API (BrowserWindow's
//    setBounds animate flag is macOS-only), so the real jump is hidden
//    behind the shutter rather than shown raw.
function commitEnterMini(token) {
  // isTransitioning is cleared by whichever of {renderer ack, watchdog} wins the
  // race, so the loser (same token, but isTransitioning already false) is a no-op
  // instead of double-committing setBounds()/mode-changed.
  if (token !== transitionToken || !mainWindow || !isTransitioning) return;
  mainWindow.setMinimumSize(MINI_WIDTH, MINI_HEIGHT);
  mainWindow.setResizable(false);
  const { x, y } = getDockedPosition(MINI_WIDTH, MINI_HEIGHT);
  mainWindow.setBounds({ x, y, width: MINI_WIDTH, height: MINI_HEIGHT });
  isMiniMode = true;
  isTransitioning = false;
  mainWindow.webContents.send('mode-changed', 'mini');
}

function enterMiniMode() {
  if (!mainWindow || isMiniMode || isTransitioning) return;
  lastFullBounds = mainWindow.getBounds();
  isTransitioning = true;
  const token = ++transitionToken;
  mainWindow.webContents.send('mode-transition', { to: 'mini' });
  setTimeout(() => commitEnterMini(token), COLLAPSE_MS + 40);
}

// Exiting mini mode has no shutter-timing dependency: the window is tiny
// today and the target (full) size is known up front, so the resize can
// happen immediately — the renderer then animates the full UI assembling
// back in on top of the newly-grown window.
function exitMiniMode() {
  if (!mainWindow || !isMiniMode || isTransitioning) return;
  isTransitioning = true;
  transitionToken++;
  mainWindow.setMinimumSize(WIN_MIN_WIDTH, WIN_MIN_HEIGHT);
  mainWindow.setResizable(true);
  if (lastFullBounds) {
    mainWindow.setBounds(lastFullBounds);
  } else {
    const { x, y } = getDockedPosition(WIN_WIDTH, WIN_HEIGHT);
    mainWindow.setBounds({ x, y, width: WIN_WIDTH, height: WIN_HEIGHT });
  }
  isMiniMode = false;
  mainWindow.webContents.send('mode-changed', 'full');
  mainWindow.show();
  mainWindow.focus();
  isTransitioning = false;
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Sleep/lock-screen is the most common way the Pushbullet socket dies
  // silently. Don't wait for the 10s health-check to notice — force a
  // reconnect the moment the machine is usable again.
  const forceReconnect = () => mainWindow?.webContents.send('force-reconnect-pushbullet');
  powerMonitor.on('resume', forceReconnect);
  powerMonitor.on('unlock-screen', forceReconnect);

  // Auto-update: only meaningful for an installed/packaged build — in dev
  // (npm start) electron-updater no-ops since there's no packaged app to
  // replace. Check once on launch, then every 4 hours while it keeps running
  // in the tray.
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
});

autoUpdater.on('update-downloaded', (info) => {
  if (!Notification.isSupported()) return;
  const notif = new Notification({
    title: '🔄 มีอัปเดตใหม่ (v' + info.version + ')',
    body: 'ดาวน์โหลดเสร็จแล้ว คลิกเพื่อรีสตาร์ทแล้วอัปเดตทันที (หรือปล่อยไว้ จะอัปเดตให้เองตอนปิดโปรแกรมครั้งถัดไป)',
    icon: path.join(__dirname, 'build', 'icon.ico')
  });
  notif.on('click', () => {
    isQuitting = true;
    autoUpdater.quitAndInstall();
  });
  notif.show();
});

autoUpdater.on('error', (err) => {
  console.error('[autoUpdater]', err == null ? 'unknown error' : (err.stack || err.message || err));
});

app.on('window-all-closed', () => {
  // Widget lives in the tray; do not quit when the window closes.
});

// Receipt printing: the native OS print dialog (window.print()'s default
// path) ignores the page's CSS @page size entirely and just uses whatever
// paper size is sitting in the driver/dialog — which is how a thermal
// receipt printer ends up printing a full A4-length sheet. Printing
// silently, with no dialog in the way, is what actually respects the
// CSS-declared 80mm page size (and is nicer for a cashier anyway — no
// dialog to click through on every receipt).
ipcMain.handle('print:silent', (_event, heightMicrons) => {
  return new Promise((resolve) => {
    if (!mainWindow) { resolve({ success: false, reason: 'no window' }); return; }
    // Electron's system-print path does NOT pick this up from the page's
    // CSS @page rule the way printToPDF's preferCSSPageSize does — it has
    // to be requested explicitly here, in microns. The renderer measures
    // the actual print content and sends its real height so the job is
    // sized to the content, not to the printer driver's nominal "up to
    // 3276mm" continuous-roll ceiling.
    const height = Number(heightMicrons) > 0 ? Math.min(Number(heightMicrons), 3276000) : 3276000;
    mainWindow.webContents.print({
      silent: true,
      printBackground: true,
      pageSize: { width: 80000, height }
    }, (success, reason) => {
      resolve({ success, reason });
    });
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

ipcMain.on('window:minimize', () => {
  mainWindow?.hide();
  refreshTrayMenu();
});

ipcMain.on('window:close', () => {
  mainWindow?.hide();
  refreshTrayMenu();
});

ipcMain.on('window:toggle-pin', () => {
  isPinned = !isPinned;
  mainWindow?.setAlwaysOnTop(isPinned, 'floating');
  mainWindow?.webContents.send('pin-state-changed', isPinned);
});

ipcMain.handle('window:get-pin-state', () => isPinned);

ipcMain.on('window:dock-to-corner', () => {
  dockToCorner();
});

ipcMain.on('window:enter-mini', () => {
  enterMiniMode();
});

ipcMain.on('window:exit-mini', () => {
  exitMiniMode();
});

// Ack from the renderer that its shutter has finished closing — commit the
// real resize now instead of waiting out the full COLLAPSE_MS watchdog.
ipcMain.on('window:collapse-ready', () => {
  commitEnterMini(transitionToken);
});

// The window's backgroundColor briefly shows through the newly-exposed
// region on a grow (see the BrowserWindow constructor comment) — keep it
// synced to whichever theme's --hero-bg-1 the renderer actually has active.
ipcMain.on('ui:bg-color', (_event, hex) => {
  if (mainWindow && typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex)) {
    mainWindow.setBackgroundColor(hex);
  }
});

ipcMain.on('money:in', (_event, payload) => {
  const amount = Number(payload && payload.amount) || 0;
  const name = ((payload && payload.name) || 'ลูกค้าโอน').toString().slice(0, 60);
  const typeLabels = { transfer: 'โอน', welfare: 'บัตรรัฐ', thaiplus: 'ไทยพลัส', expense: 'ค่าใช้จ่าย' };
  const typeLabel = typeLabels[payload && payload.type] || 'โอน';

  if (!Notification.isSupported() || amount <= 0) return;

  const notif = new Notification({
    title: '💰 เงินเข้า +' + amount.toLocaleString('en-US') + ' ฿',
    body: name + ' • ' + typeLabel,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    silent: false
  });

  notif.on('click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
    refreshTrayMenu();
  });

  notif.show();
});

// Realtime-only ingestion (the Pushbullet WebSocket) has a hard failure
// mode: if a push is missed for any reason — phone-side Doze/battery
// manager delaying the mirror sync after long idle, a reconnect window,
// a brief network blip — it's gone forever with no way to recover it.
// This REST poll is the backfill safety net: ask Pushbullet's API for
// anything modified since we last checked, so a delayed-but-eventually-
// synced push still gets picked up. Runs in main (not renderer) so it
// isn't subject to renderer CORS/webSecurity at all.
ipcMain.handle('pb:poll-missed', async (_event, { token, sinceTs }) => {
  try {
    const res = await fetch(
      `https://api.pushbullet.com/v2/pushes?modified_after=${encodeURIComponent(sinceTs)}&active=true`,
      { headers: { 'Access-Token': token } }
    );
    if (!res.ok) return { success: false, reason: 'http ' + res.status };
    const data = await res.json();
    return { success: true, pushes: data.pushes || [] };
  } catch (e) {
    return { success: false, reason: e.message };
  }
});

ipcMain.on('pb:disconnected-warning', (_event, downMinutes) => {
  if (!Notification.isSupported()) return;
  const notif = new Notification({
    title: '⚠️ Pushbullet ขาดการเชื่อมต่อ',
    body: `ไม่ได้รับสัญญาณมา ${downMinutes} นาทีแล้ว อาจพลาดยอดเงินเข้า — ลองเปิดมือถือ/เช็คเน็ตแล้วเปิดแอปนี้ขึ้นมาดู`,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    urgency: 'critical'
  });
  notif.on('click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
    refreshTrayMenu();
  });
  notif.show();
});
