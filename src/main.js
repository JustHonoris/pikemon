const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let updaterInstance = null;
let isQuitting = false;

// ─── PATHS ───────────────────────────────────────────────
const userData = app.getPath('userData');
const contactsPath = path.join(userData, 'contacts.json');
const myIdPath     = path.join(userData, 'myid.json');
const queuePath    = path.join(userData, 'queue.json');
const groupsPath   = path.join(userData, 'groups.json');
const tempDir      = path.join(userData, 'temp_media');

// Temp klasörünü oluştur
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Uygulama başlarken eski temp dosyalarını temizle
function cleanTempDir() {
  try {
    const files = fs.readdirSync(tempDir);
    files.forEach(f => {
      try { fs.unlinkSync(path.join(tempDir, f)); } catch(e) {}
    });
  } catch(e) {}
}
cleanTempDir();

function readJson(p, fallback) {
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch(e) {}
  return fallback;
}
function writeJson(p, data) {
  try { fs.writeFileSync(p, JSON.stringify(data, null, 2)); return true; }
  catch(e) { return false; }
}

// ─── WINDOW ───────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 780,
    minHeight: 520,
    frame: false,
    transparent: false,
    backgroundColor: '#0d0d0d',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  // Dış linkleri tarayıcıda aç, uygulama içinde açma
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // CSP Header
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self';" +
          "script-src 'self' 'unsafe-inline';" +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;" +
          "font-src 'self' https://fonts.gstatic.com;" +
          "connect-src 'self' https://0.peerjs.com wss://0.peerjs.com https://*.peerjs.com wss://*.peerjs.com;" +
          "img-src 'self' data: blob:;" +
          "media-src 'self' blob: data:;" +
          "object-src 'none';" +
          "base-uri 'self';"
        ]
      }
    });
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => initAutoUpdater(), 2000);
  });
}

app.whenReady().then(() => createWindow());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────
app.on('before-quit', (e) => {
  if (isQuitting) return;
  e.preventDefault();
  isQuitting = true;

  // Renderer'a peer'i yok etmesini söyle, sonra gerçekten çık
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-before-quit');
    // 1.5 saniye bekle — peer destroy + son queue persist için
    setTimeout(() => {
      cleanTempDir();
      app.quit();
    }, 1500);
  } else {
    cleanTempDir();
    app.quit();
  }
});

// ─── WINDOW CONTROLS ──────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => { if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize(); });
ipcMain.on('window-close', () => mainWindow.close());

// ─── FILE DIALOG ──────────────────────────────────────────
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
  const data = fs.readFileSync(filePath);
  const base64 = data.toString('base64');
  const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
  const mimeType = mimeTypes[ext] || 'application/octet-stream';
  return { fileName, base64, mimeType, isImage, size: data.length };
});

ipcMain.handle('save-file', async (_, { fileName, base64 }) => {
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath: fileName });
  if (result.canceled) return false;
  fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
  return true;
});

// ─── STORAGE ──────────────────────────────────────────────
ipcMain.handle('load-contacts', () => readJson(contactsPath, []));
ipcMain.handle('save-contacts', (_, contacts) => writeJson(contactsPath, contacts));
ipcMain.handle('load-my-id', () => readJson(myIdPath, {}).id || null);
ipcMain.handle('save-my-id', (_, id) => writeJson(myIdPath, { id }));
ipcMain.handle('load-queue', () => readJson(queuePath, {}));
ipcMain.handle('save-queue', (_, queue) => writeJson(queuePath, queue));
ipcMain.handle('load-groups',  () => readJson(groupsPath, []));
ipcMain.handle('save-groups',  (_, g) => writeJson(groupsPath, g));
ipcMain.handle('load-settings', () => readJson(path.join(userData, 'settings.json'), { saveHistory: false }));
ipcMain.handle('save-settings', (_, s) => writeJson(path.join(userData, 'settings.json'), s));

