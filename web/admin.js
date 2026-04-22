// Copyright 2026 diyyo White | Licensed under MIT License
// --- CONFIGURATION -------------------------------------------
const APPS_SCRIPT_URL = 'YOUR_GAS_URL';

// --- DOM ELEMENTS --------------------------------------------
const authOverlay   = document.getElementById('authOverlay');
const authError     = document.getElementById('authError');
const btnLogout     = document.getElementById('btnLogout');

const adminLayout   = document.getElementById('adminLayout');
const sidebar       = document.getElementById('sidebar');
const openSidebar   = document.getElementById('openSidebar');
const closeSidebar  = document.getElementById('closeSidebar');
const navBtns       = document.querySelectorAll('.nav-btn[data-view]');
const topbarTitle   = document.getElementById('topbarTitle');
const btnRefresh    = document.getElementById('btnRefresh');
const btnAddItem    = document.getElementById('btnAddItem');

const searchInput   = document.getElementById('adminSearchInput');
const toastContainer= document.getElementById('toastContainer');

// Data State
let currentView = 'animeList'; // animeList | episodeList | bulkInsert
let animeDataList = [];
let epsDataList = [];
let animeCurrentPage = 1;
let epsCurrentPage = 1;
const ITEMS_PER_PAGE = 12;

// --- INITIALIZATION ------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const savedToken = sessionStorage.getItem('adminToken');
  if (savedToken) {
    // If token exists, do a background check later, but grant UI access now for speed
    unlockAdminUI();
    loadCurrentViewData();
  }
});

// --- AUTHENTICATION LOGIC (GOOGLE SIGN-IN) -------------------

// Callback from Google Identity Services 
window.handleCredentialResponse = async (response) => {
  const jwtToken = response.credential;
  if(!jwtToken) {
    authError.textContent = "Gagal mendapatkan token kredensial Google.";
    authError.classList.remove('hidden');
    return;
  }

  authError.classList.add('hidden');

  try {
    // Optional: We can immediately verify the token against our GAS backend
    const res = await fetch(`${APPS_SCRIPT_URL}`, { 
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify({ action: 'auth', idToken: jwtToken })
    });
    const data = await res.json();
    
    if (data.success) {
      sessionStorage.setItem('adminToken', jwtToken);
      unlockAdminUI();
      showToast('Login berhasil', 'success');
      loadCurrentViewData();
    } else {
      throw new Error(data.error || 'Akses ditolak oleh Server');
    }
  } catch (err) {
    authError.textContent = err.message;
    authError.classList.remove('hidden');
  }
};

btnLogout.addEventListener('click', () => {
  sessionStorage.removeItem('adminToken');
  adminLayout.classList.add('hidden');
  authOverlay.classList.remove('hidden');
  document.body.classList.add('lock-scroll');
  showToast('Telah log out', 'success');
  // Disable automatic prompt if they log out
  if(google && google.accounts && google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }
});

function unlockAdminUI() {
  authOverlay.classList.add('hidden');
  adminLayout.classList.remove('hidden');
  document.body.classList.remove('lock-scroll');
}

// Helper to get token payload safely
function getToken() {
  const token = sessionStorage.getItem('adminToken');
  if(!token) {
    btnLogout.click(); // force logout
    throw new Error("Sesi berakhir");
  }
  return token;
}

// --- TOAST NOTIFICATION --------------------------------------
function showToast(msg, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  toastContainer.appendChild(toast);
  
  // auto remove
  setTimeout(() => {
    toast.classList.add('hide');
    toast.addEventListener('animationend', () => toast.remove());
  }, 4000);
}

// --- SIDEBAR & ROUTING ---------------------------------------
openSidebar.addEventListener('click', () => sidebar.classList.add('open'));
closeSidebar.addEventListener('click', () => sidebar.classList.remove('open'));

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Mobile close
    sidebar.classList.remove('open');
    
    navBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const view = btn.dataset.view;
    currentView = view;
    
    // Switch views
    document.querySelectorAll('.admin-view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view${view.charAt(0).toUpperCase() + view.slice(1)}`).classList.add('active');

    // Title & Context tweaks
    if(view === 'animeList') {
      topbarTitle.textContent = 'Kelola Anime';
      btnAddItem.style.display = 'flex';
      document.getElementById('adminSearchBarArea').style.display = 'block';
      if(animeDataList.length === 0) loadAnimeData();
    } else if(view === 'episodeList') {
      topbarTitle.textContent = 'Kelola Episode';
      btnAddItem.style.display = 'flex';
      document.getElementById('adminSearchBarArea').style.display = 'block';
      if(epsDataList.length === 0) loadEpsData();
    } else if(view === 'bulkInsert') {
      topbarTitle.textContent = 'Bulk Insert Data';
      btnAddItem.style.display = 'none';
      document.getElementById('adminSearchBarArea').style.display = 'none';
    } else if(view === 'announcementList') {
      topbarTitle.textContent = 'Kelola Pengumuman';
      btnAddItem.style.display = 'none';
      document.getElementById('adminSearchBarArea').style.display = 'none';
      loadAnnouncementData();
    }
  });
});

btnRefresh.addEventListener('click', () => loadCurrentViewData());

async function loadCurrentViewData() {
  searchInput.value = '';
  try {
    if(currentView === 'animeList') {
      await loadAnimeData();
    } else if(currentView === 'episodeList') {
      await loadEpsData();
    }
  } catch (err) {
    showToast('Gagal memuat data tampilan utama', 'error');
  } finally {
    toggleLoader('global', false);
  }
}

// --- SEARCH & FILTERING --------------------------------------
searchInput.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  if(currentView === 'animeList') {
    animeCurrentPage = 1;
    renderAnimeCards(animeDataList, q, 1);
  } else if(currentView === 'episodeList') {
    epsCurrentPage = 1;
    const animeId = document.getElementById('filterAnimeId')?.value || '';
    let base = epsDataList;
    if(animeId) {
      base = epsDataList.filter(ep => ep.anime_id === animeId);
    }
    renderEpCards(base, q, 1);
  }
});

document.getElementById('filterAnimeId')?.addEventListener('change', (e) => {
  const animeId = e.target.value;
  let filtered = epsDataList;
  if(animeId) {
    filtered = epsDataList.filter(ep => ep.anime_id === animeId);
  }
  epsCurrentPage = 1;
  renderEpCards(filtered, searchInput.value.toLowerCase(), 1);
});

