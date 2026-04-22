// Copyright 2026 diyyo White | Licensed under MIT License
/**
 * app.js — Home Page Logic
 * Anime Streaming Website | Vanilla JS
 *
 * API Actions used:
 *   ?action=getPage&page=X&limit=12  → { data:[…], total:N, totalPages:N, page:N }
 *   ?action=getAll                   → { data:[…] }  (search only, loaded lazily)
 */

// ─── CONFIG ──────────────────────────────────────────────────
const APPS_SCRIPT_URL = 'YOUR_GAS_URL';
const PAGE_SIZE = 12;

// ─── STATE ───────────────────────────────────────────────────
let currentPage   = 1;
let totalPages    = 1;
let allAnime      = [];      // lazy-loaded only when search is triggered
let allAnimeFetched = false; // guard so we only fetch-all once
let isLoading     = false;   // prevent double-fetch
let searchDebounce;

// ─── TURNSTILE GATE (smart session, 1 jam) ────────────────────
const TS_OK_UNTIL_KEY = 'ts_ok_until';
const TS_TTL_MS = 60 * 60 * 1000; // 1 hour

function hasValidTurnstileSession() {
  // sessionStorage untuk cepat, localStorage untuk "1 jam"
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
  // Callback global yang dipanggil widget Turnstile
  window.onTurnstileSuccess = (token) => {
    if (!token) return;
    persistTurnstileSession();
    hideTurnstileOverlay();
    run();
  };
}

// ─── DOM REFS ─────────────────────────────────────────────────
const searchInput       = document.getElementById('searchInput');
const searchResults     = document.getElementById('searchResults');
const searchResultsGrid = document.getElementById('searchResultsGrid');
const searchQuery       = document.getElementById('searchQuery');
const closeSearchBtn    = document.getElementById('closeSearch');
const errorState        = document.getElementById('errorState');
const mainContent       = document.getElementById('mainContent');

// New Home Sections
const homeSections      = document.getElementById('homeSections');
const pagedView         = document.getElementById('pagedView');
const pagedTitle        = document.getElementById('pagedTitle');
const gridLatestEps     = document.getElementById('gridLatestEps');
const gridLatestAnime   = document.getElementById('gridLatestAnime');
const gridAiring        = document.getElementById('gridAiring');
const gridFinished      = document.getElementById('gridFinished');
const animeGrid         = document.getElementById('animeGrid'); // used for Paged/View More

const paginationEl      = document.getElementById('pagination');
const btnPrevPage       = document.getElementById('btnPrevPage');
const btnNextPage       = document.getElementById('btnNextPage');
const pageInfoEl        = document.getElementById('pageInfo');

// ─── FETCH ALL (lazy, for search only) ───────────────────────
async function ensureAllAnimeFetched() {
  if (allAnimeFetched) return;
  try {
    const res  = await fetch(`${APPS_SCRIPT_URL}?action=getAll`, { mode: 'cors', cache: 'no-cache' });
    const json = await res.json();
    allAnime        = Array.isArray(json?.data) ? json.data : [];
    allAnimeFetched = true;
  } catch (_) {
    allAnime = [];
  }
}

// ─── RENDER HELPERS ───────────────────────────────────────────
function statusClass(status = '') {
  const s = status.toLowerCase();
  return (s.includes('airing') || s.includes('ongoing')) ? 'ongoing' : 'finished';
}

function createCard(anime) {
  const card = document.createElement('a');
  card.className = 'anime-card';
  card.href = `streaming.html?id=${encodeURIComponent(anime.id)}`;
  card.setAttribute('aria-label', anime.title);

  const coverWrapper = document.createElement('div');
  coverWrapper.className = 'card-cover-wrapper';

  const img = document.createElement('img');
  img.className = 'card-cover';
  img.alt = anime.title;
  img.loading = 'lazy';
  img.decoding = 'async';
  if (anime.cover) img.dataset.src = anime.cover;
  img.onerror = function () {
    this.style.display = 'none';
    const placeholder = document.createElement('div');
    placeholder.className = 'cover-placeholder';
    placeholder.textContent = '🎬';
    coverWrapper.appendChild(placeholder);
  };

  const badgeStatus = document.createElement('span');
  badgeStatus.className = `badge-status ${statusClass(anime.status)}`;
  // Tampilkan label "Airing" untuk data lama yang masih bernilai "Ongoing"
  const rawStatus = anime.status || 'Unknown';
  const normalized = rawStatus.toLowerCase();
  badgeStatus.textContent = normalized.includes('ongoing') ? 'Airing' : rawStatus;

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

// ─── IntersectionObserver — lazy image loader ─────────────────
const imgObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const img = entry.target;
    if (img.dataset.src) {
      img.src = img.dataset.src;
      delete img.dataset.src;
    }
    imgObserver.unobserve(img);
  });
}, { rootMargin: '200px 0px' });

