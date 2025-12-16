const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { exec } = require('child_process');
const AdmZip = require('adm-zip');

// Paths
const isDev = require('electron-is-dev');
const BIN_PATH = isDev 
  ? path.join(__dirname, '../../bin') 
  : path.join(process.resourcesPath, 'bin');

const SPEEDTEST_FILENAME = 'speedtest.exe';
const SPEEDTEST_PATH = path.join(BIN_PATH, SPEEDTEST_FILENAME);

// Official Ookla Speedtest CLI URL (Windows)
const OOKLA_URL = "https://install.speedtest.net/app/cli/ookla-speedtest-1.2.0-win64.zip";

async function checkSpeedtestBinary() {
  return fs.existsSync(SPEEDTEST_PATH);
}

async function downloadSpeedtestBinary(onProgress) {
  const ZIP_PATH = path.join(BIN_PATH, 'speedtest.zip');

  try {
    // 1. Download
    const res = await fetch(OOKLA_URL);
    if (!res.ok) throw new Error(`Failed to fetch Speedtest CLI: ${res.statusText}`);

    const totalSize = parseInt(res.headers.get('content-length'), 10);
    let downloaded = 0;

    const fileStream = fs.createWriteStream(ZIP_PATH);
    await new Promise((resolve, reject) => {
      res.body.on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress && totalSize) {
          const percent = ((downloaded / totalSize) * 100).toFixed(0);
          onProgress(`Downloading Speedtest Engine: ${percent}%`);
        }
      });
      res.body.pipe(fileStream);
      res.body.on('error', reject);
      fileStream.on('finish', resolve);
    });

    // 2. Extract
    if (onProgress) onProgress("Extracting Speedtest Engine...");
    const zip = new AdmZip(ZIP_PATH);
    zip.extractAllTo(BIN_PATH, true); // Extract speedtest.exe

    // 3. Cleanup
    fs.unlinkSync(ZIP_PATH);
    return true;

  } catch (error) {
    console.error("Speedtest download failed:", error);
    throw error;
  }
}

async function runSpeedtestCLI(onStatusUpdate) {
  return new Promise((resolve, reject) => {
    // Command flags:
    // --format=json : Output machine readable data
    // --accept-license --accept-gdpr : Bypass interactive prompts
    const cmd = `"${SPEEDTEST_PATH}" --format=json --accept-license --accept-gdpr`;
    
    // Note: Ookla CLI doesn't output real-time progress in JSON mode easily without complex parsing.
    // For this version, we'll update status generically while it runs.
    
    if (onStatusUpdate) onStatusUpdate("Connecting to nearest server...");

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        // Sometimes speedtest exits with error but still has output?
        console.error("Speedtest Error:", error);
        reject(error);
        return;
      }
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        reject(new Error("Failed to parse speedtest results"));
      }
    });
  });
}

module.exports = {
  checkSpeedtestBinary,
  downloadSpeedtestBinary,
  runSpeedtestCLI
};
