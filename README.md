# YTEngine

YTEngine is a comprehensive desktop application designed to assist and boost YouTube content creation and management. It provides a suite of tools for automation, media processing, and streaming analysis, packaged into a single, easy-to-use executable.

## 🚀 Key Features

### ✅ Completed
*   **System Dashboard:** Real-time monitoring of CPU, RAM, and Network Latency/Speed (via Ookla Speedtest).
*   **Smart Downloader:**
    *   **Dual Engine:** Self-updating `yt-dlp` and `ffmpeg` binaries.
    *   **Bulk Queue System:** Add multiple URLs, process them sequentially in the background.
    *   **Format Control:** Auto-merge Best Video + Best Audio into standard MP4 (AAC) or convert to MP3.
    *   **Custom Directory:** Save downloads to any specific folder.
    *   **History Database:** Persistent SQLite database tracking all downloads with Play/Retry actions.
*   **Built-in Player:** Preview downloaded videos instantly without leaving the app.

### 🚧 Planned Features (ToDo)
*   **Viral Video Finder:**
    *   Scrape trending keywords and videos across niches.
    *   Analyze engagement metrics (Views/Hour).
*   **Channel/Playlist Bulk Downloader:**
    *   One-click download of *all* videos from a specific channel or playlist.
    *   "Download All Competitor Videos" mode for content research.
*   **Stream Manager & Looper:**
    *   **24/7 Live Stream:** Loop a local video file indefinitely to a YouTube Stream Key.
    *   **ASMR Creator:** Combine visual loops with audio layers automatically.
*   **Automated Video Editor:**
    *   **Shorts Generator:** Auto-crop landscape videos to 9:16 vertical format.
    *   **Silence Remover:** Automatically cut silent parts from raw footage.
    *   **Compilation Maker:** Merge multiple clips into a single long video.

## 🛠 Tech Stack

*   **Framework:** **Electron** (Chromium 132 + Node.js)
*   **Frontend:** **Next.js 15**, **React 19**, **Tailwind CSS**, **Shadcn/UI concepts**
*   **Backend:** **Node.js** (IPC), **Better-SQLite3** (Database)
*   **Engines:** **yt-dlp** (Python-based Downloader), **FFmpeg** (Media Processing), **Ookla Speedtest CLI**

## 📦 Distribution
*   **Builder:** `electron-builder` is used to package the application into a distributable installer or portable executable for Windows (`win32`).

## 🔧 Development Setup

### Prerequisites
*   Node.js (LTS version)
*   npm (Node Package Manager)

### Installation
1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```

### Running Locally
To start the development server (Next.js + Electron):
```bash
npm run dev:electron
```

### Build for Production
To build the standalone `.exe`:
```bash
npm run dist
```
