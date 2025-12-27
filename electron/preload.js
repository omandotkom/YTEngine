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

  // Editor
  selectMediaFiles: () => ipcRenderer.invoke('select-media-files'),
  probeMedia: (filePath) => ipcRenderer.invoke('probe-media', filePath),
  generateProxy: (data) => ipcRenderer.invoke('generate-proxy', data),
  startRender: (payload) => ipcRenderer.invoke('start-render', payload),
  cancelRender: (jobId) => ipcRenderer.invoke('cancel-render', jobId),
  onRenderProgress: (callback) => ipcRenderer.on('editor-render-progress', (event, value) => callback(value)),
  onRenderComplete: (callback) => ipcRenderer.on('editor-render-complete', (event, value) => callback(value)),
  onRenderError: (callback) => ipcRenderer.on('editor-render-error', (event, value) => callback(value)),
  onProxyProgress: (callback) => ipcRenderer.on('editor-proxy-progress', (event, value) => callback(value)),

  // Extender
  extendVideo: (params) => ipcRenderer.invoke('extend-video', params),
  onExtenderProgress: (callback) => ipcRenderer.on('extender-progress', (event, value) => callback(value)),
});