function setupLazyImages(container) {
  container.querySelectorAll('img[data-src]').forEach(img => imgObserver.observe(img));
}

// ─── RENDER GRID TO CONTAINER ─────────────────────────────────
function renderGridTo(container, list) {
  if (!container) return;
  if (!list || list.length === 0) {
    container.replaceChildren();
    const msg = document.createElement('p');
    msg.className = 'no-results';
    msg.style.gridColumn = '1 / -1';
    msg.textContent = 'Tidak ada anime untuk ditampilkan.';
    container.appendChild(msg);
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach(anime => fragment.appendChild(createCard(anime)));

  requestAnimationFrame(() => {
    container.replaceChildren(fragment);
    setupLazyImages(container);
  });
}

// ─── SKELETON ─────────────────────────────────────────────────
function getSkeletonHTML(count) {
  return Array(count).fill(0).map(() => `
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton-cover"></div>
      <div class="skeleton-body">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>
    </div>`).join('');
}

function showSkeletons() {
  const isPaged = !pagedView.classList.contains('hidden');
  if (isPaged) {
    animeGrid.innerHTML = getSkeletonHTML(PAGE_SIZE);
  } else {
    gridLatestEps.innerHTML = getSkeletonHTML(9);
    gridLatestAnime.innerHTML = getSkeletonHTML(6);
    gridAiring.innerHTML = getSkeletonHTML(6);
    gridFinished.innerHTML = getSkeletonHTML(6);
  }
}

// ─── PAGINATION UI UPDATE ─────────────────────────────────────
function updatePaginationUI() {
  pageInfoEl.textContent = `${currentPage} / ${totalPages}`;
  btnPrevPage.disabled   = currentPage <= 1;
  btnNextPage.disabled   = currentPage >= totalPages;
  paginationEl.classList.toggle('hidden', totalPages <= 1);
}

// ─── VIEW MAPPING AND STATE ───────────────────────────────────
let currentView = 'home'; // home, latest-eps, latest-anime, airing, finished

function changeView(viewType) {
  currentView = viewType;
  currentPage = 1;

  const url = new URL(window.location);
  if (viewType === 'home') url.searchParams.delete('view');
  else url.searchParams.set('view', viewType);
  window.history.pushState({}, '', url);

  renderCurrentState(true);
}

document.body.addEventListener('click', e => {
  const btn = e.target.closest('.btn-view-more');
  if (!btn) return;
  
  if (btn.id === 'btnBackHome') {
    changeView('home');
  } else if (btn.dataset.view) {
    changeView(btn.dataset.view);
  }
});

// ─── RENDER APP STATE ─────────────────────────────────────────
function renderCurrentState(scrollToTop = false) {
  errorState.classList.add('hidden');
  
  if (!allAnime || allAnime.length === 0) {
    errorState.classList.remove('hidden');
    homeSections.classList.add('hidden');
    pagedView.classList.add('hidden');
    return;
  }

  if (currentView === 'home') {
    homeSections.classList.remove('hidden');
    pagedView.classList.add('hidden');
    paginationEl.classList.add('hidden');

    const latestEps     = allAnime.slice(0, 9);
    const latestAnime   = allAnime.slice(0, 6);
    const airingAnime   = allAnime.filter(a => statusClass(a.status) === 'ongoing').slice(0, 6);
    const finishedAnime = allAnime.filter(a => statusClass(a.status) === 'finished').slice(0, 6);

    renderGridTo(gridLatestEps, latestEps);
    renderGridTo(gridLatestAnime, latestAnime);
    renderGridTo(gridAiring, airingAnime);
    renderGridTo(gridFinished, finishedAnime);

  } else {
    homeSections.classList.add('hidden');
    pagedView.classList.remove('hidden');

    let title = 'Semua Anime';
    let filteredList = allAnime;

    switch(currentView) {
      case 'latest-eps':
        title = 'Episode Terbaru';
        break;
      case 'latest-anime':
        title = 'Anime Terbaru';
        break;
      case 'airing':
        title = 'Anime Airing';
        filteredList = allAnime.filter(a => statusClass(a.status) === 'ongoing');
        break;
      case 'finished':
        title = 'Anime Finished';
        filteredList = allAnime.filter(a => statusClass(a.status) === 'finished');
        break;
    }

    pagedTitle.textContent = title;
    
    totalPages = Math.ceil(filteredList.length / PAGE_SIZE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const pagedData = filteredList.slice(startIdx, startIdx + PAGE_SIZE);

    renderGridTo(animeGrid, pagedData);
    updatePaginationUI();
  }

  if (scrollToTop) {
    requestAnimationFrame(() => mainContent.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
}

// ─── PAGINATION BUTTON EVENTS ─────────────────────────────────
btnPrevPage.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    renderCurrentState(true);
  }
});

btnNextPage.addEventListener('click', () => {
  if (currentPage < totalPages) {
    currentPage++;
    renderCurrentState(true);
  }
});

// ─── SEARCH ──────────────────────────────────────────────────
function normalizeStr(str) {
  return (str || '').toLowerCase().normalize('NFC');
}

function searchAnime(query) {
  const q = normalizeStr(query).trim();
  if (!q) return [];
  return allAnime.filter(anime => {
    const fields = [anime.title, anime.title_en, anime.title_alt, anime.genre, anime.synopsis, anime.status]
      .map(normalizeStr).join(' ');
    return q.split(/\s+/).every(word => fields.includes(word));
  });
}

function renderSearchResults(query, results) {
  searchQuery.textContent = `"${query}"`;
  searchResultsGrid.replaceChildren();

  if (results.length === 0) {
    const p = document.createElement('p');
    p.className = 'no-results';
    p.style.gridColumn = '1 / -1';
    p.innerHTML = `Tidak ada hasil untuk "<strong>${query}</strong>".`;
    searchResultsGrid.appendChild(p);
  } else {
    const fragment = document.createDocumentFragment();
    results.forEach(anime => fragment.appendChild(createCard(anime)));
    searchResultsGrid.appendChild(fragment);
    // ⚡ FIX: activate lazy images AFTER inserting into DOM
    setupLazyImages(searchResultsGrid);
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
  searchDebounce = setTimeout(async () => {
    // Lazily fetch all anime the first time search is used
    if (!allAnimeFetched) await ensureAllAnimeFetched();
    if (allAnime.length === 0) return;
    renderSearchResults(q, searchAnime(q));
  }, 280);
});

searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') closeSearch(); });
closeSearchBtn.addEventListener('click', closeSearch);
searchResults.addEventListener('click', e => { if (e.target === searchResults) closeSearch(); });

// ─── INIT ─────────────────────────────────────────────────────
async function fetchAnnouncement() {
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=getAnnouncement`, { mode: 'cors', cache: 'no-cache' });
    const json = await res.json();
    if (json.data && json.data.IsActive) {
      const banner = document.getElementById('homeAnnouncement');
      if (banner) {
        banner.className = `announcement-banner ${json.data.Type}`;
        banner.textContent = json.data.Message;
        banner.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.warn('Failed to load announcement', err);
  }
}

async function _initHomeImpl() {
  const params = new URLSearchParams(window.location.search);
  currentView = params.get('view') || 'home';
  currentPage = parseInt(params.get('page')) || 1;
  
  homeSections.classList.remove('hidden');
  pagedView.classList.add('hidden');
  paginationEl.classList.add('hidden');
  
  showSkeletons();
  errorState.classList.add('hidden');

  try {
    fetchAnnouncement(); // Non-blocking async fetch
    if (!allAnimeFetched) await ensureAllAnimeFetched();
    renderCurrentState();
  } catch (err) {
    console.error('[AnimeStream] Init error:', err);
    errorState.classList.remove('hidden');
    homeSections.classList.add('hidden');
    pagedView.classList.add('hidden');
  }
}

window.addEventListener('popstate', () => {
  const params = new URLSearchParams(window.location.search);
  currentView = params.get('view') || 'home';
  currentPage = 1;
  renderCurrentState(false);
});

function initHome() {
  requireTurnstileThen(_initHomeImpl);
}

document.addEventListener('DOMContentLoaded', () => {
  // Jika sudah valid, langsung inisialisasi tanpa menampilkan overlay.
  // Jika belum, overlay akan tampil dan init ditahan sampai Turnstile sukses.
  initHome();
});
