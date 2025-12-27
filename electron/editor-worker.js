const { parentPort, workerData } = require('worker_threads');
const { spawn } = require('child_process');

const { jobId, ffmpegPath, payload } = workerData;

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_FPS = 30;

function send(type, data) {
  if (parentPort) {
    parentPort.postMessage({ type, jobId, ...data });
  }
}

function parseTimecode(value) {
  const match = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function safeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function fmt(value) {
  const num = safeNumber(value, 0);
  return Number(num.toFixed(3)).toString();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeText(value) {
  if (!value) return '';
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function buildFallbackArgs(duration, preset) {
  const safeDuration = duration > 0 ? duration : 5;
  const width = safeNumber(preset.width, DEFAULT_WIDTH);
  const height = safeNumber(preset.height, DEFAULT_HEIGHT);
  return [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=black:s=${width}x${height}:d=${fmt(safeDuration)}`,
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-shortest',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k'
  ];
}

function resolveBaseDimensions(timeline, preset) {
  let width = 0;
  let height = 0;
  let fps = 0;

  if (preset.mode === 'fixed') {
    width = safeNumber(preset.width, 0);
    height = safeNumber(preset.height, 0);
    fps = safeNumber(preset.fps, 0);
  }

  if (!width || !height) {
    width = safeNumber(payload.base?.width, 0);
    height = safeNumber(payload.base?.height, 0);
    fps = safeNumber(payload.base?.fps, 0);
  }

  if ((!width || !height) && timeline) {
    const tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
    const clips = Array.isArray(timeline.clips) ? timeline.clips : [];
    const assets = Array.isArray(timeline.assets) ? timeline.assets : [];
    const trackById = new Map(tracks.map((track) => [track.id, track]));
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    const baseClip = clips
      .filter((clip) => trackById.get(clip.trackId)?.type === 'video')
      .sort((a, b) => safeNumber(a.start, 0) - safeNumber(b.start, 0))[0];
    const baseAsset = baseClip ? assetById.get(baseClip.assetId) : null;
    width = safeNumber(baseAsset?.width, width);
    height = safeNumber(baseAsset?.height, height);
    fps = safeNumber(baseAsset?.fps, fps);
  }

  return {
    width: width || DEFAULT_WIDTH,
    height: height || DEFAULT_HEIGHT,
    fps: fps || DEFAULT_FPS
  };
}

function buildGradeFilters(clip) {
  const sections = Array.isArray(clip.grading) ? clip.grading : [];
  const clipStart = safeNumber(clip.start, 0);
  const clipEnd = safeNumber(clip.end, clipStart);
  const filters = [];

  sections.forEach((section) => {
    const sectionStart = safeNumber(section.start, 0);
    const sectionEnd = safeNumber(section.end, 0);
    if (sectionEnd <= sectionStart) return;
    if (sectionEnd <= clipStart || sectionStart >= clipEnd) return;

    const exposure = clamp(safeNumber(section.exposure, 0), -1, 1);
    const contrast = clamp(safeNumber(section.contrast, 1), 0.1, 3);
    const saturation = clamp(safeNumber(section.saturation, 1), 0, 3);
    const temperature = clamp(safeNumber(section.temperature, 0), -1, 1);

    filters.push(
      `eq=brightness=${fmt(exposure)}:contrast=${fmt(contrast)}:saturation=${fmt(saturation)}:enable='between(t,${fmt(sectionStart)},${fmt(sectionEnd)})'`
    );

    if (temperature !== 0) {
      filters.push(
        `colorbalance=rs=${fmt(temperature)}:bs=${fmt(-temperature)}:enable='between(t,${fmt(sectionStart)},${fmt(sectionEnd)})'`
      );
    }
  });

  return filters;
}

function getClipTiming(clip) {
  const start = safeNumber(clip.start, 0);
  const end = safeNumber(clip.end, start);
  const inPoint = safeNumber(clip.inPoint, 0);
  const outPoint = safeNumber(clip.outPoint, 0);
  const sourceDuration = Math.max(0.05, outPoint - inPoint);
  const timelineDuration = Math.max(0.05, end - start);
  return {
    start,
    end,
    inPoint,
    outPoint,
    duration: Math.min(sourceDuration, timelineDuration)
  };
}

function buildArgs() {
  const preset = payload.preset || { mode: 'follow' };
  const outputPath = payload.outputPath;
  const timeline = payload.timeline || null;
  let duration = safeNumber(payload.duration, 0);

  if (!timeline || !Array.isArray(timeline.clips) || timeline.clips.length === 0) {
    const fallbackArgs = buildFallbackArgs(duration, preset);
    return { args: [...fallbackArgs, outputPath], duration: duration > 0 ? duration : 5 };
  }

  const clips = Array.isArray(timeline.clips) ? timeline.clips : [];
  const tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
  const assets = Array.isArray(timeline.assets) ? timeline.assets : [];
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

  if (!duration || duration <= 0) {
    duration = clips.reduce((max, clip) => Math.max(max, safeNumber(clip.end, 0)), 0);
  }
  if (!duration || duration <= 0) {
    duration = 5;
  }

  const base = resolveBaseDimensions(timeline, preset);
  const width = preset.mode === 'fixed' ? safeNumber(preset.width, base.width) : base.width;
  const height = preset.mode === 'fixed' ? safeNumber(preset.height, base.height) : base.height;
  const fps = preset.mode === 'fixed' ? safeNumber(preset.fps, base.fps) : base.fps;

  const inputArgs = [];
  const filterParts = [];
  const clipInputIndex = new Map();

  let inputIndex = 0;

  const registerInput = (clip, asset) => {
    if (clipInputIndex.has(clip.id)) return clipInputIndex.get(clip.id);
    if (asset.type === 'image') {
      inputArgs.push('-loop', '1');
    }
    inputArgs.push('-i', asset.path);
    clipInputIndex.set(clip.id, inputIndex);
    inputIndex += 1;
    return clipInputIndex.get(clip.id);
  };

  const usableClips = clips.filter((clip) => {
    const track = trackById.get(clip.trackId);
    if (!track || track.type === 'text') return false;
    const asset = assetById.get(clip.assetId);
    return asset && asset.path;
  });

  usableClips.forEach((clip) => {
    const asset = assetById.get(clip.assetId);
    if (!asset || !asset.path) return;
    registerInput(clip, asset);
  });

  filterParts.push(`color=c=black:s=${width}x${height}:d=${fmt(duration)}[base0]`);
  let baseLabel = '[base0]';
  let baseIndex = 0;
  let clipIndex = 0;

  const overlayClipStream = (clip, asset) => {
    const timing = getClipTiming(clip);
    const inputLabel = `[${clipInputIndex.get(clip.id)}:v]`;
    const outputLabel = `[v${clipIndex++}]`;
    const gradeFilters = buildGradeFilters(clip);
    const filterChain = [
      `trim=start=${fmt(timing.inPoint)}:duration=${fmt(timing.duration)}`,
      `setpts=PTS-STARTPTS+${fmt(timing.start)}/TB`,
      ...gradeFilters,
      `scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`
    ].join(',');
    filterParts.push(`${inputLabel}${filterChain}${outputLabel}`);
    const nextBase = `[base${++baseIndex}]`;
    filterParts.push(`${baseLabel}${outputLabel}overlay=eof_action=pass${nextBase}`);
    baseLabel = nextBase;
  };

  const clipOrder = (clipList) => {
    return clipList.sort((a, b) => safeNumber(a.start, 0) - safeNumber(b.start, 0));
  };

  const baseVideoClips = clipOrder(
    clips.filter((clip) => trackById.get(clip.trackId)?.type === 'video')
  );
  baseVideoClips.forEach((clip) => {
    const asset = assetById.get(clip.assetId);
    if (!asset || !asset.path) return;
    overlayClipStream(clip, asset);
  });

  const overlayVideoClips = clipOrder(
    clips.filter((clip) => trackById.get(clip.trackId)?.type === 'videoOverlay')
  );
  overlayVideoClips.forEach((clip) => {
    const asset = assetById.get(clip.assetId);
    if (!asset || !asset.path) return;
    overlayClipStream(clip, asset);
  });

  const imageClips = clipOrder(
    clips.filter((clip) => trackById.get(clip.trackId)?.type === 'image')
  );
  imageClips.forEach((clip) => {
    const asset = assetById.get(clip.assetId);
    if (!asset || !asset.path) return;
    overlayClipStream(clip, asset);
  });

  const textClips = clipOrder(
    clips.filter((clip) => trackById.get(clip.trackId)?.type === 'text')
  );
  textClips.forEach((clip) => {
    const textValue = escapeText(clip.text || 'Text');
    const timing = getClipTiming(clip);
    const fontSize = Math.max(24, Math.round(height * 0.08));
    const nextBase = `[base${++baseIndex}]`;
    filterParts.push(
      `${baseLabel}drawtext=text='${textValue}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${fmt(timing.start)},${fmt(timing.end)})'${nextBase}`
    );
    baseLabel = nextBase;
  });

  const audioLabels = [];
  let audioIndex = 0;

  const audioCandidates = clips.filter((clip) => {
    const track = trackById.get(clip.trackId);
    if (!track) return false;
    if (track.type === 'audio') return true;
    if (track.type !== 'video') return false;
    const asset = assetById.get(clip.assetId);
    return asset && asset.hasAudio;
  });

  audioCandidates.forEach((clip) => {
    const asset = assetById.get(clip.assetId);
    if (!asset || !asset.path) return;
    const inputLabel = `[${clipInputIndex.get(clip.id)}:a]`;
    const timing = getClipTiming(clip);
    const label = `[a${audioIndex++}]`;
    const filters = [
      `atrim=start=${fmt(timing.inPoint)}:duration=${fmt(timing.duration)}`,
      'asetpts=PTS-STARTPTS'
    ];
    const delayMs = Math.max(0, Math.round(timing.start * 1000));
    if (delayMs > 0) {
      filters.push(`adelay=${delayMs}:all=1`);
    }
    const volume = safeNumber(clip.volume, 1);
    if (volume !== 1) {
      filters.push(`volume=${fmt(volume)}`);
    }
    filterParts.push(`${inputLabel}${filters.join(',')}${label}`);
    audioLabels.push(label);
  });

  if (audioLabels.length === 1) {
    filterParts.push(
      `${audioLabels[0]}apad=pad_dur=${fmt(duration)},atrim=0:${fmt(duration)}[aout]`
    );
  } else if (audioLabels.length > 1) {
    filterParts.push(
      `${audioLabels.join('')}amix=inputs=${audioLabels.length}:dropout_transition=2,apad=pad_dur=${fmt(duration)},atrim=0:${fmt(duration)}[aout]`
    );
  }

  const args = [
    '-y',
    ...inputArgs,
    '-filter_complex', filterParts.join(';'),
    '-map', baseLabel,
    '-r', String(Math.round(fps)),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-pix_fmt', 'yuv420p'
  ];

  if (audioLabels.length > 0) {
    args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k');
  } else {
    args.push('-an');
  }

  args.push(outputPath);
  return { args, duration };
}

function runRender() {
  const build = buildArgs();
  const args = build.args;
  const duration = build.duration;
  const outputPath = payload.outputPath;

  const proc = spawn(ffmpegPath, args);

  proc.stderr.on('data', (data) => {
    const text = data.toString();
    const lines = text.split(/\r?\n/);
    lines.forEach((line) => {
      const match = /time=([0-9:.]+)/.exec(line);
      if (!match) return;
      const seconds = parseTimecode(match[1]);
      if (seconds === null) return;
      const percent = duration > 0 ? Math.min(100, (seconds / duration) * 100) : null;
      send('progress', { seconds, percent });
    });
  });

  proc.on('close', (code) => {
    if (code === 0) {
      send('done', { outputPath });
    } else {
      send('error', { error: `FFmpeg exited with code ${code}` });
    }
  });
}

runRender();
