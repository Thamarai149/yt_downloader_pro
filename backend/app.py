"""
app.py — Flask API Server for YouTube Downloader Pro
Run: python backend/app.py
"""
import json
import logging
import os
import time
from flask import Flask, Response, jsonify, request, send_from_directory  
from flask_cors import CORS  

import downloader  
import history  
import queue_manager  

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, '..', 'frontend')
DOWNLOADS_DIR = r'C:\Users\THAMARAISELVAN\Downloads\ytdownloads'
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
CORS(app)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(BASE_DIR, '..', 'logs', 'app.log'), encoding='utf-8'),
        logging.StreamHandler(),
    ]
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Serve Frontend
# ---------------------------------------------------------------------------
@app.route('/')
def index():
    return send_from_directory(FRONTEND_DIR, 'index.html')


@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(FRONTEND_DIR, path)


# ---------------------------------------------------------------------------
# API: Fetch video / playlist info
# ---------------------------------------------------------------------------
@app.route('/api/info', methods=['POST'])
def api_info():
    data = request.get_json(force=True) or {}
    url = (data.get('url') or '').strip()
    cookies_browser = (data.get('cookies_browser') or '').strip()

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    try:
        log.info(f'Fetching info: {url}')
        info = downloader.fetch_info(url, cookies_from_browser=cookies_browser or None)
        return jsonify(info)
    except Exception as e:
        log.error(f'Error fetching info: {e}')
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# API: Start download
# ---------------------------------------------------------------------------
@app.route('/api/download', methods=['POST'])
def api_download():
    data = request.get_json(force=True) or {}
    url = (data.get('url') or '').strip()
    if not url:
        return jsonify({'error': 'URL is required'}), 400

    options = {
        'format_id':       data.get('format_id', ''),
        'audio_only':      bool(data.get('audio_only', False)),
        'audio_format':    data.get('audio_format', 'mp3'),
        'subtitles':       bool(data.get('subtitles', False)),
        'sub_langs':       data.get('sub_langs', 'en'),
        'trim_start':      data.get('trim_start', ''),
        'trim_end':        data.get('trim_end', ''),
        'cookies_browser': data.get('cookies_browser', ''),
        'retries':         int(data.get('retries', 3)),
    }
    title = data.get('title', '')

    download_id = queue_manager.new_download_id()
    queue_manager.init_progress(download_id, title=title, url=url)

    def run():
        def progress_callback(d):
            queue_manager.update_progress(download_id, **d)

        def cancel_check():
            return queue_manager.is_cancelled(download_id)

        queue_manager.update_progress(download_id, status='downloading')
        log.info(f'[{download_id}] Starting download: {url}')

        result = downloader.start_download(
            url=url,
            download_id=download_id,
            options=options,
            progress_callback=progress_callback,
            cancel_check=cancel_check,
        )

        final_status = result.get('status', 'error')
        prog = queue_manager.get_progress(download_id)
        queue_manager.update_progress(
            download_id,
            status=final_status,
            filename=result.get('filename', ''),
            error=result.get('error', ''),
            percent=100 if final_status == 'done' else (prog.get('percent', 0) if prog else 0),
        )
        log.info(f'[{download_id}] Finished: {final_status}')

        if final_status == 'done':
            history.add_entry({
                'id': download_id,
                'url': url,
                'title': title,
                'filename': result.get('filename', ''),
                'options': options,
                'status': 'done',
            })

        queue_manager.cleanup(download_id)

    queue_manager.start_in_thread(download_id, run)
    return jsonify({'download_id': download_id})


# ---------------------------------------------------------------------------
# API: SSE progress stream
# ---------------------------------------------------------------------------
@app.route('/api/progress/<download_id>')
def api_progress(download_id):
    def generate():
        while True:
            prog = queue_manager.get_progress(download_id)
            if prog:
                yield f'data: {json.dumps(prog)}\n\n'
                status = prog.get('status', '')
                if status in ('done', 'error', 'cancelled'):
                    break
            else:
                yield f'data: {json.dumps({"status": "not_found"})}\n\n'
                break
            time.sleep(0.5)

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        }
    )


# ---------------------------------------------------------------------------
# API: Cancel download
# ---------------------------------------------------------------------------
@app.route('/api/cancel/<download_id>', methods=['POST'])
def api_cancel(download_id):
    queue_manager.cancel_download(download_id)
    return jsonify({'status': 'cancelled', 'id': download_id})


# ---------------------------------------------------------------------------
# API: Queue status
# ---------------------------------------------------------------------------
@app.route('/api/queue')
def api_queue():
    return jsonify(queue_manager.get_all_progress())


# ---------------------------------------------------------------------------
# API: History
# ---------------------------------------------------------------------------
@app.route('/api/history', methods=['GET'])
def api_history_get():
    return jsonify(history.get_history())


@app.route('/api/history', methods=['DELETE'])
def api_history_delete():
    history.clear_history()
    return jsonify({'status': 'cleared'})


# ---------------------------------------------------------------------------
# API: Serve downloaded files
# ---------------------------------------------------------------------------
@app.route('/api/file/<path:filename>')
def api_file(filename):
    return send_from_directory(DOWNLOADS_DIR, filename, as_attachment=True)


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    log.info('YouTube Downloader Pro — starting on http://127.0.0.1:5000')
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
