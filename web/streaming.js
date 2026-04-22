// Copyright 2026 diyyo White | Licensed under MIT License
/**
 * streaming.js — Streaming Page Logic
 * Anime Streaming Website | Vanilla JS
 *
 * URL query params consumed:
 *   ?id=<anime_id>&ep=<episode_number>
 *
 * Google Apps Script API endpoint actions:
 *   ?action=getAll        — returns all anime (used for search)
 *   ?action=getAnime&id=X — returns single anime + all its episodes
 *
 * Episode row structure (within anime object):
 *   anime.episodeList = [
 *     {
 *       ep_number,          // "1", "2", …
 *       title,              // optional episode title
 *       servers: [          // array of server objects
 *         { name, url },
 *       ]
 *     }
 *   ]
 */

// ─── CONFIG ───────────────────────────────────────────────────
const APPS_SCRIPT_URL = 'YOUR_GAS_URL';

// ─── URL PARAMS ───────────────────────────────────────────────
const params      = new URLSearchParams(location.search);
const ANIME_ID    = params.get('id') || '';
const INIT_EP_NUM = params.get('ep') || '1';

// ─── STATE ────────────────────────────────────────────────────
let animeData    = null;
let episodeList  = [];
let currentEpIdx = 0;
let allAnimeList = []; // for search
let searchDebounce;

// ─── DOM REFS ─────────────────────────────────────────────────
const streamSkeleton   = document.getElementById('streamSkeleton');
const streamContent    = document.getElementById('streamContent');
const streamError      = document.getElementById('streamError');
const videoTitle       = document.getElementById('videoTitle');
const videoEpisodeLabel= document.getElementById('videoEpisodeLabel');
const uploaderName     = document.getElementById('uploaderName');
const uploadDate       = document.getElementById('uploadDate');
const videoFrame       = document.getElementById('videoFrame');
const iframeLoading    = document.getElementById('iframeLoading');
const serverSelect     = document.getElementById('serverSelect');
const btnPrev          = document.getElementById('btnPrev');
const btnNext          = document.getElementById('btnNext');
const btnAllEp         = document.getElementById('btnAllEp');
const episodeModal     = document.getElementById('episodeModal');
const modalClose       = document.getElementById('modalClose');
const episodeListEl    = document.getElementById('episodeList');
const infoCover        = document.getElementById('infoCover');
const infoTitle        = document.getElementById('infoTitle');
const infoTitleEn      = document.getElementById('infoTitleEn');
const infoGenre        = document.getElementById('infoGenre');
const infoSynopsis     = document.getElementById('infoSynopsis');

// Video Player & Controls Refs
const videoPlayer      = document.getElementById('videoPlayer');
const videoControls    = document.getElementById('videoControls');
const videoBuffering   = document.getElementById('videoBuffering');
const btnPlayPause     = document.getElementById('btnPlayPause');
const iconPlay         = document.getElementById('iconPlay');
const iconPause        = document.getElementById('iconPause');
const btnCenterPlayPause = document.getElementById('btnCenterPlayPause');
const centerPlayIcon     = document.getElementById('centerPlayIcon');
const centerPauseIcon    = document.getElementById('centerPauseIcon');
const currentTimeEl    = document.getElementById('currentTime');
const totalTimeEl      = document.getElementById('totalTime');
const btnMute          = document.getElementById('btnMute');
const iconVol          = document.getElementById('iconVol');
const iconMute         = document.getElementById('iconMute');
const progressBar      = document.getElementById('progressBar');
const progressFill     = document.getElementById('progressFill');
const progressBuffer   = document.getElementById('progressBuffer');
const seekRipple       = document.getElementById('seekRipple');
const seekRippleIcon   = document.getElementById('seekRippleIcon');
const seekRippleText   = document.getElementById('seekRippleText');

