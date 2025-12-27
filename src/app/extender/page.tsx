"use client";

import { useState, useRef, useEffect } from "react";
import { Repeat, Terminal, FileVideo, Zap, Cpu, Clock, CheckCircle2, AlertCircle, FolderOpen, Play } from "lucide-react";

export default function ExtenderPage() {
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [loopCount, setLoopCount] = useState<number>(5);
  const [mode, setMode] = useState<'copy' | 'encode'>('copy');
  const [encoder, setEncoder] = useState<'cpu' | 'nvidia' | 'intel' | 'amd'>('cpu');
  const [transitionDuration, setTransitionDuration] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.onExtenderProgress((msg) => addLog(msg));
    }
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg.trim()]);
  };

  const handleBrowse = async () => {
    if (!window.electronAPI) return;
    const files = await window.electronAPI.selectMediaFiles();
    if (files && files.length > 0) {
      setInputPath(files[0]);
      addLog(`Selected input: ${files[0]}`);
    }
  };

  const handleProcess = async () => {
    if (!inputPath) return;
    setIsProcessing(true);
    setLogs([]); // Clear logs
    addLog("Starting Video Extender...");

    try {
      const result = await window.electronAPI.extendVideo({
        inputPath,
        loopCount,
        mode,
        encoder: mode === 'encode' ? encoder : undefined,
        transitionDuration: mode === 'encode' ? transitionDuration : undefined
      });

      if (result.success) {
        addLog(`COMPLETE: Saved to ${result.outputPath}`);
        // Optionally open folder
        // window.electronAPI.openFileLocation(result.outputPath);
      } else {
        addLog(`ERROR: ${result.error}`);
      }
    } catch (error: any) {
      addLog(`CRITICAL ERROR: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
          <Repeat className="text-blue-500" size={32} />
          Video Extender
        </h2>
        <p className="text-gray-400 mt-2">Loop videos to extend their duration. Choose between instant copy or smooth transitions.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Controls */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* File Selection */}
          <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6">
            <label className="text-sm font-medium text-gray-400 mb-2 block">Input Video</label>
            <div className="flex gap-2">
              <div className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 truncate">
                {inputPath || "No file selected"}
              </div>
              <button 
                onClick={handleBrowse}
                disabled={isProcessing}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-700 text-sm font-medium flex items-center gap-2 transition-colors"
              >
                <FolderOpen size={16} />
                Browse
              </button>
            </div>
          </div>

          {/* Configuration */}
          <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6 space-y-6">
            
            {/* Loop Count */}
            <div>
              <label className="text-sm font-medium text-gray-400 mb-2 block">Total Loops</label>
              <div className="flex items-center gap-4">
                 <input 
                   type="range" 
                   min="2" 
                   max="50" 
                   value={loopCount}
                   onChange={(e) => setLoopCount(Number(e.target.value))}
                   disabled={isProcessing}
                   className="flex-1 accent-blue-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                 />
                 <div className="w-16 text-center bg-gray-950 border border-gray-700 rounded px-2 py-1 text-white font-mono">
                   {loopCount}x
                 </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">The video will play {loopCount} times consecutively.</p>
            </div>

            <div className="h-px bg-gray-800"></div>

            {/* Mode Selection */}
            <div>
               <label className="text-sm font-medium text-gray-400 mb-3 block">Processing Mode</label>
               <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setMode('copy')}
                    disabled={isProcessing}
                    className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                      mode === 'copy' 
                      ? 'border-blue-500 bg-blue-500/10' 
                      : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <Zap size={24} className={mode === 'copy' ? 'text-blue-400' : 'text-gray-500'} />
                      {mode === 'copy' && <CheckCircle2 size={18} className="text-blue-500" />}
                    </div>
                    <div className="font-bold text-white mb-1">Instant Loop</div>
                    <div className="text-xs text-gray-400">Lossless quality. Immediate result. Hard cuts between loops.</div>
                  </button>

                  <button
                    onClick={() => setMode('encode')}
                    disabled={isProcessing}
                    className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                      mode === 'encode' 
                      ? 'border-purple-500 bg-purple-500/10' 
                      : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <Cpu size={24} className={mode === 'encode' ? 'text-purple-400' : 'text-gray-500'} />
                      {mode === 'encode' && <CheckCircle2 size={18} className="text-purple-500" />}
                    </div>
                    <div className="font-bold text-white mb-1">Smooth Loop</div>
                    <div className="text-xs text-gray-400">Re-encodes video. Adds crossfade transitions. Slower.</div>
                  </button>
               </div>
            </div>

            {/* Advanced Settings for Encode Mode */}
            {mode === 'encode' && (
              <div className="animate-in slide-in-from-top-2 duration-300 space-y-4 pt-4 border-t border-gray-800">
                 
                 {/* Transition Duration */}
                 <div>
                    <label className="text-sm font-medium text-gray-400 mb-2 block flex justify-between">
                       <span>Transition Duration (Crossfade)</span>
                       <span className="text-white font-mono">{transitionDuration}s</span>
                    </label>
                    <input 
                      type="range" 
                      min="0.5" 
                      max="5.0" 
                      step="0.5"
                      value={transitionDuration}
                      onChange={(e) => setTransitionDuration(Number(e.target.value))}
                      disabled={isProcessing}
                      className="w-full accent-purple-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                 </div>

                 {/* Encoder Selection */}
                 <div>
                    <label className="text-sm font-medium text-gray-400 mb-2 block">Hardware Acceleration</label>
                    <select 
                       value={encoder}
                       onChange={(e: any) => setEncoder(e.target.value)}
                       disabled={isProcessing}
                       className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                    >
                       <option value="cpu">CPU (Software - Slowest)</option>
                       <option value="nvidia">NVIDIA (NVENC - Recommended)</option>
                       <option value="intel">Intel (QuickSync)</option>
                       <option value="amd">AMD (AMF)</option>
                    </select>
                    <p className="text-xs text-amber-500/80 mt-2 flex items-center gap-1">
                       <AlertCircle size={12} />
                       Ensure your system supports the selected hardware encoder.
                    </p>
                 </div>
              </div>
            )}

            <button 
              onClick={handleProcess}
              disabled={!inputPath || isProcessing}
              className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all ${
                !inputPath || isProcessing 
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                : mode === 'copy' 
                   ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20' 
                   : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/20'
              }`}
            >
              {isProcessing ? "PROCESSING..." : "START PROCESS"}
            </button>

          </div>
        </div>

        {/* RIGHT COLUMN: Logs */}
        <div className="lg:col-span-1">
          <div className="bg-black rounded-xl border border-gray-800 overflow-hidden font-mono text-xs shadow-2xl h-[500px] flex flex-col">
            <div className="bg-gray-900 px-4 py-3 flex items-center gap-2 border-b border-gray-800">
              <Terminal size={14} className="text-gray-500" />
              <span className="text-gray-500 font-medium">System Output</span>
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-1 text-gray-300">
              {logs.length === 0 && (
                <div className="text-gray-700 italic text-center mt-10">Waiting for command...</div>
              )}
              {logs.map((log, i) => (
                <div key={i} className="break-all border-l-2 border-transparent hover:border-gray-700 pl-2">
                  <span className="opacity-50 mr-2">[{new Date().toLocaleTimeString()}]</span>
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
