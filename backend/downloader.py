"""
downloader.py — Core yt-dlp download engine
"""
import os
import re
import time
import json
import subprocess
from typing import Any, Optional, Callable, Dict

import yt_dlp  # type: ignore[import]

DOWNLOADS_DIR = r'C:\Users\THAMARAISELVAN\Downloads\ytdownloads'
os.makedirs(DOWNLOADS_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip_ansi(s):
    if not s:
        return ''
    # Strip ANSI escape sequences and other weird characters
    s = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', s)
    # Also strip some common yt-dlp weirdness like the progress bar blocks if they leak in
    s = re.sub(r'[\u2580-\u259F]+', '', s)
    return s.strip()

def _format_bytes(b):
    if b is None:
        return 'N/A'
    for unit in ('B', 'KB', 'MB', 'GB'):
        if b < 1024:
            return f'{b:.1f} {unit}'
        b /= 1024
    return f'{b:.1f} TB'


def _format_duration(sec):
    if sec is None:
        return 'N/A'
    sec = int(sec)
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f'{h}:{m:02d}:{s:02d}'
    return f'{m}:{s:02d}'


def _safe_filesize(fmt):
    fs = fmt.get('filesize') or fmt.get('filesize_approx')
    return int(fs) if fs else None


# ---------------------------------------------------------------------------
# Fetch video / playlist info
# ---------------------------------------------------------------------------

def fetch_info(url: str, cookies_from_browser: Optional[str] = None) -> Dict[str, Any]:
    """Return rich metadata dict for a URL (video or playlist)."""
    ydl_opts: Dict[str, Any] = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'noplaylist': False,
        # include formats
        'listformats': False,
    }
    if cookies_from_browser:
        ydl_opts['cookiesfrombrowser'] = [cookies_from_browser]

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:  # type: ignore[arg-type]
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        # Fallback for cookie database lock
        if cookies_from_browser and ("Could not copy Chrome cookie database" in str(e) or "database is locked" in str(e)):
            print(f"Cookie fallback: {e}. Retrying without cookies...")
            ydl_opts.pop('cookiesfrombrowser', None)
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:  # type: ignore[arg-type]
                info = ydl.extract_info(url, download=False)
        else:
            raise e

    # Handle playlists
    is_playlist = info.get('_type') == 'playlist' or 'entries' in info
    if is_playlist:
        entries = []
        for e in (info.get('entries') or []):
            if e:
                entries.append(_extract_video_meta(e))  # type: ignore[arg-type]
        return {
            'type': 'playlist',
            'title': info.get('title', 'Playlist'),
            'count': len(entries),
            'entries': entries,
        }  # type: ignore[return-value]
    else:
        meta = _extract_video_meta(info)  # type: ignore[arg-type]
        meta['type'] = 'video'
        return meta


