"use client";

import { useEffect, useState } from "react";
import { FolderOpen, Play, RefreshCw, Clock, XCircle, CheckCircle } from "lucide-react";

interface DownloadRecord {
  id: number;
  title: string | null;
  url: string;
  format: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  filePath: string | null;
  createdAt: string;
}

interface Props {
  onPlay: (path: string) => void;
}

export default function DownloadHistoryTable({ onPlay }: Props) {
  const [history, setHistory] = useState<DownloadRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchHistory = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    try {
      const res = await window.electronAPI.getDownloadHistory({ page, limit: 10 });
      setHistory(res.history);
      setTotalPages(res.totalPages);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    // Listen for updates from backend
    if (window.electronAPI) {
      window.electronAPI.onHistoryUpdated(() => {
        fetchHistory();
      });
    }
  }, [page]);

  const handleRetry = async (id: number) => {
    await window.electronAPI.retryDownload(id);
  };

  const handleBrowse = async (path: string) => {
    await window.electronAPI.openFileLocation(path);
  };

  const statusColor = (status: string) => {
    switch(status) {
      case 'completed': return 'text-emerald-500';
      case 'downloading': return 'text-cyan-500 animate-pulse';
      case 'failed': return 'text-red-500';
      case 'cancelled': return 'text-gray-500';
      case 'queued': return 'text-amber-500';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-gray-800 bg-gray-900/30 flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">Download History</h3>
        <button onClick={fetchHistory} disabled={loading} className="text-gray-500 hover:text-white">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-gray-400">
          <thead className="bg-gray-900 text-gray-500 font-medium uppercase">
            <tr>
              <th className="px-4 py-3">Title / URL</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {history.length === 0 ? (
               <tr>
                 <td colSpan={4} className="px-4 py-8 text-center text-gray-600 italic">No download history yet.</td>
               </tr>
            ) : (
              history.map((item) => (
                <tr key={item.id} className="hover:bg-gray-800/50 transition-colors group">
                  <td className="px-4 py-3 max-w-[300px]">
                    <p className="font-medium text-gray-300 truncate">{item.title || "Fetching info..."}</p>
                    <p className="text-[10px] text-gray-600 truncate">{item.url}</p>
                  </td>
                  <td className={`px-4 py-3 font-medium capitalize ${statusColor(item.status)}`}>
                    <div className="flex items-center gap-2">
                       {item.status === 'downloading' && <RefreshCw size={12} className="animate-spin" />}
                       {item.status === 'completed' && <CheckCircle size={12} />}
                       {item.status === 'failed' && <XCircle size={12} />}
                       {item.status === 'queued' && <Clock size={12} />}
                       {item.status}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 tabular-nums">
                    {new Date(item.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {item.status === 'completed' && item.filePath && (
                        <>
                          <button 
                            onClick={() => onPlay(item.filePath!)}
                            className="p-1.5 bg-gray-800 hover:bg-cyan-900 text-gray-400 hover:text-cyan-400 rounded transition-colors"
                            title="Play Video"
                          >
                            <Play size={14} />
                          </button>
                          <button 
                            onClick={() => handleBrowse(item.filePath!)}
                            className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors"
                            title="Show in Folder"
                          >
                            <FolderOpen size={14} />
                          </button>
                        </>
                      )}
                      
                      {(item.status === 'failed' || item.status === 'cancelled') && (
                        <button 
                          onClick={() => handleRetry(item.id)}
                          className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[10px] border border-gray-700 transition-colors"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center px-4 py-3 border-t border-gray-800 bg-gray-900/30">
          <button 
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="text-xs text-gray-500 hover:text-white disabled:opacity-30 disabled:hover:text-gray-500"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
          <button 
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="text-xs text-gray-500 hover:text-white disabled:opacity-30 disabled:hover:text-gray-500"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
