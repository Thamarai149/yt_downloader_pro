# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 📋 Project Overview

**YT Downloader Pro** - A professional YouTube video/audio downloader with a modern glassmorphism dark-mode UI.

**Tech Stack:**
- **Backend:** Flask (Python 3.8+) with yt-dlp and FFmpeg integration
- **Frontend:** Vanilla HTML/CSS/JS (no build step required)
- **Communication:** REST API + Server-Sent Events (SSE) for real-time progress

**Key Design Patterns:**
- Thread-safe download queue with progress tracking
- SSE-based real-time progress updates
- Separation of concerns: API layer (app.py) → Download engine (downloader.py) → Queue management (queue_manager.py)
- Persistent JSON-based history storage

---

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- FFmpeg installed and available in PATH
- Git (optional)

### Setup
```bash
# Install Python dependencies
pip install -r requirements.txt

# Start the Flask server
cd backend
python app.py

# Open browser to http://127.0.0.1:5000
```

**Note:** The server serves the frontend statically from the `frontend/` directory. No build step for frontend.

---

## 🛠️ Common Development Commands

### Backend
```bash
# Run development server (with debug logging)
cd backend
python app.py

# Run with explicit host/port (edit app.py or use environment variables)
# Server listens on 0.0.0.0:5000 by default

# Type checking (basic mode configured in pyrightconfig.json)
pyright backend

# Linting (if flake8 installed)
flake8 backend

# Manual testing with curl
curl -X POST http://127.0.0.1:5000/api/info \
  -H "Content-Type: application/json" \
  -d '{"url":"https://youtube.com/watch?v=..."}'
```

### Frontend
No build step. Edit files directly in `frontend/` and refresh browser:
- `frontend/index.html` - main page
- `frontend/css/style.css` - glassmorphism theme
- `frontend/js/app.js` - all client-side logic

For CSS/JS changes, hard refresh (Ctrl+F5) to bypass cache.

