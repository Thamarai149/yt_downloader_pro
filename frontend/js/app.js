/**
 * YT Downloader Pro — Frontend Application Logic
 * app.js
 */

'use strict';

// ═══════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════
const API = '';          // Same origin — Flask serves frontend
let currentInfo = null;  // Last fetched video/playlist info
let activeTab = 'video'; // 'video' | 'audio'
let activeDownloads = {}; // download_id -> { eventSource, el }
let currentSection = 'downloader';

// ═══════════════════════════════════════════════════════════
// DOM Helpers
// ═══════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);
const show = el => el && el.classList.remove('hidden');
const hide = el => el && el.classList.add('hidden');
const fmt = {
  num: n => n ? Number(n).toLocaleString() : 'N/A',
  date: d => d ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : '',
};

// ═══════════════════════════════════════════════════════════
// Toast Notifications
// ═══════════════════════════════════════════════════════════
function toast(msg, type = 'info', duration = 4000) {
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  const container = $('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i class="fas ${icons[type]}"></i><span>${msg}</span>`;
  container.appendChild(el);
  const remove = () => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 320);
  };
  setTimeout(remove, duration);
  el.addEventListener('click', remove);
}

// ═══════════════════════════════════════════════════════════
// Navigation
// ═══════════════════════════════════════════════════════════
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.getAttribute('data-section');
      switchSection(section);
    });
  });
}

function switchSection(sectionId) {
  currentSection = sectionId;
  
  // Update nav UI
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-section') === sectionId);
  });
  
  // Update page sections
  document.querySelectorAll('.page-section').forEach(sec => {
    const isActive = sec.id === `section${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}`;
    sec.classList.toggle('active', isActive);
    if (isActive) sec.classList.remove('hidden');
  });
  
  // Update title
  const titles = { downloader: 'Downloader', active: 'Active Queue', history: 'Download History', settings: 'Settings' };
  $('sectionTitle').textContent = titles[sectionId] || 'YT Downloader Pro';

  if (sectionId === 'history') loadHistory();
}

// ═══════════════════════════════════════════════════════════
// Theme Toggle
// ═══════════════════════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('ytdl-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
  
  const btn = $('themeToggleBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ytdl-theme', next);
      updateThemeIcon(next);
    });
  }
}

function updateThemeIcon(theme) {
  const btn = $('themeToggleBtn');
  if (btn) btn.innerHTML = theme === 'dark'
    ? '<i class="fas fa-sun"></i>'
    : '<i class="fas fa-moon"></i>';
}

// ═══════════════════════════════════════════════════════════
// Drag & Drop URL
// ═══════════════════════════════════════════════════════════
function initDragDrop() {
  const zone = $('dropZone');
  ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => {
    e.preventDefault(); zone.classList.add('drag-over');
  }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => {
    e.preventDefault(); zone.classList.remove('drag-over');
  }));
  zone.addEventListener('drop', e => {
    const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list') || '';
    if (text.trim()) {
      $('urlInput').value = text.trim();
      fetchVideo();
    }
  });
  document.addEventListener('paste', e => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (text && isYouTubeUrl(text)) {
      $('urlInput').value = text.trim();
      toast('URL pasted from clipboard', 'info');
      fetchVideo();
    }
  });
}

function isYouTubeUrl(url) {
  return /youtu(be\.com|\.be)/i.test(url);
}

// ═══════════════════════════════════════════════════════════
// URL Input Helpers
// ═══════════════════════════════════════════════════════════
$('clearUrlBtn').addEventListener('click', () => {
  $('urlInput').value = '';
  resetInfoCards();
  $('urlInput').focus();
});
$('urlInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') fetchVideo();
});

function resetInfoCards() {
  hide($('videoInfoCard'));
  hide($('playlistCard'));
  hide($('loadingCard'));
  currentInfo = null;
}