// --- DATA FETCHING: ANIME ------------------------------------
async function loadAnimeData() {
  toggleLoader('anime', true);
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=getAll`, { redirect: 'follow' });
    const json = await res.json();
    if(json.error) throw new Error(json.error);
    animeDataList = json.data || [];
    animeCurrentPage = 1;
    renderAnimeCards(animeDataList);
    populateAnimeFilter(); // updates the Select in Ep List
  } catch(e) {
    showToast('Gagal memuat anime: ' + e.message, 'error');
  } finally {
    toggleLoader('anime', false);
  }
}

function renderAnimeCards(data, query = '', page = 1) {
  const container = document.getElementById('animeCardContainer');
  const empty = document.getElementById('animeEmptyState');
  container.innerHTML = '';

  let filtered = data;
  if(query) {
    filtered = data.filter(a => 
      (a.title || '').toLowerCase().includes(query) || 
      (a.id || '').toLowerCase().includes(query)
    );
  }

  const totalItems = filtered.length;

  if(totalItems === 0) {
    empty.classList.remove('hidden');
    const pagEl = document.getElementById('animePagination');
    if(pagEl) {
      pagEl.classList.add('hidden');
      pagEl.innerHTML = '';
    }
    document.getElementById('animeBulkToolbar').classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  document.getElementById('animeBulkToolbar').classList.remove('hidden');
  document.getElementById('selectAllAnime').checked = false;
  if(typeof toggleBulkDeleteBtn === 'function') toggleBulkDeleteBtn('anime');

  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  animeCurrentPage = safePage;

  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const pageItems = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const frag = document.createDocumentFragment();
  pageItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'data-card';
    card.innerHTML = `
      <div class="card-header" style="align-items:center; gap:8px;">
        <label class="custom-checkbox cb-anime">
          <input type="checkbox" class="chk-anime" value="${item.id}">
          <span class="checkmark"></span>
        </label>
        <div style="flex:1; min-width:0;">
          <div class="card-title" title="${item.title}">${item.title}</div>
          <div class="card-subtitle">ID: ${item.id}</div>
        </div>
      </div>
      <div class="card-body">
        <div class="card-row">
          <span class="card-label">Episodes</span>
          <span>${item.episodes || '?'}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Status</span>
          <span style="color:${((item.status||'').toLowerCase().includes('airing') || (item.status||'').toLowerCase().includes('ongoing')) ? '#d40000' : '#2eac68'}">${item.status || '-'}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Tanggal</span>
          <span>${(item.date||'').split(' ')[1] || '-'} ${(item.date||'').split(' ')[2] || ''}</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="action-btn" onclick="editAnime('${item.id}')" title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="action-btn del" onclick="deleteRecord('Anime', '${item.id}')" title="Hapus Anime (data saja)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
        </button>
        <button class="action-btn del-series" onclick="deleteAnimeSeries('${item.id}', '${escCardStr(item.title)}')" title="Hapus Series (anime + semua episode)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
            <line x1="5" y1="2" x2="19" y2="21" stroke-width="2.5"/>
          </svg>
        </button>
      </div>
    `;
    frag.appendChild(card);
  });
  container.appendChild(frag);
  renderPagination('anime', totalItems, safePage);
}

// --- DATA FETCHING: EPISODES ---------------------------------
async function loadEpsData() {
  toggleLoader('ep', true);
  try {
    // we need a new action or just fetch all episodes. Let's assume we add action=getAllEpisodes in GAS
    const res = await fetch(`${APPS_SCRIPT_URL}?action=getAllEpisodes`, { redirect: 'follow' });
    const json = await res.json();
    if(json.error) throw new Error(json.error);
    epsDataList = json.data || [];
    // Reset filter
    document.getElementById('filterAnimeId').value = '';
    epsCurrentPage = 1;
    renderEpCards(epsDataList);
  } catch(e) {
    showToast('Gagal memuat eps: ' + e.message, 'error');
  } finally {
    toggleLoader('ep', false);
  }
}

function renderEpCards(data, query = '', page = 1) {
  const container = document.getElementById('epCardContainer');
  const empty = document.getElementById('epEmptyState');
  container.innerHTML = '';

  let filtered = data;
  if(query) {
    filtered = data.filter(e => 
      (e.anime_id || '').toLowerCase().includes(query) || 
      (e.ep_title || '').toLowerCase().includes(query)
    );
  }

  const totalItems = filtered.length;

  if(totalItems === 0) {
    empty.classList.remove('hidden');
    const pagEl = document.getElementById('epPagination');
    if(pagEl) {
      pagEl.classList.add('hidden');
      pagEl.innerHTML = '';
    }
    document.getElementById('epBulkToolbar').classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  document.getElementById('epBulkToolbar').classList.remove('hidden');
  document.getElementById('selectAllEps').checked = false;
  if(typeof toggleBulkDeleteBtn === 'function') toggleBulkDeleteBtn('episode');

  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  epsCurrentPage = safePage;

  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const pageItems = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const frag = document.createDocumentFragment();
  pageItems.forEach(item => {
    // Count servers
    let srvCount = 0;
    if(item.server1_url) srvCount++;
    if(item.server2_url) srvCount++;
    if(item.server3_url) srvCount++;

    const card = document.createElement('div');
    card.className = 'data-card';
    card.innerHTML = `
      <div class="card-header" style="align-items:center; gap:8px;">
        <label class="custom-checkbox cb-episode">
          <input type="checkbox" class="chk-episode" data-anime="${item.anime_id}" data-ep="${item.ep_number}">
          <span class="checkmark"></span>
        </label>
        <div style="flex:1; min-width:0;">
          <div class="card-title">Episode ${item.ep_number}: ${item.ep_title || '-'}</div>
          <div class="card-subtitle" title="${item.anime_id}">${item.anime_id}</div>
        </div>
      </div>
      <div class="card-body">
        <div class="card-row">
          <span class="card-label">Total Server</span>
          <span>${srvCount} Tersedia</span>
        </div>
        <div class="card-row">
          <span class="card-label">Tgl. Rilis</span>
          <span>${(item.date||'').split(' ')[1] || '-'} ${(item.date||'').split(' ')[2] || ''}</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="action-btn" onclick="editEpisode('${item.anime_id}', '${item.ep_number}')" title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="action-btn del" onclick="deleteRecord('Episodes', '${item.anime_id}', '${item.ep_number}')" title="Hapus">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
        </button>
      </div>
    `;
    frag.appendChild(card);
  });
  container.appendChild(frag);
  renderPagination('episode', totalItems, safePage);
}

function renderPagination(type, totalItems, currentPage) {
  const perPage = ITEMS_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const containerId = type === 'anime' ? 'animePagination' : 'epPagination';
  const el = document.getElementById(containerId);
  if(!el) return;

  if(totalItems <= perPage) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }

  el.classList.remove('hidden');

  let html = '';
  const prevDisabled = currentPage <= 1 ? 'disabled' : '';
  const nextDisabled = currentPage >= totalPages ? 'disabled' : '';

  html += `<button class="pagination-btn" ${prevDisabled} onclick="changePage('${type}', ${currentPage - 1})">Sebelumnya</button>`;

  for(let i = 1; i <= totalPages; i++) {
    const activeClass = i === currentPage ? 'active' : '';
    html += `<button class="pagination-btn ${activeClass}" onclick="changePage('${type}', ${i})">${i}</button>`;
  }

  html += `<button class="pagination-btn" ${nextDisabled} onclick="changePage('${type}', ${currentPage + 1})">Selanjutnya</button>`;

  el.innerHTML = html;
}

window.changePage = function(type, page) {
  if(page < 1) return;
  const query = searchInput.value.toLowerCase();

  if(type === 'anime') {
    renderAnimeCards(animeDataList, query, page);
  } else {
    const animeId = document.getElementById('filterAnimeId')?.value || '';
    let base = epsDataList;
    if(animeId) {
      base = epsDataList.filter(ep => ep.anime_id === animeId);
    }
    renderEpCards(base, query, page);
  }
};

function populateAnimeFilter() {
  const selFilter = document.getElementById('filterAnimeId');
  const selForm   = document.getElementById('ep_anime_id');
  
  const opts = animeDataList.map(a => `<option value="${a.id}">${a.id} - ${a.title.substring(0,25)}</option>`).join('');
  
  if(selFilter) selFilter.innerHTML = '<option value="">Semua Anime</option>' + opts;
  if(selForm)   selForm.innerHTML   = opts;
}

// --- ADD BUTTON ACTIONS --------------------------------------
btnAddItem.addEventListener('click', () => {
  if(currentView === 'animeList') {
    document.getElementById('formAnime').reset();
    document.getElementById('actionAnime').value = 'addAnime';
    document.getElementById('originalAnimeId').value = '';
    document.getElementById('animeModalTitle').textContent = 'Tambah Anime';
    const jikanResults = document.getElementById('jikanResults');
    if(jikanResults) { jikanResults.classList.add('hidden'); jikanResults.innerHTML = ''; }
    const helper = document.getElementById('jikanHelperText');
    if(helper) helper.style.display = 'none';
    document.getElementById('jikanSearchStr').value = '';
    document.getElementById('modalAnimeForm').classList.add('active');
  } else if(currentView === 'episodeList') {
    document.getElementById('formEpisode').reset();
    document.getElementById('actionEp').value = 'addEpisode';
    document.getElementById('originalEpAnimeId').value = '';
    document.getElementById('originalEpNumber').value = '';
    document.getElementById('epModalTitle').textContent = 'Tambah Episode';
    
    // Clear auto api and jikan bars
    if(document.getElementById('epApiUrl')) document.getElementById('epApiUrl').value = '';
    if(document.getElementById('epApiHelperText')) document.getElementById('epApiHelperText').style.display = 'none';
    if(document.getElementById('epJikanSearchStr')) document.getElementById('epJikanSearchStr').value = '';
    if(document.getElementById('epJikanHelperText')) document.getElementById('epJikanHelperText').style.display = 'none';
    const jikanRes = document.getElementById('epJikanResults');
    if(jikanRes) { jikanRes.classList.add('hidden'); jikanRes.innerHTML = ''; }
    
    // Hide and reset selects
    for(let i=1; i<=3; i++) {
       const grp = document.getElementById('ep_s' + i + '_select_group');
       if(grp) grp.classList.add('hidden');
       const sel = document.getElementById('ep_s' + i + '_select');
       if(sel) sel.innerHTML = '<option value="">- Manual -</option>';
    }
    
    // auto select logic: if filter is active, pre-select it
    const activeFilter = document.getElementById('filterAnimeId').value;
    if(activeFilter) document.getElementById('ep_anime_id').value = activeFilter;
    
    document.getElementById('modalEpForm').classList.add('active');
  }
});

// modal close
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.closest('.modal-overlay').classList.remove('active');
  });
});

// --- FORM SUBMISSIONS -----------------------------------------
document.getElementById('formAnime').addEventListener('submit', async(e) => {
  e.preventDefault();
  const btn = document.getElementById('btnSaveAnime');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  toggleLoader('global', true);

  const action = document.getElementById('actionAnime').value;
  const payload = {
    idToken: getToken(),
    action: action,
    table: 'Anime',
    data: {
      id: document.getElementById('anime_id').value,
      title: document.getElementById('anime_title').value,
      title_en: document.getElementById('anime_title_en').value,
      title_alt: document.getElementById('anime_title_alt').value,
      cover: document.getElementById('anime_cover').value,
      synopsis: document.getElementById('anime_synopsis').value,
      genre: document.getElementById('anime_genre').value,
      status: document.getElementById('anime_status').value,
      episodes: document.getElementById('anime_episodes').value,
      uploader: document.getElementById('anime_uploader').value,
      date: new Date().toString() // only generated on creation on backend ideally, but we pass it anyway
    }
  };

  // If editing, we must pass the original ID so backend can find the row
  if(action === 'updateAnime') {
    payload.originalId = document.getElementById('originalAnimeId').value;
  }

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload) // Need backend doPost
    });
    const result = await res.json();
    if(result.success) {
      showToast('Anime berhasil disimpan!', 'success');
      document.getElementById('closeAnimeModal').click();
      loadAnimeData();
    } else {
      throw new Error(result.error);
    }
  } catch(err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Anime';
    toggleLoader('global', false);
  }
});

// Jikan Autofill
let jikanResultsCache = [];
document.getElementById('btnJikanSearch').addEventListener('click', async () => {
  const query = document.getElementById('jikanSearchStr').value.trim();
  const helper = document.getElementById('jikanHelperText');
  const resultsContainer = document.getElementById('jikanResults');
  
  if(!query) return;

  helper.style.display = 'block';
  helper.style.color = 'var(--text-secondary)';
  helper.textContent = 'Mencari di MyAnimeList...';
  if(resultsContainer) {
    resultsContainer.classList.add('hidden');
    resultsContainer.innerHTML = '';
  }

  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`);
    const data = await res.json();
    
    if(data.data && data.data.length > 0) {
      jikanResultsCache = data.data;
      helper.style.display = 'none';
      if(resultsContainer) resultsContainer.classList.remove('hidden');
      
      const frag = document.createDocumentFragment();
      jikanResultsCache.forEach((anime) => {
        const item = document.createElement('div');
        item.className = 'jikan-item';
        const imgUrl = (anime.images && anime.images.jpg && anime.images.jpg.image_url) || '';
        item.innerHTML = `
          <img src="${imgUrl}" alt="Cover">
          <div class="jikan-item-info">
            <span class="jikan-item-title">${anime.title}</span>
            <span class="jikan-item-meta">${anime.type || '-'} | Eps: ${anime.episodes || '?'} | ${anime.status || ''}</span>
          </div>
        `;
        item.addEventListener('click', () => fillJikanForm(anime));
        frag.appendChild(item);
      });
      if(resultsContainer) resultsContainer.appendChild(frag);
    } else {
      helper.style.color = 'var(--primary)';
      helper.textContent = 'Anime tidak ditemukan.';
    }
  } catch(e) {
    helper.style.color = 'var(--primary)';
    helper.textContent = 'Gagal mengakses Jikan API.';
  }
});

function fillJikanForm(anime) {
  document.getElementById('anime_title').value = anime.title || '';
  document.getElementById('anime_title_en').value = anime.title_english || '';
  document.getElementById('anime_title_alt').value = (anime.title_synonyms || []).join(', ');
  
  if(anime.images && anime.images.jpg && anime.images.jpg.large_image_url) {
    document.getElementById('anime_cover').value = anime.images.jpg.large_image_url;
  }
  
  document.getElementById('anime_synopsis').value = anime.synopsis || '';
  
  if(anime.genres) {
    document.getElementById('anime_genre').value = anime.genres.map(g => g.name).join(', ');
  }

  // Map status dari Jikan ke label internal (Airing / Finished)
  const mappedStatus = anime.status === 'Currently Airing' ? 'Airing' : 'Finished';
  document.getElementById('anime_status').value = mappedStatus;
  document.getElementById('anime_episodes').value = anime.episodes || '';
  
  const idField = document.getElementById('anime_id');
  if(!idField.value) {
    idField.value = anime.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  const resultsContainer = document.getElementById('jikanResults');
  if(resultsContainer) {
    resultsContainer.classList.add('hidden');
    resultsContainer.innerHTML = '';
  }
  
  const helper = document.getElementById('jikanHelperText');
  if(helper) {
    helper.style.display = 'block';
    helper.style.color = '#2eac68';
    helper.textContent = `Terisi: ${anime.title}`;
  }
}

document.getElementById('formEpisode').addEventListener('submit', async(e) => {
  e.preventDefault();
  const btn = document.getElementById('btnSaveEp');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  toggleLoader('global', true);

  const action = document.getElementById('actionEp').value;
  const payload = {
    idToken: getToken(),
    action: action,
    table: 'Episodes',
    data: {
      anime_id: document.getElementById('ep_anime_id').value,
      ep_number: document.getElementById('ep_number').value,
      ep_title: document.getElementById('ep_title').value,
      server1_name: document.getElementById('ep_s1_name').value,
      server1_url: document.getElementById('ep_s1_url').value,
      server2_name: document.getElementById('ep_s2_name').value,
      server2_url: document.getElementById('ep_s2_url').value,
      server3_name: document.getElementById('ep_s3_name').value,
      server3_url: document.getElementById('ep_s3_url').value,
      uploader: document.getElementById('ep_uploader').value,
      date: new Date().toString()
    }
  };

  if(action === 'updateEpisode') {
    payload.originalAnimeId = document.getElementById('originalEpAnimeId').value;
    payload.originalEpNumber = document.getElementById('originalEpNumber').value;
  }

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if(result.success) {
      showToast('Episode berhasil disimpan!', 'success');
      document.getElementById('closeEpModal').click();
      loadEpsData();
    } else {
      throw new Error(result.error);
    }
  } catch(err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Episode';
    toggleLoader('global', false);
  }
});


// --- EDIT & DELETE HELPERS -----------------------------------
window.editAnime = function(id) {
  const anime = animeDataList.find(a => a.id === id);
  if(!anime) return;

  document.getElementById('actionAnime').value = 'updateAnime';
  document.getElementById('originalAnimeId').value = anime.id;
  document.getElementById('animeModalTitle').textContent = 'Edit Anime';

  const jikanResults = document.getElementById('jikanResults');
  if(jikanResults) { jikanResults.classList.add('hidden'); jikanResults.innerHTML = ''; }
  const helper = document.getElementById('jikanHelperText');
  if(helper) helper.style.display = 'none';
  document.getElementById('jikanSearchStr').value = '';

  document.getElementById('anime_id').value = anime.id;
  document.getElementById('anime_title').value = anime.title;
  document.getElementById('anime_title_en').value = anime.title_en || '';
  document.getElementById('anime_title_alt').value = anime.title_alt || '';
  document.getElementById('anime_cover').value = anime.cover || '';
  document.getElementById('anime_synopsis').value = anime.synopsis || '';
  document.getElementById('anime_genre').value = anime.genre || '';
  // Normalisasi status lama "Ongoing" menjadi "Airing" saat tampil di form
  const status = (anime.status || '').toLowerCase();
  document.getElementById('anime_status').value = status.includes('airing') || status.includes('ongoing') ? 'Airing' : 'Finished';
  document.getElementById('anime_episodes').value = anime.episodes || '';
  document.getElementById('anime_uploader').value = anime.uploader || 'diyyo';

  document.getElementById('modalAnimeForm').classList.add('active');
}