### Database / Data
- Download history: `backend/history/history.json` (auto-created, max 200 entries)
- Downloaded files: `C:\Users\THAMARAISELVAN\Downloads\ytdownloads\` (hardcoded in app.py:21 and downloader.py:13)
- Logs: `logs/app.log`

---

## 🏗️ Architecture

### Backend Structure
```
backend/
├── app.py              # Flask routes + SSE + static file serving
├── downloader.py       # yt-dlp wrapper: fetch_info(), start_download()
├── queue_manager.py    # Thread-safe progress dict + thread pool
└── history.py          # JSON history CRUD with file locking
```

**Key Flow:**
1. `POST /api/info` → `downloader.fetch_info()` → returns metadata + formats
2. `POST /api/download` → creates download_id → spawns thread via `queue_manager.start_in_thread()` → calls `downloader.start_download()`
3. Progress updates via `queue_manager.update_progress()` → frontend SSE to `/api/progress/<id>`
4. On completion → `history.add_entry()` → `queue_manager.cleanup()`

**Thread Safety:**
- All progress state stored in `queue_manager._progress` dict protected by `threading.Lock()`
- Each download runs in daemon thread
- Cancellation via `queue_manager.cancel_download()` sets flag checked by download hook

### Frontend Structure
```
frontend/
├── index.html         # Single-page app layout
├── css/style.css      # Glassmorphism theme, responsive, light/dark modes
└── js/app.js          # Event handlers, SSE, playlist UI, history, settings
```

**Navigation:** Single-page with section switching via `switchSection()`.
**State:** `currentInfo`, `activeDownloads`, `activeTab` stored in JS memory.
**Settings:** Persisted to `localStorage` as `ytpro-settings`.
**Theme:** Persisted to `localStorage` as `ytdl-theme`.

---

## 🔌 API Reference

All endpoints under `/api/`:

| Method | Endpoint | Purpose | Request Body |
|--------|----------|---------|--------------|
| POST | `/api/info` | Fetch video/playlist metadata | `{url, cookies_browser?}` |
| POST | `/api/download` | Start download | `{url, title?, format_id?, audio_only?, audio_format?, subtitles?, sub_langs?, trim_start?, trim_end?, cookies_browser?, retries?}` |
| GET | `/api/progress/<id>` | SSE progress stream | - |
| POST | `/api/cancel/<id>` | Cancel download | - |
| GET | `/api/queue` | List active downloads | - |
| GET | `/api/history` | Get download history | - |
| DELETE | `/api/history` | Clear history | - |
| GET | `/api/file/<filename>` | Download file (serves from downloads dir) | - |

**Progress SSE payload fields:** `status` (`queued`/`downloading`/`processing`/`done`/`error`/`cancelled`/`retrying`), `percent`, `speed`, `eta`, `filename`, `error`, `attempt?`

**Error handling:** Errors returned as JSON `{error: "message"}` with appropriate HTTP status.

---

## 📁 Important File Locations

- Flask server: `backend/app.py:214` (`app.run()`)
- Download logic: `backend/downloader.py:245` (`_run_download()`)
- Progress state: `backend/queue_manager.py:6-9` (`_progress`, `_cancel_flags`)
- History storage: `backend/history/history.json`
- Frontend entry: `frontend/index.html`
- Main JS: `frontend/js/app.js` (`fetchVideo()` at line 164, `startDownload()` at line 299)
- CSS theme: `frontend/css/style.css` (CSS variables in `:root`)

---

## ⚙️ Configuration

**Flask debug mode:** Edit `backend/app.py:215` → `debug=True` (not recommended for production)

**Download directory:** Hardcoded in two places:
- `backend/app.py:21` - where files are served from
- `backend/downloader.py:13` - where yt-dlp writes files

Change both if moving downloads folder.

**FFmpeg requirement:** Must be in PATH. yt-dlp uses FFmpeg for merging video+audio and audio conversion.

**Cookie support:** `cookies_browser` param accepts `"chrome"` (other browsers possible per yt-dlp docs). Handles Chrome cookie database lock with fallback.

**History retention:** `backend/history.py:34` keeps last 200 entries.

---

## 🐛 Known Behaviors

- Chrome cookie database can be locked; code has fallback in `downloader.py:78-82` and `downloader.py:375-389`
- Downloads default to MKV format when merging bestvideo+bestaudio (`downloader.py:345`, `downloader.py:370-372`)
- Audio-only uses FFmpeg to transcode to requested format (`downloader.py:263-267`)
- Subtitles converted to SRT via FFmpeg (`downloader.py:273-276`)
- Trim feature uses `download_ranges` (`downloader.py:280-288`)
- Progress percentage calculated from `downloaded_bytes/total_bytes` (more reliable than yt-dlp's string) at `downloader.py:303-317`

---

## ✅ Testing Checklist

When modifying backend:
1. Check APIClient fetch: `/api/info` for single video
2. Check APIClient fetch: `/api/info` for playlist
3. Start download (video + audio merge)
4. Start download (audio-only mp3)
5. Cancel a download mid-flight
6. Verify SSE progress updates
7. Verify history entry created on success
8. Clear history via DELETE

When modifying frontend:
1. Test dark/light theme toggle
2. Test drag & drop URL
3. Test paste from clipboard
4. Test mobile swipe gestures (resize browser)
5. Test sidebar resize (persists to localStorage)
6. Test settings saved/loaded
7. Verify SSE reconnects if page refreshed during active downloads

---

## 🔒 Security Notes

- No authentication; instance is local-only by default (`host='0.0.0.0'` binds all interfaces)
- Cookie browser option executes Chrome cookie extraction (ensure Chrome is installed)
- Download directory path is hardcoded user path (Windows-specific currently)
- No rate limiting or URL validation beyond yt-dlp's own checks
- History stored in plain JSON file (no encryption)

---

## 📦 Dependencies

**Python (requirements.txt):**
- `flask>=3.0.3` - web framework
- `flask-cors>=4.0.1` - CORS headers
- `yt-dlp>=2024.11.18` - YouTube extraction/download
- `requests>=2.32.3` - HTTP library (used? appears not imported anywhere)

**Frontend:**
- Google Fonts (Inter)
- Font Awesome 6.5.0 (CDN)
- No npm/build tooling

**External system:**
- FFmpeg (binary in PATH)

---

## 🧪 Type Annotations

Python code uses inline type hints (pyrightconfig.json sets `typeCheckingMode: "basic"`). Backend code is largely typed with `dict[str, Any]` for dynamic parts.

---

## ⚠️ Platform Notes

Currently Windows-specific due to:
- Hardcoded downloads path (`C:\Users\THAMARAISELVAN\Downloads\ytdownloads`)
- `pyrightconfig.json` sets `"pythonPlatform": "Windows"`

To port to Linux/macOS:
1. Change downloads path to configurable or `~/Downloads/ytdownloads`
2. Update cookie browser paths if needed (yt-dlp handles this automatically)

---

## 📝 Code Style

- Python: 4-space indentation, descriptive variable names, docstrings on modules/functions
- JavaScript: single quotes, 2-space indentation (as seen in app.js)
- CSS: BEM-like class names with kebab-case
- No enforced linter, but follow existing patterns

---

## 🧩 Extension Ideas

- Add authentication/proxy for remote access
- Replace JSON history with SQLite for larger datasets
- Add format preset saving
- Add batch URL import from text file
- Add download speed limit option
- Add video preview thumbnail generation
- Add subtitle embedding into video
- Make downloads directory configurable via settings UI

---

## 🆘 Troubleshooting

**"FFmpeg not found"** → Install FFmpeg and add to PATH, verify with `ffmpeg -version`

**Port 5000 already in use** → Change `port=5000` in `backend/app.py:215` or kill existing process

**Cookie extraction fails** → Close Chrome completely before downloading, or disable "Use Chrome Cookies" in UI

**Downloads not appearing** → Check `C:\Users\THAMARAISELVAN\Downloads\ytdownloads\` (or change path)

**No progress updates** → Check browser console for SSE errors; verify Flask route `/api/progress/<id>` is reachable

**History not persisting** → Check permissions on `backend/history/` directory

---

## 📚 Resources

- yt-dlp docs: https://github.com/yt-dlp/yt-dlp#options
- Flask docs: https://flask.palletsprojects.com/
- SSE guide: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