def _extract_video_meta(info: Dict[str, Any]) -> Dict[str, Any]:
    """Pull key fields + format list from a single video info dict."""
    formats_raw = info.get('formats', [])

    # Build clean format list
    formats = []
    seen_labels = set()
    
    # Video+audio combined / video-only formats
    resolution_map = {
        '144': '144p', '240': '240p', '360': '360p', '480': '480p',
        '720': '720p', '1080': '1080p', '1440': '2K', '2160': '4K',
    }

    for fmt in formats_raw:
        vcodec = fmt.get('vcodec', 'none')
        acodec = fmt.get('acodec', 'none')
        height = fmt.get('height')
        ext = fmt.get('ext', '')
        fmt_id = fmt.get('format_id', '')
        tbr = fmt.get('tbr')
        
        if vcodec == 'none' and acodec == 'none':
            continue

        if vcodec != 'none' and height:
            h_str = str(height)
            base_res = resolution_map.get(h_str, f'{height}p')
            
            fps = fmt.get('fps')
            fps_label = f"{int(fps)}" if fps and fps > 30 else ""
            res_label = f'{base_res}{fps_label}'
            
            label = f'{res_label} ({ext})'
            if label not in seen_labels:
                seen_labels.add(label)
                formats.append({
                    'id': fmt_id,
                    'type': 'video',
                    'label': label,
                    'resolution': res_label,
                    'height': height,
                    'ext': ext,
                    'vcodec': vcodec,
                    'acodec': acodec,
                    'filesize': _safe_filesize(fmt),
                    'filesize_str': _format_bytes(_safe_filesize(fmt)),
                    'tbr': tbr,
                    'has_audio': acodec != 'none',
                })
        elif vcodec == 'none' and acodec != 'none':
            label = f'Audio-only ({ext}, {int(fmt.get("abr", 0) or 0)}kbps)'
            if label not in seen_labels:
                seen_labels.add(label)
                formats.append({
                    'id': fmt_id,
                    'type': 'audio',
                    'label': label,
                    'resolution': 'audio',
                    'ext': ext,
                    'vcodec': 'none',
                    'acodec': acodec,
                    'filesize': _safe_filesize(fmt),
                    'filesize_str': _format_bytes(_safe_filesize(fmt)),
                    'abr': fmt.get('abr'),
                })

    # Sort by height desc
    video_fmts = sorted(
        [f for f in formats if f['type'] == 'video'],
        key=lambda x: x.get('height', 0), reverse=True
    )
    audio_fmts = [f for f in formats if f['type'] == 'audio']
    formats = video_fmts + audio_fmts

    return {
        'id': info.get('id', ''),
        'url': info.get('webpage_url', info.get('url', '')),
        'title': info.get('title', 'Unknown'),
        'thumbnail': info.get('thumbnail', ''),
        'duration': info.get('duration'),
        'duration_str': _format_duration(info.get('duration')),
        'channel': info.get('uploader', info.get('channel', '')),
        'view_count': info.get('view_count'),
        'upload_date': info.get('upload_date', ''),
        'formats': formats,
    }


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def start_download(
    url: str,
    download_id: str,
    options: Dict[str, Any],
    progress_callback: Callable,
    cancel_check: Callable,
) -> Dict[str, Any]:
    """
    Run yt-dlp download. Calls progress_callback(data_dict) frequently.
    Returns result dict with 'status', 'filename', 'error'.
    options keys:
        format_id     - yt-dlp format id ('' = best)
        audio_only    - bool
        audio_format  - mp3 | m4a | wav | aac
        subtitles     - bool
        sub_langs     - e.g. 'en'
        trim_start    - HH:MM:SS or ''
        trim_end      - HH:MM:SS or ''
        cookies_browser - 'chrome' | ''
        retries       - int (default 3)
    """
    retries = int(options.get('retries', 3))

    for attempt in range(1, retries + 1):
        if cancel_check():
            return {'status': 'cancelled', 'filename': '', 'error': ''}

        result = _run_download(url, download_id, options, progress_callback, cancel_check, attempt)
        if result['status'] == 'done':
            return result
        if result['status'] == 'cancelled':
            return result
        # retry
        if attempt < retries:
            progress_callback({
                'status': 'retrying',
                'percent': 0,
                'speed': '',
                'eta': '',
                'error': result.get('error', ''),
                'attempt': attempt + 1,
            })
            time.sleep(2)

    return result


