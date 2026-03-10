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

  // Kalıcı kuyruk
  loadQueue:  () => ipcRenderer.invoke('load-queue'),
  saveQueue:  (q) => ipcRenderer.invoke('save-queue', q),

  // Güncelleme
  getVersion:       () => ipcRenderer.invoke('get-version'),
  checkUpdates:     () => ipcRenderer.send('check-updates-manual'),
  openReleaseUrl:   (url) => ipcRenderer.send('open-release-url', url),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, data) => cb(data)),
});
