const { app, BrowserWindow, ipcMain, shell, protocol, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const isDev = require('electron-is-dev');
const si = require('systeminformation');
const os = require('os');
const { exec, spawn } = require('child_process');
const { checkYtDlpStatus, checkFfmpegStatus, downloadYtDlp, downloadFfmpeg, YTDLP_PATH, FFMPEG_PATH, FFPROBE_PATH } = require('./downloader-engine');
const { checkSpeedtestBinary, downloadSpeedtestBinary, runSpeedtestCLI } = require('./speedtest-engine');
const { runExtendVideo } = require('./extender-engine');
const { getHistory, getTotalCount, addDownload, updateStatus, getDownloadById } = require('./db');

let mainWindow;
let isDownloading = false;
let currentDownloadId = null;
let currentDownloadProcess = null;
const renderJobs = new Map();

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getExportsDir() {
  return path.join(app.getPath('downloads'), 'YTEngine', 'Exports');
}

function getProxyDir() {
  return path.join(app.getPath('userData'), 'proxies');
}

function parseFps(rate) {
  if (!rate || typeof rate !== 'string') return null;
  const parts = rate.split('/');
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      return num / den;
    }
  }
  const value = Number(rate);
  return Number.isFinite(value) ? value : null;
}

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

// Editor
ipcMain.handle('select-media-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media', extensions: ['mp4', 'mov', 'mkv', 'webm', 'mp3', 'wav', 'aac', 'flac', 'png', 'jpg', 'jpeg', 'gif'] }
    ]
  });
  if (result.canceled) return [];
  return result.filePaths;
});

ipcMain.handle('probe-media', async (event, filePath) => {
  if (!filePath) return { success: false, error: 'No file path provided' };
  if (!fs.existsSync(FFPROBE_PATH)) return { success: false, error: 'FFprobe not found' };

  return new Promise((resolve) => {
    const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath];
    const proc = spawn(FFPROBE_PATH, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ success: false, error: stderr.trim() || 'ffprobe failed' });
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        const duration = Number(parsed?.format?.duration || 0);
        const videoStream = parsed?.streams?.find((stream) => stream.codec_type === 'video');
        const audioStream = parsed?.streams?.find((stream) => stream.codec_type === 'audio');
        resolve({
          success: true,
          data: {
            duration,
            width: videoStream?.width || null,
            height: videoStream?.height || null,
            fps: parseFps(videoStream?.r_frame_rate),
            hasVideo: Boolean(videoStream),
            hasAudio: Boolean(audioStream),
            channels: audioStream?.channels || null,
            sampleRate: audioStream?.sample_rate ? Number(audioStream.sample_rate) : null
          }
        });
      } catch (error) {
        resolve({ success: false, error: 'Failed to parse ffprobe output' });
      }
    });
  });
});

ipcMain.handle('generate-proxy', async (event, { filePath, maxWidth = 1280 }) => {
  if (!filePath) return { success: false, error: 'No file path provided' };
  if (!fs.existsSync(FFMPEG_PATH)) return { success: false, error: 'FFmpeg not found' };

  const proxyDir = getProxyDir();
  ensureDir(proxyDir);
  const hash = crypto.createHash('md5').update(filePath).digest('hex');
  const proxyPath = path.join(proxyDir, `${hash}.mp4`);

  if (fs.existsSync(proxyPath)) {
    return { success: true, proxyPath, cached: true };
  }

  return new Promise((resolve) => {
    const args = [
      '-y',
      '-i', filePath,
      '-vf', `scale=w=${maxWidth}:h=-2:force_original_aspect_ratio=decrease`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '28',
      '-c:a', 'aac',
      '-b:a', '128k',
      proxyPath
    ];

    if (mainWindow) {
      mainWindow.webContents.send('editor-proxy-progress', { filePath, status: 'start' });
    }

    const proc = spawn(FFMPEG_PATH, args);
    proc.on('close', (code) => {
      if (code === 0) {
        if (mainWindow) {
          mainWindow.webContents.send('editor-proxy-progress', { filePath, status: 'complete', proxyPath });
        }
        resolve({ success: true, proxyPath, cached: false });
      } else {
        if (mainWindow) {
          mainWindow.webContents.send('editor-proxy-progress', { filePath, status: 'error' });
        }
        resolve({ success: false, error: 'Proxy generation failed' });
      }
    });
  });
});

ipcMain.handle('start-render', async (event, payload) => {
  if (!payload) return { success: false, error: 'Missing render payload' };
  if (!fs.existsSync(FFMPEG_PATH)) return { success: false, error: 'FFmpeg not found' };

  const outputDir = payload.outputDir || getExportsDir();
  ensureDir(outputDir);
  const outputName = payload.outputName || `render-${Date.now()}.mp4`;
  const outputPath = path.join(outputDir, outputName.endsWith('.mp4') ? outputName : `${outputName}.mp4`);
  const jobId = crypto.randomUUID();

  const worker = new Worker(path.join(__dirname, 'editor-worker.js'), {
    workerData: {
      jobId,
      ffmpegPath: FFMPEG_PATH,
      payload: { ...payload, outputPath }
    }
  });

  renderJobs.set(jobId, worker);

  worker.on('message', (message) => {
    if (!mainWindow) return;
    if (message.type === 'progress') {
      mainWindow.webContents.send('editor-render-progress', { jobId, ...message });
    }
    if (message.type === 'done') {
      mainWindow.webContents.send('editor-render-complete', { jobId, ...message });
      renderJobs.delete(jobId);
    }
    if (message.type === 'error') {
      mainWindow.webContents.send('editor-render-error', { jobId, ...message });
      renderJobs.delete(jobId);
    }
  });

  worker.on('exit', () => {
    renderJobs.delete(jobId);
  });

  return { success: true, jobId, outputPath };
});

ipcMain.handle('cancel-render', async (event, jobId) => {
  const worker = renderJobs.get(jobId);
  if (!worker) return { success: false, error: 'Render job not found' };
  await worker.terminate();
  renderJobs.delete(jobId);
  return { success: true };
});

// Extender
ipcMain.handle('extend-video', async (event, params) => {
  try {
    const onProgress = (msg) => {
      if (mainWindow) mainWindow.webContents.send('extender-progress', msg);
    };
    const outputPath = await runExtendVideo(params, onProgress);
    return { success: true, outputPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
