import threading
import uuid
from typing import Callable, Optional

# Shared progress state: download_id -> dict
_progress: dict = {}
_cancel_flags: dict = {}
_lock = threading.Lock()
_active_threads: dict = {}


def new_download_id() -> str:
    return str(uuid.uuid4())


def init_progress(download_id: str, title: str = '', url: str = ''):
    with _lock:
        _progress[download_id] = {
            'id': download_id,
            'title': title,
            'url': url,
            'status': 'queued',
            'percent': 0.0,
            'speed': '',
            'eta': '',
            'filename': '',
            'error': '',
        }
        _cancel_flags[download_id] = False


def update_progress(download_id: str, **kwargs):
    with _lock:
        if download_id in _progress:
            _progress[download_id].update(kwargs)


def get_progress(download_id: str) -> Optional[dict]:
    with _lock:
        return dict(_progress.get(download_id, {}))


def get_all_progress() -> list:
    with _lock:
        return [dict(v) for v in _progress.values()]


def is_cancelled(download_id: str) -> bool:
    with _lock:
        return _cancel_flags.get(download_id, False)


def cancel_download(download_id: str):
    with _lock:
        _cancel_flags[download_id] = True
        if download_id in _progress:
            _progress[download_id]['status'] = 'cancelled'


def start_in_thread(download_id: str, target: Callable, args=()):
    t = threading.Thread(target=target, args=args, daemon=True)
    with _lock:
        _active_threads[download_id] = t
    t.start()


def cleanup(download_id: str):
    with _lock:
        _active_threads.pop(download_id, None)
        _cancel_flags.pop(download_id, None)
