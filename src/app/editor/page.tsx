"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Timeline, TimelineEffect, TimelineRow, TimelineState } from "@xzdarcy/react-timeline-editor";
import {
  Copy,
  ClipboardPaste,
  Film,
  Folder,
  Image as ImageIcon,
  Loader2,
  Music,
  Plus,
  Scissors,
  Type
} from "lucide-react";

type AssetType = "video" | "audio" | "image" | "text";
type TrackType = "video" | "audio" | "image" | "text" | "videoOverlay";
type PreviewMode = "live" | "proxy";

interface Asset {
  id: string;
  name: string;
  type: AssetType;
  path?: string;
  duration: number;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  hasAudio?: boolean;
  proxyPath?: string;
}

interface GradingSection {
  id: string;
  start: number;
  end: number;
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
}

interface Clip {
  id: string;
  assetId: string;
  trackId: string;
  name: string;
  start: number;
  end: number;
  inPoint: number;
  outPoint: number;
  volume: number;
  speed: number;
  text?: string;
  grading: GradingSection[];
}

interface Track {
  id: string;
  type: TrackType;
  name: string;
}

const DEFAULT_TRACKS: Track[] = [
  { id: "track-video-1", type: "video", name: "Video 1" },
  { id: "track-audio-1", type: "audio", name: "Audio 1" },
  { id: "track-overlay-video-1", type: "videoOverlay", name: "Overlay Video" },
  { id: "track-text-1", type: "text", name: "Text" },
  { id: "track-image-1", type: "image", name: "Image" }
];

const EFFECTS: Record<string, TimelineEffect> = {
  video: { id: "video", name: "Video" },
  audio: { id: "audio", name: "Audio" },
  image: { id: "image", name: "Image" },
  text: { id: "text", name: "Text" },
  videoOverlay: { id: "videoOverlay", name: "Overlay" }
};