// ─── ENCRYPTED MESSAGES ───────────────────────────────────
const crypto = require('crypto');
const messagesDir = path.join(userData, 'messages');
if (!fs.existsSync(messagesDir)) fs.mkdirSync(messagesDir, { recursive: true });

function deriveKey(myId) {
  return crypto.createHash('sha256').update(myId + 'pikemon-v1').digest(); // 32 byte
}

function encryptMessages(data, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const json = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptMessages(b64, key) {
  try {
    const buf = Buffer.from(b64, 'base64');
    const iv  = buf.slice(0, 12);
    const tag = buf.slice(12, 28);
    const enc = buf.slice(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const json = decipher.update(enc) + decipher.final('utf8');
    return JSON.parse(json);
  } catch(e) { return []; }
}

ipcMain.handle('save-messages', (_, { chatId, messages, myId }) => {
  try {
    const key = deriveKey(myId);
    const encrypted = encryptMessages(messages, key);
    fs.writeFileSync(path.join(messagesDir, `${chatId}.enc`), encrypted);
    return true;
  } catch(e) { console.error('save-messages error:', e); return false; }
});

ipcMain.handle('load-messages', (_, { chatId, myId }) => {
  try {
    const filePath = path.join(messagesDir, `${chatId}.enc`);
    if (!fs.existsSync(filePath)) return [];
    const key = deriveKey(myId);
    return decryptMessages(fs.readFileSync(filePath, 'utf8'), key);
  } catch(e) { return []; }
});

ipcMain.handle('delete-messages', (_, chatId) => {
  try {
    const filePath = path.join(messagesDir, `${chatId}.enc`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return true;
  } catch(e) { return false; }
});

ipcMain.handle('delete-all-messages', () => {
  try {
    const files = fs.readdirSync(messagesDir);
    files.forEach(f => { try { fs.unlinkSync(path.join(messagesDir, f)); } catch(e) {} });
    return true;
  } catch(e) { return false; }
});

// ─── TEMP MEDIA ───────────────────────────────────────────
ipcMain.handle('save-temp-media', (_, { tempId, base64, mimeType }) => {
  try {
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
    const filePath = path.join(tempDir, `${tempId}.${ext}`);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return filePath;
  } catch(e) {
    console.error('Temp media save error:', e);
    return null;
  }
});

ipcMain.handle('load-temp-media', (_, filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const data = fs.readFileSync(filePath);
    return data.toString('base64');
  } catch(e) { return null; }
});

ipcMain.on('delete-temp-media', (_, filePath) => {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch(e) {}
});

// Renderer "hazır" sinyali verince temp'i temizledi bildir
ipcMain.on('peer-destroyed', () => {
  console.log('Peer destroyed, temp media cleaned.');
});

// ─── AUTO UPDATER ─────────────────────────────────────────
function initAutoUpdater() {
  try {
    const { autoUpdater } = require('electron-updater');
    updaterInstance = autoUpdater;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => console.log('Güncelleme kontrol ediliyor...'));

    autoUpdater.on('update-available', (info) => {
      console.log('Yeni sürüm:', info.version);
      mainWindow?.webContents.send('update-available', { version: info.version });
    });

    autoUpdater.on('update-not-available', () => console.log('Güncel.'));

    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.webContents.send('update-progress', {
        percent: Math.round(progress.percent),
        speed: Math.round(progress.bytesPerSecond / 1024),
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('İndirildi:', info.version);
      mainWindow?.webContents.send('update-downloaded', { version: info.version });
    });

    autoUpdater.on('error', (err) => {
      console.error('Güncelleme hatası:', err.message);
      mainWindow?.webContents.send('update-error', { message: err.message });
    });

    autoUpdater.checkForUpdates();

  } catch(e) {
    console.log('Auto updater atlandı:', e.message);
  }
}

ipcMain.on('install-update', () => {
  if (updaterInstance) {
    updaterInstance.quitAndInstall(false, true);
  }
});

ipcMain.handle('get-version', () => app.getVersion());
ipcMain.on('open-release-url', (_, url) => shell.openExternal(url));