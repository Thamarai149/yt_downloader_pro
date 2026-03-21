import json
import os
import threading
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HISTORY_FILE = os.path.join(BASE_DIR, 'history', 'history.json')

_lock = threading.Lock()


def _load():
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []


def _save(data):
    os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
    with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def add_entry(entry: dict):
    with _lock:
        history = _load()
        entry['timestamp'] = datetime.now().isoformat()
        history.insert(0, entry)
        # Keep last 200 entries
        while len(history) > 200:
            history.pop()
        _save(history)


def get_history():
    with _lock:
        return _load()


def clear_history():
    with _lock:
        _save([])
