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

      // Editor
      selectMediaFiles: () => Promise<string[]>;
      probeMedia: (filePath: string) => Promise<{ success: boolean; data?: { duration: number; width: number | null; height: number | null; fps: number | null; hasVideo: boolean; hasAudio: boolean; channels: number | null; sampleRate: number | null }; error?: string }>;
      generateProxy: (data: { filePath: string; maxWidth?: number }) => Promise<{ success: boolean; proxyPath?: string; cached?: boolean; error?: string }>;
      startRender: (payload: {
        outputDir?: string | null;
        outputName?: string | null;
        duration: number;
        preset: { mode: "follow" | "fixed"; width?: number; height?: number; fps?: number };
        base?: { width?: number | null; height?: number | null; fps?: number | null };
        timeline: {
          tracks: Array<{ id: string; type: string; name: string }>;
          assets: Array<{
            id: string;
            type: string;
            path: string | null;
            hasAudio: boolean;
            width: number | null;
            height: number | null;
            fps: number | null;
            duration: number;
          }>;
          clips: Array<{
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
            text: string | null;
            grading: Array<{
              id: string;
              start: number;
              end: number;
              exposure: number;
              contrast: number;
              saturation: number;
              temperature: number;
            }>;
          }>;
        };
      }) => Promise<{ success: boolean; jobId?: string; outputPath?: string; error?: string }>;
      cancelRender: (jobId: string) => Promise<{ success: boolean; error?: string }>;
      onRenderProgress: (callback: (data: { jobId: string; percent?: number | null; seconds?: number }) => void) => void;
      onRenderComplete: (callback: (data: { jobId: string; outputPath: string }) => void) => void;
      onRenderError: (callback: (data: { jobId: string; error: string }) => void) => void;
      onProxyProgress: (callback: (data: { filePath: string; status: 'start' | 'complete' | 'error'; proxyPath?: string }) => void) => void;

      // Extender
      extendVideo: (params: { 
        inputPath: string; 
        loopCount: number; 
        mode: 'copy' | 'encode'; 
        encoder?: 'cpu' | 'nvidia' | 'intel' | 'amd'; 
        transitionDuration?: number 
      }) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
      onExtenderProgress: (callback: (msg: string) => void) => void;
    };
  }
}