def _run_download(
    url: str,
    download_id: str,
    options: Dict[str, Any],
    progress_callback: Callable,
    cancel_check: Callable,
    attempt: int = 1,
) -> Dict[str, Any]:
    audio_only = options.get('audio_only', False)
    audio_format = options.get('audio_format', 'mp3')
    format_id = options.get('format_id', '')
    subtitles = options.get('subtitles', False)
    sub_langs = options.get('sub_langs', 'en')
    trim_start = options.get('trim_start', '').strip()
    trim_end = options.get('trim_end', '').strip()
    cookies_browser = options.get('cookies_browser', '').strip()

    subfolder = 'Audio' if audio_only else 'Video'
    out_dir = os.path.join(DOWNLOADS_DIR, subfolder)
    os.makedirs(out_dir, exist_ok=True)
    out_tmpl = os.path.join(out_dir, '%(title)s.%(ext)s')
    
    # Build postprocessors
    postprocessors = []
    if audio_only:
        postprocessors.append({
            'key': 'FFmpegExtractAudio',
            'preferredcodec': audio_format,
            'preferredquality': '192',
        })
    else:
        # Always merge best video+audio into MKV as requested
        postprocessors.append({'key': 'FFmpegVideoConvertor', 'preferedformat': 'mkv'})

    if subtitles:
        postprocessors.append({
            'key': 'FFmpegSubtitlesConvertor',
            'format': 'srt',
        })

    # Trim via ffmpeg-sections
    downloader_opts = {}
    if trim_start or trim_end:
        sections = []
        start = trim_start if trim_start else '00:00:00'
        if trim_end:
            sections.append(f'*{start}-{trim_end}')
        else:
            sections.append(f'*{start}-inf')
        downloader_opts['download_ranges'] = yt_dlp.utils.download_range_func(None, sections)  # type: ignore[attr-defined]
        downloader_opts['force_keyframes_at_cuts'] = True

    # Format selection
    if audio_only:
        fmt = 'bestaudio/best'
    elif format_id:
        fmt = f'{format_id}+bestaudio/best'
    else:
        fmt = 'bestvideo+bestaudio/best'

    def _progress_hook(d):
        if cancel_check():
            raise yt_dlp.utils.DownloadError('Cancelled by user')  # type: ignore[attr-defined]
        status = d.get('status', '')
        if status == 'downloading':
            # Try to calculate percentage from bytes first (more reliable)
            total = d.get('total_bytes') or d.get('total_bytes_estimate')
            downloaded = d.get('downloaded_bytes', 0)
            if total and total > 0:
                pct = (downloaded / total) * 100
            else:
                # Fallback to string parsing if bytes missing
                raw_percent = d.get('_percent_str', '0%').strip()
                # Handle both dot and comma decimals (e.g. 94.9% vs 94,9%)
                pct_clean = re.sub(r'[^0-9.,]', '', raw_percent)
                pct_clean = pct_clean.replace(',', '.')
                try:
                    pct = float(pct_clean)
                except:
                    pct = 0

            speed = _strip_ansi(d.get('_speed_str', ''))
            eta = _strip_ansi(d.get('_eta_str', ''))

            progress_callback({
                'status': 'downloading',
                'percent': round(pct, 1),
                'speed': speed or '—',
                'eta': eta or '—',
                'filename': d.get('filename', ''),
                'downloaded_bytes': downloaded,
                'total_bytes': total or 0,
            })
        elif status == 'finished':
            progress_callback({
                'status': 'processing',
                'percent': 100,
                'speed': '',
                'eta': '',
                'filename': d.get('filename', ''),
            })

    ydl_opts: Dict[str, Any] = {
        'format': fmt,
        'outtmpl': out_tmpl,
        'progress_hooks': [_progress_hook],
        'postprocessors': postprocessors,
        'merge_output_format': 'mkv',
        'quiet': True,
        'no_warnings': True,
        'retries': 3,
        'fragment_retries': 3,
        'concurrent_fragment_downloads': 4,
    }

    if subtitles:
        ydl_opts['writesubtitles'] = True
        ydl_opts['writeautomaticsub'] = True
        ydl_opts['subtitleslangs'] = [sub_langs]

    if cookies_browser:
        ydl_opts['cookiesfrombrowser'] = [cookies_browser]

    if trim_start or trim_end:
        ydl_opts.update(downloader_opts)

    last_filename = ''
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:  # type: ignore[arg-type]
            info = ydl.extract_info(url, download=True)
            last_filename = ydl.prepare_filename(info) if info else ''
            # Ensure extension is mkv if bestvideo+bestaudio was used
            if not audio_only and last_filename:
                base, _ = os.path.splitext(last_filename)
                last_filename = base + '.mkv'
    except Exception as e:
        # Fallback for cookie database lock during download
        if cookies_browser and ("Could not copy Chrome cookie database" in str(e) or "database is locked" in str(e)):
            print(f"Cookie fallback during download: {e}. Retrying without cookies...")
            ydl_opts.pop('cookiesfrombrowser', None)
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:  # type: ignore[arg-type]
                    info = ydl.extract_info(url, download=True)
                    last_filename = ydl.prepare_filename(info) if info else ''
                    if not audio_only and last_filename:
                        base, _ = os.path.splitext(last_filename)
                        last_filename = base + '.mkv'
            except Exception as e2:
                err = str(e2)
                if 'Cancelled' in err:
                    return {'status': 'cancelled', 'filename': '', 'error': ''}
                return {'status': 'error', 'filename': '', 'error': err}
        else:
            err = str(e)
            if 'Cancelled' in err:
                return {'status': 'cancelled', 'filename': '', 'error': ''}
            return {'status': 'error', 'filename': '', 'error': err}

    return {'status': 'done', 'filename': last_filename, 'error': ''}