window.editEpisode = function(animeId, epNumber) {
  const ep = epsDataList.find(e => e.anime_id === animeId && String(e.ep_number) === String(epNumber));
  if(!ep) return;

  document.getElementById('actionEp').value = 'updateEpisode';
  document.getElementById('originalEpAnimeId').value = ep.anime_id;
  document.getElementById('originalEpNumber').value = ep.ep_number;
  document.getElementById('epModalTitle').textContent = 'Edit Episode';

  // Clear auto api and jikan bars
  if(document.getElementById('epApiUrl')) document.getElementById('epApiUrl').value = '';
  if(document.getElementById('epApiHelperText')) document.getElementById('epApiHelperText').style.display = 'none';
  if(document.getElementById('epJikanSearchStr')) document.getElementById('epJikanSearchStr').value = '';
  if(document.getElementById('epJikanHelperText')) document.getElementById('epJikanHelperText').style.display = 'none';
  const jikanResEp = document.getElementById('epJikanResults');
  if(jikanResEp) { jikanResEp.classList.add('hidden'); jikanResEp.innerHTML = ''; }
  
  // Hide and reset selects
  for(let i=1; i<=3; i++) {
     const grp = document.getElementById('ep_s' + i + '_select_group');
     if(grp) grp.classList.add('hidden');
     const sel = document.getElementById('ep_s' + i + '_select');
     if(sel) sel.innerHTML = '<option value="">- Manual -</option>';
  }

  document.getElementById('ep_anime_id').value = ep.anime_id;
  document.getElementById('ep_number').value = ep.ep_number;
  document.getElementById('ep_title').value = ep.ep_title || '';
  document.getElementById('ep_s1_name').value = ep.server1_name || 'Server 1';
  document.getElementById('ep_s1_url').value = ep.server1_url || '';
  document.getElementById('ep_s2_name').value = ep.server2_name || 'Server 2';
  document.getElementById('ep_s2_url').value = ep.server2_url || '';
  document.getElementById('ep_s3_name').value = ep.server3_name || 'Server 3';
  document.getElementById('ep_s3_url').value = ep.server3_url || '';

  document.getElementById('modalEpForm').classList.add('active');
}

window.deleteRecord = async function(table, id1, id2 = null) {
  if(!await customConfirm(`Yakin ingin menghapus data ini dari tabel ${table}?`, 'Hapus Data')) return;

  const payload = {
    idToken: getToken(),
    action: table === 'Anime' ? 'deleteAnime' : 'deleteEpisode',
    table: table,
  };

  if(table === 'Anime') {
    payload.id = id1;
  } else {
    payload.animeId = id1;
    payload.epNumber = id2;
  }

  try {
    toggleLoader('global', true);
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if(result.success) {
      showToast('Data berhasil dihapus!', 'success');
      table === 'Anime' ? loadAnimeData() : loadEpsData();
    } else {
      throw new Error(result.error);
    }
  } catch(e) {
    showToast(e.message, 'error');
  } finally {
    toggleLoader('global', false);
  }
}