// ═══════════════════════════════════════════════════════════
// Fetch Video Info
// ═══════════════════════════════════════════════════════════
async function fetchVideo() {
  const url = $('urlInput').value.trim();
  if (!url) { toast('Please enter a YouTube URL', 'error'); return; }

  resetInfoCards();
  show($('loadingCard'));

  const fetchBtn = $('fetchBtn');
  fetchBtn.disabled = true;
  fetchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fetching…';

  try {
    const res = await fetch(`${API}/api/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch info');

    currentInfo = data;
    hide($('loadingCard'));

    if (data.type === 'playlist') {
      renderPlaylist(data);
    } else {
      renderVideoInfo(data);
    }
  } catch (err) {
    hide($('loadingCard'));
    toast(`Error: ${err.message}`, 'error', 6000);
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> <span>Fetch Video</span>';
  }
}

// ═══════════════════════════════════════════════════════════
// Render Video Info
// ═══════════════════════════════════════════════════════════
function renderVideoInfo(info) {
  $('videoThumb').src = info.thumbnail || '';
  $('videoTitle').textContent = info.title || 'Unknown';
  $('videoDuration').textContent = info.duration_str || '';
  $('videoChannel').textContent = info.channel || '';
  $('videoViews').textContent = fmt.num(info.view_count) + ' views';
  $('videoDate').textContent = fmt.date(info.upload_date);

  // Populate format select
  const sel = $('formatSelect');
  sel.innerHTML = '';

  const videoFmts = (info.formats || []).filter(f => f.type === 'video');
  if (videoFmts.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Best Available';
    sel.appendChild(opt);
  } else {
    // Add "best" option
    const best = document.createElement('option');
    best.value = '';
    best.textContent = '⭐ Best Quality (Auto)';
    sel.appendChild(best);

    videoFmts.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = `${f.resolution} — ${f.ext.toUpperCase()} ${f.filesize_str !== 'N/A' ? '(~' + f.filesize_str + ')' : ''}`;
      sel.appendChild(opt);
    });
  }

  applyPrefsToSelection();
  sel.addEventListener('change', updateFormatInfo);
  updateFormatInfo();

  // Subtitle toggle
  $('subtitleCheck').addEventListener('change', () => {
    const row = $('subLangRow');
    $('subtitleCheck').checked ? show(row) : hide(row);
  });

  show($('videoInfoCard'));
  
  const prefs = JSON.parse(localStorage.getItem('ytpro-settings') || '{}');
  if (prefs.autoDownload) {
    setTimeout(() => startDownload(), 300);
  }
}


function updateFormatInfo() {
  if (!currentInfo || currentInfo.type !== 'video') return;
  const sel = $('formatSelect');
  const id = sel.value;
  const fmt_info = $('formatInfo');
  if (!id) {
    fmt_info.textContent = 'Automatic best video + best audio merge via FFmpeg';
    return;
  }
  const found = (currentInfo.formats || []).find(f => f.id === id);
  if (found) {
    const parts = [
      found.resolution,
      found.ext.toUpperCase(),
      found.filesize_str !== 'N/A' ? `~${found.filesize_str}` : '',
      found.vcodec && found.vcodec !== 'none' ? found.vcodec.split('.')[0] : '',
      found.has_audio ? '(has audio)' : '(video only — will merge audio)',
    ].filter(Boolean);
    fmt_info.textContent = parts.join(' · ');
  }
}

// ═══════════════════════════════════════════════════════════
// Format Tabs
// ═══════════════════════════════════════════════════════════
function switchTab(tab) {
  activeTab = tab;
  if (tab === 'video') {
    show($('videoTab')); hide($('audioTab'));
    $('tabVideo').classList.add('active');
    $('tabAudio').classList.remove('active');
    show($('extraOptsSection'));
  } else {
    hide($('videoTab')); show($('audioTab'));
    $('tabAudio').classList.add('active');
    $('tabVideo').classList.remove('active');
    show($('extraOptsSection'));
  }
}

// ═══════════════════════════════════════════════════════════
// Start Single Download
// ═══════════════════════════════════════════════════════════
async function startDownload(overrideUrl, overrideTitle, overrideOpts) {
  const url = overrideUrl || $('urlInput').value.trim();
  const title = overrideTitle || currentInfo?.title || 'Download';
  if (!url) { toast('No URL to download', 'error'); return; }

  const isAudio = overrideOpts?.audio_only ?? (activeTab === 'audio');
  const opts = overrideOpts || {
    format_id:       isAudio ? '' : ($('formatSelect')?.value || ''),
    audio_only:      isAudio,
    audio_format:    $('audioFormatSelect')?.value || 'mp3',
    subtitles:       $('subtitleCheck')?.checked || false,
    sub_langs:       $('subLangInput')?.value || 'en',
    trim_start:      $('trimStart')?.value || '',
    trim_end:        $('trimEnd')?.value || '',
    cookies_browser: $('cookieCheck')?.checked ? 'chrome' : '',
    retries:         3,
    title,
  };

  try {
    const res = await fetch(`${API}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title, ...opts }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Download failed');

    const { download_id } = data;
    createDownloadItem(download_id, title, url);
    listenProgress(download_id);
    toast(`Download started: ${title}`, 'info');
  } catch (err) {
    toast(`Error: ${err.message}`, 'error', 7000);
  }
}