// Fullscreen Custom Refs
const btnCustomFs      = document.getElementById('btnCustomFs');
const iframeWrapper    = document.getElementById('iframeWrapper');
const iconFsEnter      = document.getElementById('iconFsEnter');
const iconFsExit       = document.getElementById('iconFsExit');

// Search refs
const searchInput      = document.getElementById('searchInput');
const searchResults    = document.getElementById('searchResults');
const searchResultsGrid= document.getElementById('searchResultsGrid');
const searchQuery      = document.getElementById('searchQuery');
const closeSearchBtn   = document.getElementById('closeSearch');

// ─── TURNSTILE GATE (smart session, 1 jam) ────────────────────
const TS_OK_UNTIL_KEY = 'ts_ok_until';
const TS_TTL_MS = 60 * 60 * 1000; // 1 hour

function hasValidTurnstileSession() {
  if (sessionStorage.getItem('ts_ok') === '1') return true;
  const until = Number(localStorage.getItem(TS_OK_UNTIL_KEY) || '0');
  return Number.isFinite(until) && until > Date.now();
}

function persistTurnstileSession() {
  sessionStorage.setItem('ts_ok', '1');
  localStorage.setItem(TS_OK_UNTIL_KEY, String(Date.now() + TS_TTL_MS));
}

function showTurnstileOverlay() {
  const overlay = document.getElementById('tsOverlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function hideTurnstileOverlay() {
  const overlay = document.getElementById('tsOverlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  document.body.style.overflow = '';
}

function requireTurnstileThen(run) {
  if (hasValidTurnstileSession()) {
    hideTurnstileOverlay();
    run();
    return;
  }

  showTurnstileOverlay();
  window.onTurnstileSuccess = (token) => {
    if (!token) return;
    persistTurnstileSession();
    hideTurnstileOverlay();
    run();
  };
}

// ─── IFRAME LOADING ANIMATION ─────────────────────────────────
function showIframeLoader() {
  iframeLoading.classList.remove('hidden');
  // Pastikan controller dan spinner buffering disembunyikan saat ganti server/loading
  if (videoControls) videoControls.classList.add('hidden');
  if (videoBuffering) videoBuffering.classList.add('hidden');
}

function hideIframeLoader() {
  iframeLoading.classList.add('hidden');
}

videoFrame.addEventListener('load', () => {
  // Only hide loader once the iframe actually loads something real
  if (videoFrame.src && videoFrame.src !== 'about:blank' && videoFrame.src !== location.href) {
    hideIframeLoader();
  }
});

// ─── FULLSCREEN & ORIENTATION LOGIC ─────────────────────────────
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    if (iframeWrapper.requestFullscreen) {
      // 1. Enter Fullscreen on wrapper (covers desktop & mobile)
      iframeWrapper.requestFullscreen().then(() => {
        // 2. Lock orientation to landscape on mobile devices
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(() => { /* Some browsers require explicit user gesture / HTTPS to lock */ });
        }
      }).catch(err => console.warn(`Fullscreen error: ${err.message}`));
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

if (btnCustomFs) {
  btnCustomFs.addEventListener('click', () => {
    // Beri efek tap untuk mobile, hapus setelah 3 detik
    btnCustomFs.classList.add('tap-active');
    setTimeout(() => {
      btnCustomFs.classList.remove('tap-active');
    }, 3000);
    
    toggleFullscreen();
  });
}

// 3. Listen to state changes to toggle icons and unlock orientation
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) {
    iconFsEnter.classList.add('hidden');
    iconFsExit.classList.remove('hidden');
  } else {
    iconFsEnter.classList.remove('hidden');
    iconFsExit.classList.add('hidden');
    // Unlock orientation if it was locked
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
  }
});

