const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { FFMPEG_PATH, FFPROBE_PATH } = require('./downloader-engine');

/**
 * Get video duration in seconds using ffprobe
 * @param {string} inputPath 
 * @returns {Promise<number>} duration in seconds
 */
function getVideoDuration(inputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath
    ];

    exec(`"${FFPROBE_PATH}" ${args.join(' ')}`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      const duration = parseFloat(stdout.trim());
      if (isNaN(duration)) {
        reject(new Error('Could not parse duration'));
      } else {
        resolve(duration);
      }
    });
  });
}

/**
 * Run Video Extender
 * @param {object} params
 * @param {string} params.inputPath
 * @param {number} params.loopCount - Total number of times the video should play (e.g., 5)
 * @param {string} params.mode - 'copy' (Instant) or 'encode' (Smooth/Transistion)
 * @param {string} params.encoder - 'cpu', 'nvidia', 'intel', 'amd' (only for encode mode)
 * @param {number} params.transitionDuration - Duration of crossfade in seconds (default 1)
 * @param {function} onProgress - Callback (logString) => void
 * @returns {Promise<string>} Output file path
 */
async function runExtendVideo({ inputPath, loopCount, mode, encoder, transitionDuration = 1 }, onProgress) {
  // Input validation
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const name = path.basename(inputPath, ext);
  const outputPath = path.join(dir, `${name}_extended_${Date.now()}${ext}`);

  if (mode === 'copy') {
    // Mode: Instant Loop (Stream Copy)
    // Formula: -stream_loop (N-1) -i input -c copy output
    // -stream_loop specifies number of loops *added*. So 5 total plays = loop 4 times.
    
    return new Promise((resolve, reject) => {
      const args = [
        '-stream_loop', (loopCount - 1).toString(),
        '-i', inputPath,
        '-c', 'copy',
        '-y', // Overwrite
        outputPath
      ];

      onProgress(`Starting Instant Loop process...`);
      onProgress(`Command: ffmpeg ${args.join(' ')}`);

      const child = spawn(FFMPEG_PATH, args);

      child.stderr.on('data', (data) => {
        onProgress(data.toString());
      });

      child.on('close', (code) => {
        if (code === 0) {
          onProgress(`Success! Output saved to: ${outputPath}`);
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
    });

  } else {
    // Mode: Smooth Loop (Re-encode with xfade)
    // This requires calculating offsets and building a complex filter graph.
    
    onProgress(`Analyzing video duration...`);
    const duration = await getVideoDuration(inputPath);
    onProgress(`Video Duration: ${duration}s`);
    
    // Safety check: Transition cannot be longer than video
    if (transitionDuration >= duration) {
      throw new Error(`Transition duration (${transitionDuration}s) must be shorter than video duration (${duration}s).`);
    }

    // Encoder mapping
    let vCodec = 'libx264';
    switch (encoder) {
      case 'nvidia': vCodec = 'h264_nvenc'; break;
      case 'intel': vCodec = 'h264_qsv'; break;
      case 'amd': vCodec = 'h264_amf'; break;
      case 'cpu': default: vCodec = 'libx264'; break;
    }

    // Construct Inputs
    // We need 'loopCount' inputs
    const inputArgs = [];
    for (let i = 0; i < loopCount; i++) {
      inputArgs.push('-i', inputPath);
    }

    // Construct Filter Complex
    // Example for 3 loops:
    // [0:v][1:v]xfade=...:offset=9[v1];
    // [v1][2:v]xfade=...:offset=18[vout];
    // [0:a][1:a]acrossfade=d=1[a1];
    // [a1][2:a]acrossfade=d=1[aout]
    
    let filterComplex = '';
    let lastV = '0:v';
    let lastA = '0:a';
    
    const offsetStep = duration - transitionDuration;

    for (let i = 1; i < loopCount; i++) {
      const currentOffset = offsetStep * i; // Wait, first offset is 1*step. Second is 2*step?
      // Logic:
      // Mix 1 (Input 0 + Input 1): Offset = duration - trans. Result duration = 2*dur - trans.
      // Mix 2 (Result 1 + Input 2): We want Input 2 to start such that it overlaps Result 1 by 'trans'.
      // Result 1 ends at (2*dur - trans).
      // So Input 2 starts at (2*dur - trans) - trans? No.
      // Let's stick to the absolute timeline.
      // Video 0 starts at 0. Ends at D.
      // Video 1 starts at D - d. Ends at (D-d) + D = 2D - d.
      // Video 2 starts at (2D - d) - d = 2D - 2d = 2(D-d).
      // So Video i starts at i * (D-d).
      // The xfade offset is exactly the start time of the SECOND video in the pair.
      // For the accumulated chain:
      // Mix 0+1: offset = D - d.
      // Mix (0+1)+2: offset = 2(D - d).
      // Mix ((..)+i): offset = i * (D - d).
      
      const offset = i * offsetStep;
      
      // Video Filter
      const vLabel = i === loopCount - 1 ? '[vout]' : `[v${i}]`;
      filterComplex += `${lastV}[${i}:v]xfade=transition=fade:duration=${transitionDuration}:offset=${offset.toFixed(3)}${vLabel};`;
      lastV = vLabel; // Update for next iteration ([v1], [v2]...)

      // Audio Filter
      const aLabel = i === loopCount - 1 ? '[aout]' : `[a${i}]`;
      filterComplex += `${lastA}[${i}:a]acrossfade=d=${transitionDuration}${aLabel};`;
      lastA = aLabel;
    }

    // Remove trailing semicolons if any (though my logic puts them at end of line)
    // My loop adds a semicolon at the end of each line.

    return new Promise((resolve, reject) => {
      const args = [
        ...inputArgs,
        '-filter_complex', filterComplex,
        '-map', '[vout]',
        '-map', '[aout]',
        '-c:v', vCodec,
        '-c:a', 'aac', // Always re-encode audio for acrossfade
        '-b:v', '5M', // Set a reasonable default bitrate or copy from source (hard to copy dynamic)
        '-y',
        outputPath
      ];

      onProgress(`Starting Smooth Loop (Re-encode) process...`);
      onProgress(`Encoder: ${vCodec}`);
      onProgress(`Calculated Offset Step: ${offsetStep}s`);
      // onProgress(`Command: ffmpeg ${args.join(' ')}`); // Command might be huge

      const child = spawn(FFMPEG_PATH, args);

      child.stderr.on('data', (data) => {
        const msg = data.toString();
        // Parse time=... to show progress
        onProgress(msg);
      });

      child.on('close', (code) => {
        if (code === 0) {
          onProgress(`Success! Output saved to: ${outputPath}`);
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
    });
  }
}

module.exports = { runExtendVideo };
