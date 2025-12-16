const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onSystemStats: (callback) => ipcRenderer.on('system-stats', (event, value) => callback(value)),

  // Downloader
  checkYtDlp: () => ipcRenderer.invoke('check-ytdlp'),
  updateYtDlp: () => ipcRenderer.invoke('update-ytdlp'),
  onInstallProgress: (callback) => ipcRenderer.on('install-progress', (event, value) => callback(value)),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  startDownload: (data) => ipcRenderer.invoke('start-download', data),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, value) => callback(value)),
  onDownloadError: (callback) => ipcRenderer.on('download-error', (event, value) => callback(value)),

  // History & Queue
  getDownloadHistory: (params) => ipcRenderer.invoke('get-download-history', params),
  retryDownload: (id) => ipcRenderer.invoke('retry-download', id),
  openFileLocation: (path) => ipcRenderer.invoke('open-file-location', path),
  onHistoryUpdated: (callback) => ipcRenderer.on('history-updated', () => callback()),

  // Speedtest
  startSpeedtest: () => ipcRenderer.invoke('start-speedtest'),
  onSpeedtestProgress: (callback) => ipcRenderer.on('speedtest-progress', (event, value) => callback(value)),
});
