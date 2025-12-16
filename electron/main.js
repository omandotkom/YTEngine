const { app, BrowserWindow, ipcMain, shell, protocol, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const si = require('systeminformation');
const os = require('os');
const { exec, spawn } = require('child_process');
const { checkYtDlpStatus, checkFfmpegStatus, downloadYtDlp, downloadFfmpeg, YTDLP_PATH, FFMPEG_PATH } = require('./downloader-engine');
const { checkSpeedtestBinary, downloadSpeedtestBinary, runSpeedtestCLI } = require('./speedtest-engine');
const { getHistory, getTotalCount, addDownload, updateStatus, getDownloadById } = require('./db');

let mainWindow;
let isDownloading = false;
let currentDownloadId = null;
let currentDownloadProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'YTEngine',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false 
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
  }

  startSystemMonitor(mainWindow);
}

function startSystemMonitor(window) {
  setInterval(async () => {
    try {
      const cpuLoad = await si.currentLoad();
      const mem = await si.mem();

      const stats = {
        cpuUsage: cpuLoad.currentLoad, // Percentage
        totalMem: mem.total,
        freeMem: mem.available, // Available is more accurate than free for OS caching
        usedMem: mem.active
      };

      if (window && !window.isDestroyed()) {
        window.webContents.send('system-stats', stats);
      }
    } catch (error) {
      console.error("Monitor Error:", error);
    }
  }, 2000); 
}

app.whenReady().then(() => {
  protocol.registerFileProtocol('local-video', (request, callback) => {
    const url = request.url.replace('local-video://', '');
    try {
      return callback(decodeURIComponent(url));
    } catch (error) {
      console.error(error);
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- QUEUE SYSTEM ---

let downloadQueue = []; 

async function processQueue() {
  if (isDownloading || downloadQueue.length === 0) return;

  isDownloading = true;
  const nextId = downloadQueue.shift(); 
  currentDownloadId = nextId;

  const task = getDownloadById(nextId);
  if (!task) {
    isDownloading = false;
    processQueue();
    return;
  }

  updateStatus(nextId, 'downloading');
  notifyHistoryUpdate();

  try {
    // Determine download folder
    // If task.filePath is a directory (custom path saved during add), use it.
    // Otherwise use default.
    // We check if it ends with .mp4/.mp3 to distinguish file from dir, 
    // or better: assumes if it exists and is dir.
    // Since we just added it, it's just a string path.
    let downloadFolder = path.join(app.getPath('downloads'), 'YTEngine');
    if (task.filePath && !task.filePath.endsWith('.mp4') && !task.filePath.endsWith('.mp3')) {
        downloadFolder = task.filePath;
    }

    const { url, format } = task;

    const args = [
      url,
      '-P', downloadFolder,
      '-o', '%(title)s.%(ext)s',
      '--no-playlist',
      '--ffmpeg-location', FFMPEG_PATH
    ];

    if (format === 'audio') {
      args.push('-x', '--audio-format', 'mp3');
    } else {
      args.push('--recode-video', 'mp4');
    }

    args.push('--print', 'after_move:filepath');
    args.push('--print', 'title'); 

    currentDownloadProcess = spawn(YTDLP_PATH, args);
    
    let capturedTitle = null;
    let capturedPath = null;

    currentDownloadProcess.stdout.on('data', (data) => {
      const message = data.toString();
      
      const lines = message.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          if (path.isAbsolute(trimmed)) {
            capturedPath = trimmed;
          } else if (!trimmed.startsWith('[download]') && !trimmed.startsWith('Deleting')) {
             if (!capturedTitle) capturedTitle = trimmed;
          }
        }
      }

      if (mainWindow) {
        mainWindow.webContents.send('download-progress', message);
      }
    });

    currentDownloadProcess.stderr.on('data', (data) => {
      if (mainWindow) mainWindow.webContents.send('download-progress', data.toString()); 
    });

    currentDownloadProcess.on('close', (code) => {
      isDownloading = false;
      currentDownloadProcess = null;
      currentDownloadId = null;

      if (code === 0) {
        updateStatus(nextId, 'completed', capturedPath, capturedTitle);
        if (mainWindow && capturedPath) {
             mainWindow.webContents.send('download-success', { filePath: capturedPath });
        }
      } else if (code === null || code === 1 || code === 3221225786) {
         updateStatus(nextId, 'cancelled');
      } else {
        updateStatus(nextId, 'failed');
      }

      notifyHistoryUpdate();
      processQueue(); 
    });

  } catch (error) {
    isDownloading = false;
    updateStatus(nextId, 'failed');
    notifyHistoryUpdate();
    processQueue();
  }
}

function notifyHistoryUpdate() {
  if (mainWindow) mainWindow.webContents.send('history-updated');
}

// --- IPC HANDLERS ---

ipcMain.handle('ping', () => 'pong');
ipcMain.handle('get-app-version', () => app.getVersion());

// Folder Selection
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// History Handlers
ipcMain.handle('get-download-history', (event, { page = 1, limit = 10 }) => {
  const offset = (page - 1) * limit;
  const history = getHistory(limit, offset);
  const total = getTotalCount();
  return { history, total, page, totalPages: Math.ceil(total / limit) };
});

ipcMain.handle('open-file-location', (event, filePath) => {
  if (filePath) shell.showItemInFolder(filePath);
});

// Queue Handlers
ipcMain.handle('start-download', async (event, { url, format, customPath }) => {
  // Pass customPath as targetDir to be stored in filePath column initially
  const id = addDownload(url, format, null, customPath);
  downloadQueue.push(id);
  processQueue();
  notifyHistoryUpdate();
  return { success: true, queuedId: id };
});

ipcMain.handle('retry-download', async (event, id) => {
  const task = getDownloadById(id);
  if (!task) return { success: false };
  updateStatus(id, 'queued');
  downloadQueue.push(id);
  processQueue();
  notifyHistoryUpdate();
  return { success: true };
});

ipcMain.handle('cancel-download', async () => {
  if (currentDownloadProcess) {
    if (currentDownloadId) {
      updateStatus(currentDownloadId, 'cancelled');
    }
    currentDownloadProcess.kill();
    return { success: true };
  }
  return { success: false, error: "No active download" };
});

// Engines
ipcMain.handle('check-ytdlp', async () => {
  const ytdlp = await checkYtDlpStatus();
  const ffmpeg = await checkFfmpegStatus();
  return { 
    exists: ytdlp.exists && ffmpeg.exists, 
    ytdlpVersion: ytdlp.version,
    ffmpegVersion: ffmpeg.version,
    details: { ytdlp, ffmpeg }
  };
});

ipcMain.handle('update-ytdlp', async () => {
  try {
    const sendProgress = (msg) => {
      if (mainWindow) mainWindow.webContents.send('install-progress', msg);
    };
    await downloadYtDlp(sendProgress);
    await downloadFfmpeg(sendProgress);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Speedtest
ipcMain.handle('start-speedtest', async () => {
  try {
    const sendProgress = (msg) => {
      if (mainWindow) mainWindow.webContents.send('speedtest-progress', msg);
    };
    const exists = await checkSpeedtestBinary();
    if (!exists) {
      sendProgress("Initializing Speedtest Engine...");
      await downloadSpeedtestBinary(sendProgress);
    }
    sendProgress("Running Network Diagnostics... (This takes ~30s)");
    const result = await runSpeedtestCLI(sendProgress);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
