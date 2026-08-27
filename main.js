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

let mainWindow = null;
let tray = null;
let isPinned = true;
let isQuitting = false;
let isMiniMode = false;
let lastFullBounds = null;

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
    backgroundColor: '#0f0a1e',
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
function enterMiniMode() {
  if (!mainWindow) return;
  if (!isMiniMode) lastFullBounds = mainWindow.getBounds();
  mainWindow.setMinimumSize(MINI_WIDTH, MINI_HEIGHT);
  mainWindow.setResizable(false);
  const { x, y } = getDockedPosition(MINI_WIDTH, MINI_HEIGHT);
  mainWindow.setBounds({ x, y, width: MINI_WIDTH, height: MINI_HEIGHT });
  isMiniMode = true;
  mainWindow.webContents.send('mode-changed', 'mini');
  mainWindow.show();
}

function exitMiniMode() {
  if (!mainWindow) return;
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