const TRACK_ROW_HEIGHT = 46;
const MIN_SECTION_DURATION = 0.1;
const OVERLAY_ORDER: Record<TrackType, number> = {
  video: 0,
  audio: 0,
  videoOverlay: 1,
  image: 2,
  text: 3
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeGrading = (sections: GradingSection[], clipStart: number, clipEnd: number) => {
  return sections
    .map((section) => ({
      ...section,
      start: clamp(section.start, clipStart, clipEnd),
      end: clamp(section.end, clipStart, clipEnd)
    }))
    .filter((section) => section.end - section.start >= MIN_SECTION_DURATION);
};

const formatTime = (value: number) => {
  const safe = Math.max(0, value);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const pad = (num: number) => String(num).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};

const toLocalMedia = (filePath?: string) => {
  if (!filePath) return "";
  const normalized = filePath.replace(/\\/g, "/");
  return `local-video://${encodeURIComponent(normalized)}`;
};

export default function VideoEditorPage() {
  const timelineRef = useRef<TimelineState>(null);
  const trackListRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const overlayVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  const [tracks] = useState<Track[]>(DEFAULT_TRACKS);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string>(DEFAULT_TRACKS[0].id);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [clipboardClip, setClipboardClip] = useState<Clip | null>(null);
  const [cursorTime, setCursorTime] = useState(0);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("live");
  const [isImporting, setIsImporting] = useState(false);
  const [timelineScrollTop, setTimelineScrollTop] = useState(0);
  const [proxyStatus, setProxyStatus] = useState<Record<string, "idle" | "loading" | "done" | "error">>({});

  const [renderOpen, setRenderOpen] = useState(false);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const renderJobIdRef = useRef<string | null>(null);
  const [renderProgress, setRenderProgress] = useState<number | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [outputName, setOutputName] = useState("ytengine-render.mp4");
  const [presetMode, setPresetMode] = useState<"follow" | "fixed">("follow");
  const [fixedWidth, setFixedWidth] = useState(1920);
  const [fixedHeight, setFixedHeight] = useState(1080);
  const [fixedFps, setFixedFps] = useState(30);

  const clipById = useMemo(() => {
    const map = new Map<string, Clip>();
    clips.forEach((clip) => map.set(clip.id, clip));
    return map;
  }, [clips]);

  const assetById = useMemo(() => {
    const map = new Map<string, Asset>();
    assets.forEach((asset) => map.set(asset.id, asset));
    return map;
  }, [assets]);

  const trackById = useMemo(() => {
    const map = new Map<string, Track>();
    tracks.forEach((track) => map.set(track.id, track));
    return map;
  }, [tracks]);

  const timelineRows = useMemo<TimelineRow[]>(() => {
    return tracks.map((track) => {
      const actions = clips
        .filter((clip) => clip.trackId === track.id)
        .sort((a, b) => a.start - b.start)
        .map((clip) => ({
          id: clip.id,
          start: clip.start,
          end: clip.end,
          effectId: track.type,
          selected: clip.id === selectedClipId
        }));
      return { id: track.id, actions, rowHeight: TRACK_ROW_HEIGHT };
    });
  }, [tracks, clips, selectedClipId]);

  const selectedClip = selectedClipId ? clipById.get(selectedClipId) || null : null;

  const timelineDuration = useMemo(() => {
    return clips.reduce((max, clip) => Math.max(max, clip.end), 0);
  }, [clips]);

  const primaryVideoTrack = tracks.find((track) => track.type === "video");
  const primaryVideoClips = clips
    .filter((clip) => clip.trackId === primaryVideoTrack?.id)
    .sort((a, b) => a.start - b.start);

  const activePreviewClip = useMemo(() => {
    const selectedTrack = selectedClip ? trackById.get(selectedClip.trackId) : null;
    if (selectedClip && selectedTrack?.type === "video") return selectedClip;
    const active = primaryVideoClips.find((clip) => cursorTime >= clip.start && cursorTime <= clip.end);
    return active || primaryVideoClips[0] || null;
  }, [selectedClip, primaryVideoClips, cursorTime, trackById]);

  const activePreviewAsset = activePreviewClip ? assetById.get(activePreviewClip.assetId) : null;
  const activeProxyState = activePreviewAsset?.path ? proxyStatus[activePreviewAsset.path] || "idle" : "idle";

  const overlayClips = useMemo(() => {
    return clips
      .filter((clip) => {
        const track = trackById.get(clip.trackId);
        if (!track) return false;
        if (track.type === "video" || track.type === "audio") return false;
        return cursorTime >= clip.start && cursorTime <= clip.end;
      })
      .sort((a, b) => {
        const trackA = trackById.get(a.trackId);
        const trackB = trackById.get(b.trackId);
        const orderA = trackA ? OVERLAY_ORDER[trackA.type] : 0;
        const orderB = trackB ? OVERLAY_ORDER[trackB.type] : 0;
        return orderA - orderB;
      });
  }, [clips, cursorTime, trackById]);

  const overlayLayers = useMemo(() => {
    return overlayClips
      .map((clip) => ({
        clip,
        track: trackById.get(clip.trackId) || null,
        asset: assetById.get(clip.assetId) || null
      }))
      .filter((layer) => layer.track !== null);
  }, [overlayClips, trackById, assetById]);

  const activeOverlayAssets = useMemo(() => {
    return overlayLayers
      .map((layer) => layer.asset)
      .filter((asset): asset is Asset => Boolean(asset && asset.path));
  }, [overlayLayers]);

  const activeGrade = useMemo(() => {
    if (!activePreviewClip) return null;
    return activePreviewClip.grading.find(
      (section) => cursorTime >= section.start && cursorTime <= section.end
    );
  }, [activePreviewClip, cursorTime]);

  const previewFilter = useMemo(() => {
    if (!activeGrade) return "none";
    const brightness = clamp(1 + activeGrade.exposure, 0.1, 2);
    const contrast = clamp(activeGrade.contrast, 0.2, 3);
    const saturation = clamp(activeGrade.saturation, 0, 3);
    const hue = clamp(activeGrade.temperature * 15, -45, 45);
    return `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${hue}deg)`;
  }, [activeGrade]);

  const basePreviewSource = useMemo(() => {
    if (!activePreviewAsset?.path) return "";
    const path =
      previewMode === "proxy" && activePreviewAsset.proxyPath
        ? activePreviewAsset.proxyPath
        : activePreviewAsset.path;
    return toLocalMedia(path);
  }, [activePreviewAsset?.path, activePreviewAsset?.proxyPath, previewMode]);

  useEffect(() => {
    renderJobIdRef.current = renderJobId;
  }, [renderJobId]);

  useEffect(() => {
    if (!trackListRef.current) return;
    trackListRef.current.scrollTop = timelineScrollTop;
  }, [timelineScrollTop]);

  useEffect(() => {
    if (!activePreviewClip) return;
    const localTime = Math.max(0, cursorTime - activePreviewClip.start + activePreviewClip.inPoint);
    if (previewRef.current && Number.isFinite(localTime)) {
      previewRef.current.currentTime = localTime;
    }
    overlayClips.forEach((clip) => {
      const track = trackById.get(clip.trackId);
      if (track?.type !== "videoOverlay") return;
      const overlayTime = Math.max(0, cursorTime - clip.start + clip.inPoint);
      const element = overlayVideoRefs.current[clip.id];
      if (element && Number.isFinite(overlayTime)) {
        element.currentTime = overlayTime;
      }
    });
  }, [cursorTime, activePreviewClip?.id, overlayClips, trackById]);

  useEffect(() => {
    if (!previewRef.current) return;
    previewRef.current.load();
  }, [activePreviewAsset?.path, previewMode]);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.onRenderProgress((data) => {
      if (data.jobId !== renderJobIdRef.current) return;
      setRenderProgress(data.percent ?? null);
    });
    window.electronAPI.onRenderComplete((data) => {
      if (data.jobId !== renderJobIdRef.current) return;
      setRenderProgress(100);
      setRenderJobId(null);
    });
    window.electronAPI.onRenderError((data) => {
      if (data.jobId !== renderJobIdRef.current) return;
      setRenderError(data.error);
      setRenderJobId(null);
    });
    window.electronAPI.onProxyProgress((data) => {
      setProxyStatus((prev) => ({
        ...prev,
        [data.filePath]: data.status === "start" ? "loading" : data.status === "complete" ? "done" : "error"
      }));
      if (data.status === "complete" && data.proxyPath) {
        setAssets((prev) =>
          prev.map((asset) =>
            asset.path === data.filePath ? { ...asset, proxyPath: data.proxyPath } : asset
          )
        );
      }
    });
  }, []);

  const handleImport = async () => {
    if (!window.electronAPI) return;
    setIsImporting(true);
    try {
      const files = await window.electronAPI.selectMediaFiles();
      if (!files.length) return;
      const results = await Promise.all(
        files.map(async (filePath) => {
          const probe = await window.electronAPI.probeMedia(filePath);
          return { filePath, probe };
        })
      );
      setAssets((prev) => {
        const existing = new Set(prev.map((asset) => asset.path));
        const next = [...prev];
        results.forEach(({ filePath, probe }) => {
          if (existing.has(filePath)) return;
          const name = filePath.split(/[\\/]/).pop() || "media";
          const id = `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const type = name.match(/\.(mp3|wav|aac|flac)$/i)
            ? "audio"
            : name.match(/\.(png|jpg|jpeg|gif)$/i)
            ? "image"
            : "video";
          const duration = probe.success ? Math.max(0, probe.data?.duration || 0) : 0;
          next.push({
            id,
            name,
            type,
            path: filePath,
            duration: duration || 5,
            width: probe.success ? probe.data?.width || null : null,
            height: probe.success ? probe.data?.height || null : null,
            fps: probe.success ? probe.data?.fps || null : null,
            hasAudio: probe.success ? probe.data?.hasAudio || false : false
          });
        });
        return next;
      });
    } finally {
      setIsImporting(false);
    }
  };

  const resolveTrackForAsset = (asset: Asset) => {
    const selectedTrack = tracks.find((track) => track.id === selectedTrackId);
    if (selectedTrack) {
      if (asset.type === "video" && (selectedTrack.type === "video" || selectedTrack.type === "videoOverlay")) {
        return selectedTrack.id;
      }
      if (asset.type === "audio" && selectedTrack.type === "audio") {
        return selectedTrack.id;
      }
      if (asset.type === "image" && selectedTrack.type === "image") {
        return selectedTrack.id;
      }
    }
    const fallback = tracks.find((track) => track.type === asset.type) || tracks[0];
    return fallback.id;
  };

  const addClipFromAsset = (asset: Asset) => {
    const trackId = resolveTrackForAsset(asset);
    const duration = Math.max(0.5, asset.duration || 5);
    const start = cursorTime;
    const end = start + duration;
    setClips((prev) => [
      ...prev,
      {
        id: `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        assetId: asset.id,
        trackId,
        name: asset.name,
        start,
        end,
        inPoint: 0,
        outPoint: duration,
        volume: 1,
        speed: 1,
        grading: []
      }
    ]);
  };

  const addTextOverlay = () => {
    const id = `asset-text-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const clipId = `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const duration = 5;
    const start = cursorTime;
    const end = start + duration;
    setAssets((prev) => [
      ...prev,
      { id, name: "Text Overlay", type: "text", duration }
    ]);
    const textTrack = tracks.find((track) => track.type === "text") || tracks[0];
    setClips((prev) => [
      ...prev,
      {
        id: clipId,
        assetId: id,
        trackId: textTrack.id,
        name: "Text Overlay",
        start,
        end,
        inPoint: 0,
        outPoint: duration,
        volume: 1,
        speed: 1,
        text: "Title Text",
        grading: []
      }
    ]);
    setSelectedClipId(clipId);
  };

  const handleCut = () => {
    if (!selectedClip) return;
    if (cursorTime <= selectedClip.start || cursorTime >= selectedClip.end) return;
    const firstDuration = cursorTime - selectedClip.start;
    const secondDuration = selectedClip.end - cursorTime;
    if (firstDuration <= 0 || secondDuration <= 0) return;

    const firstOut = selectedClip.inPoint + firstDuration;
    const secondIn = firstOut;

    const firstClip: Clip = {
      ...selectedClip,
      id: `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      end: cursorTime,
      outPoint: firstOut
    };
    const secondClip: Clip = {
      ...selectedClip,
      id: `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      start: cursorTime,
      inPoint: secondIn
    };

    setClips((prev) => prev.filter((clip) => clip.id !== selectedClip.id).concat([firstClip, secondClip]));
    setSelectedClipId(secondClip.id);
  };

  const handleCopy = () => {
    if (!selectedClip) return;
    setClipboardClip({ ...selectedClip });
  };

  const handlePaste = () => {
    if (!clipboardClip) return;
    const asset = assetById.get(clipboardClip.assetId);
    if (!asset) return;
    const duration = clipboardClip.end - clipboardClip.start;
    const trackId = resolveTrackForAsset(asset);
    const start = cursorTime;
    const end = start + duration;
    const newClip: Clip = {
      ...clipboardClip,
      id: `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      trackId,
      start,
      end
    };
    setClips((prev) => [...prev, newClip]);
    setSelectedClipId(newClip.id);
  };

  const handleTimelineMoveEnd = (actionId: string, start: number, end: number) => {
    setClips((prev) =>
      prev.map((clip) => {
        if (clip.id !== actionId) return clip;
        const delta = start - clip.start;
        const shifted = clip.grading.map((section) => ({
          ...section,
          start: section.start + delta,
          end: section.end + delta
        }));
        return { ...clip, start, end, grading: normalizeGrading(shifted, start, end) };
      })
    );
  };

  const handleTimelineResizeEnd = (actionId: string, start: number, end: number, dir: "left" | "right") => {
    setClips((prev) =>
      prev.map((clip) => {
        if (clip.id !== actionId) return clip;
        const deltaStart = start - clip.start;
        const deltaEnd = end - clip.end;
        if (dir === "left") {
          const nextIn = Math.max(0, clip.inPoint + deltaStart);
          const shifted = clip.grading.map((section) => ({
            ...section,
            start: section.start + deltaStart,
            end: section.end + deltaStart
          }));
          return { ...clip, start, end, inPoint: nextIn, grading: normalizeGrading(shifted, start, end) };
        }
        const nextOut = Math.max(clip.inPoint, clip.outPoint + deltaEnd);
        return { ...clip, start, end, outPoint: nextOut, grading: normalizeGrading(clip.grading, start, end) };
      })
    );
  };

  const queueProxyForAsset = async (asset: Asset, force = false) => {
    if (!window.electronAPI || !asset.path) return;
    const status = proxyStatus[asset.path] || "idle";
    if (!force && status !== "idle") return;
    if (status === "loading" || status === "done") return;
    setProxyStatus((prev) => ({ ...prev, [asset.path as string]: "loading" }));
    const result = await window.electronAPI.generateProxy({ filePath: asset.path, maxWidth: 1280 });
    if (result.success && result.proxyPath) {
      setAssets((prev) =>
        prev.map((item) =>
          item.path === asset.path ? { ...item, proxyPath: result.proxyPath } : item
        )
      );
      setProxyStatus((prev) => ({ ...prev, [asset.path as string]: "done" }));
    } else if (!result.success) {
      setProxyStatus((prev) => ({ ...prev, [asset.path as string]: "error" }));
    }
  };

  useEffect(() => {
    if (previewMode !== "proxy") return;
    const assetsToQueue = [activePreviewAsset, ...activeOverlayAssets].filter(
      (asset): asset is Asset => Boolean(asset && asset.path)
    );
    assetsToQueue.forEach((asset) => {
      queueProxyForAsset(asset, false);
    });
  }, [previewMode, activePreviewAsset, activeOverlayAssets, proxyStatus]);

  const handleProxyGenerate = async () => {
    if (!activePreviewAsset) return;
    await queueProxyForAsset(activePreviewAsset, true);
  };

  const handleRender = async () => {
    if (!window.electronAPI) return;
    setRenderError(null);
    setRenderProgress(null);

    const primaryClip = primaryVideoClips[0];
    const primaryAsset = primaryClip ? assetById.get(primaryClip.assetId) : null;
    const duration = Math.max(0.5, timelineDuration || 0);
    const base = {
      width: primaryAsset?.width || null,
      height: primaryAsset?.height || null,
      fps: primaryAsset?.fps || null
    };
    const preset =
      presetMode === "fixed"
        ? { mode: "fixed" as const, width: fixedWidth, height: fixedHeight, fps: fixedFps }
        : { mode: "follow" as const };
    const payload = {
      outputDir,
      outputName,
      duration,
      preset,
      base,
      timeline: {
        tracks: tracks.map((track) => ({ id: track.id, type: track.type, name: track.name })),
        assets: assets.map((asset) => ({
          id: asset.id,
          type: asset.type,
          path: asset.path || null,
          hasAudio: asset.hasAudio ?? false,
          width: asset.width || null,
          height: asset.height || null,
          fps: asset.fps || null,
          duration: asset.duration
        })),
        clips: clips.map((clip) => ({
          id: clip.id,
          assetId: clip.assetId,
          trackId: clip.trackId,
          name: clip.name,
          start: clip.start,
          end: clip.end,
          inPoint: clip.inPoint,
          outPoint: clip.outPoint,
          volume: clip.volume,
          speed: clip.speed,
          text: clip.text || null,
          grading: clip.grading.map((section) => ({
            id: section.id,
            start: section.start,
            end: section.end,
            exposure: section.exposure,
            contrast: section.contrast,
            saturation: section.saturation,
            temperature: section.temperature
          }))
        }))
      }
    };

    const result = await window.electronAPI.startRender(payload);
    if (!result.success) {
      setRenderError(result.error || "Failed to start render");
      return;
    }
    setRenderJobId(result.jobId || null);
    setRenderProgress(0);
  };

  const handleSelectOutputDir = async () => {
    if (!window.electronAPI) return;
    const dir = await window.electronAPI.selectFolder();
    if (dir) setOutputDir(dir);
  };

  const handleTrimUpdate = (field: "inPoint" | "outPoint", value: number) => {
    if (!selectedClip) return;
    const nextValue = Math.max(0, value);
    const minDuration = 0.5;
    setClips((prev) =>
      prev.map((clip) => {
        if (clip.id !== selectedClip.id) return clip;
        let nextIn = clip.inPoint;
        let nextOut = clip.outPoint;
        if (field === "inPoint") {
          nextIn = Math.min(nextValue, nextOut - minDuration);
        } else {
          nextOut = Math.max(nextValue, nextIn + minDuration);
        }
        const duration = Math.max(minDuration, nextOut - nextIn);
        const nextEnd = clip.start + duration;
        return { ...clip, inPoint: nextIn, outPoint: nextOut, end: nextEnd, grading: normalizeGrading(clip.grading, clip.start, nextEnd) };
      })
    );
  };

  const addGradingSection = () => {
    if (!selectedClip) return;
    const sectionStart = Math.max(selectedClip.start, Math.min(cursorTime, selectedClip.end - 0.5));
    const sectionEnd = Math.min(selectedClip.end, sectionStart + 2);
    const newSection: GradingSection = {
      id: `grade-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      start: sectionStart,
      end: sectionEnd,
      exposure: 0,
      contrast: 1,
      saturation: 1,
      temperature: 0
    };
    setClips((prev) =>
      prev.map((clip) =>
        clip.id === selectedClip.id ? { ...clip, grading: [...clip.grading, newSection] } : clip
      )
    );
  };

  const updateGrading = (sectionId: string, field: keyof GradingSection, value: number) => {
    if (!selectedClip) return;
    setClips((prev) =>
      prev.map((clip) => {
        if (clip.id !== selectedClip.id) return clip;
        return {
          ...clip,
          grading: clip.grading.map((section) =>
            section.id === sectionId ? { ...section, [field]: value } : section
          )
        };
      })
    );
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-gray-800 pb-5">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Video Editor</h2>
          <p className="text-gray-400 mt-1 text-sm">Full-track timeline with live or proxy preview</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-gray-800 bg-gray-900/70 p-1 text-xs">
            <button
              className={`px-3 py-1 rounded-md ${previewMode === "live" ? "bg-cyan-500/20 text-cyan-300" : "text-gray-400"}`}
              onClick={() => setPreviewMode("live")}
            >
              Live
            </button>
            <button
              className={`px-3 py-1 rounded-md ${previewMode === "proxy" ? "bg-cyan-500/20 text-cyan-300" : "text-gray-400"}`}
              onClick={() => setPreviewMode("proxy")}
            >
              Proxy
            </button>
          </div>
          <button
            onClick={() => setRenderOpen(true)}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-lg shadow-blue-900/30"
          >
            Render
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[260px_1fr_300px] gap-4">
        <div className="bg-[#141414] border border-gray-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Media Bin</h3>
            <button
              onClick={handleImport}
              disabled={isImporting}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-md border border-gray-700 flex items-center gap-2"
            >
              {isImporting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Import
            </button>
          </div>

          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {assets.length === 0 ? (
              <div className="text-xs text-gray-500 italic">No media imported.</div>
            ) : (
              assets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => addClipFromAsset(asset)}
                  className="w-full flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 text-left hover:border-cyan-600/50"
                >
                  {asset.type === "video" && <Film size={16} className="text-cyan-400" />}
                  {asset.type === "audio" && <Music size={16} className="text-amber-400" />}
                  {asset.type === "image" && <ImageIcon size={16} className="text-emerald-400" />}
                  {asset.type === "text" && <Type size={16} className="text-violet-400" />}
                  <div className="flex-1">
                    <div className="text-xs text-gray-200 truncate">{asset.name}</div>
                    <div className="text-[10px] text-gray-500">{formatTime(asset.duration)}</div>
                  </div>
                  <span className="text-[10px] text-gray-500">Add</span>
                </button>
              ))
            )}
          </div>

          <button
            onClick={addTextOverlay}
            className="w-full px-3 py-2 bg-gray-900 hover:bg-gray-800 text-xs text-gray-300 rounded-lg border border-gray-800 flex items-center justify-center gap-2"
          >
            <Type size={12} />
            Add Text Overlay
          </button>
        </div>

        <div className="bg-[#141414] border border-gray-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Preview</h3>
            <div className="text-[10px] text-gray-500">Cursor: {formatTime(cursorTime)}</div>
          </div>

          <div className="aspect-video bg-black rounded-lg border border-gray-900 relative overflow-hidden">
            <div className="absolute inset-0">
              {activePreviewAsset?.type === "video" ? (
                <video
                  key={`${activePreviewAsset.path}-${previewMode}`}
                  ref={previewRef}
                  src={basePreviewSource}
                  controls
                  className="w-full h-full object-contain"
                  style={{ filter: previewFilter }}
                />
              ) : activePreviewAsset?.type === "image" ? (
                <img
                  src={basePreviewSource}
                  alt={activePreviewAsset.name}
                  className="w-full h-full object-contain"
                  style={{ filter: previewFilter }}
                />
              ) : activePreviewClip?.text ? (
                <div className="w-full h-full flex items-center justify-center text-white text-3xl font-bold">
                  {activePreviewClip.text}
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                  No preview source
                </div>
              )}
            </div>

            <div className="absolute inset-0 pointer-events-none">
              {overlayLayers.map((layer) => {
                const { clip, track, asset } = layer;
                if (!track) return null;
                if (track.type === "videoOverlay" && asset?.path) {
                  const srcPath =
                    previewMode === "proxy" && asset.proxyPath ? asset.proxyPath : asset.path;
                  return (
                    <video
                      key={`${clip.id}-${srcPath}`}
                      ref={(element) => {
                        overlayVideoRefs.current[clip.id] = element;
                      }}
                      src={toLocalMedia(srcPath)}
                      muted
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  );
                }
                if (track.type === "image" && asset?.path) {
                  return (
                    <img
                      key={`${clip.id}-${asset.path}`}
                      src={toLocalMedia(asset.path)}
                      alt={asset.name}
                      className="absolute inset-0 w-full h-full object-contain opacity-90"
                    />
                  );
                }
                if (track.type === "text") {
                  return (
                    <div
                      key={clip.id}
                      className="absolute inset-0 flex items-center justify-center text-white text-3xl font-bold drop-shadow-lg"
                    >
                      {clip.text || "Text"}
                    </div>
                  );
                }
                return null;
              })}
            </div>

            {previewMode === "proxy" && activePreviewAsset?.path && !activePreviewAsset.proxyPath && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 text-xs text-gray-300">
                {activeProxyState === "loading" && (
                  <div className="flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin" />
                    Generating proxy...
                  </div>
                )}
                {activeProxyState === "error" && <span>Proxy failed</span>}
                {activeProxyState === "idle" && <span>Proxy not generated</span>}
                <button
                  onClick={handleProxyGenerate}
                  disabled={activeProxyState === "loading"}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-md border border-gray-700"
                >
                  Generate Proxy
                </button>
              </div>
            )}
          </div>

          {activePreviewAsset?.path && (
            <div className="text-[10px] text-gray-500 truncate">
              Source: {activePreviewAsset.path}
            </div>
          )}
        </div>

        <div className="bg-[#141414] border border-gray-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Inspector</h3>
            <span className="text-[10px] text-gray-500">{selectedClip ? "Clip" : "None"}</span>
          </div>

          {!selectedClip ? (
            <div className="text-xs text-gray-500 italic">Select a clip to edit.</div>
          ) : (
            <div className="space-y-4 text-xs text-gray-300">
              <div>
                <div className="text-[10px] text-gray-500 mb-1">Clip</div>
                <div className="text-sm text-white">{selectedClip.name}</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] text-gray-500">
                  Start
                  <input
                    type="number"
                    value={selectedClip.start.toFixed(2)}
                    disabled
                    className="mt-1 w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-gray-300"
                  />
                </label>
                <label className="text-[10px] text-gray-500">
                  End
                  <input
                    type="number"
                    value={selectedClip.end.toFixed(2)}
                    disabled
                    className="mt-1 w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-gray-300"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] text-gray-500">
                  In
                  <input
                    type="number"
                    value={selectedClip.inPoint.toFixed(2)}
                    onChange={(event) => handleTrimUpdate("inPoint", Number(event.target.value))}
                    className="mt-1 w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-gray-300"
                  />
                </label>
                <label className="text-[10px] text-gray-500">
                  Out
                  <input
                    type="number"
                    value={selectedClip.outPoint.toFixed(2)}
                    onChange={(event) => handleTrimUpdate("outPoint", Number(event.target.value))}
                    className="mt-1 w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-gray-300"
                  />
                </label>
              </div>

              {selectedClip.text !== undefined && (
                <label className="text-[10px] text-gray-500">
                  Text
                  <input
                    type="text"
                    value={selectedClip.text}
                    onChange={(event) =>
                      setClips((prev) =>
                        prev.map((clip) =>
                          clip.id === selectedClip.id ? { ...clip, text: event.target.value } : clip
                        )
                      )
                    }
                    className="mt-1 w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-gray-300"
                  />
                </label>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">Color Grading</span>
                  <button
                    onClick={addGradingSection}
                    className="px-2 py-1 text-[10px] bg-gray-900 hover:bg-gray-800 rounded border border-gray-800"
                  >
                    Add Section
                  </button>
                </div>

                {selectedClip.grading.length === 0 ? (
                  <div className="text-[10px] text-gray-500 italic">No grading sections.</div>
                ) : (
                  <div className="space-y-3">
                    {selectedClip.grading.map((section) => (
                      <div key={section.id} className="bg-gray-900/60 border border-gray-800 rounded-lg p-2 space-y-2">
                        <div className="text-[10px] text-gray-500">
                          {formatTime(section.start)} - {formatTime(section.end)}
                        </div>
                        <label className="text-[10px] text-gray-500 flex items-center gap-2">
                          Exposure
                          <input
                            type="range"
                            min={-1}
                            max={1}
                            step={0.05}
                            value={section.exposure}
                            onChange={(event) => updateGrading(section.id, "exposure", Number(event.target.value))}
                            className="flex-1"
                          />
                        </label>
                        <label className="text-[10px] text-gray-500 flex items-center gap-2">
                          Contrast
                          <input
                            type="range"
                            min={0.5}
                            max={2}
                            step={0.05}
                            value={section.contrast}
                            onChange={(event) => updateGrading(section.id, "contrast", Number(event.target.value))}
                            className="flex-1"
                          />
                        </label>
                        <label className="text-[10px] text-gray-500 flex items-center gap-2">
                          Saturation
                          <input
                            type="range"
                            min={0}
                            max={2}
                            step={0.05}
                            value={section.saturation}
                            onChange={(event) => updateGrading(section.id, "saturation", Number(event.target.value))}
                            className="flex-1"
                          />
                        </label>
                        <label className="text-[10px] text-gray-500 flex items-center gap-2">
                          Temperature
                          <input
                            type="range"
                            min={-1}
                            max={1}
                            step={0.05}
                            value={section.temperature}
                            onChange={(event) => updateGrading(section.id, "temperature", Number(event.target.value))}
                            className="flex-1"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-[#141414] border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/40">
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <button
              onClick={handleCut}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded-md border border-gray-700 flex items-center gap-1"
            >
              <Scissors size={12} />
              Cut
            </button>
            <button
              onClick={handleCopy}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded-md border border-gray-700 flex items-center gap-1"
            >
              <Copy size={12} />
              Copy
            </button>
            <button
              onClick={handlePaste}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded-md border border-gray-700 flex items-center gap-1"
            >
              <ClipboardPaste size={12} />
              Paste
            </button>
          </div>
          <div className="text-[10px] text-gray-500">Duration: {formatTime(timelineDuration)}</div>
        </div>

        <div className="grid grid-cols-[200px_1fr]">
          <div
            ref={trackListRef}
            onScroll={(event) => {
              const scrollTop = event.currentTarget.scrollTop;
              setTimelineScrollTop(scrollTop);
              timelineRef.current?.setScrollTop(scrollTop);
            }}
            className="max-h-[360px] overflow-y-auto border-r border-gray-800 bg-[#101010]"
          >
            <div className="h-[32px] border-b border-gray-800 text-[10px] uppercase tracking-wider text-gray-500 flex items-center px-3">
              Tracks
            </div>
            {tracks.map((track) => (
              <button
                key={track.id}
                onClick={() => setSelectedTrackId(track.id)}
                className={`w-full flex items-center gap-2 px-3 border-b border-gray-800 text-xs ${
                  selectedTrackId === track.id ? "bg-gray-800/70 text-white" : "text-gray-400 hover:bg-gray-900"
                }`}
                style={{ height: TRACK_ROW_HEIGHT }}
              >
                {track.type === "video" && <Film size={14} className="text-cyan-400" />}
                {track.type === "audio" && <Music size={14} className="text-amber-400" />}
                {track.type === "videoOverlay" && <Film size={14} className="text-violet-400" />}
                {track.type === "text" && <Type size={14} className="text-emerald-400" />}
                {track.type === "image" && <ImageIcon size={14} className="text-emerald-400" />}
                <span className="truncate">{track.name}</span>
              </button>
            ))}
          </div>

          <div className="h-[360px]">
            <Timeline
              ref={timelineRef}
              editorData={timelineRows}
              effects={EFFECTS}
              rowHeight={TRACK_ROW_HEIGHT}
              scale={1}
              scaleWidth={90}
              scaleSplitCount={5}
              minScaleCount={10}
              startLeft={0}
              dragLine
              gridSnap
              onScroll={(params) => setTimelineScrollTop(params.scrollTop)}
              onClickRow={(event, data) => {
                setSelectedTrackId(data.row.id);
                setSelectedClipId(null);
              }}
              onClickAction={(event, data) => {
                setSelectedTrackId(data.row.id);
                setSelectedClipId(data.action.id);
              }}
              onActionMoveEnd={(data) => {
                handleTimelineMoveEnd(data.action.id, data.start, data.end);
              }}
              onActionResizeEnd={(data) => {
                handleTimelineResizeEnd(data.action.id, data.start, data.end, data.dir);
              }}
              onCursorDrag={(time) => setCursorTime(time)}
              onClickTimeArea={(time) => {
                setCursorTime(time);
                return true;
              }}
              onChange={() => {}}
              getScaleRender={(value) => formatTime(value)}
              getActionRender={(action) => {
                const clip = clipById.get(action.id);
                if (!clip) return null;
                const isSelected = clip.id === selectedClipId;
                return (
                  <div
                    className={`h-full w-full rounded-md border px-2 py-1 text-[10px] ${
                      isSelected ? "border-cyan-400 text-cyan-100 bg-cyan-500/10" : "border-gray-700 bg-gray-900 text-gray-200"
                    }`}
                  >
                    <div className="truncate">{clip.name}</div>
                    <div className="text-[9px] text-gray-500">{formatTime(clip.end - clip.start)}</div>
                  </div>
                );
              }}
            />
          </div>
        </div>
      </div>

      {renderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
          <div className="w-full max-w-lg bg-[#111] border border-gray-800 rounded-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Render Settings</h3>
              <button
                onClick={() => setRenderOpen(false)}
                className="text-gray-500 hover:text-white text-xs"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-300">
              <label className="block">
                Output Name
                <input
                  type="text"
                  value={outputName}
                  onChange={(event) => setOutputName(event.target.value)}
                  className="mt-1 w-full bg-gray-900 border border-gray-800 rounded px-3 py-2 text-xs"
                />
              </label>

              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-xs text-gray-400">
                  {outputDir || "Default exports folder"}
                </div>
                <button
                  onClick={handleSelectOutputDir}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-xs text-gray-200 rounded-md border border-gray-700 flex items-center gap-2"
                >
                  <Folder size={12} />
                  Browse
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPresetMode("follow")}
                  className={`flex-1 px-3 py-2 rounded-md border text-xs ${
                    presetMode === "follow" ? "border-cyan-500 text-cyan-300 bg-cyan-500/10" : "border-gray-700 text-gray-400"
                  }`}
                >
                  Follow Source
                </button>
                <button
                  onClick={() => setPresetMode("fixed")}
                  className={`flex-1 px-3 py-2 rounded-md border text-xs ${
                    presetMode === "fixed" ? "border-cyan-500 text-cyan-300 bg-cyan-500/10" : "border-gray-700 text-gray-400"
                  }`}
                >
                  Fixed
                </button>
              </div>

              {presetMode === "fixed" && (
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-[10px] text-gray-500">
                    Width
                    <input
                      type="number"
                      value={fixedWidth}
                      onChange={(event) => setFixedWidth(Number(event.target.value))}
                      className="mt-1 w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-gray-300"
                    />
                  </label>
                  <label className="text-[10px] text-gray-500">
                    Height
                    <input
                      type="number"
                      value={fixedHeight}
                      onChange={(event) => setFixedHeight(Number(event.target.value))}
                      className="mt-1 w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-gray-300"
                    />
                  </label>
                  <label className="text-[10px] text-gray-500">
                    FPS
                    <input
                      type="number"
                      value={fixedFps}
                      onChange={(event) => setFixedFps(Number(event.target.value))}
                      className="mt-1 w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-gray-300"
                    />
                  </label>
                </div>
              )}
            </div>

            {renderError && <div className="text-xs text-red-400">{renderError}</div>}
            {renderJobId && (
              <div className="text-xs text-gray-400">
                Rendering... {renderProgress !== null ? `${renderProgress.toFixed(0)}%` : "Working"}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setRenderOpen(false)}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleRender}
                disabled={Boolean(renderJobId)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-md"
              >
                Start Render
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
