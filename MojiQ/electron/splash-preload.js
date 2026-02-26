const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splashAPI', {
  onProgress: (callback) => ipcRenderer.on('splash-progress', (event, progress) => callback(progress))
});
