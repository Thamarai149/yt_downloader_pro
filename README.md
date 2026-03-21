# 🎬 YT Downloader Pro

A professional YouTube Video & Audio Downloader with a glassmorphism dark-mode UI, powered by **yt-dlp** and **FFmpeg**.

---

## 📁 Folder Structure

```
ytdownloader/
├── backend/
│   ├── app.py              # Flask API server
│   ├── downloader.py       # yt-dlp download engine
│   ├── history.py          # Download history (JSON)
│   └── queue_manager.py    # Thread-safe download queue
├── frontend/
│   ├── index.html          # Main UI
│   ├── css/
│   │   └── style.css       # Glassmorphism dark theme
│   └── js/
│       └── app.js          # Frontend logic
├── downloads/              # Downloaded files saved here
├── logs/                   # Application logs
└── requirements.txt
```

---

## ⚡ Quick Start

### 1. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 2. Install FFmpeg

#### Windows
Download FFmpeg from https://www.gyan.dev/ffmpeg/builds/
Extract and add `ffmpeg/bin` to your system PATH.

Or with winget:
```bash
winget install Gyan.FFmpeg
```

#### Linux
```bash
sudo apt install ffmpeg
```

#### macOS
```bash
brew install ffmpeg
```

### 3. Run the server

```bash
cd backend
python app.py
```

### 4. Open in browser

```
http://127.0.0.1:5000
```

---

## 🚀 Features

| Feature | Details |
|---|---|
| Video download | 144p → 4K, auto-merged via FFmpeg |
| Audio-only | MP3, M4A, WAV, AAC |
| Playlists | Full playlist batch download |
| Subtitles | SRT/VTT download |
| Video trimming | Start/End time (HH:MM:SS) |
| Cookie support | Chrome cookies for restricted videos |
| Progress | Real-time % + speed + ETA via SSE |
| History | Persistent JSON download history |
| Dark mode | Glassmorphism dark UI |
| Drag & Drop | Drop URLs directly onto the page |
| Multi-queue | Concurrent downloads with cancel |

---

## 🔧 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/info` | Fetch video/playlist metadata |
| POST | `/api/download` | Start a download |
| GET | `/api/progress/<id>` | SSE progress stream |
| POST | `/api/cancel/<id>` | Cancel a download |
| GET | `/api/queue` | Active queue status |
| GET | `/api/history` | Download history |
| DELETE | `/api/history` | Clear history |

---

## 📦 Requirements

- Python 3.8+
- FFmpeg (in PATH)
- pip packages: `flask`, `flask-cors`, `yt-dlp`

---

## ⚠️ Notes

- Downloads are saved in the `downloads/` folder
- Logs are written to `logs/app.log`
- For age-restricted videos, enable "Use Chrome Cookies" in the UI
