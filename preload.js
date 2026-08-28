const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('heroWindow', {
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  togglePin: () => ipcRenderer.send('window:toggle-pin'),
  dockToCorner: () => ipcRenderer.send('window:dock-to-corner'),
  getPinState: () => ipcRenderer.invoke('window:get-pin-state'),
  onPinStateChanged: (callback) => ipcRenderer.on('pin-state-changed', (_event, pinned) => callback(pinned)),
  notifyMoneyIn: (amount, name, type) => ipcRenderer.send('money:in', { amount, name, type }),
  notifyPbDisconnected: (downMinutes) => ipcRenderer.send('pb:disconnected-warning', downMinutes),
  pollMissedPushes: (token, sinceTs) => ipcRenderer.invoke('pb:poll-missed', { token, sinceTs }),
  onForceReconnect: (callback) => ipcRenderer.on('force-reconnect-pushbullet', () => callback()),
  enterMini: () => ipcRenderer.send('window:enter-mini'),
  exitMini: () => ipcRenderer.send('window:exit-mini'),
  onModeChanged: (callback) => ipcRenderer.on('mode-changed', (_event, mode) => callback(mode)),
  silentPrint: (heightMicrons) => ipcRenderer.invoke('print:silent', heightMicrons)
});
