"use client";

import { useEffect, useRef } from "react";
import { X, Play } from "lucide-react";

interface VideoPlayerModalProps {
  isOpen: boolean;
  videoPath: string | null;
  onClose: () => void;
}

export default function VideoPlayerModal({ isOpen, videoPath, onClose }: VideoPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Reset video when opened new
    if (isOpen && videoRef.current) {
      videoRef.current.load();
      // Try auto play
      videoRef.current.play().catch(e => console.log("Autoplay prevented:", e));
    }
  }, [isOpen, videoPath]);

  if (!isOpen || !videoPath) return null;

  // Transform windows path to custom protocol url
  // "C:\User\..." -> "local-video://C:/User/..."
  const normalizedPath = videoPath.replace(/\\/g, "/");
  const videoSrc = `local-video://${encodeURIComponent(normalizedPath)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-5xl aspect-video bg-black relative rounded-lg shadow-2xl border border-gray-800 flex flex-col">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute -top-12 right-0 p-2 text-gray-400 hover:text-white transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm uppercase tracking-widest font-bold">Close Player</span>
            <X size={24} />
          </div>
        </button>

        {/* Video Element */}
        <video 
          ref={videoRef}
          controls 
          className="w-full h-full rounded-lg outline-none"
          onError={(e) => console.error("Video Error:", e)}
        >
          <source src={videoSrc} type="video/mp4" />
          <p className="text-white text-center mt-10">
            Your browser does not support the video tag or codec.
          </p>
        </video>

        {/* Path Info */}
        <div className="absolute bottom-4 left-4 right-4 pointer-events-none opacity-0 hover:opacity-100 transition-opacity bg-black/60 p-2 rounded text-xs text-gray-400 font-mono truncate">
          Source: {videoPath}
        </div>
      </div>
    </div>
  );
}
