const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let updaterInstance = null;

// ─── PATHS ───────────────────────────────────────────────
const userData = app.getPath('userData');
const contactsPath = path.join(userData, 'contacts.json');
const myIdPath     = path.join(userData, 'myid.json');
const queuePath    = path.join(userData, 'queue.json');

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
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
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