// ─── FETCH ────────────────────────────────────────────────────
async function fetchAnime(id) {
  const url = `${APPS_SCRIPT_URL}?action=getAnime&id=${encodeURIComponent(id)}`;
  const res = await fetch(url, { mode: 'cors', cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json || !json.data) throw new Error('Empty response');
  return json.data;
}

async function fetchAllAnime() {
  const res = await fetch(`${APPS_SCRIPT_URL}?action=getAll`, { mode: 'cors', cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}

// ─── URL MANAGEMENT ───────────────────────────────────────────
function updateUrl(epNum) {
  const newParams = new URLSearchParams({ id: ANIME_ID, ep: epNum });
  history.replaceState(null, '', `?${newParams}`);
}

// ─── DATE FORMATTER ──────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr || dateStr === '—') return '—';
  // If GAS Date string: "Mon Mar 16 2026 00:00:00 GMT+0700 (Western Indonesia Time)"
  // We take the first 4 parts: "Mon Mar 16 2026"
  const parts = String(dateStr).split(' ');
  if (parts.length >= 4) {
    return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`;
  }
  return dateStr;
}

// ─── RENDER EPISODE ───────────────────────────────────────────
// scrollToPlayer: true only on explicit user navigation, NOT on initial load
function loadEpisode(idx, scrollToPlayer = false) {
  const ep = episodeList[idx];
  if (!ep) return;
  currentEpIdx = idx;

  // Meta
  document.title = `${animeData.title} Eps ${ep.ep_number} — Luxion!`;
  videoTitle.textContent = animeData.title;
  videoEpisodeLabel.textContent = `Episode ${ep.ep_number}${ep.title ? ': ' + ep.title : ''}`;
  uploaderName.textContent = ep.uploader || animeData.uploader || 'Admin';
  uploadDate.textContent   = formatDate(ep.date || animeData.date || '—');

  // Populate server dropdown
  serverSelect.innerHTML = '';
  const servers = ep.servers || [];
  if (servers.length === 0) {
    serverSelect.innerHTML = '<option value="">Tidak ada server tersedia</option>';
  } else {
    servers.forEach((srv, i) => {
      const opt = document.createElement('option');
      opt.value = srv.url;
      opt.textContent = srv.name || `Server ${i + 1}`;
      serverSelect.appendChild(opt);
    });
    // Default to first server
    serverSelect.selectedIndex = 0;
    setVideoSrc(servers[0].url);
  }

  // URL update
  updateUrl(ep.ep_number);

  // Update nav buttons
  btnPrev.disabled = (idx <= 0);
  btnNext.disabled = (idx >= episodeList.length - 1);

  // Update modal active state
  document.querySelectorAll('.ep-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });

  // ⚡ FIX: scroll only when user explicitly triggered episode change
  if (scrollToPlayer) {
    requestAnimationFrame(() => {
      document.querySelector('.video-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

// ─── VIDEO SRC & HLS SUPPORT ────────────────────────────────────
let hlsInstance = null;

function destroyHls() {
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
}

function formatTime(sec) {
  if (isNaN(sec) || !isFinite(sec)) return '00:00';
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function setVideoSrc(url) {
  if (!url) return;
  showIframeLoader();

  // --- AGGRESSIVE MEMORY CLEANUP ---
  // Hentikan aktivitas video sebelumnya agar browser tidak terus men-download buffer di background
  videoPlayer.pause();
  videoPlayer.removeAttribute('src');
  videoPlayer.load(); 
  destroyHls();

  // Smart Detection: Direct Video (.mp4, .webm, .m3u8) vs iFrame
  const isDirect = /\.(mp4|webm|m3u8)(\?.*)?$/i.test(url);

  if (isDirect) {
    videoFrame.classList.add('hidden');
    videoFrame.src = '';
    videoPlayer.classList.remove('hidden');
    // Tunggu sampai metadata selesai dimuat sebelum merender controller
    videoControls.classList.add('hidden'); 
    
    // Move fullscreen button gracefully into the control bar
    document.querySelector('.controls-toolbar').appendChild(btnCustomFs);
    btnCustomFs.className = 'ctrl-btn';
    
    const isHls = /\.m3u8(\?.*)?$/i.test(url);
    
    if (isHls && typeof Hls !== 'undefined' && Hls.isSupported()) {
      // Initialize with optimized configuration for performance
      hlsInstance = new Hls({
        maxMaxBufferLength: 60,
        enableWorker: true
      });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoPlayer);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        hideIframeLoader();
        videoPlayer.play().catch(()=>{});
      });
      hlsInstance.on(Hls.Events.ERROR, function (event, data) {
        if (data.fatal) hideIframeLoader();
      });
    } else {
      // Native fallback (E.g. Safari supports HLS directly, or for .mp4/.webm)
      videoPlayer.src = url;
      videoPlayer.addEventListener('loadedmetadata', () => {
        hideIframeLoader();
      }, { once: true });
      videoPlayer.play().catch(()=>{});
    }

  } else {
    // Standard iframe
    videoPlayer.classList.add('hidden');
    videoControls.classList.add('hidden');
    
    // Eject fullscreen button back to floating wrapper overlay
    iframeWrapper.appendChild(btnCustomFs);
    btnCustomFs.className = 'btn-custom-fs';
    
    videoFrame.classList.remove('hidden');
    videoFrame.src = url;
  }
}

// ─── CUSTOM CONTROLS LOGIC ────────────────────────────────────
let controlsTimeout;

function showControlsTemp() {
  // Cegah controller muncul jika video belum memiliki metadata/belum di-load sama sekali
  if (videoPlayer.readyState === 0) return;

  videoControls.classList.remove('hidden'); // Munculkan kembali kontroler
  videoControls.classList.remove('idle');
  clearTimeout(controlsTimeout);
  if (!videoPlayer.paused) {
    controlsTimeout = setTimeout(() => {
      videoControls.classList.add('idle');
    }, 2500);
  }
}

document.getElementById('iframeWrapper').addEventListener('mousemove', showControlsTemp);
document.getElementById('iframeWrapper').addEventListener('touchstart', showControlsTemp, {passive: true});
videoControls.addEventListener('click', (e) => e.stopPropagation()); // prevent double tap through bottom bar

// Prevent 'download video' native menu on mobile long press
videoPlayer.addEventListener('contextmenu', e => e.preventDefault());

function togglePlay() {
  if (videoPlayer.paused) videoPlayer.play();
  else videoPlayer.pause();
  showControlsTemp();
}

btnPlayPause.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePlay();
});

btnCenterPlayPause.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePlay();
});

videoPlayer.addEventListener('play', () => {
  iconPlay.classList.add('hidden');
  iconPause.classList.remove('hidden');
  centerPlayIcon.classList.add('hidden');
  centerPauseIcon.classList.remove('hidden');
  showControlsTemp();
});

videoPlayer.addEventListener('pause', () => {
  iconPause.classList.add('hidden');
  iconPlay.classList.remove('hidden');
  centerPauseIcon.classList.add('hidden');
  centerPlayIcon.classList.remove('hidden');
  videoControls.classList.remove('idle');
});

// Progress Bar & Time
let isDraggingProgress = false;
let isUpdatingTime = false;

progressBar.addEventListener('mousedown', () => isDraggingProgress = true);
progressBar.addEventListener('touchstart', () => isDraggingProgress = true, {passive: true});

window.addEventListener('mouseup', () => { if (isDraggingProgress) isDraggingProgress = false; });
window.addEventListener('touchend', () => { if (isDraggingProgress) isDraggingProgress = false; });

videoPlayer.addEventListener('timeupdate', () => {
  if (isDraggingProgress || isUpdatingTime) return; // Jangan update UI bar saat sedang ditarik
  isUpdatingTime = true;

  requestAnimationFrame(() => {
    const current = videoPlayer.currentTime;
    const total = videoPlayer.duration || 0;
    currentTimeEl.textContent = formatTime(current);
    totalTimeEl.textContent = formatTime(total);

    if (total > 0) {
      const pct = current / total;
      progressBar.value = pct * 100;
      progressFill.style.transform = `scaleX(${pct})`; // Hardware acceleration
    }
    isUpdatingTime = false;
  });
});

videoPlayer.addEventListener('loadedmetadata', () => {
  totalTimeEl.textContent = formatTime(videoPlayer.duration);
  showControlsTemp(); // Munculkan controller segera setelah data siap
});

// Update Buffer Indicator
let isUpdatingBuffer = false;
videoPlayer.addEventListener('progress', () => {
  if (isUpdatingBuffer) return;
  isUpdatingBuffer = true;

  requestAnimationFrame(() => {
    if (videoPlayer.duration > 0 && videoPlayer.buffered.length > 0) {
      const bufferedEnd = videoPlayer.buffered.end(videoPlayer.buffered.length - 1);
      const pct = bufferedEnd / videoPlayer.duration;
      if (progressBuffer) {
        progressBuffer.style.transform = `scaleX(${pct})`; // Hardware acceleration
      }
    }
    isUpdatingBuffer = false;
  });
});

// Dragging UI update ONLY
progressBar.addEventListener('input', (e) => {
  e.stopPropagation();
  const rawVal = progressBar.value;
  const pct = rawVal / 100;
  progressFill.style.transform = `scaleX(${pct})`;
  
  const time = pct * (videoPlayer.duration || 0);
  currentTimeEl.textContent = formatTime(time);
  showControlsTemp();
});

// Apply seek only when drag released
progressBar.addEventListener('change', (e) => {
  e.stopPropagation();
  const time = (progressBar.value / 100) * (videoPlayer.duration || 0);
  videoPlayer.currentTime = time;
  isDraggingProgress = false;
  showControlsTemp();
});

// Buffering Indication (only show if iframeLoading overlay is gone)
videoPlayer.addEventListener('waiting', () => {
  if (iframeLoading.classList.contains('hidden')) {
    videoBuffering.classList.remove('hidden');
    btnCenterPlayPause.classList.add('hidden'); // Sembunyikan tombol tengah saat buffering
  }
});
videoPlayer.addEventListener('playing', () => {
  videoBuffering.classList.add('hidden');
  btnCenterPlayPause.classList.remove('hidden'); // Munculkan kembali tombol tengah saat resume
});
videoPlayer.addEventListener('canplay', () => {
  videoBuffering.classList.add('hidden');
  btnCenterPlayPause.classList.remove('hidden');
});

// Audio / Mute
btnMute.addEventListener('click', (e) => {
  e.stopPropagation();
  videoPlayer.muted = !videoPlayer.muted;
  if (videoPlayer.muted) {
    iconVol.classList.add('hidden');
    iconMute.classList.remove('hidden');
  } else {
    iconMute.classList.add('hidden');
    iconVol.classList.remove('hidden');
  }
  showControlsTemp();
});

// ─── DOUBLE TAP TO SEEK LOGIC ─────────────────────────────────
let lastTapTime = 0;
let tapTimeout;

function triggerSeekRipple(direction) {
  seekRipple.className = `seek-ripple ${direction}`; // reset
  void seekRipple.offsetWidth; // trigger reflow
  
  seekRipple.classList.add('animate');
  seekRipple.innerHTML = `
    <div class="seek-ripple-inner">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        ${direction === 'left' 
          ? '<path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>' 
          : '<path d="M13 17l5-5-5-5M6 17l5-5-5-5"/>'}
      </svg>
      <span>10s</span>
    </div>
  `;
}

videoPlayer.addEventListener('click', (e) => {
  const currentTime = new Date().getTime();
  const tapLength = currentTime - lastTapTime;

  if (tapLength > 0 && tapLength < 300) {
    // Confirmed Double Tap
    clearTimeout(tapTimeout);
    
    const rect = videoPlayer.getBoundingClientRect();
    const isRightHalf = (e.clientX - rect.left) > (rect.width / 2);

    if (isRightHalf) {
      videoPlayer.currentTime += 10;
      triggerSeekRipple('right');
    } else {
      videoPlayer.currentTime -= 10;
      triggerSeekRipple('left');
    }
    showControlsTemp();
  } else {
    // Single Tap -> Just show controls
    tapTimeout = setTimeout(() => {
      showControlsTemp();
    }, 300);
  }
  lastTapTime = currentTime;
});

// ─── SERVER CHANGE ────────────────────────────────────────────
serverSelect.addEventListener('change', () => {
  const url = serverSelect.value;
  if (url) setVideoSrc(url);
});

// ─── NAV BUTTONS ─────────────────────────────────────────────
btnPrev.addEventListener('click', () => {
  if (currentEpIdx > 0) loadEpisode(currentEpIdx - 1, true);
});

btnNext.addEventListener('click', () => {
  if (currentEpIdx < episodeList.length - 1) loadEpisode(currentEpIdx + 1, true);
});

// ─── EPISODE MODAL ────────────────────────────────────────────
function openModal() {
  episodeModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  episodeModal.classList.remove('active');
  document.body.style.overflow = '';
}

btnAllEp.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
episodeModal.addEventListener('click', e => {
  if (e.target === episodeModal) closeModal();
});

function buildEpisodeList() {
  episodeListEl.innerHTML = '';
  const fragment = document.createDocumentFragment();
  episodeList.forEach((ep, idx) => {
    const btn = document.createElement('button');
    btn.className = `ep-btn${idx === currentEpIdx ? ' active' : ''}`;
    btn.textContent = `Eps ${ep.ep_number}`;
    btn.addEventListener('click', () => {
      loadEpisode(idx, true); // user selected from modal → scroll
      closeModal();
    });
    fragment.appendChild(btn);
  });
  episodeListEl.appendChild(fragment);
}

// ─── INFO SECTION ─────────────────────────────────────────────
function renderInfoSection(anime, currentEp) {
  infoCover.src = anime.cover || '';
  infoCover.alt = anime.title;
  infoCover.onerror = function () { this.src = ''; this.style.display = 'none'; };

  infoTitle.textContent    = anime.title;
  infoTitleEn.textContent  = anime.title_en || '';
  infoSynopsis.textContent = anime.synopsis || 'Tidak ada sinopsis.';

  // Genre tags
  infoGenre.innerHTML = '';
  const genres = (anime.genre || '').split(',').map(g => g.trim()).filter(Boolean);
  genres.forEach(g => {
    const tag = document.createElement('span');
    tag.className = 'info-tag';
    tag.textContent = g;
    infoGenre.appendChild(tag);
  });
}

// ─── SEARCH (shared with home) ────────────────────────────────
function normalizeStr(str) {
  return (str || '').toLowerCase().normalize('NFC');
}

function createSearchCard(anime) {
  const card = document.createElement('a');
  card.className = 'anime-card';
  card.href = `streaming.html?id=${encodeURIComponent(anime.id)}`;

  const coverWrapper = document.createElement('div');
  coverWrapper.className = 'card-cover-wrapper';

  const img = document.createElement('img');
  img.className = 'card-cover';
  img.alt = anime.title;
  img.loading = 'lazy';
  img.decoding = 'async';
  // ⚡ FIX: use data-src so IntersectionObserver controls loading
  if (anime.cover) img.dataset.src = anime.cover;
  img.onerror = function () {
    this.style.display = 'none';
    const ph = document.createElement('div');
    ph.className = 'cover-placeholder';
    ph.textContent = '🎬';
    coverWrapper.appendChild(ph);
  };

  const badgeStatus = document.createElement('span');
  badgeStatus.className = `badge-status ${(anime.status || '').toLowerCase().includes('ongoing') ? 'ongoing' : 'finished'}`;
  badgeStatus.textContent = anime.status || 'Unknown';

  const badgeEp = document.createElement('span');
  badgeEp.className = 'badge-episode';
  badgeEp.textContent = `Eps ${anime.episodes || '?'}`;

  coverWrapper.appendChild(img);
  coverWrapper.appendChild(badgeStatus);
  coverWrapper.appendChild(badgeEp);

  const body = document.createElement('div');
  body.className = 'card-body';
  const title = document.createElement('p');
  title.className = 'card-title';
  title.textContent = anime.title;
  body.appendChild(title);

  card.appendChild(coverWrapper);
  card.appendChild(body);
  return card;
}

function doSearch(query) {
  const q = normalizeStr(query).trim();
  if (!q) return;
  const results = allAnimeList.filter(anime => {
    const fields = [anime.title, anime.title_en, anime.title_alt, anime.genre, anime.synopsis, anime.status]
      .map(normalizeStr).join(' ');
    return q.split(/\s+/).every(w => fields.includes(w));
  });
  searchQuery.textContent = `"${query}"`;
  searchResultsGrid.replaceChildren();
  if (results.length === 0) {
    const p = document.createElement('p');
    p.className = 'no-results';
    p.style.gridColumn = '1 / -1';
    p.innerHTML = `Tidak ada hasil untuk "<strong>${query}</strong>".`;
    searchResultsGrid.appendChild(p);
  } else {
    const frag = document.createDocumentFragment();
    results.forEach(a => frag.appendChild(createSearchCard(a)));
    searchResultsGrid.appendChild(frag);
    // ⚡ FIX: register IntersectionObserver AFTER images are in the DOM
    searchResultsGrid.querySelectorAll('img[data-src]').forEach(img => {
      // Inline observer so streaming.js doesn't depend on app.js
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (!e.isIntersecting) return;
          if (e.target.dataset.src) { e.target.src = e.target.dataset.src; delete e.target.dataset.src; }
          obs.unobserve(e.target);
        });
      }, { rootMargin: '200px 0px' });
      obs.observe(img);
    });
  }
  searchResults.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSearch() {
  searchResults.classList.remove('active');
  searchInput.value = '';
  document.body.style.overflow = '';
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  const q = searchInput.value.trim();
  if (!q) { closeSearch(); return; }
  searchDebounce = setTimeout(() => doSearch(q), 280);
});

searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') closeSearch(); });
closeSearchBtn.addEventListener('click', closeSearch);
searchResults.addEventListener('click', e => { if (e.target === searchResults) closeSearch(); });

// ─── INIT ─────────────────────────────────────────────────────
async function _initStreamImpl() {
  if (!ANIME_ID) {
    showError();
    return;
  }

  // Load all anime in background for search (non-blocking)
  fetchAllAnime().then(list => { allAnimeList = list; }).catch(() => {});

  try {
    animeData   = await fetchAnime(ANIME_ID);
    episodeList = (animeData.episodeList || []).sort((a, b) => Number(a.ep_number) - Number(b.ep_number));

    if (episodeList.length === 0) throw new Error('No episodes');

    // Build episode list & find the initial episode
    buildEpisodeList();

    // Find the target episode index from ?ep= param
    let targetIdx = episodeList.findIndex(e => String(e.ep_number) === String(INIT_EP_NUM));
    if (targetIdx < 0) targetIdx = 0;

    // Render info section
    renderInfoSection(animeData, episodeList[targetIdx]);

    // Show content, hide skeleton
    streamSkeleton.classList.add('hidden');
    streamContent.classList.remove('hidden');

    // Load the target episode — false = no scroll on initial page open
    loadEpisode(targetIdx, false);

  } catch (err) {
    console.error('[Stream] Error:', err);
    showError();
  }
}

function showError() {
  streamSkeleton.classList.add('hidden');
  streamContent.classList.add('hidden');
  streamError.classList.remove('hidden');
}

function initStream() {
  requireTurnstileThen(_initStreamImpl);
}

document.addEventListener('DOMContentLoaded', () => {
  initStream();
});
