"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Flame, 
  Download, 
  Radio, 
  RefreshCcw, 
  Headphones, 
  Settings 
} from "lucide-react";

const navItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Viral Finder", href: "/viral", icon: Flame },
  { name: "Downloader", href: "/downloader", icon: Download },
  { name: "Stream Manager", href: "/stream-manager", icon: Radio },
  { name: "Loop Streamer", href: "/looper", icon: RefreshCcw },
  { name: "ASMR Creator", href: "/asmr", icon: Headphones },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-[#0f0f0f] text-gray-300 h-screen flex flex-col border-r border-gray-800">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-900/50">
          <Flame size={18} className="text-white fill-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">YTEngine</h1>
          <p className="text-[10px] text-gray-500 font-mono tracking-wider uppercase">V.1.0.0 PRO</p>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto mt-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                isActive
                  ? "bg-red-600/10 text-red-500 border border-red-600/20"
                  : "text-gray-400 hover:bg-gray-800 hover:text-gray-100"
              }`}
            >
              <item.icon size={18} className={isActive ? "text-red-500" : "text-gray-500 group-hover:text-gray-300"} />
              <span className="font-medium text-sm">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800 bg-[#0a0a0a]">
        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
          <div className="flex justify-between items-center mb-2">
             <p className="text-[10px] text-gray-500 font-mono uppercase">Engine Status</p>
             <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/30"></div>
             </div>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-xs text-cyan-400 font-mono">Running...</code>
          </div>
        </div>
      </div>
    </aside>
  );
}