// Safe string for use inside inline onclick attributes in innerHTML
function escCardStr(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// --- CASCADE DELETE: Anime + All Episodes --------------------
window.deleteAnimeSeries = async function(animeId, animeTitle) {
  const confirmed = await customConfirm(
    `Anda akan menghapus seri "${animeTitle}" secara permanen. Tindakan ini tidak dapat dibatalkan!`,
    'Hapus Seluruh Series',
    'warning',
    'Hapus Permanen',
    'Batal'
  );
  if (!confirmed) return;

  const payload = {
    idToken: getToken(),
    action: 'deleteAnimeSeries',
    animeId: animeId,
  };

  try {
    toggleLoader('global', true);
    const res    = await fetch(APPS_SCRIPT_URL, { method: 'POST', redirect: 'follow', body: JSON.stringify(payload) });
    const result = await res.json();
    if (result.success) {
      const epCount = result.deletedEpisodes ?? '?';
      showToast(`Series "${animeTitle}" dihapus (${epCount} episode ikut terhapus).`, 'success');
      loadAnimeData();
      // Refresh episode list silently if it has been loaded
      if (epsDataList.length > 0) loadEpsData();
    } else {
      throw new Error(result.error || 'Gagal menghapus series');
    }
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    toggleLoader('global', false);
  }
};

// --- BULK INSERT PROCESSOR -----------------------------------
document.getElementById('btnProcessBulk').addEventListener('click', async () => {
  const targetTable = document.getElementById('bulkTargetTable').value;
  const rawData = document.getElementById('bulkDataInput').value.trim();
  const errorLog = document.getElementById('bulkErrorLog');
  const btn = document.getElementById('btnProcessBulk');

  if(!rawData) {
    showBulkError('Data tidak boleh kosong. Paste data spreadsheet Anda terlebih dahulu.');
    return;
  }

  // 1. Parsing TSV/CSV 
  // We assume Tab Separated Values (default when copy pasting from Excel/Google Sheets)
  const rows = rawData.split('\n').filter(r => r.trim() !== '');
  const parsedData = [];

  // Determine required keys for payload mapped exactly to GAS script expected Obj
  const animeKeys = ["id","title","title_en","title_alt","cover","synopsis","genre","status","episodes","uploader","date"];
  const epKeys    = ["anime_id","ep_number","ep_title","server1_name","server1_url","server2_name","server2_url","server3_name","server3_url","uploader","date"];

  const expectedKeys = targetTable === 'Anime' ? animeKeys : epKeys;

  for(let i=0; i<rows.length; i++) {
    // split by tab first, fallback to comma if no tab found and commas exist
    let cols = rows[i].split('\t');
    if(cols.length === 1 && rows[i].includes(',')) {
       // extremely naive CSV split, fails on comma inside quotes. 
       // For a robust system TSV (tab) paste is enforced.
       cols = rows[i].split(','); 
    }

    if(cols.length > expectedKeys.length) {
       showBulkError(`Baris ${i+1}: Jumlah kolom (${cols.length}) melebihi struktur target (${expectedKeys.length}).`);
       return;
    }

    // construct object
    let obj = {};
    for(let j=0; j<expectedKeys.length; j++) {
      obj[expectedKeys[j]] = (cols[j] || '').trim();
    }
    
    // Auto fill date if missing
    if(!obj.date) obj.date = new Date().toString();

    // basic validation
    if(targetTable === 'Anime' && (!obj.id || !obj.title)) {
      showBulkError(`Baris ${i+1}: ID atau Judul wajib diisi untuk Anime.`);
      return;
    }
    if(targetTable === 'Episodes' && (!obj.anime_id || !obj.ep_number)) {
      showBulkError(`Baris ${i+1}: Anime_ID dan Nomor Episode wajib diisi.`);
      return;
    }

    parsedData.push(obj);
  }

  // 2. Prepare payload
  const payload = {
    idToken: getToken(),
    action: 'bulkInsert',
    table: targetTable,
    data: parsedData
  };

  btn.disabled = true;
  btn.textContent = 'Memproses Bulk Insert...';
  errorLog.classList.add('hidden');
  toggleLoader('global', true);

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    
    if(result.success) {
      document.getElementById('bulkDataInput').value = '';
      showToast(`${parsedData.length} baris berhasil di-insert ke tabel ${targetTable}!`, 'success');
      // refresh UI data silently
      if(targetTable === 'Anime') loadAnimeData();
      else loadEpsData();
    } else {
      throw new Error(result.error);
    }
  } catch(e) {
    showBulkError('Server Error: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Validasi & Upload';
    toggleLoader('global', false);
  }
});

function showBulkError(msg) {
  const el = document.getElementById('bulkErrorLog');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// --- UTILS ---------------------------------------------------
function toggleLoader(_idPrefix, show) {
  const overlay = document.getElementById('globalLoader');
  if(!overlay) return;
  if(show) {
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

// --- BULK ADD EPISODE VIA API ---------------------------------

const SCRAPER_API_BASE = 'YOUR_VERCEL_API';
const BULK_STORAGE_KEY  = 'bulkEpisodesUnsaved';

// Ref to the selected anime from API search results
let bulkSelectedAnime      = null; // { title, link }
// Holds the final episodes payload before saving
let bulkEpisodesPayload    = [];
// Tracks the current target anime_id being processed (used by sync check)
let currentBulkTargetAnimeId = '';
// Tracks MAL ID from Jikan for importing episode titles
let currentBulkMalId       = null;

// -- localStorage helpers ---------------------------------------
function bulkSaveToStorage(payload) {
  try {
    localStorage.setItem(BULK_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) { /* quota exceeded - skip silently */ }
}

function bulkClearStorage() {
  localStorage.removeItem(BULK_STORAGE_KEY);
  localStorage.removeItem(BULK_STORAGE_KEY + '_total');
}

function bulkLoadFromStorage() {
  try {
    const raw = localStorage.getItem(BULK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

// -- beforeunload guard -----------------------------------------
// Fires whenever bulkEpisodesPayload has data that hasn't been cleared yet
window.addEventListener('beforeunload', (e) => {
  if (bulkEpisodesPayload.length > 0) {
    e.preventDefault();
    e.returnValue = 'Ada data yang belum disimpan!';
    return e.returnValue;
  }
});

// -- Button trigger: now lives inside the Sidebar -----------------
const btnBulkApi = document.getElementById('btnBulkApi');
if (btnBulkApi) {
  btnBulkApi.addEventListener('click', () => {
    // Close sidebar on mobile
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');
    
    // Open bulk modal without preselected ID
    openBulkApiModal('');
  });
}

// -- Populate bulkApiTargetAnimeId whenever animeDataList loads --
const _origPopulateAnimeFilter = populateAnimeFilter;
populateAnimeFilter = function() {
  _origPopulateAnimeFilter();
  const sel = document.getElementById('bulkApiTargetAnimeId');
  if (sel && animeDataList.length > 0) {
    sel.innerHTML = animeDataList.map(a =>
      `<option value="${a.id}">${a.id} - ${a.title.substring(0, 30)}</option>`
    ).join('');
  }
};

// -- Open Modal A -----------------------------------------------
async function openBulkApiModal(preselectedAnimeId = '') {
  // 1. Check for leftover unsaved data in localStorage
  const recovered = bulkLoadFromStorage();
  if (recovered && recovered.length > 0) {
    // Restore to memory and open review directly
    bulkEpisodesPayload = recovered;
    const totalBatch = localStorage.getItem(BULK_STORAGE_KEY + '_total') || recovered.length;
    const choice = await customConfirm(
      `Terdapat ${recovered.length} dari ${totalBatch} data episode yang belum tersimpan dari sesi sebelumnya, apakah Anda ingin melanjutkan proses penyimpanan?`,
      'Data Belum Tersimpan',
      'info',
      'Ya, Lanjutkan',
      'Mulai Baru'
    );
    if (choice) {
      // Restore: open review modal immediately
      // Recover anime_id from the first stored row
      if (bulkEpisodesPayload.length > 0 && bulkEpisodesPayload[0].anime_id) {
        currentBulkTargetAnimeId = bulkEpisodesPayload[0].anime_id;
      }
      // Reset sync label for the recovered session
      const lbl = document.getElementById('syncStatusLabel');
      if (lbl) { lbl.textContent = ''; lbl.className = 'sync-status-label'; }
      renderBulkReviewTable(bulkEpisodesPayload, true /* isRecovered */);
      document.getElementById('modalBulkReview').classList.add('active');
      document.getElementById('bulkSaveProgress').textContent = '';
      return;
    } else {
      // Discard old data
      bulkEpisodesPayload = [];
      bulkClearStorage();
    }
  }

  // 2. Normal reset
  bulkSelectedAnime = null;
  currentBulkTargetAnimeId = '';
  currentBulkMalId = null;
  const lbl = document.getElementById('syncStatusLabel');
  if (lbl) { lbl.textContent = ''; lbl.className = 'sync-status-label'; }
  document.getElementById('bulkApiSearchStr').value = '';
  document.getElementById('bulkApiResults').classList.add('hidden');
  document.getElementById('bulkApiResults').innerHTML = '';
  document.getElementById('bulkApiHelperText').style.display = 'none';
  document.getElementById('bulkApiSelectedInfo').classList.add('hidden');
  document.getElementById('bulkApiProgressWrap').classList.add('hidden');
  setBulkProgress(0, 0, '');

  // 3. Populate target dropdown
  const sel = document.getElementById('bulkApiTargetAnimeId');
  if (animeDataList.length > 0) {
    sel.innerHTML = animeDataList.map(a =>
      `<option value="${a.id}">${a.id} - ${a.title.substring(0, 30)}</option>`
    ).join('');
  }

  // 4. Pre-select anime id from form (if passed) or active Episode filter
  if (preselectedAnimeId && sel.querySelector(`option[value="${preselectedAnimeId}"]`)) {
    sel.value = preselectedAnimeId;
  } else {
    const activeFilter = document.getElementById('filterAnimeId').value;
    if (activeFilter) sel.value = activeFilter;
  }

  document.getElementById('btnStartBulkFetch').disabled = false;
  document.getElementById('btnStartBulkFetch').innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    Ambil Data`;

  document.getElementById('modalBulkApi').classList.add('active');
}

// -- Close listeners --------------------------------------------
document.getElementById('closeBulkApiModal').addEventListener('click', () => {
  document.getElementById('modalBulkApi').classList.remove('active');
});
document.getElementById('closeBulkReviewModal').addEventListener('click', async () => {
  // If still has unsaved data, confirm
  if (bulkEpisodesPayload.length > 0) {
    const choice = await customConfirm(
      'Ada data yang belum disimpan. Apakah Anda ingin menyimpan draft ini untuk dilanjutkan nanti, atau menghapusnya secara permanen?', 
      'Tutup Review', 
      'warning',
      'Hapus Draft',
      'Simpan Draft'
    );

    if (choice) {
      // Hapus Draft (OK)
      bulkEpisodesPayload = [];
      currentBulkTargetAnimeId = '';
      currentBulkMalId = null;
      bulkClearStorage();
      const lbl = document.getElementById('syncStatusLabel');
      if (lbl) { lbl.textContent = ''; lbl.className = 'sync-status-label'; }
    } else {
      // Simpan Draft (Batal)
      // data already preserved in localStorage incrementally
    }
  }
  // Always hide & reset the import search panel on close
  const importPanel = document.getElementById('importSearchPanel');
  if (importPanel) importPanel.classList.add('hidden');
  const importResults = document.getElementById('importSearchResults');
  if (importResults) { importResults.classList.add('hidden'); importResults.innerHTML = ''; }
  const importHelper = document.getElementById('importSearchHelper');
  if (importHelper) importHelper.textContent = '';
  document.getElementById('importSearchStr').value = '';
  document.getElementById('modalBulkReview').classList.remove('active');
});

// -- API Search -------------------------------------------------
document.getElementById('btnBulkApiSearch').addEventListener('click', doBulkApiSearch);
document.getElementById('bulkApiSearchStr').addEventListener('keydown', e => {
  if (e.key === 'Enter') doBulkApiSearch();
});

async function doBulkApiSearch() {
  const query = document.getElementById('bulkApiSearchStr').value.trim();
  const source = document.getElementById('bulkApiSource').value;
  const helper = document.getElementById('bulkApiHelperText');
  const resultsEl = document.getElementById('bulkApiResults');
  if (!query) return;

  helper.style.display = 'block';
  helper.style.color = 'var(--text-secondary)';
  helper.textContent = `Mencari "${query}" di ${source}...`;
  resultsEl.classList.add('hidden');
  resultsEl.innerHTML = '';

  const url = `${SCRAPER_API_BASE}/api/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(source)}`;

  try {
    const res = await fetch(url);
    
    // Try to parse as JSON — if the server returns HTML error page this will throw
    let data;
    try {
      data = await res.json();
    } catch (_) {
      helper.style.color = 'var(--primary)';
      helper.textContent = `Error: Server mengembalikan respons non-JSON (Status ${res.status}). Mungkin CORS atau server error.`;
      return;
    }

    // Show raw error message if API returns one
    if (!data.success) {
      const apiMsg = data.error || data.message || JSON.stringify(data).substring(0, 100);
      helper.style.color = 'var(--primary)';
      helper.textContent = `API Error: ${apiMsg}`;
      return;
    }

    // Flexible extraction — API may use 'results', 'data', or 'result'
    const resultList = Array.isArray(data.results) ? data.results
                     : Array.isArray(data.data)    ? data.data
                     : Array.isArray(data.result)  ? data.result
                     : null;

    if (!resultList || resultList.length === 0) {
      helper.style.color = 'var(--primary)';
      helper.textContent = `Anime tidak ditemukan untuk "${query}" di sumber ${source}.`;
      return;
    }

    helper.style.display = 'none';
    resultsEl.classList.remove('hidden');

    const frag = document.createDocumentFragment();
    resultList.forEach(anime => {
      // Resolve relative image URLs for Animeindo
      const rawImg = anime.image || '';
      const imgSrc = rawImg.startsWith('http') ? rawImg
                   : rawImg.startsWith('/')    ? `https://anime-indo.lol${rawImg}`
                   : rawImg;

      const item = document.createElement('div');
      item.className = 'jikan-item';
      item.innerHTML = `
        <img src="${imgSrc}" alt="Cover" onerror="this.style.display='none'">
        <div class="jikan-item-info">
          <span class="jikan-item-title">${anime.title || ''}</span>
          <span class="jikan-item-meta">${anime.type || '-'} | ${anime.rating ? 'Rating: ' + anime.rating : (anime.synopsis ? anime.synopsis.substring(0,60)+'…' : '')}</span>
        </div>
      `;
      item.addEventListener('click', () => selectBulkAnime(anime));
      frag.appendChild(item);
    });
    resultsEl.appendChild(frag);

  } catch (err) {
    helper.style.color = 'var(--primary)';
    // Show the actual error message — helps diagnose CORS or network issues
    helper.textContent = `Gagal terhubung ke API: ${err.message}`;
    console.error('[doBulkApiSearch] fetch error:', err);
  }
}


// -- Resolve potentially-relative links from API sources --------
function resolveAnimeLink(link, source) {
  if (!link) return '';
  if (link.startsWith('http')) return link;
  // Determine base from source identifier or from link pattern
  const baseMap = {
    animeindo: 'https://anime-indo.lol',
    otakudesu: 'https://otakudesu.blog',
    samehadaku: 'https://v2.samehadaku.how'
  };
  const base = baseMap[source] || (
    link.startsWith('/bleach') || link.startsWith('/anime') ? 'https://anime-indo.lol' : ''
  );
  return base ? base + (link.startsWith('/') ? link : '/' + link) : link;
}

// -- Parse Episode Number ---------------------------------------
function parseEpisodeNumber(text) {
  if (!text) return 0;
  const match = text.match(/(?:ep(?:isode)?)[\.\s#]*(\d+(?:\.\d+)?)/i);
  if (match) return parseFloat(match[1]);
  // Fallback: extract first number sequence
  const fallback = text.match(/(\d+(?:\.\d+)?)/);
  if (fallback) return parseFloat(fallback[1]);
  return 0;
}

let bulkEpisodesListRaw = []; // Store the full list of episodes fetched for the selected anime

async function selectBulkAnime(anime) {
  bulkSelectedAnime = anime;
  document.getElementById('bulkApiSelectedTitle').textContent = anime.title;
  document.getElementById('bulkApiSelectedInfo').classList.remove('hidden');
  document.getElementById('bulkApiResults').classList.add('hidden');
  document.getElementById('bulkApiResults').innerHTML = '';
  document.getElementById('bulkApiHelperText').style.display = 'none';

  // Show the episode selector group and loading state
  const epSelectGroup = document.getElementById('bulkApiEpisodeSelectGroup');
  const epSelect = document.getElementById('bulkApiEpisodeList');
  const loader = document.getElementById('bulkApiEpisodeLoading');
  const countLabel = document.getElementById('bulkApiEpisodeCount');
  
  epSelectGroup.style.display = 'block';
  loader.classList.remove('hidden');
  epSelect.innerHTML = '';
  countLabel.textContent = '';
  bulkEpisodesListRaw = [];

  try {
    // Resolve relative URL — Animeindo returns relative links
    const resolvedLink = resolveAnimeLink(anime.link, anime.source);
    const res = await fetch(`${SCRAPER_API_BASE}/api/anime?url=${encodeURIComponent(resolvedLink)}`);
    const data = await res.json();
    
    if (data.success && data.episodes && data.episodes.length > 0) {
      // API often returns newest first, reverse so Ep 1 is at the top
      bulkEpisodesListRaw = [...data.episodes].reverse();
      
      const frag = document.createDocumentFragment();
      bulkEpisodesListRaw.forEach(ep => {
        // Defensive: ensure all ep properties are defined
        if (!ep || typeof ep !== 'object') return;
        
        ep.original_episode_text = ep.episode || '';
        const epNum = parseEpisodeNumber(ep.episode || '');
        ep.episode = epNum > 0 ? String(epNum) : (ep.original_episode_text || '?');
        
        // Resolve relative episode link
        ep.link = resolveAnimeLink(ep.link || '', anime.source);
        
        const label = document.createElement('label');
        label.className = 'ep-checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = ep.episode;
        checkbox.checked = true; // selected by default
        
        const textSpan = document.createElement('span');
        // Show original text only if it differs meaningfully from the cleaned number
        const origShort = ep.original_episode_text.length <= 20;
        textSpan.textContent = origShort
          ? `Ep ${ep.episode} — ${ep.original_episode_text}`
          : `Ep ${ep.episode} — ${ep.original_episode_text.substring(0, 40)}…`;
        
        label.appendChild(checkbox);
        label.appendChild(textSpan);
        frag.appendChild(label);
      });
      epSelect.appendChild(frag);
      countLabel.textContent = `(${bulkEpisodesListRaw.length} episode)`;
    } else {
      epSelect.innerHTML = '<div style="padding:10px; color:var(--text-muted); text-align:center;">Tidak ada episode ditemukan.</div>';
    }
  } catch (err) {
    console.error('selectBulkAnime error:', err);
    epSelect.innerHTML = '<div style="padding:10px; color:var(--primary); text-align:center;">Gagal memuat daftar episode.</div>';
  } finally {
    loader.classList.add('hidden');
  }
}

// Helper for "Pilih Semua" dan "Hapus Pilihan" buttons
window.selectAllEpisodes = function(selectStatus) {
  const checkboxes = document.querySelectorAll('#bulkApiEpisodeList input[type="checkbox"]');
  checkboxes.forEach(cb => cb.checked = selectStatus);
}

// -- Quality Parsing --------------------------------------------
function extractQuality(srv) {
  if (!srv) return 0;
  const qStr = srv.quality || srv.server_name || '';
  const m = qStr.match(/(\d{3,4})p/i);
  return m ? parseInt(m[1], 10) : 0;
}

function qualityClass(q) {
  if (q >= 1080) return 'q-1080';
  if (q >= 720)  return 'q-720';
  if (q >= 480)  return 'q-480';
  return '';
}

// Priority-based server slot assignment: Server 1 highest quality, Server 2 strictly lower, Server 3 strictly lower
function assignServersToSlots(servers, defaultEmbed) {
  const valid = servers
    .filter(s => s.embed_url !== null && s.embed_url !== undefined && s.embed_url !== '')
    .sort((a, b) => extractQuality(b) - extractQuality(a));

  const slots = [null, null, null];
  const maxQ = valid.length > 0 ? extractQuality(valid[0]) : 0;

  if (maxQ === 0) {
    // Apabila sistem tidak bisa menentukan kualitas video, isi server dengan url yang ada
    for (let i = 0; i < 3 && i < valid.length; i++) {
      slots[i] = valid[i];
    }
  } else {
    let currentSlot = 0;
    let lastQuality = Infinity;
    const unused = new Set(valid.map((_, i) => i));

    // Tahap 1: Pilih server dengan kualitas saling menurun (strictly decreasing) secara berurutan
    for (let i = 0; i < valid.length && currentSlot < 3; i++) {
        const q = extractQuality(valid[i]);
        if (q < lastQuality && q > 0) {
            slots[currentSlot] = valid[i];
            lastQuality = q;
            unused.delete(i);
            currentSlot++;
        }
    }
    
    // Tahap 2: Jika masih ada slot kosong, isi dengan URL sisa yang valid
    for (let i = 0; i < valid.length && currentSlot < 3; i++) {
        if (unused.has(i)) {
            slots[currentSlot] = valid[i];
            unused.delete(i);
            currentSlot++;
        }
    }
  }
  
  if (!slots[0] && defaultEmbed) {
    slots[0] = { server_name: 'Default', embed_url: defaultEmbed, quality: '' };
  }
  
  return slots;
}

// -- Progress helpers -------------------------------------------
function setBulkProgress(current, total, statusText) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  document.getElementById('bulkApiProgressBar').style.width = pct + '%';
  document.getElementById('bulkApiProgressCount').textContent = `${current} / ${total}`;
  if (statusText) document.getElementById('bulkApiStatusText').textContent = statusText;
}

// -- Main Scraping Pipeline -------------------------------------
document.getElementById('btnStartBulkFetch').addEventListener('click', startBulkFetch);

async function startBulkFetch() {
  if (!bulkSelectedAnime) {
    showToast('Pilih anime dari hasil pencarian terlebih dahulu.', 'error');
    return;
  }
  const targetAnimeId = document.getElementById('bulkApiTargetAnimeId').value;
  if (!targetAnimeId) {
    showToast('Pilih target Anime ID dari dropdown.', 'error');
    return;
  }
  currentBulkTargetAnimeId = targetAnimeId;

  const btn = document.getElementById('btnStartBulkFetch');
  btn.disabled = true;
  btn.textContent = 'Sedang memproses...';

  // Get all checked checkboxes
  const checkboxes = document.querySelectorAll('#bulkApiEpisodeList input[type="checkbox"]:checked');
  const selectedOptions = Array.from(checkboxes).map(cb => cb.value);

  if (selectedOptions.length === 0) {
    showToast('Pilih setidaknya satu episode untuk ditarik.', 'error');
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      Ambil Data`;
    return;
  }

  // Filter out only the episodes the user selected (keeping the order they appear in bulkEpisodesListRaw i.e. Ep 1 first)
  const episodesToProcess = bulkEpisodesListRaw.filter(ep => selectedOptions.includes(String(ep.episode)));
  const total = episodesToProcess.length;

  const progressWrap = document.getElementById('bulkApiProgressWrap');
  progressWrap.classList.remove('hidden');

  try {
    localStorage.setItem(BULK_STORAGE_KEY + '_total', total);
    setBulkProgress(0, total, `Memulai scraping link embed untuk ${total} episode terpilih...`);

    bulkEpisodesPayload = [];

    // STEP 2: Fetch streaming servers for each SELECTED episode
    for (let i = 0; i < episodesToProcess.length; i++) {
      const ep = episodesToProcess[i];
      const epLabel = ep.original_episode_text ? ep.original_episode_text.substring(0, 30) : `Ep ${ep.episode}`;
      setBulkProgress(i + 1, total, `Mengambil server: ${epLabel} (${i + 1}/${total})...`);

      let slots      = [null, null, null];
      let allServers = []; // raw valid servers for dropdown

      try {
        // ep.link is already resolved (done in selectBulkAnime)
        const streamRes  = await fetch(`${SCRAPER_API_BASE}/api/episode?url=${encodeURIComponent(ep.link)}`);
        const streamData = await streamRes.json();

        if (streamData.success && (streamData.streaming_servers || streamData.default_embed)) {
          let srvList = streamData.streaming_servers || [];
          
          // Normalize server names
          srvList.forEach(srv => {
            srv.server_name = srv.server_name || srv.name || 'Server';
          });
          
          allServers = srvList
            .filter(s => s.embed_url !== null && s.embed_url !== undefined && s.embed_url !== '')
            .sort((a, b) => extractQuality(b) - extractQuality(a));
          slots = assignServersToSlots(srvList, streamData.default_embed);
        }
      } catch (_) { /* individual failure - leave slots empty for manual fill */ }

      const row = {
        anime_id:     targetAnimeId,
        ep_number:    ep.episode,
        ep_title:     '',
        ep_date:      ep.date || '',
        // Assigned slot data (best quality server)
        server1_name: slots[0] ? slots[0].server_name : 'Server 1',
        server1_url:  slots[0] ? slots[0].embed_url   : '',
        server1_q:    slots[0] ? extractQuality(slots[0]) : 0,
        server2_name: slots[1] ? slots[1].server_name : 'Server 2',
        server2_url:  slots[1] ? slots[1].embed_url   : '',
        server2_q:    slots[1] ? extractQuality(slots[1]) : 0,
        server3_name: slots[2] ? slots[2].server_name : 'Server 3',
        server3_url:  slots[2] ? slots[2].embed_url   : '',
        server3_q:    slots[2] ? extractQuality(slots[2]) : 0,
        // All raw valid servers for interactive dropdown
        allServers: allServers,
      };
      bulkEpisodesPayload.push(row);

      // Persist to localStorage after each episode (incremental safety)
      bulkSaveToStorage(bulkEpisodesPayload);

      await new Promise(r => setTimeout(r, 50)); // keep UI responsive
    }

    setBulkProgress(total, total, `Selesai! ${total} episode siap ditinjau.`);

    // STEP 3: Open review modal
    renderBulkReviewTable(bulkEpisodesPayload);
    document.getElementById('modalBulkApi').classList.remove('active');
    document.getElementById('modalBulkReview').classList.add('active');
    document.getElementById('bulkSaveProgress').textContent = '';

  } catch (err) {
    setBulkProgress(0, 0, '');
    progressWrap.classList.add('hidden');
    showToast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      Mulai Tarik Data`;
  }
}

// -- Render Review Table ----------------------------------------
function renderBulkReviewTable(rows, isRecovered = false) {
  const tbody = document.getElementById('bulkReviewTbody');
  tbody.innerHTML = '';

  // Show recovery banner if data came from localStorage
  const header = document.querySelector('#modalBulkReview .modal-header div > p');
  if (header) {
    if (isRecovered) {
      header.innerHTML = `<span class="bulk-unsaved-banner" style="margin:0;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Data berhasil dipulihkan! ${rows.length} episode belum tersimpan.
      </span>`;
    } else {
      header.textContent = 'Periksa data, anda dapat mengedit sebelum menyimpan.';
    }
  }

  rows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;

    // Build server cell: a quality-badge, a SELECT dropdown from all raw servers, plus manual URL input
    const makeServerCell = (slotName, slotUrl, slotQ, allServers, slotIndex) => {
      const qLabel = slotQ > 0
        ? `<span class="quality-badge ${qualityClass(slotQ)}">${slotQ}p</span>`
        : '';

      // Build option list from all servers; mark the auto-assigned one as selected
      let selectOpts = `<option value="">- Tidak ada -</option>`;
      if (allServers && allServers.length > 0) {
        allServers.forEach(srv => {
          const q    = extractQuality(srv.server_name);
          const qStr = q > 0 ? ` [${q}p]` : '';
          // Trim URL for display
          const displayUrl = (srv.embed_url || '').substring(0, 45) + ((srv.embed_url || '').length > 45 ? '-¦' : '');
          const isSelected = srv.embed_url === slotUrl ? 'selected' : '';
          selectOpts += `<option value="${escHtml(srv.embed_url)}" data-name="${escHtml(srv.server_name)}" ${isSelected}>${escHtml(srv.server_name)}${qStr} - ${displayUrl}</option>`;
        });
      }
      // If slotUrl is non-empty but not in allServers (manual fill scenario)
      if (slotUrl && allServers && !allServers.find(s => s.embed_url === slotUrl)) {
        selectOpts += `<option value="${escHtml(slotUrl)}" selected>[Manual] ${escHtml(slotUrl).substring(0, 40)}</option>`;
      }

      return `
        <td>
          <div class="bulk-cell-group">
            ${qLabel}
            <input class="bulk-cell-input input-name" type="text" placeholder="Nama server"
              value="${escHtml(slotName)}" data-field="name" data-slot="${slotIndex}">
            <select class="bulk-cell-select" data-field="url" data-slot="${slotIndex}"
              onchange="bulkServerSelectChange(this, ${idx}, ${slotIndex})">
              ${selectOpts}
            </select>
            <input class="bulk-cell-input input-url" type="url"
              placeholder="Atau ketik URL embed manual"
              value="${escHtml(slotUrl)}" data-field="urlmanual" data-slot="${slotIndex}">
          </div>
        </td>`;
    };

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><input class="bulk-cell-input" type="number" step="0.5" value="${row.ep_number}" data-field="ep_number" style="width:52px; text-align:center;"></td>
      <td><input class="bulk-cell-input" type="text" value="${escHtml(row.ep_title)}" data-field="ep_title" placeholder="Judul episode (opsional)"></td>
      ${makeServerCell(row.server1_name, row.server1_url, row.server1_q, row.allServers, 1)}
      ${makeServerCell(row.server2_name, row.server2_url, row.server2_q, row.allServers, 2)}
      ${makeServerCell(row.server3_name, row.server3_url, row.server3_q, row.allServers, 3)}
    `;

    // Auto-save ep_title to localStorage on every keystroke
    const titleInput = tr.querySelector('input[data-field="ep_title"]');
    if (titleInput) {
      titleInput.addEventListener('input', () => {
        if (bulkEpisodesPayload[idx]) {
          bulkEpisodesPayload[idx].ep_title = titleInput.value;
          bulkSaveToStorage(bulkEpisodesPayload);
        }
      });
    }

    tbody.appendChild(tr);
  });

  setTimeout(setupClearButtons, 50);
}

// When user picks a server from the dropdown, auto-fill the name input and url manual input
window.bulkServerSelectChange = function(selectEl, rowIdx, slotIndex) {
  const selectedOption = selectEl.options[selectEl.selectedIndex];
  const url  = selectEl.value;
  const name = selectedOption.dataset.name || '';
  const tr   = document.querySelector(`#bulkReviewTbody tr[data-idx="${rowIdx}"]`);
  if (!tr) return;

  // Update name input for this slot
  const nameInput = tr.querySelector(`input[data-field="name"][data-slot="${slotIndex}"]`);
  if (nameInput && name) nameInput.value = name;

  // Update manual url input for this slot
  const urlInput = tr.querySelector(`input[data-field="urlmanual"][data-slot="${slotIndex}"]`);
  if (urlInput) urlInput.value = url;
};

// HTML escape helper
function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// -- Bulk Row Removal (used by sync check duplicates) -----------
window.bulkRemoveRow = function(trEl) {
  const idx = parseInt(trEl.dataset.idx, 10);
  // Remove from payload
  if (!isNaN(idx) && bulkEpisodesPayload[idx]) {
    bulkEpisodesPayload.splice(idx, 1);
  }
  // Remove <tr> from DOM
  trEl.remove();
  // Re-index remaining rows so data-idx stays sequential
  const remaining = document.querySelectorAll('#bulkReviewTbody tr');
  remaining.forEach((row, i) => {
    row.dataset.idx = i;
    const firstCell = row.cells[0];
    if (firstCell) firstCell.textContent = i + 1;
  });
  // Persist updated payload
  bulkSaveToStorage(bulkEpisodesPayload);
  // Update sync label count
  const dupeCount = document.querySelectorAll('#bulkReviewTbody tr.sync-duplicate').length;
  const label = document.getElementById('syncStatusLabel');
  if (label) {
    if (dupeCount > 0) {
      label.textContent = `⚠ ${dupeCount} duplikat tersisa`;
      label.className = 'sync-status-label has-dupes';
    } else {
      label.textContent = '✓ Tidak ada duplikat';
      label.className = 'sync-status-label no-dupes';
    }
  }
};

// -- Cek Sinkronisasi -------------------------------------------
async function bulkCheckSync() {
  const btn   = document.getElementById('btnCheckSync');
  const label = document.getElementById('syncStatusLabel');
  const animeId = currentBulkTargetAnimeId;

  if (!animeId) {
    showToast('Tidak ada Anime ID yang aktif. Tarik data episode terlebih dahulu.', 'error');
    return;
  }

  btn.disabled = true;
  const origHtml = btn.innerHTML;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 50 50" style="animation:loader-spin 0.8s linear infinite;"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="90,150" stroke-linecap="round"></circle></svg> Memeriksa...`;
  if (label) { label.textContent = 'Memeriksa sinkronisasi...'; label.className = 'sync-status-label'; }

  try {
    // Fetch all episodes for this anime from the database
    const res  = await fetch(`${APPS_SCRIPT_URL}?action=getAllEpisodes`, { redirect: 'follow' });
    const json = await res.json();
    if (json.error) throw new Error(json.error);

    const existingEps = (json.data || []).filter(ep => ep.anime_id === animeId);
    const existingNums = new Set(existingEps.map(ep => String(parseFloat(ep.ep_number))));

    // First: clear all previous sync markers
    document.querySelectorAll('#bulkReviewTbody tr').forEach(tr => {
      tr.classList.remove('sync-duplicate');
      tr.querySelectorAll('.sync-warn-badge, .btn-row-remove').forEach(el => el.remove());
    });

    let dupeCount = 0;
    document.querySelectorAll('#bulkReviewTbody tr').forEach(tr => {
      const epNumInput = tr.querySelector('input[data-field="ep_number"]');
      if (!epNumInput) return;
      const epNum = String(parseFloat(epNumInput.value));
      if (existingNums.has(epNum)) {
        dupeCount++;
        tr.classList.add('sync-duplicate');
        // Inject warning badge + remove button inside the ep_number cell (2nd cell)
        const epCell = tr.cells[1];
        if (epCell) {
          const badge = document.createElement('div');
          badge.className = 'sync-warn-badge';
          badge.innerHTML = `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Duplikat`;
          const removeBtn = document.createElement('button');
          removeBtn.className = 'btn-row-remove';
          removeBtn.title = 'Hapus baris ini dari daftar';
          removeBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
          removeBtn.addEventListener('click', () => bulkRemoveRow(tr));
          epCell.appendChild(badge);
          epCell.appendChild(removeBtn);
        }
      }
    });

    if (label) {
      if (dupeCount > 0) {
        label.textContent = `⚠ ${dupeCount} nomor episode sudah ada di database`;
        label.className = 'sync-status-label has-dupes';
        showToast(`Ditemukan ${dupeCount} episode duplikat — baris ditandai oranye.`, 'error');
      } else {
        label.textContent = `✓ Semua episode baru (${existingNums.size} episode di DB)`;
        label.className = 'sync-status-label no-dupes';
        showToast('Tidak ada duplikat ditemukan. Semua episode siap disimpan!', 'success');
      }
    }
  } catch (err) {
    showToast('Gagal cek sinkronisasi: ' + err.message, 'error');
    if (label) { label.textContent = ''; label.className = 'sync-status-label'; }
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHtml;
  }
}

// -- Import Judul: toggle search panel -------------------------
function bulkImportTitles() {
  const panel = document.getElementById('importSearchPanel');
  if (!panel) return;

  // If MAL ID already known, skip search and run import directly
  if (currentBulkMalId) {
    runImportFromMalId(currentBulkMalId);
    return;
  }

  // Toggle the search panel visibility
  const isHidden = panel.classList.contains('hidden');
  if (isHidden) {
    panel.classList.remove('hidden');
    document.getElementById('importSearchStr')?.focus();
  } else {
    panel.classList.add('hidden');
  }
}

// -- Search anime in Jikan for Import Judul --------------------
async function doImportSearch() {
  const query   = (document.getElementById('importSearchStr')?.value || '').trim();
  const helper  = document.getElementById('importSearchHelper');
  const results = document.getElementById('importSearchResults');
  if (!query) return;

  helper.textContent = 'Mencari di MyAnimeList...';
  helper.style.color = 'var(--text-secondary)';
  if (results) { results.classList.add('hidden'); results.innerHTML = ''; }

  try {
    const res  = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=6`);
    const data = await res.json();

    if (!data.data || data.data.length === 0) {
      helper.textContent = 'Anime tidak ditemukan. Coba kata kunci lain.';
      helper.style.color = 'var(--primary)';
      return;
    }

    helper.textContent = '';
    if (results) results.classList.remove('hidden');

    const frag = document.createDocumentFragment();
    data.data.forEach(anime => {
      const item = document.createElement('div');
      item.className = 'jikan-item';
      const imgUrl = anime.images?.jpg?.image_url || '';
      item.innerHTML = `
        <img src="${imgUrl}" alt="Cover" onerror="this.style.display='none'">
        <div class="jikan-item-info">
          <span class="jikan-item-title">${anime.title}</span>
          <span class="jikan-item-meta">MAL ID: ${anime.mal_id} | Eps: ${anime.episodes || '?'} | ${anime.status || ''}</span>
        </div>
      `;
      item.addEventListener('click', () => {
        currentBulkMalId = anime.mal_id;
        // Close panel
        document.getElementById('importSearchPanel').classList.add('hidden');
        document.getElementById('importSearchStr').value = '';
        if (results) { results.classList.add('hidden'); results.innerHTML = ''; }
        helper.textContent = '';
        // Run the actual import
        runImportFromMalId(anime.mal_id);
      });
      frag.appendChild(item);
    });
    if (results) results.appendChild(frag);

  } catch (err) {
    helper.textContent = 'Gagal mengakses Jikan API.';
    helper.style.color = 'var(--primary)';
  }
}

// -- Fetch episode titles and fill the review table -------------
async function runImportFromMalId(malId) {
  const btn = document.getElementById('btnImportTitles');
  btn.disabled = true;
  const origHtml = btn.innerHTML;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 50 50" style="animation:loader-spin 0.8s linear infinite;"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="90,150" stroke-linecap="round"></circle></svg> Mengimpor...`;

  try {
    // Fetch all episode pages from Jikan (paginated)
    const episodeMap = new Map(); // ep_number -> title
    let page = 1;
    let hasNext = true;

    while (hasNext) {
      const res  = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`);
      const data = await res.json();

      if (!data.data || data.data.length === 0) break;

      data.data.forEach(ep => {
        const epNum  = String(parseFloat(ep.mal_id));
        const title  = ep.title || ep.title_romanji || '';
        episodeMap.set(epNum, title);
      });

      hasNext = data.pagination && data.pagination.has_next_page;
      page++;
      if (hasNext) await new Promise(r => setTimeout(r, 340)); // respect rate limit
    }

    if (episodeMap.size === 0) {
      showToast('Tidak ada data judul episode dari Jikan untuk anime ini.', 'error');
      return;
    }

    let filledCount = 0;
    document.querySelectorAll('#bulkReviewTbody tr').forEach(tr => {
      const idx        = parseInt(tr.dataset.idx, 10);
      const epNumInput = tr.querySelector('input[data-field="ep_number"]');
      const titleInput = tr.querySelector('input[data-field="ep_title"]');
      if (!epNumInput || !titleInput) return;

      const epNum      = String(parseFloat(epNumInput.value));
      const jikanTitle = episodeMap.get(epNum);

      // Only fill empty title fields
      if (jikanTitle && !titleInput.value.trim()) {
        titleInput.value = jikanTitle;
        filledCount++;
        if (!isNaN(idx) && bulkEpisodesPayload[idx]) {
          bulkEpisodesPayload[idx].ep_title = jikanTitle;
        }
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    bulkSaveToStorage(bulkEpisodesPayload);

    showToast(
      filledCount > 0
        ? `${filledCount} judul episode berhasil diimpor dari Jikan!`
        : 'Tidak ada kolom judul kosong yang cocok dengan episode di Jikan.',
      'success'
    );

  } catch (err) {
    showToast('Gagal mengimpor judul dari Jikan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHtml;
  }
}

// -- Wire up new button listeners --
document.getElementById('btnCheckSync').addEventListener('click', bulkCheckSync);
document.getElementById('btnImportTitles').addEventListener('click', bulkImportTitles);

// Import search panel — search button & Enter key
document.getElementById('btnImportSearch').addEventListener('click', doImportSearch);
document.getElementById('importSearchStr').addEventListener('keydown', e => {
  if (e.key === 'Enter') doImportSearch();
});


// -- Bulk Save --------------------------------------------------
document.getElementById('btnSaveBulkEpisodes').addEventListener('click', saveBulkEpisodes);

async function saveBulkEpisodes() {
  const rows = document.querySelectorAll('#bulkReviewTbody tr');
  if (rows.length === 0) return;

  const btn        = document.getElementById('btnSaveBulkEpisodes');
  const btnCancel  = document.querySelector('#modalBulkReview .btn-secondary');
  const modal      = document.getElementById('modalBulkReview');
  const oldBtnHtml = btn.innerHTML;
  
  const progressOverlay = document.getElementById('globalProgressOverlay');
  const progressTitle   = document.getElementById('globalProgressTitle');
  const progressText    = document.getElementById('globalProgressText');
  const progressBar     = document.getElementById('globalProgressBar');
  const total           = rows.length;

  btn.disabled = true;
  if(btnCancel) btnCancel.disabled = true;
  if(modal) modal.style.pointerEvents = 'none';

  btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 50 50" style="margin-right:8px; animation: loader-spin 1s linear infinite;"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="90, 150" stroke-linecap="round"></circle></svg>Menyimpan...`;

  if(progressOverlay) {
    progressOverlay.classList.remove('hidden');
    if(progressTitle) progressTitle.textContent = 'Menyimpan Episode...';
    if(progressText) progressText.textContent = `Mempersiapkan data (0 dari ${total})`;
    if(progressBar) progressBar.style.width = '0%';
  }

  let successCount = 0;
  let failCount    = 0;

  for (let i = 0; i < rows.length; i++) {
    const tr  = rows[i];
    const idx = parseInt(tr.dataset.idx, 10);
    const base = bulkEpisodesPayload[idx];

    // Read ep_number and ep_title
    const epNumber = tr.querySelector('input[data-field="ep_number"]')?.value.trim() || base.ep_number;
    const epTitle  = tr.querySelector('input[data-field="ep_title"]')?.value.trim()  || base.ep_title;

    // For each slot: prefer the dropdown selection (urlmanual input), then fall back to base
    const getSlotData = (slotIndex, baseUrlKey, baseNameKey) => {
      const urlInput  = tr.querySelector(`input[data-field="urlmanual"][data-slot="${slotIndex}"]`);
      const nameInput = tr.querySelector(`input[data-field="name"][data-slot="${slotIndex}"]`);
      return {
        url:  urlInput?.value.trim()  || base[baseUrlKey]  || '',
        name: nameInput?.value.trim() || base[baseNameKey] || `Server ${slotIndex}`,
      };
    };

    const s1 = getSlotData(1, 'server1_url', 'server1_name');
    const s2 = getSlotData(2, 'server2_url', 'server2_name');
    const s3 = getSlotData(3, 'server3_url', 'server3_name');

    const payload = {
      idToken: getToken(),
      action:  'addEpisode',
      table:   'Episodes',
      data: {
        anime_id:     base.anime_id,
        ep_number:    epNumber,
        ep_title:     epTitle,
        server1_name: s1.name,
        server1_url:  s1.url,
        server2_name: s2.name,
        server2_url:  s2.url,
        server3_name: s3.name,
        server3_url:  s3.url,
        uploader:     '',
        date:         base.ep_date
      }
    };

    if(progressText) progressText.textContent = `Menyimpan Ep ${epNumber} (${i + 1} dari ${total})`;
    if(progressBar) progressBar.style.width = Math.round(((i + 1) / total) * 100) + '%';

    try {
      const res    = await fetch(APPS_SCRIPT_URL, { method: 'POST', redirect: 'follow', body: JSON.stringify(payload) });
      const result = await res.json();
      if (result.success) {
        successCount++;
        tr.style.opacity = '0.45';
        // Remove this row from payload tracking immediately for safety
        if (bulkEpisodesPayload[idx]) {
          bulkEpisodesPayload[idx]._saved = true;
        }
        const remaining = bulkEpisodesPayload.filter(r => !r._saved);
        if(remaining.length === 0) bulkClearStorage();
        else bulkSaveToStorage(remaining);
      } else {
        failCount++;
        showToast(`Ep ${epNumber}: ${result.error || 'Gagal disimpan'}`, 'error');
      }
    } catch (err) {
      failCount++;
      showToast(`Ep ${epNumber}: Koneksi gagal`, 'error');
    }

    await new Promise(r => setTimeout(r, 100));
  }

  if(progressTitle) progressTitle.textContent = failCount > 0 ? 'Selesai dengan Peringatan' : 'Penyimpanan Berhasil!';
  if(progressText) progressText.textContent = `${successCount} episode berhasil disimpan, ${failCount} gagal.`;

  // Delay 1.5s before hiding overlay to let user read the result
  await new Promise(r => setTimeout(r, 1500));
  if(progressOverlay) progressOverlay.classList.add('hidden');

  btn.disabled = false;
  btn.innerHTML = oldBtnHtml;
  if(btnCancel) btnCancel.disabled = false;
  if(modal) modal.style.pointerEvents = 'auto';

  // Final confirmation to memory
  const remaining = bulkEpisodesPayload.filter(r => !r._saved);
  if (remaining.length === 0) {
    bulkEpisodesPayload = [];
    bulkClearStorage(); // All done - safe to clear
  } else {
    // localStorage already synced
    bulkEpisodesPayload = remaining;
  }

  if (successCount > 0) {
    showToast(
      `${successCount} episode berhasil disimpan!${failCount > 0 ? ` (${failCount} gagal - coba lagi)` : ''}`,
      'success'
    );
    loadEpsData();
    if (failCount === 0) {
      setTimeout(() => document.getElementById('closeBulkReviewModal').click(), 600);
    }
  } else {
    showToast('Semua episode gagal disimpan.', 'error');
  }
}

// --- CLEAR INPUTS FEATURE ---
function setupClearButtons() {
  document.querySelectorAll('input[type="text"].admin-input, input[type="url"].admin-input, input[type="search"], .bulk-cell-input[type="text"], .bulk-cell-input[type="url"]').forEach(input => {
    if (input.dataset.hasClearBtn) return;
    input.dataset.hasClearBtn = "true";

    const parent = input.parentElement;
    if (!parent) return;

    if (!parent.classList.contains('input-clear-wrapper')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'input-clear-wrapper';
      parent.insertBefore(wrapper, input);
      wrapper.appendChild(input);
      
      const clearBtn = document.createElement('span');
      clearBtn.className = 'input-clear-btn hidden';
      clearBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      wrapper.appendChild(clearBtn);

      const toggleClear = () => {
        if (input.value.length > 0 && !input.readOnly && !input.disabled) {
          clearBtn.classList.remove('hidden');
        } else {
          clearBtn.classList.add('hidden');
        }
      };

      input.addEventListener('input', toggleClear);
      toggleClear();

      clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.focus();
        toggleClear();
      });
    }
  });
}
document.addEventListener('DOMContentLoaded', () => { setTimeout(setupClearButtons, 500); });
const searchInputObserver = new MutationObserver(() => setupClearButtons());
searchInputObserver.observe(document.body, { childList: true, subtree: true });

// --- BULK DELETE LOGIC ---
document.getElementById('selectAllAnime')?.addEventListener('change', function() {
  const isChecked = this.checked;
  document.querySelectorAll('.chk-anime').forEach(chk => chk.checked = isChecked);
  toggleBulkDeleteBtn('anime');
});
document.getElementById('selectAllEps')?.addEventListener('change', function() {
  const isChecked = this.checked;
  document.querySelectorAll('.chk-episode').forEach(chk => chk.checked = isChecked);
  toggleBulkDeleteBtn('episode');
});

document.getElementById('animeCardContainer')?.addEventListener('change', e => {
  if(e.target.classList.contains('chk-anime')) {
    const all = document.querySelectorAll('.chk-anime').length;
    const checked = document.querySelectorAll('.chk-anime:checked').length;
    document.getElementById('selectAllAnime').checked = (all > 0 && checked === all);
    toggleBulkDeleteBtn('anime');
  }
});
document.getElementById('epCardContainer')?.addEventListener('change', e => {
  if(e.target.classList.contains('chk-episode')) {
    const all = document.querySelectorAll('.chk-episode').length;
    const checked = document.querySelectorAll('.chk-episode:checked').length;
    document.getElementById('selectAllEps').checked = (all > 0 && checked === all);
    toggleBulkDeleteBtn('episode');
  }
});

function toggleBulkDeleteBtn(type) {
  if(type === 'anime') {
    const checked = document.querySelectorAll('.chk-anime:checked').length;
    const btn = document.getElementById('btnDeleteSelectedAnime');
    if(btn) btn.style.display = checked > 0 ? 'flex' : 'none';
  } else {
    const checked = document.querySelectorAll('.chk-episode:checked').length;
    const btn = document.getElementById('btnDeleteSelectedEps');
    if(btn) btn.style.display = checked > 0 ? 'flex' : 'none';
  }
}

document.getElementById('btnDeleteSelectedAnime')?.addEventListener('click', async () => {
  const checkedNodes = document.querySelectorAll('.chk-anime:checked');
  if(checkedNodes.length === 0) return;
  if(!await customConfirm(`Yakin ingin menghapus ${checkedNodes.length} anime terpilih?`, 'Hapus Massal')) return;

  const btn = document.getElementById('btnDeleteSelectedAnime');
  btn.disabled = true;
  btn.textContent = 'Menghapus...';
  toggleLoader('global', true);

  let successCount = 0, failCount = 0;
  for(let i=0; i<checkedNodes.length; i++) {
    const payload = { idToken: getToken(), action: 'deleteAnime', table: 'Anime', id: checkedNodes[i].value };
    try {
      const res = await fetch(APPS_SCRIPT_URL, { method: 'POST', redirect: 'follow', body: JSON.stringify(payload) });
      const result = await res.json();
      if(result.success) successCount++; else failCount++;
    } catch(e) { failCount++; }
  }

  btn.disabled = false;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Hapus Terpilih`;
  toggleLoader('global', false);

  if(failCount > 0) showToast(`Peringatan: Ada ${failCount} data yang belum terhapus!`, 'error');
  else if(successCount > 0) showToast(`${successCount} data berhasil dihapus!`, 'success');
  loadAnimeData();
});

document.getElementById('btnDeleteSelectedEps')?.addEventListener('click', async () => {
  const checkedNodes = document.querySelectorAll('.chk-episode:checked');
  if(checkedNodes.length === 0) return;
  if(!await customConfirm(`Yakin ingin menghapus ${checkedNodes.length} episode terpilih?`, 'Hapus Massal')) return;

  const btn = document.getElementById('btnDeleteSelectedEps');
  btn.disabled = true;
  btn.textContent = 'Menghapus...';
  toggleLoader('global', true);

  let successCount = 0, failCount = 0;
  for(let i=0; i<checkedNodes.length; i++) {
    const payload = { idToken: getToken(), action: 'deleteEpisode', table: 'Episodes', animeId: checkedNodes[i].dataset.anime, epNumber: checkedNodes[i].dataset.ep };
    try {
      const res = await fetch(APPS_SCRIPT_URL, { method: 'POST', redirect: 'follow', body: JSON.stringify(payload) });
      const result = await res.json();
      if(result.success) successCount++; else failCount++;
    } catch(e) { failCount++; }
  }

  btn.disabled = false;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Hapus Terpilih`;
  toggleLoader('global', false);


  if(failCount > 0) showToast(`Peringatan: Ada ${failCount} data yang belum terhapus!`, 'error');
  else if(successCount > 0) showToast(`${successCount} data berhasil dihapus!`, 'success');
  loadEpsData();
});

// --- CUSTOM CONFIRM MODAL ---
window.customConfirm = function(message, title = 'Konfirmasi', type = 'warning', okText = 'Ya, Lanjutkan', cancelText = 'Batal') {
  return new Promise((resolve) => {
    const modal = document.getElementById('modalConfirm');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').innerHTML = message.replace(/\n/g, '<br>');

    const iconEl = document.getElementById('confirmIcon');
    if(type === 'warning') {
      iconEl.style.color = 'var(--primary)';
      iconEl.innerHTML = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else if(type === 'info') {
      iconEl.style.color = '#3b82f6';
      iconEl.innerHTML = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    const btnOk = document.getElementById('btnConfirmOk');
    const btnCancel = document.getElementById('btnConfirmCancel');
    
    btnOk.textContent = okText;
    btnCancel.textContent = cancelText;

    const cleanup = () => {
      modal.classList.remove('active');
    };

    // Ensure we remove previous event listeners by replacing nodes
    btnOk.replaceWith(btnOk.cloneNode(true));
    btnCancel.replaceWith(btnCancel.cloneNode(true));

    document.getElementById('btnConfirmOk').addEventListener('click', () => { cleanup(); resolve(true); }, {once: true});
    document.getElementById('btnConfirmCancel').addEventListener('click', () => { cleanup(); resolve(false); }, {once: true});

    modal.classList.add('active');
  });
};

// --- AUTO FETCH EPISODE DATA via Anime Search (Tambah / Edit Episode) ---

let epApiSelectedAnime = null; // { title, link, source }

const btnEpApiSearch = document.getElementById('btnEpApiSearch');
if (btnEpApiSearch) {
  btnEpApiSearch.addEventListener('click', doEpApiSearch);
  document.getElementById('epApiSearchStr').addEventListener('keydown', e => {
    if (e.key === 'Enter') doEpApiSearch();
  });
}

async function doEpApiSearch() {
  const query = document.getElementById('epApiSearchStr').value.trim();
  const source = document.getElementById('epApiSource').value;
  const helper = document.getElementById('epApiHelperText');
  const resultsEl = document.getElementById('epApiSearchResults');
  if (!query) return;

  helper.style.display = 'block';
  helper.style.color = 'var(--text-secondary)';
  helper.textContent = `Mencari "${query}" di ${source}...`;
  resultsEl.classList.add('hidden');
  resultsEl.innerHTML = '';
  document.getElementById('epApiSelectedInfo').classList.add('hidden');

  try {
    const res = await fetch(`${SCRAPER_API_BASE}/api/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(source)}`);
    let data;
    try { data = await res.json(); } catch(_) {
      helper.style.color = 'var(--primary)';
      helper.textContent = `Error: Respons non-JSON dari server (${res.status}).`;
      return;
    }

    if (!data.success) {
      helper.style.color = 'var(--primary)';
      helper.textContent = `API Error: ${data.error || data.message || 'Unknown error'}`;
      return;
    }

    const resultList = Array.isArray(data.results) ? data.results
                     : Array.isArray(data.data)    ? data.data
                     : Array.isArray(data.result)  ? data.result
                     : null;

    if (!resultList || resultList.length === 0) {
      helper.style.color = 'var(--primary)';
      helper.textContent = `Anime tidak ditemukan untuk "${query}".`;
      return;
    }

    helper.style.display = 'none';
    resultsEl.classList.remove('hidden');

    const frag = document.createDocumentFragment();
    resultList.forEach(anime => {
      const rawImg = anime.image || '';
      const imgSrc = rawImg.startsWith('http') ? rawImg
                   : rawImg.startsWith('/') ? `https://anime-indo.lol${rawImg}` : rawImg;
      const item = document.createElement('div');
      item.className = 'jikan-item';
      item.innerHTML = `
        <img src="${imgSrc}" alt="" onerror="this.style.display='none'">
        <div class="jikan-item-info">
          <span class="jikan-item-title">${anime.title || ''}</span>
          <span class="jikan-item-meta">${anime.type || '-'} | ${anime.rating ? 'Rating: ' + anime.rating : ''}</span>
        </div>
      `;
      item.addEventListener('click', () => selectEpApiAnime(anime));
      frag.appendChild(item);
    });
    resultsEl.appendChild(frag);

  } catch (err) {
    helper.style.color = 'var(--primary)';
    helper.textContent = `Gagal terhubung ke API: ${err.message}`;
  }
}

async function selectEpApiAnime(anime) {
  epApiSelectedAnime = anime;
  const helper = document.getElementById('epApiHelperText');
  const resultsEl = document.getElementById('epApiSearchResults');
  const selectedInfo = document.getElementById('epApiSelectedInfo');
  const selectedTitleEl = document.getElementById('epApiSelectedTitle');

  resultsEl.classList.add('hidden');
  resultsEl.innerHTML = '';
  selectedTitleEl.textContent = anime.title || '';
  selectedInfo.classList.remove('hidden');

  // Now auto-fetch servers based on ep_number
  await doEpApiFetchServers();
}

// [ganti] button to reset the search
const btnEpApiClear = document.getElementById('btnEpApiClear');
if (btnEpApiClear) {
  btnEpApiClear.addEventListener('click', () => {
    epApiSelectedAnime = null;
    document.getElementById('epApiSelectedInfo').classList.add('hidden');
    document.getElementById('epApiSearchStr').value = '';
    document.getElementById('epApiSearchStr').focus();
    document.getElementById('epApiHelperText').style.display = 'none';
    document.getElementById('epApiResolvedLink').value = '';
    // Hide server dropdowns
    for (let i = 1; i <= 3; i++) {
      const g = document.getElementById(`ep_s${i}_select_group`);
      if (g) g.classList.add('hidden');
    }
  });
}

// Also re-fetch when ep_number changes if we already have a selected anime
document.getElementById('ep_number')?.addEventListener('change', () => {
  if (epApiSelectedAnime) doEpApiFetchServers();
});

async function doEpApiFetchServers() {
  if (!epApiSelectedAnime) return;

  const epNum = parseFloat(document.getElementById('ep_number').value);
  const helper = document.getElementById('epApiHelperText');

  if (isNaN(epNum)) {
    helper.style.display = 'block';
    helper.style.color = 'var(--primary)';
    helper.textContent = 'Isi Nomor Episode terlebih dahulu sebelum mengambil server.';
    return;
  }

  helper.style.display = 'block';
  helper.style.color = 'var(--text-secondary)';
  helper.textContent = `Mencari Episode ${epNum} dari "${epApiSelectedAnime.title}"...`;

  try {
    // Step 1: get episode list for the anime
    const resolvedAnimeLink = resolveAnimeLink(epApiSelectedAnime.link, epApiSelectedAnime.source);
    const animeRes = await fetch(`${SCRAPER_API_BASE}/api/anime?url=${encodeURIComponent(resolvedAnimeLink)}`);
    const animeData = await animeRes.json();

    if (!animeData.success || !animeData.episodes || animeData.episodes.length === 0) {
      helper.style.color = 'var(--primary)';
      helper.textContent = 'Gagal memuat daftar episode anime ini.';
      return;
    }

    // Step 2: find the episode matching ep_number
    const targetEp = animeData.episodes.find(ep => {
      const parsed = parseEpisodeNumber(ep.episode || '');
      return Math.abs(parsed - epNum) < 0.01;
    });

    if (!targetEp) {
      helper.style.color = 'var(--primary)';
      helper.textContent = `Episode ${epNum} tidak ditemukan dalam daftar anime ini.`;
      return;
    }

    const resolvedEpLink = resolveAnimeLink(targetEp.link || '', epApiSelectedAnime.source);
    document.getElementById('epApiResolvedLink').value = resolvedEpLink;

    helper.textContent = `Ditemukan! Mengambil server Episode ${epNum}...`;

    // Step 3: fetch streaming servers for that episode
    const streamRes = await fetch(`${SCRAPER_API_BASE}/api/episode?url=${encodeURIComponent(resolvedEpLink)}`);
    const streamData = await streamRes.json();

    if (!streamData.success || (!streamData.streaming_servers && !streamData.default_embed)) {
      helper.style.color = 'var(--primary)';
      helper.textContent = 'Gagal atau tidak ada server ditemukan untuk episode ini.';
      return;
    }

    const srvList = streamData.streaming_servers || [];
    helper.style.color = '#2eac68';
    helper.textContent = `Berhasil! ${srvList.length} server ditemukan untuk Episode ${epNum}.`;

    const valid = srvList
      .filter(s => s.embed_url)
      .sort((a, b) => extractQuality(b) - extractQuality(a));

    const slots = assignServersToSlots(srvList, streamData.default_embed);

    for (let slot = 0; slot < 3; slot++) {
      const selectEl = document.getElementById(`ep_s${slot+1}_select`);
      const groupEl  = document.getElementById(`ep_s${slot+1}_select_group`);
      if (!selectEl || !groupEl) continue;
      groupEl.classList.remove('hidden');

      let opts = `<option value="">- Manual -</option>`;
      valid.forEach(srv => {
        const q = extractQuality(srv);
        const qStr = q > 0 ? ` [${q}p]` : '';
        const displayUrl = (srv.embed_url || '').substring(0, 40) + '...';
        const isSelected = (slots[slot] && slots[slot].embed_url === srv.embed_url) ? 'selected' : '';
        opts += `<option value="${escHtml(srv.embed_url)}" data-name="${escHtml(srv.server_name)}" ${isSelected}>${escHtml(srv.server_name)}${qStr} - ${displayUrl}</option>`;
      });
      selectEl.innerHTML = opts;

      if (slots[slot]) {
        document.getElementById(`ep_s${slot+1}_name`).value = slots[slot].server_name;
        document.getElementById(`ep_s${slot+1}_url`).value  = slots[slot].embed_url;
      }
    }

  } catch (err) {
    helper.style.color = 'var(--primary)';
    helper.textContent = `Error: ${err.message}`;
    console.error('[doEpApiFetchServers]', err);
  }
}

// Sync input changes when select option changes
window.epFormServerSelectChange = function(selectEl, slotIndex) {
  const selectedOption = selectEl.options[selectEl.selectedIndex];
  const url = selectEl.value;
  const name = selectedOption.dataset.name || '';
  if (url) {
    document.getElementById(`ep_s${slotIndex}_name`).value = name;
    document.getElementById(`ep_s${slotIndex}_url`).value = url;
  } else {
    document.getElementById(`ep_s${slotIndex}_url`).value = '';
  }
};

// --- IMPORT JUDUL JIKAN (inline button next to ep_title) ---
const btnEpJikanSearch = document.getElementById('btnEpJikanSearch');
if (btnEpJikanSearch) {
  btnEpJikanSearch.addEventListener('click', async () => {
    // Use the anime title from the selected scraper anime, or from ep_anime_id selector label
    const epAnimeSelect = document.getElementById('ep_anime_id');
    const selectedAnimeText = epAnimeSelect?.options[epAnimeSelect.selectedIndex]?.text || '';
    // Extract just the title part (after "ID - ") or use epApiSelectedAnime title
    const query = (epApiSelectedAnime?.title) || selectedAnimeText.replace(/^\d+\s*-\s*/, '').trim();

    const helper = document.getElementById('epJikanHelperText');
    const resultsContainer = document.getElementById('epJikanResults');

    if (!query) {
      helper.style.display = 'block';
      helper.style.color = 'var(--primary)';
      helper.textContent = 'Tidak dapat menentukan judul anime. Pilih anime terlebih dahulu.';
      return;
    }

    helper.style.display = 'block';
    helper.style.color = 'var(--text-secondary)';
    helper.textContent = `Mencari "${query}" di MyAnimeList...`;
    resultsContainer.classList.add('hidden');
    resultsContainer.innerHTML = '';

    try {
      const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`);
      const data = await res.json();

      if (data.data && data.data.length > 0) {
        helper.style.display = 'none';
        resultsContainer.classList.remove('hidden');

        const frag = document.createDocumentFragment();
        data.data.forEach(anime => {
          const item = document.createElement('div');
          item.className = 'jikan-item';
          const imgUrl = (anime.images?.jpg?.image_url) || '';
          item.innerHTML = `
            <img src="${imgUrl}" alt="Cover">
            <div class="jikan-item-info">
              <span class="jikan-item-title">${anime.title}</span>
              <span class="jikan-item-meta">MAL ID: ${anime.mal_id} | Eps: ${anime.episodes || '?'}</span>
            </div>
          `;
          item.addEventListener('click', () => epFormImportJikanTitle(anime.mal_id, anime.title));
          frag.appendChild(item);
        });
        resultsContainer.appendChild(frag);
      } else {
        helper.style.color = 'var(--primary)';
        helper.textContent = 'Anime tidak ditemukan di MyAnimeList.';
      }
    } catch(e) {
      helper.style.color = 'var(--primary)';
      helper.textContent = 'Gagal mengakses Jikan API.';
    }
  });
}

async function epFormImportJikanTitle(malId, animeTitle) {
  const helper = document.getElementById('epJikanHelperText');
  const resultsContainer = document.getElementById('epJikanResults');
  const epNumberInput = document.getElementById('ep_number').value.trim();

  if (resultsContainer) {
    resultsContainer.classList.add('hidden');
    resultsContainer.innerHTML = '';
  }

  if (!epNumberInput) {
    helper.style.display = 'block';
    helper.style.color = 'var(--primary)';
    helper.textContent = 'Harap isi Nomor Episode terlebih dahulu!';
    return;
  }

  helper.style.display = 'block';
  helper.style.color = 'var(--text-secondary)';
  helper.textContent = `Menarik judul untuk Episode ${epNumberInput} dari Jikan...`;

  try {
    const episodeMap = new Map();
    let page = 1;
    let hasNext = true;

    while (hasNext) {
      const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`);
      const data = await res.json();
      if (!data.data || data.data.length === 0) break;

      data.data.forEach(ep => {
        const epNum = String(parseFloat(ep.mal_id));
        const title = ep.title || ep.title_romanji || '';
        episodeMap.set(epNum, title);
      });

      if (episodeMap.has(String(parseFloat(epNumberInput)))) break;
      hasNext = data.pagination && data.pagination.has_next_page;
      page++;
      if (hasNext) await new Promise(r => setTimeout(r, 340));
    }

    const targetEpNum = String(parseFloat(epNumberInput));
    const titleFound = episodeMap.get(targetEpNum);

    if (titleFound) {
      document.getElementById('ep_title').value = titleFound;
      helper.style.color = '#2eac68';
      helper.textContent = `Berhasil mengimpor: "${titleFound}"`;
    } else {
      helper.style.color = 'var(--primary)';
      helper.textContent = `Judul tidak ditemukan untuk Episode ${targetEpNum}.`;
    }
  } catch(err) {
    helper.style.color = 'var(--primary)';
    helper.textContent = 'Gagal mengimpor dari Jikan.';
  }
}

// --- ANNOUNCEMENT FEATURE ------------------------------------
async function loadAnnouncementData() {
  const btn = document.getElementById('btnSaveAnnouncement');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Memuat...';

  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=getAnnouncement`, { redirect: 'follow' });
    const json = await res.json();
    
    if (json.data) {
      document.getElementById('announcementStatus').value = json.data.IsActive ? '1' : '0';
      document.getElementById('announcementType').value = json.data.Type || 'info';
      document.getElementById('announcementMessage').value = json.data.Message || '';
    } else {
      document.getElementById('announcementStatus').value = '0';
      document.getElementById('announcementType').value = 'info';
      document.getElementById('announcementMessage').value = '';
    }
  } catch (err) {
    showToast('Gagal memuat pengaturan pengumuman', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Pengaturan';
  }
}

document.getElementById('btnSaveAnnouncement')?.addEventListener('click', async () => {
  const btn = document.getElementById('btnSaveAnnouncement');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  const payload = {
    action: 'saveAnnouncement',
    idToken: getToken(),
    data: {
      IsActive: document.getElementById('announcementStatus').value === '1',
      Type: document.getElementById('announcementType').value,
      Message: document.getElementById('announcementMessage').value
    }
  };

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    
    if (json.success) {
      showToast('Pengaturan pengumuman berhasil disimpan!', 'success');
    } else {
      throw new Error(json.error || 'Gagal menyimpan');
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Pengaturan';
  }
});