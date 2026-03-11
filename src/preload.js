const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow:    () => ipcRenderer.send('window-close'),

  // Files
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  saveFile: (data) => ipcRenderer.invoke('save-file', data),

  // Storage
  loadContacts:  () => ipcRenderer.invoke('load-contacts'),
  saveContacts:  (c) => ipcRenderer.invoke('save-contacts', c),
  loadMyId:      () => ipcRenderer.invoke('load-my-id'),
  saveMyId:      (id) => ipcRenderer.invoke('save-my-id', id),
  loadQueue:     () => ipcRenderer.invoke('load-queue'),
  saveQueue:     (q) => ipcRenderer.invoke('save-queue', q),

  // Version & Update
  getVersion:          () => ipcRenderer.invoke('get-version'),
  openReleaseUrl:      (url) => ipcRenderer.send('open-release-url', url),
  installUpdate:       () => ipcRenderer.send('install-update'),
  onUpdateAvailable:   (cb) => ipcRenderer.on('update-available',  (_, d) => cb(d)),
  onUpdateProgress:    (cb) => ipcRenderer.on('update-progress',   (_, d) => cb(d)),
  onUpdateDownloaded:  (cb) => ipcRenderer.on('update-downloaded', (_, d) => cb(d)),
  onUpdateError:       (cb) => ipcRenderer.on('update-error',      (_, d) => cb(d)),
});
