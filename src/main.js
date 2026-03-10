const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

let mainWindow;

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
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Pencere tamamen yüklendikten sonra güncelleme kontrol et
    setTimeout(() => checkForUpdates(), 3000);
  });
}

app.whenReady().then(() => {
  createWindow();
});

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

// ─── CONTACTS ─────────────────────────────────────────────
ipcMain.handle('load-contacts', () => readJson(contactsPath, []));
ipcMain.handle('save-contacts', (_, contacts) => writeJson(contactsPath, contacts));

// ─── MY ID ────────────────────────────────────────────────
ipcMain.handle('load-my-id', () => readJson(myIdPath, {}).id || null);
ipcMain.handle('save-my-id', (_, id) => writeJson(myIdPath, { id }));

// ─── MESSAGE QUEUE (kalıcı) ───────────────────────────────
ipcMain.handle('load-queue', () => readJson(queuePath, {}));
ipcMain.handle('save-queue', (_, queue) => writeJson(queuePath, queue));

// ─── AUTO UPDATE ──────────────────────────────────────────
// GitHub Releases üzerinden güncelleme kontrolü
// package.json'daki "repository" alanındaki GitHub repo kullanılır
// Örnek: "https://github.com/KULLANICI/pikemon"
const GITHUB_REPO = 'KULLANICI/pikemon'; // <-- bunu değiştir

function checkForUpdates() {
  const currentVersion = app.getVersion();
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

  const req = https.get(url, { headers: { 'User-Agent': 'Pikemon' } }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      try {
        const release = JSON.parse(body);
        const latestVersion = release.tag_name?.replace('v', '');
        if (latestVersion && latestVersion !== currentVersion) {
          // Yeni sürüm var, renderer'a bildir
          mainWindow?.webContents.send('update-available', {
            version: latestVersion,
            url: release.html_url,
            notes: release.body || '',
          });
        }
      } catch(e) {}
    });
  });
  req.on('error', () => {}); // sessizce hata yut
  req.end();
}

ipcMain.on('open-release-url', (_, url) => shell.openExternal(url));
ipcMain.on('check-updates-manual', () => checkForUpdates());
ipcMain.handle('get-version', () => app.getVersion());