// ═══════════════════════════════════════════════════════════
// SSE Progress Listener
// ═══════════════════════════════════════════════════════════
function listenProgress(download_id) {
  const es = new EventSource(`${API}/api/progress/${download_id}`);
  activeDownloads[download_id] = { es };

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      updateDownloadItem(download_id, data);
      if (['done', 'error', 'cancelled', 'not_found'].includes(data.status)) {
        es.close();
        delete activeDownloads[download_id];
        updateActiveCount();

        if (data.status === 'done') {
          toast('✅ Download complete!', 'success');
          loadHistory();
        } else if (data.status === 'error') {
          toast(`❌ Download failed: ${data.error || ''}`, 'error', 8000);
        }
      }
    } catch (_) {}
  };
  es.onerror = () => { es.close(); delete activeDownloads[download_id]; };
  updateActiveCount();
}

// ═══════════════════════════════════════════════════════════
// Download Queue UI
// ═══════════════════════════════════════════════════════════
function createDownloadItem(id, title, url) {
  const list = $('downloadsList');
  hide($('downloadsEmpty'));

  const el = document.createElement('div');
  el.className = 'dl-item status-queued';
  el.id = `dl-${id}`;
  el.innerHTML = `
    <div class="dl-header">
      <div class="dl-title" title="${escHtml(title)}">${escHtml(title)}</div>
      <span class="dl-status-badge">Queued</span>
    </div>
    <div class="dl-progress-wrap">
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" style="width:0%"></div>
      </div>
    </div>
    <div class="dl-meta">
      <div class="dl-stats">
        <span><i class="fas fa-chart-line"></i> <span class="dl-pct">0%</span></span>
        <span><i class="fas fa-bolt"></i> <span class="dl-speed">—</span></span>
        <span><i class="fas fa-clock"></i> <span class="dl-eta">—</span></span>
      </div>
      <div class="dl-actions">
        <button class="dl-cancel-btn" onclick="cancelDownload('${id}')">
          <i class="fas fa-times"></i> Cancel
        </button>
      </div>
    </div>
    <div class="dl-error-msg hidden"></div>
  `;
  list.prepend(el);
}

