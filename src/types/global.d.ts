export interface SystemStats {
  cpuUsage: number;
  totalMem: number;
  freeMem: number;
  usedMem: number;
}

declare global {
  interface Window {
    electronAPI: {
      ping: () => Promise<string>;
      getAppVersion: () => Promise<string>;
      onSystemStats: (callback: (stats: SystemStats) => void) => void;
      
      // Downloader
      checkYtDlp: () => Promise<{ 
        exists: boolean; 
        ytdlpVersion: string | null; 
        ffmpegVersion: string | null;
        details?: any; 
      }>;
      updateYtDlp: () => Promise<{ success: boolean; error?: string }>;
      onInstallProgress: (callback: (msg: string) => void) => void;
      
      selectFolder: () => Promise<string | null>;
      startDownload: (data: { url: string; format: 'video' | 'audio'; customPath?: string }) => Promise<{ success: boolean; queuedId?: number; error?: string }>;
      cancelDownload: () => Promise<{ success: boolean; error?: string }>;
      onDownloadProgress: (callback: (log: string) => void) => void;
      onDownloadError: (callback: (log: string) => void) => void;

      // History
      getDownloadHistory: (params: { page: number; limit: number }) => Promise<{ history: any[]; total: number; page: number; totalPages: number }>;
      retryDownload: (id: number) => Promise<{ success: boolean }>;
      openFileLocation: (path: string) => Promise<void>;
      onHistoryUpdated: (callback: () => void) => void;

      // Speedtest
      startSpeedtest: () => Promise<{ success: boolean; data?: any; error?: string }>;
      onSpeedtestProgress: (callback: (msg: string) => void) => void;
    };
  }
}
