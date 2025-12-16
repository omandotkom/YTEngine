"use client";

import { Activity, HardDrive, Play, Zap, Cpu, Server, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import SpeedTestModal from "@/components/SpeedTestModal";
// import { SystemStats } from "@/types/global"; // Types are global

export default function Home() {
  const [stats, setStats] = useState({
    cpuUsage: 0,
    totalMem: 0,
    freeMem: 0,
    usedMem: 0
  });

  const [isSpeedTestOpen, setIsSpeedTestOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.onSystemStats((newStats: any) => {
        setStats(newStats);
      });
    }
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 GB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  };

  return (
    <div className="space-y-8">
      <SpeedTestModal isOpen={isSpeedTestOpen} onClose={() => setIsSpeedTestOpen(false)} />

      {/* Header */}
      <div className="flex justify-between items-end border-b border-gray-800 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Dashboard</h2>
          <p className="text-gray-400 mt-1 text-sm">System Overview & Performance Metrics</p>
        </div>
        <div className="flex gap-3">
           <button 
             onClick={() => setIsSpeedTestOpen(true)}
             className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-xs font-medium text-cyan-400 rounded-md border border-gray-800 transition-colors flex items-center gap-2"
           >
              <Wifi size={14} />
              Check Network
           </button>
           <button className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-300 rounded-md border border-gray-700 transition-colors">
              Refresh Data
           </button>
           <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-xs font-bold text-white rounded-md shadow-lg shadow-red-900/20 transition-colors">
              START ENGINE
           </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard 
          title="CPU Load" 
          value={`${stats.cpuUsage.toFixed(1)}%`} 
          subtitle="Real-time Usage"
          icon={Cpu} 
          color="text-cyan-400"
          bg="bg-cyan-950/20"
          border="border-cyan-900/50"
        />
        <StatsCard 
          title="RAM Usage" 
          value={`${formatBytes(stats.usedMem)}`} 
          subtitle={`of ${formatBytes(stats.totalMem)} Total`}
          icon={Server} 
          color="text-emerald-400"
          bg="bg-emerald-950/20"
          border="border-emerald-900/50"
        />
        <StatsCard 
          title="Active Streams" 
          value="0" 
          subtitle="Live on YouTube"
          icon={Play} 
          color="text-red-500"
          bg="bg-red-950/20"
          border="border-red-900/50"
        />
        <StatsCard 
          title="Viral Candidates" 
          value="0" 
          subtitle="New videos found"
          icon={Zap} 
          color="text-amber-400"
          bg="bg-amber-950/20"
          border="border-amber-900/50"
        />
      </div>

      {/* Recent Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart Area (Placeholder) */}
        <div className="lg:col-span-2 bg-[#1a1a1a] border border-gray-800 rounded-xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">System Performance</h3>
            <select className="bg-gray-900 border border-gray-700 text-xs text-gray-400 rounded px-2 py-1 outline-none">
                <option>Last 24 Hours</option>
                <option>Last 7 Days</option>
            </select>
          </div>
          
          <div className="h-64 flex items-center justify-center bg-[#111] rounded-lg border border-dashed border-gray-800 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/5 to-transparent opacity-50"></div>
            <p className="text-gray-600 font-mono text-xs z-10 group-hover:text-cyan-500 transition-colors">Waiting for data stream...</p>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-0 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-800 bg-gray-900/30">
             <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">Engine Logs</h3>
          </div>
          <div className="p-4 space-y-4 max-h-[300px] overflow-y-auto">
            <LogItem message="System initialized successfully" time="Just now" type="info" />
            <LogItem message="Connected to Local Database" time="1 min ago" type="success" />
            <LogItem message="FFmpeg core loaded (v6.0)" time="2 mins ago" type="warning" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatsCard({ title, value, subtitle, icon: Icon, color, bg, border }: any) {
  return (
    <div className={`p-5 rounded-xl border ${border} ${bg} backdrop-blur-sm relative overflow-hidden group transition-all hover:scale-[1.02]`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">{title}</p>
          <h4 className="text-2xl font-bold text-white mt-1 font-mono">{value}</h4>
        </div>
        <div className={`p-2 rounded-lg ${bg} border border-white/5`}>
          <Icon size={20} className={color} />
        </div>
      </div>
      <p className="text-[10px] text-gray-500">{subtitle}</p>
    </div>
  );
}

function LogItem({ message, time, type }: { message: string, time: string, type: 'info' | 'success' | 'warning' | 'error' }) {
  const colors = {
    info: 'bg-blue-500',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500'
  };

  return (
    <div className="flex items-start gap-3 group">
      <div className={`w-1.5 h-1.5 mt-2 rounded-full ${colors[type]} shadow-[0_0_8px_rgba(0,0,0,0.5)]`} />
      <div className="flex-1">
        <p className="text-xs text-gray-300 font-mono group-hover:text-white transition-colors">{message}</p>
        <p className="text-[10px] text-gray-600 mt-0.5">{time}</p>
      </div>
    </div>
  );
}