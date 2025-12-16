"use client";

import { useEffect, useState } from "react";
import { X, Activity, Wifi, ArrowDown, ArrowUp, Server } from "lucide-react";
import CountUp from "react-countup";

interface SpeedTestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SpeedTestModal({ isOpen, onClose }: SpeedTestModalProps) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [progressMsg, setProgressMsg] = useState("Initializing...");
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isOpen && status === 'idle') {
      runTest();
    }
    
    // Listen for progress updates
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.onSpeedtestProgress((msg) => {
        setProgressMsg(msg);
      });
    }
  }, [isOpen]);

  const runTest = async () => {
    setStatus('running');
    setProgressMsg("Checking diagnostics engine...");
    setErrorMsg("");
    setResult(null);

    try {
      const res = await window.electronAPI.startSpeedtest();
      if (res.success) {
        setResult(res.data);
        setStatus('done');
      } else {
        setErrorMsg(res.error || "Unknown error");
        setStatus('error');
      }
    } catch (e) {
      setErrorMsg("Failed to communicate with engine");
      setStatus('error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#111] border border-gray-800 w-[600px] rounded-2xl shadow-2xl overflow-hidden relative">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
          <div className="flex items-center gap-2 text-cyan-400">
            <Activity size={18} />
            <span className="font-bold tracking-wider text-sm">NETWORK DIAGNOSTICS</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-800 rounded-full text-gray-500 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 min-h-[300px] flex flex-col items-center justify-center">
          
          {status === 'running' && (
            <div className="text-center space-y-6">
              <div className="relative w-24 h-24 mx-auto">
                <div className="absolute inset-0 border-4 border-cyan-900/30 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-t-cyan-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                <Wifi className="absolute inset-0 m-auto text-cyan-500 animate-pulse" size={32} />
              </div>
              <div>
                <h3 className="text-xl font-medium text-white">Running Analysis</h3>
                <p className="text-sm text-gray-400 mt-2 font-mono">{progressMsg}</p>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mx-auto">
                <X className="text-red-500" size={32} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-500">Test Failed</h3>
                <p className="text-sm text-gray-400 mt-2 max-w-xs mx-auto">{errorMsg}</p>
              </div>
              <button onClick={runTest} className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg">
                Retry
              </button>
            </div>
          )}

          {status === 'done' && result && (
            <div className="w-full space-y-8 animate-in zoom-in-95 duration-300">
              
              {/* ISP Info */}
              <div className="flex items-center justify-center gap-2 text-gray-400 text-xs mb-4">
                <Server size={14} />
                <span>{result.isp}</span>
                <span className="text-gray-600">•</span>
                <span>{result.server?.location} ({result.server?.country})</span>
              </div>

              {/* Gauges Row */}
              <div className="grid grid-cols-2 gap-8">
                {/* Download */}
                <div className="bg-emerald-950/10 border border-emerald-900/30 rounded-xl p-6 text-center relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-50 transition-opacity">
                    <ArrowDown className="text-emerald-500" size={48} />
                  </div>
                  <p className="text-emerald-500 text-xs font-bold uppercase tracking-widest mb-2">Download</p>
                  <div className="text-4xl font-bold text-white font-mono">
                    <CountUp 
                      end={result.download.bandwidth / 125000} 
                      decimals={1}
                      duration={2.5}
                    />
                    <span className="text-lg text-gray-500 ml-2">Mbps</span>
                  </div>
                </div>

                {/* Upload */}
                <div className="bg-indigo-950/10 border border-indigo-900/30 rounded-xl p-6 text-center relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-50 transition-opacity">
                    <ArrowUp className="text-indigo-500" size={48} />
                  </div>
                  <p className="text-indigo-500 text-xs font-bold uppercase tracking-widest mb-2">Upload</p>
                  <div className="text-4xl font-bold text-white font-mono">
                    <CountUp 
                      end={result.upload.bandwidth / 125000} 
                      decimals={1}
                      duration={2.5}
                    />
                    <span className="text-lg text-gray-500 ml-2">Mbps</span>
                  </div>
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-gray-900/50 rounded-lg">
                   <p className="text-xs text-gray-500">Ping</p>
                   <p className="text-lg font-bold text-white">{result.ping.latency.toFixed(0)} <span className="text-xs text-gray-600">ms</span></p>
                </div>
                <div className="p-3 bg-gray-900/50 rounded-lg">
                   <p className="text-xs text-gray-500">Jitter</p>
                   <p className="text-lg font-bold text-white">{result.ping.jitter.toFixed(1)} <span className="text-xs text-gray-600">ms</span></p>
                </div>
                <div className="p-3 bg-gray-900/50 rounded-lg">
                   <p className="text-xs text-gray-500">Packet Loss</p>
                   <p className={`text-lg font-bold ${result.packetLoss > 0 ? 'text-amber-500' : 'text-white'}`}>
                     {result.packetLoss ? result.packetLoss.toFixed(1) : 0}%
                   </p>
                </div>
              </div>

              <div className="text-center pt-2">
                <button onClick={runTest} className="text-xs text-gray-500 hover:text-cyan-400 underline decoration-dashed">
                  Run Test Again
                </button>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
