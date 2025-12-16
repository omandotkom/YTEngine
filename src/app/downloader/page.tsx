"use client";

import { useEffect, useState, useRef } from "react";
import { Download, Terminal, AlertCircle, CheckCircle2, Loader2, FileVideo, Music, X, Plus, Trash2, Folder, Play } from "lucide-react";
import VideoPlayerModal from "@/components/VideoPlayerModal";
import DownloadHistoryTable from "@/components/DownloadHistoryTable";

interface InputRow {
  id: string; // Unique ID for UI key
  url: string;
  format: 'video' | 'audio';
}

export default function DownloaderPage() {
  const [engineStatus, setEngineStatus] = useState<{ 
    ready: boolean; 
    ytdlpVersion: string | null; 
    ffmpegVersion: string | null;
    checking: boolean 
  }>({
    ready: false,
    ytdlpVersion: null,
    ffmpegVersion: null,
    checking: true,
  });

  // Bulk Input State
  const [inputRows, setInputRows] = useState<InputRow[]>([
    { id: '1', url: '', format: 'video' }
  ]);
  const [customPath, setCustomPath] = useState<string | null>(null);

  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Video Player State
  const [playerState, setPlayerState] = useState<{ isOpen: boolean; path: string | null }>({
    isOpen: false,
    path: null
  });

  useEffect(() => {
    checkEngine();
    
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.onDownloadProgress((log) => addLog(log));
      window.electronAPI.onDownloadError((log) => addLog(`ERROR: ${log}`));
      window.electronAPI.onInstallProgress((msg) => setInstallProgress(msg));
      
      // Auto-open player on success if it was a single active download (optional, maybe distracting in bulk mode)
      // window.electronAPI.onDownloadSuccess(...) -> We disable auto-popup for bulk mode to not annoy user
    }
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const checkEngine = async () => {
    if (!window.electronAPI) return;
    setEngineStatus(prev => ({ ...prev, checking: true }));
    
    const status = await window.electronAPI.checkYtDlp();
    setEngineStatus({
      ready: status.exists,
      ytdlpVersion: status.ytdlpVersion,
      ffmpegVersion: status.ffmpegVersion,
      checking: false
    });
    
    if (status.exists) {
      addLog(`Engine ready: yt-dlp ${status.ytdlpVersion}, FFmpeg ${status.ffmpegVersion}`);
    }
  };

  const handleInstallEngine = async () => {
    setIsInstalling(true);
    addLog("Starting engine installation...");
    try {
      const res = await window.electronAPI.updateYtDlp();
      if (res.success) {
        addLog("Engines installed!");
        await checkEngine();
      } else {
        addLog(`Install Failed: ${res.error}`);
      }
    } finally {
      setIsInstalling(false);
    }
  };

  const handleCancel = async () => {
    await window.electronAPI.cancelDownload();
    addLog("Cancellation requested.");
  };

  const handleBrowseFolder = async () => {
    const path = await window.electronAPI.selectFolder();
    if (path) setCustomPath(path);
  };

  const addRow = () => {
    setInputRows([...inputRows, { id: Date.now().toString(), url: '', format: 'video' }]);
  };

  const removeRow = (id: string) => {
    if (inputRows.length > 1) {
      setInputRows(inputRows.filter(r => r.id !== id));
    }
  };

  const updateRow = (id: string, field: keyof InputRow, value: any) => {
    setInputRows(inputRows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleDownloadAll = async () => {
    const validRows = inputRows.filter(r => r.url.trim() !== "");
    if (validRows.length === 0) {
      addLog("Please enter at least one valid URL.");
      return;
    }

    addLog(`Queueing ${validRows.length} downloads...`);
    
    // Process sequentially (or parallel add to queue)
    for (const row of validRows) {
      try {
        await window.electronAPI.startDownload({
          url: row.url,
          format: row.format,
          customPath: customPath || undefined
        });
        addLog(`Added to Queue: ${row.url}`);
      } catch (e: any) {
        addLog(`Failed to queue ${row.url}: ${e.message}`);
      }
    }
    
    // Reset inputs after queuing
    setInputRows([{ id: Date.now().toString(), url: '', format: 'video' }]);
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg.trim()]);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-10">
      <VideoPlayerModal 
        isOpen={playerState.isOpen} 
        videoPath={playerState.path} 
        onClose={() => setPlayerState({ ...playerState, isOpen: false })} 
      />

      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
          <Download className="text-red-500" size={32} />
          Bulk Downloader
        </h2>
        <p className="text-gray-400 mt-2">Queue multiple videos or audios. Supports custom directories.</p>
      </div>

      {/* Engine Status */}
      {!engineStatus.ready && (
         <div className="p-4 rounded-xl border bg-amber-950/20 border-amber-900/50 flex justify-between items-center">
            <div className="flex items-center gap-3">
               <AlertCircle className="text-amber-500" />
               <div>
                  <h4 className="text-white font-medium">Core Engine Missing</h4>
                  <p className="text-xs text-gray-400">yt-dlp or ffmpeg not found.</p>
               </div>
            </div>
            <button 
              onClick={handleInstallEngine}
              disabled={isInstalling}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg"
            >
              {isInstalling ? (installProgress || "INSTALLING...") : "INSTALL ENGINES"}
            </button>
         </div>
      )}

      {/* QUEUE BUILDER AREA */}
      <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6 opacity-100 transition-opacity space-y-4">
        
        {/* Directory Selector */}
        <div className="flex gap-2 items-center mb-4">
           <div className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400 flex items-center gap-2">
              <Folder size={14} className="text-gray-500" />
              {customPath || "Default Downloads Folder"}
           </div>
           <button 
             onClick={handleBrowseFolder}
             className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 text-xs font-medium"
           >
             Change Folder
           </button>
        </div>

        {/* Dynamic Rows */}
        <div className="space-y-2">
           {inputRows.map((row, index) => (
             <div key={row.id} className="flex gap-2 animate-in slide-in-from-left-2 duration-200">
                {/* Format Toggle */}
                <div className="flex bg-gray-950 rounded-lg border border-gray-700 p-1">
                   <button
                     onClick={() => updateRow(row.id, 'format', 'video')}
                     className={`p-2 rounded ${row.format === 'video' ? 'bg-red-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                     title="Video (MP4)"
                   >
                     <FileVideo size={16} />
                   </button>
                   <button
                     onClick={() => updateRow(row.id, 'format', 'audio')}
                     className={`p-2 rounded ${row.format === 'audio' ? 'bg-red-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                     title="Audio (MP3)"
                   >
                     <Music size={16} />
                   </button>
                </div>

                {/* URL Input */}
                <input 
                  type="text" 
                  placeholder={`Paste URL #${index + 1}...`}
                  value={row.url}
                  onChange={(e) => updateRow(row.id, 'url', e.target.value)}
                  disabled={!engineStatus.ready}
                  className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-4 text-white focus:outline-none focus:border-red-500 transition-colors text-sm"
                />

                {/* Remove Button */}
                {inputRows.length > 1 && (
                  <button 
                    onClick={() => removeRow(row.id)}
                    className="p-3 text-gray-500 hover:text-red-500 hover:bg-gray-900 rounded-lg border border-transparent hover:border-gray-800 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
             </div>
           ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-gray-800">
           <button 
             onClick={addRow}
             className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium border border-gray-700 transition-colors"
           >
             <Plus size={16} />
             Add Row
           </button>
           
           <div className="flex-1"></div>

           <button 
             onClick={handleCancel}
             className="px-4 py-2 bg-transparent hover:bg-red-950/30 text-red-500 rounded-lg text-sm font-medium border border-red-900/50 transition-colors"
           >
             Stop Current
           </button>

           <button 
             onClick={handleDownloadAll}
             disabled={!engineStatus.ready}
             className="flex items-center gap-2 px-6 py-2 bg-white hover:bg-gray-200 text-black rounded-lg text-sm font-bold shadow-lg shadow-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
           >
             <Download size={16} />
             DOWNLOAD ALL
           </button>
        </div>
      </div>

      {/* Terminal Log */}
      <div className="bg-black rounded-xl border border-gray-800 overflow-hidden font-mono text-xs shadow-2xl h-48">
        <div className="bg-gray-900 px-4 py-2 flex items-center gap-2 border-b border-gray-800">
          <Terminal size={14} className="text-gray-500" />
          <span className="text-gray-500">Live Process Output</span>
        </div>
        <div className="p-4 h-full overflow-y-auto space-y-1 text-gray-300 pb-10">
          {logs.map((log, i) => (
            <div key={i} className="break-all border-l-2 border-transparent hover:border-gray-700 pl-2">
              {log}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* HISTORY TABLE */}
      <DownloadHistoryTable onPlay={(path) => setPlayerState({ isOpen: true, path })} />
    </div>
  );
}