function updateDownloadItem(id, data) {
  const el = document.getElementById(`dl-${id}`);
  if (!el) return;

  const status = data.status || 'queued';
  const pct = data.percent || 0;

  // Update class
  el.className = `dl-item status-${status}`;

  // Badge
  const badgeText = {
    queued: 'Queued', downloading: 'Downloading', processing: 'Processing',
    done: 'Done ✓', error: 'Failed', cancelled: 'Cancelled', retrying: 'Retrying…',
  };
  el.querySelector('.dl-status-badge').textContent = badgeText[status] || status;

  // Progress bar
  const displayPct = typeof pct === 'number' ? pct.toFixed(1) : pct;
  el.querySelector('.progress-bar-fill').style.width = `${pct}%`;
  el.querySelector('.dl-pct').textContent = `${displayPct}%`;
  el.querySelector('.dl-speed').textContent = stripAnsi(data.speed || '—');
  el.querySelector('.dl-eta').textContent = stripAnsi(data.eta || '—');

  // Error message
  const errEl = el.querySelector('.dl-error-msg');
  if (data.error) {
    errEl.textContent = data.error;
    show(errEl);
  } else {
    hide(errEl);
  }

  // Hide cancel on terminal states
  if (['done', 'error', 'cancelled'].includes(status)) {
    const cancelBtn = el.querySelector('.dl-cancel-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';
  }
}

async function cancelDownload(id) {
  try {
    await fetch(`${API}/api/cancel/${id}`, { method: 'POST' });
    toast('Download cancelled', 'info');
    if (activeDownloads[id]) {
      activeDownloads[id].es?.close();
      delete activeDownloads[id];
    }
    updateDownloadItem(id, { status: 'cancelled', percent: 0 });
    updateActiveCount();
  } catch (e) {
    toast('Failed to cancel', 'error');
  }
}

function updateActiveCount() {
  const count = Object.keys(activeDownloads).length;
  const badge = $('activeCount');
  if (badge) badge.textContent = count;
  
  const navBadge = $('navActiveCount');
  if (navBadge) {
    navBadge.textContent = count;
    count > 0 ? show(navBadge) : hide(navBadge);
  }
}

// ═══════════════════════════════════════════════════════════
// Playlist
// ═══════════════════════════════════════════════════════════
function renderPlaylist(info) {
  $('playlistTitle').textContent = info.title || 'Playlist';
  $('playlistCount').textContent = `${info.count} videos`;

  const container = $('playlistItems');
  container.innerHTML = '';

  (info.entries || []).forEach((entry, i) => {
    const item = document.createElement('div');
    item.className = 'pl-item';
    item.innerHTML = `
      <span class="pl-index">${i + 1}</span>
      <span class="pl-title" title="${escHtml(entry.title)}">${escHtml(entry.title)}</span>
      <span class="pl-duration">${entry.duration_str || ''}</span>
      <button class="pl-dl-btn" onclick="startDownload('${escAttr(entry.url)}','${escAttr(entry.title)}')">
        <i class="fas fa-download"></i>
      </button>
    `;
    container.appendChild(item);
  });

  show($('playlistCard'));
}

async function downloadPlaylist() {
  if (!currentInfo || currentInfo.type !== 'playlist') return;
  const fmt_val = $('playlistFormatSelect').value;

  let baseOpts = { retries: 3, cookies_browser: $('cookieCheck').checked ? 'chrome' : '' };
  if (fmt_val === 'mp3_audio') Object.assign(baseOpts, { audio_only: true, audio_format: 'mp3' });
  else if (fmt_val === 'm4a_audio') Object.assign(baseOpts, { audio_only: true, audio_format: 'm4a' });
  else if (fmt_val === '720p') Object.assign(baseOpts, { audio_only: false });
  else if (fmt_val === '1080p') Object.assign(baseOpts, { audio_only: false });
  else Object.assign(baseOpts, { audio_only: false, format_id: '' });

  for (const entry of (currentInfo.entries || [])) {
    await startDownload(entry.url, entry.title, { ...baseOpts, title: entry.title });
    await sleep(500); // small delay between queue submissions
  }
  toast(`Queued ${currentInfo.count} downloads`, 'success');
}

// ═══════════════════════════════════════════════════════════
// History
// ═══════════════════════════════════════════════════════════
async function loadHistory() {
  try {
    const res = await fetch(`${API}/api/history`);
    const data = await res.json();
    renderHistory(data);
  } catch (_) {}
}

function renderHistory(items) {
  const list = $('historyList');
  if (!items || items.length === 0) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-clock"></i><p>No history yet</p></div>';
    return;
  }
  list.innerHTML = items.map(item => `
    <div class="hist-item">
      <i class="fas fa-check-circle hist-icon"></i>
      <span class="hist-title" title="${escHtml(item.title)}">${escHtml(item.title)}</span>
      <span class="hist-date">${formatRelTime(item.timestamp)}</span>
      <div class="hist-actions">
        <button class="btn btn-ghost btn-sm" title="Re-download" onclick="reDownload('${escAttr(item.url)}')">
          <i class="fas fa-redo"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function reDownload(url) {
  $('urlInput').value = url;
  switchSection('downloader');
  fetchVideo();
}

async function clearHistory() {
  await fetch(`${API}/api/history`, { method: 'DELETE' });
  renderHistory([]);
  toast('History cleared', 'info');
}

// ═══════════════════════════════════════════════════════════
// Settings
// ═══════════════════════════════════════════════════════════
function loadSettings() {
  const prefs = JSON.parse(localStorage.getItem('ytpro-settings') || '{}');
  if (prefs.resolution) $('prefResolution').value = prefs.resolution;
  if (prefs.audioFormat) $('prefAudioFormat').value = prefs.audioFormat;
  if (prefs.autoDownload !== undefined) $('prefAutoDownload').checked = prefs.autoDownload;
}

function saveSettings() {
  const prefs = {
    resolution: $('prefResolution').value,
    audioFormat: $('prefAudioFormat').value,
    autoDownload: $('prefAutoDownload').checked
  };
  localStorage.setItem('ytpro-settings', JSON.stringify(prefs));
  toast('Settings saved successfully!', 'success');
}

// ═══════════════════════════════════════════════════════════
// Settings Auto-apply in fetchVideo
// ═══════════════════════════════════════════════════════════
function applyPrefsToSelection() {
  const prefs = JSON.parse(localStorage.getItem('ytpro-settings') || '{}');
  if (prefs.resolution) {
    const sel = $('formatSelect');
    if (sel) {
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value.includes(prefs.resolution)) {
          sel.selectedIndex = i;
          break;
        }
      }
    }
  }
  if (prefs.audioFormat && $('audioFormatSelect')) {
    $('audioFormatSelect').value = prefs.audioFormat;
  }
}

// ═══════════════════════════════════════════════════════════
// FAB
// ═══════════════════════════════════════════════════════════
async function quickPaste() {
  try {
    const text = await navigator.clipboard.readText();
    if (text && isYouTubeUrl(text)) {
      $('urlInput').value = text.trim();
      if (currentSection !== 'downloader') switchSection('downloader');
      fetchVideo();
    } else {
      toast('No valid YouTube URL found in clipboard', 'error');
    }
  } catch (err) {
    toast('Clipboard access denied. Please paste manually.', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════════════════════
function stripAnsi(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();
}

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function escAttr(s) {
  return String(s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatRelTime(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

// ═══════════════════════════════════════════════════════════
// Keyboard Shortcuts
// ═══════════════════════════════════════════════════════════
function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement === $('urlInput')) {
      fetchVideo();
    }
    if (e.key === 'Escape') {
      if ($('urlInput').value) $('urlInput').value = '';
      resetInfoCards();
    }
  });
}

// ═══════════════════════════════════════════════════════════
// Mobile Switch Gestures
// ═══════════════════════════════════════════════════════════
function initGestures() {
  let touchStartX = 0;
  let touchEndX = 0;
  const sections = ['downloader', 'active', 'history', 'settings'];

  document.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }, { passive: true });

  function handleSwipe() {
    // Only swipe if the movement is significant (e.g., > 100px)
    const threshold = 100;
    if (touchEndX < touchStartX - threshold) {
      // Swiped Left -> Go to "Next" section
      const currIdx = sections.indexOf(currentSection);
      if (currIdx < sections.length - 1) switchSection(sections[currIdx + 1]);
    }
    if (touchEndX > touchStartX + threshold) {
      // Swiped Right -> Go to "Prev" section
      const currIdx = sections.indexOf(currentSection);
      if (currIdx > 0) switchSection(sections[currIdx - 1]);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// Resizable Sidebar
// ═══════════════════════════════════════════════════════════
function initResizer() {
  const sidebar = document.querySelector('.sidebar');
  const resizer = document.getElementById('sidebarResizer');
  if (!sidebar || !resizer) return;

  let isResizing = false;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none'; // Prevent text selection
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    // Limit min/max width
    const newWidth = Math.max(200, Math.min(600, e.clientX));
    sidebar.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Save user preference
      localStorage.setItem('ytpro-sidebar-width', sidebar.style.width);
    }
  });

  // Restore saved width
  const savedWidth = localStorage.getItem('ytpro-sidebar-width');
  if (savedWidth) sidebar.style.width = savedWidth;
}

// ═══════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════
(function init() {
  initTheme();
  loadSettings();
  initNavigation();
  initDragDrop();
  initShortcuts();
  initGestures();
  initResizer();
  loadHistory();
  
  if ($('quickPasteBtn')) $('quickPasteBtn').classList.remove('hidden');

  // Refresh queue status on load (reconnect active downloads if any)
  fetch(`${API}/api/queue`).then(r => r.json()).then(items => {
    items.forEach(item => {
      if (!['done','error','cancelled'].includes(item.status)) {
        createDownloadItem(item.id, item.title, item.url);
        updateDownloadItem(item.id, item);
        listenProgress(item.id);
      }
    });
  }).catch(() => {});
})();
