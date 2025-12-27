const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { app } = require('electron');
const { exec } = require('child_process');
const AdmZip = require('adm-zip');

// Define path for binaries
// In development: ./bin/
// In production: resources/bin/ (Electron standard)
const isDev = require('electron-is-dev');
const BIN_PATH = isDev 
  ? path.join(__dirname, '../../bin') 
  : path.join(process.resourcesPath, 'bin');

const YTDLP_FILENAME = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const YTDLP_PATH = path.join(BIN_PATH, YTDLP_FILENAME);

const FFMPEG_FILENAME = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const FFMPEG_PATH = path.join(BIN_PATH, FFMPEG_FILENAME);
const FFPROBE_FILENAME = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
const FFPROBE_PATH = path.join(BIN_PATH, FFPROBE_FILENAME);

// Ensure bin directory exists
if (!fs.existsSync(BIN_PATH)) {
  fs.mkdirSync(BIN_PATH, { recursive: true });
}

async function checkYtDlpStatus() {
  if (fs.existsSync(YTDLP_PATH)) {
    // Try to get version
    return new Promise((resolve) => {
      exec(`"${YTDLP_PATH}" --version`, (error, stdout) => {
        if (error) {
          resolve({ exists: true, version: 'Unknown (Error)', path: YTDLP_PATH });
        } else {
          resolve({ exists: true, version: stdout.trim(), path: YTDLP_PATH });
        }
      });
    });
  } else {
    return { exists: false, version: null, path: YTDLP_PATH };
  }
}

async function checkFfmpegStatus() {
  if (fs.existsSync(FFMPEG_PATH)) {
    return new Promise((resolve) => {
      exec(`"${FFMPEG_PATH}" -version`, (error, stdout) => {
        if (error) {
          resolve({ exists: true, version: 'Unknown', path: FFMPEG_PATH });
        } else {
          // Parse first line: "ffmpeg version 6.0-..."
          const versionLine = stdout.split('\n')[0];
          const version = versionLine.split('version')[1]?.split(' ')[1] || 'Detected';
          resolve({ exists: true, version: version, path: FFMPEG_PATH });
        }
      });
    });
  } else {
    return { exists: false, version: null, path: FFMPEG_PATH };
  }
}

async function downloadYtDlp(onProgress) {
  const LATEST_RELEASE_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";

  try {
    const res = await fetch(LATEST_RELEASE_URL);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
    
    const totalSize = parseInt(res.headers.get('content-length'), 10);
    let downloaded = 0;
    
    const fileStream = fs.createWriteStream(YTDLP_PATH);
    
    return new Promise((resolve, reject) => {
      res.body.on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress && totalSize) {
          const percent = ((downloaded / totalSize) * 100).toFixed(0);
          onProgress(`Downloading yt-dlp: ${percent}%`);
        }
      });

      res.body.pipe(fileStream);
      res.body.on('error', reject);
      fileStream.on('finish', () => {
        if (process.platform !== 'win32') {
          fs.chmodSync(YTDLP_PATH, '755');
        }
        resolve(true);
      });
    });
  } catch (error) {
    console.error("Download yt-dlp failed:", error);
    throw error;
  }
}

async function downloadFfmpeg(onProgress) {
  // Using gyan.dev essential build for Windows
  const ZIP_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";
  const ZIP_PATH = path.join(BIN_PATH, 'ffmpeg.zip');

  try {
    // 1. Download Zip
    const res = await fetch(ZIP_URL);
    if (!res.ok) throw new Error(`Failed to fetch FFmpeg: ${res.statusText}`);
    
    const totalSize = parseInt(res.headers.get('content-length'), 10);
    let downloaded = 0;

    const fileStream = fs.createWriteStream(ZIP_PATH);
    await new Promise((resolve, reject) => {
      res.body.on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress && totalSize) {
          const percent = ((downloaded / totalSize) * 100).toFixed(0);
          onProgress(`Downloading FFmpeg: ${percent}%`);
        }
      });

      res.body.pipe(fileStream);
      res.body.on('error', reject);
      fileStream.on('finish', resolve);
    });

    if (onProgress) onProgress("Extracting FFmpeg...");

    // 2. Extract
    const zip = new AdmZip(ZIP_PATH);
    const zipEntries = zip.getEntries();
    
    // Find bin/ffmpeg.exe and bin/ffprobe.exe inside zip
    zipEntries.forEach(entry => {
      if (entry.entryName.match(/bin\/ffmpeg\.exe$/)) {
        zip.extractEntryTo(entry, BIN_PATH, false, true);
      }
      if (entry.entryName.match(/bin\/ffprobe\.exe$/)) {
        zip.extractEntryTo(entry, BIN_PATH, false, true);
      }
    });

    // 3. Cleanup Zip
    fs.unlinkSync(ZIP_PATH);
    return true;

  } catch (error) {
    console.error("Download FFmpeg failed:", error);
    throw error;
  }
}

module.exports = {
  checkYtDlpStatus,
  checkFfmpegStatus,
  downloadYtDlp,
  downloadFfmpeg,
  YTDLP_PATH,
  FFMPEG_PATH,
  FFPROBE_PATH
};
