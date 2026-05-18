/* ═══════════════════════════════════════════════════════════════
   THE STADIUM LIST — FBS Bucket List Tracker
   app.js — guest-mode only (localStorage)

   // TODO: Replace with Supabase for cross-device sync.

   SECTIONS
   ────────
   1. Constants & localStorage keys
   2. State
   3. Data loading
   4. localStorage helpers
   5. Render: grid view
   6. Render: map view (Leaflet)
   7. Render: sidebar (filters, badges)
   8. Filter & sort logic
   9. Visit toggle
   10. View switcher
   11. Share card (html2canvas)
   12. Toast notification
   13. Init
═══════════════════════════════════════════════════════════════ */


/* ─────────────────────────────────────────
   1. CONSTANTS & STORAGE KEYS
───────────────────────────────────────── */
const LS_VISITS  = 'stadium-visits';       // JSON array of visited stadium IDs
const LS_VERSION = 'stadium-app-version';  // "1.0"
const LS_NAME    = 'stadium-name';         // user's display name string
const APP_VERSION = '1.0';

// Conference display metadata (icon + colors used in share card)
const CONF_META = {
  'SEC':          { icon: '🏈', color: '#065F46' },
  'Big Ten':      { icon: '🔵', color: '#1E40AF' },
  'Big 12':       { icon: '⭐', color: '#7C2D12' },
  'Mountain West':{ icon: '🏔️', color: '#4338CA' },
  'Independents': { icon: '🎓', color: '#6D28D9' },
};


/* ─────────────────────────────────────────
   2. STATE
───────────────────────────────────────── */
let allStadiums    = [];   // full loaded dataset
let visitedIds     = [];   // array of visited stadium IDs
let userName       = '';   // user's display name

// Active filter state
let filterConfs    = [];   // [] means "show all conferences"
let filterState    = '';   // '' means "show all states"
let filterStatus   = 'all'; // 'all' | 'visited' | 'unvisited'

// Current view
let currentView    = 'grid'; // 'grid' | 'map'

// Leaflet map instance & markers
let leafletMap     = null;
let mapMarkers     = {};  // keyed by stadium id → L.Marker
let mapInitialized = false;


/* ─────────────────────────────────────────
   3. DATA LOADING
───────────────────────────────────────── */

/**
 * Fetch stadiums.json and kick off the app.
 */
async function loadData() {
  try {
    const res  = await fetch('data/stadiums.json');
    allStadiums = await res.json();
    init();
  } catch (err) {
    console.error('Failed to load stadiums.json:', err);
    document.getElementById('grid-view').innerHTML =
      '<div class="empty-state"><div class="empty-state-icon">⚠️</div>' +
      '<div class="empty-state-text">Could not load stadium data.</div></div>';
  }
}


/* ─────────────────────────────────────────
   4. LOCALSTORAGE HELPERS
───────────────────────────────────────── */

/** Load persisted data from localStorage. */
function loadStorage() {
  // Version check / migration hook
  const storedVersion = localStorage.getItem(LS_VERSION);
  if (storedVersion !== APP_VERSION) {
    localStorage.setItem(LS_VERSION, APP_VERSION);
  }

  // Visited IDs
  try {
    const raw = localStorage.getItem(LS_VISITS);
    visitedIds = raw ? JSON.parse(raw) : [];
  } catch {
    visitedIds = [];
  }

  // User name
  userName = localStorage.getItem(LS_NAME) || '';
}

/** Persist visitedIds to localStorage. */
function saveVisits() {
  localStorage.setItem(LS_VISITS, JSON.stringify(visitedIds));
}

/** Persist user name. Called on every keystroke. */
function saveName(value) {
  userName = value.trim();
  localStorage.setItem(LS_NAME, value); // store raw (may include spaces)
}


/* ─────────────────────────────────────────
   5. RENDER: GRID VIEW
───────────────────────────────────────── */

/**
 * Render the filtered + sorted stadiums as cards into #grid-view.
 */
function renderGrid() {
  const container = document.getElementById('grid-view');
  const filtered  = getFilteredStadiums();

  // Update results count
  document.getElementById('results-count').innerHTML =
    `Showing <strong>${filtered.length}</strong> of <strong>${allStadiums.length}</strong> stadiums`;

  if (filtered.length === 0) {
    container.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-state-icon">🏟️</div>' +
        '<div class="empty-state-text">No stadiums match your filters.</div>' +
      '</div>';
    return;
  }

  container.innerHTML = filtered.map(s => {
    const visited  = visitedIds.includes(s.id);
    const capacity = s.capacity.toLocaleString();
    return `
      <div
        class="bs-stadium-card${visited ? ' visited' : ''}"
        id="card-${s.id}"
        onclick="toggleVisit('${s.id}')"
        role="button"
        tabindex="0"
        aria-label="${s.team} at ${s.stadium}, ${visited ? 'visited' : 'not visited'}"
        onkeydown="if(event.key==='Enter'||event.key===' ')toggleVisit('${s.id}')"
      >
        <div class="card-team">${s.team}</div>
        <div class="card-stadium-name">${s.stadium}</div>
        <div class="card-location">${s.city}, ${s.state}</div>
        <div class="card-meta-row">
          <span class="bs-stadium-conf">${s.conference}</span>
          <span class="card-capacity">⬡ ${capacity}</span>
          <div class="card-checkbox">
            ${visited ? '✓' : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}


/* ─────────────────────────────────────────
   6. RENDER: MAP VIEW (Leaflet)
───────────────────────────────────────── */

/**
 * Initialize the Leaflet map. Called once when user first switches to map view.
 */
function initMap() {
  if (mapInitialized) return;
  mapInitialized = true;

  leafletMap = L.map('leaflet-map');

  // OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(leafletMap);

  // Add all markers
  allStadiums.forEach(s => {
    const marker = createMarker(s);
    mapMarkers[s.id] = marker;
    marker.addTo(leafletMap);
  });

  // Fit map bounds to all stadium markers
  const coords = allStadiums.map(s => [s.lat, s.lng]);
  if (coords.length > 0) {
    leafletMap.fitBounds(L.latLngBounds(coords), { padding: [30, 30] });
  }
}

/**
 * Create a custom DivIcon marker for a stadium.
 * Visited → filled accent-color circle; Unvisited → hollow grey circle.
 */
function createMarker(stadium) {
  const visited = visitedIds.includes(stadium.id);
  const icon    = L.divIcon({
    className: '',
    html: `<div class="map-marker ${visited ? 'visited' : 'unvisited'}"></div>`,
    iconSize:   [16, 16],
    iconAnchor: [8, 8],
    popupAnchor:[0, -10],
  });

  const marker = L.marker([stadium.lat, stadium.lng], { icon });

  // Build popup content
  marker.bindPopup(buildPopupHTML(stadium), { maxWidth: 220, minWidth: 180 });

  return marker;
}

/**
 * Build popup HTML string for a stadium.
 * Includes a "Mark Visited" toggle button.
 */
function buildPopupHTML(s) {
  const visited  = visitedIds.includes(s.id);
  const capacity = s.capacity.toLocaleString();
  return `
    <div class="stadium-popup">
      <h3>${s.team}</h3>
      <div class="popup-stadium">${s.stadium}</div>
      <div class="popup-capacity">⬡ ${capacity} · ${s.city}, ${s.state}</div>
      <button
        class="popup-visit-btn ${visited ? 'visited' : 'unvisited'}"
        onclick="toggleVisitFromMap('${s.id}')"
      >
        ${visited ? '✓ Visited' : '+ Mark Visited'}
      </button>
    </div>
  `;
}

/**
 * Update all map marker icons to reflect current visit state.
 * Also hides/shows markers based on active filters.
 */
function updateMapMarkers() {
  if (!mapInitialized || !leafletMap) return;

  const filtered = getFilteredStadiums();
  const filteredIds = new Set(filtered.map(s => s.id));

  allStadiums.forEach(s => {
    const marker  = mapMarkers[s.id];
    if (!marker) return;

    // Show/hide based on current filters
    if (filteredIds.has(s.id)) {
      if (!leafletMap.hasLayer(marker)) marker.addTo(leafletMap);
    } else {
      if (leafletMap.hasLayer(marker)) leafletMap.removeLayer(marker);
    }

    // Refresh icon to reflect visited state
    const visited = visitedIds.includes(s.id);
    const newIcon = L.divIcon({
      className: '',
      html: `<div class="map-marker ${visited ? 'visited' : 'unvisited'}"></div>`,
      iconSize:   [16, 16],
      iconAnchor: [8, 8],
      popupAnchor:[0, -10],
    });
    marker.setIcon(newIcon);

    // Refresh popup content
    marker.setPopupContent(buildPopupHTML(s));
  });
}

/**
 * Toggle visit from a map popup button.
 * After toggling, close the popup and refresh the marker.
 */
function toggleVisitFromMap(id) {
  toggleVisit(id);
  // Close all open popups so user sees refreshed state on reopen
  if (leafletMap) leafletMap.closePopup();
}


/* ─────────────────────────────────────────
   7. RENDER: SIDEBAR (filters + badges)
───────────────────────────────────────── */

/**
 * Populate the conference filter pill checkboxes.
 */
function renderConferenceFilters() {
  const conferences = [...new Set(allStadiums.map(s => s.conference))].sort();
  const container   = document.getElementById('conf-filters');

  container.innerHTML = conferences.map(conf => `
    <label class="conf-pill">
      <input
        type="checkbox"
        value="${conf}"
        onchange="toggleConfFilter('${conf}', this.checked)"
      />
      <span class="conf-pill-label">${conf}</span>
    </label>
  `).join('');
}

/**
 * Populate the state dropdown with unique states from the dataset.
 */
function renderStateDropdown() {
  const states    = [...new Set(allStadiums.map(s => s.state))].sort();
  const select    = document.getElementById('state-filter');
  const existing  = select.innerHTML; // preserve "All States" option

  select.innerHTML = '<option value="">All States</option>' +
    states.map(st => `<option value="${st}">${st}</option>`).join('');
}

/**
 * Render conference completion badge cards in the sidebar.
 * Locks (grey) until all stadiums in that conference are visited.
 * Triggers CSS flip animation when newly earned.
 */
function renderBadges() {
  const container   = document.getElementById('badge-grid');
  const conferences = [...new Set(allStadiums.map(s => s.conference))].sort();

  container.innerHTML = conferences.map(conf => {
    const stadiumsInConf = allStadiums.filter(s => s.conference === conf);
    const totalInConf    = stadiumsInConf.length;
    const visitedInConf  = stadiumsInConf.filter(s => visitedIds.includes(s.id)).length;
    const earned         = visitedInConf === totalInConf;
    const meta           = CONF_META[conf] || { icon: '🏟️' };

    return `
      <div class="conf-badge-card${earned ? ' earned' : ''}" id="badge-${conf.replace(/\s+/g,'_')}">
        <div class="conf-badge-check">✓</div>
        <div class="conf-badge-icon">${meta.icon}</div>
        <div class="conf-badge-name">${conf}</div>
        <div class="conf-badge-progress">${visitedInConf}/${totalInConf}</div>
      </div>
    `;
  }).join('');
}

/**
 * Update the visit count badge in the header.
 */
function updateVisitCount() {
  const total   = allStadiums.length;
  const visited = visitedIds.length;
  document.getElementById('visit-count-badge').innerHTML =
    `${visited} <span>/ ${total} Visited</span>`;
}


/* ─────────────────────────────────────────
   8. FILTER & SORT LOGIC
───────────────────────────────────────── */

/**
 * Returns filtered + sorted array of stadiums based on current filter state.
 * Sort: visited first, then alphabetical by team name.
 */
function getFilteredStadiums() {
  let result = allStadiums.slice();

  // Conference filter (multi-select — any checked conference passes)
  if (filterConfs.length > 0) {
    result = result.filter(s => filterConfs.includes(s.conference));
  }

  // State filter
  if (filterState) {
    result = result.filter(s => s.state === filterState);
  }

  // Visit status filter
  if (filterStatus === 'visited') {
    result = result.filter(s => visitedIds.includes(s.id));
  } else if (filterStatus === 'unvisited') {
    result = result.filter(s => !visitedIds.includes(s.id));
  }

  // Sort: visited first, then alphabetical by team
  result.sort((a, b) => {
    const aVisited = visitedIds.includes(a.id);
    const bVisited = visitedIds.includes(b.id);
    if (aVisited !== bVisited) return aVisited ? -1 : 1;
    return a.team.localeCompare(b.team);
  });

  return result;
}

/** Toggle a conference in/out of the active filter set. */
function toggleConfFilter(conf, checked) {
  if (checked) {
    if (!filterConfs.includes(conf)) filterConfs.push(conf);
  } else {
    filterConfs = filterConfs.filter(c => c !== conf);
  }
  applyFilters();
}

/** Update state filter from dropdown value. */
function applyFilters() {
  filterState = document.getElementById('state-filter').value;
  refreshViews();
}

/** Set the visit status filter (all / visited / unvisited). */
function setStatusFilter(status) {
  filterStatus = status;

  // Update button active state
  document.querySelectorAll('.status-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === status);
  });

  refreshViews();
}

/**
 * Re-render grid (and update map markers) after any filter or data change.
 */
function refreshViews() {
  renderGrid();
  updateMapMarkers();
}


/* ─────────────────────────────────────────
   9. VISIT TOGGLE
───────────────────────────────────────── */

/**
 * Toggle a stadium's visited status.
 * Updates state, localStorage, UI badge, grid card, and map markers.
 */
function toggleVisit(id) {
  const stadium = allStadiums.find(s => s.id === id);
  if (!stadium) return;

  const wasVisited = visitedIds.includes(id);

  if (wasVisited) {
    visitedIds = visitedIds.filter(v => v !== id);
    showToast(`Removed: ${stadium.team}`);
  } else {
    visitedIds.push(id);
    showToast(`Visited: ${stadium.team} ✓`);
  }

  saveVisits();
  updateVisitCount();
  renderBadges();
  refreshViews();
}


/* ─────────────────────────────────────────
   10. VIEW SWITCHER
───────────────────────────────────────── */

/**
 * Switch between 'grid' and 'map' view.
 * Initializes Leaflet on first switch to map.
 * Calls invalidateSize() to fix rendering after tab reveal.
 */
function switchView(view) {
  currentView = view;

  const gridEl      = document.getElementById('grid-view');
  const mapEl       = document.getElementById('map-view');
  const btnGrid     = document.getElementById('btn-grid-view');
  const btnMap      = document.getElementById('btn-map-view');

  if (view === 'grid') {
    gridEl.style.display = '';
    mapEl.classList.remove('active');
    btnGrid.classList.add('active');
    btnMap.classList.remove('active');
  } else {
    gridEl.style.display = 'none';
    mapEl.classList.add('active');
    btnGrid.classList.remove('active');
    btnMap.classList.add('active');

    // Initialize Leaflet on first open
    if (!mapInitialized) {
      initMap();
    }

    // Fix tile rendering after element was hidden
    setTimeout(() => {
      if (leafletMap) leafletMap.invalidateSize();
    }, 100);

    // Apply current filters to map markers
    updateMapMarkers();
  }
}


/* ─────────────────────────────────────────
   11. SHARE CARD (html2canvas → PNG)
───────────────────────────────────────── */

/**
 * Build the off-screen #share-card, render it via html2canvas,
 * and trigger a PNG download.
 */
async function generateShareCard() {
  const totalVisited = visitedIds.length;
  const totalFBS     = 133;  // Full FBS count (we have 25 sample)

  // Name line
  const scName = document.getElementById('sc-name');
  scName.textContent = userName ? `${userName}'s Bucket List` : '';

  // Big count
  document.getElementById('sc-count').textContent = totalVisited;

  // Overall progress bar (based on sample 25 for visual)
  const pct = allStadiums.length > 0
    ? Math.round((totalVisited / allStadiums.length) * 100)
    : 0;
  document.getElementById('sc-progress-fill').style.width = pct + '%';

  // Conference breakdown bars
  const conferences = [...new Set(allStadiums.map(s => s.conference))].sort();
  const confGrid    = document.getElementById('sc-conf-grid');

  confGrid.innerHTML = conferences.map(conf => {
    const inConf     = allStadiums.filter(s => s.conference === conf);
    const total      = inConf.length;
    const visited    = inConf.filter(s => visitedIds.includes(s.id)).length;
    const heightPct  = total > 0 ? Math.round((visited / total) * 100) : 0;
    const meta       = CONF_META[conf] || { color: '#6B7280' };
    // Shorten conf name for the share card label
    const shortName  = conf === 'Mountain West' ? 'MW' :
                       conf === 'Independents'  ? 'Ind' :
                       conf === 'Big Ten'        ? 'B10' :
                       conf === 'Big 12'         ? 'B12' : conf;

    return `
      <div class="share-conf-col">
        <div class="share-conf-frac">${visited}/${total}</div>
        <div class="share-conf-bar-wrap">
          <div class="share-conf-bar-fill" style="height:${heightPct}%;background:rgba(255,255,255,0.85);"></div>
        </div>
        <div class="share-conf-label">${shortName}</div>
      </div>
    `;
  }).join('');

  // Render to canvas
  try {
    const card   = document.getElementById('share-card');
    const canvas = await html2canvas(card, {
      scale:           2,
      useCORS:         true,
      backgroundColor: null,
      logging:         false,
    });

    // Trigger PNG download
    const link    = document.createElement('a');
    link.download = 'my-stadium-list.png';
    link.href     = canvas.toDataURL('image/png');
    link.click();

    showToast('Share image downloaded!');
  } catch (err) {
    console.error('html2canvas error:', err);
    showToast('Could not generate image. Try again.');
  }
}


/* ─────────────────────────────────────────
   12. TOAST NOTIFICATION
───────────────────────────────────────── */

let toastTimer = null;

/**
 * Show a brief toast notification at the bottom of the screen.
 * Auto-hides after 2.5 seconds.
 */
function showToast(message) {
  const toast = document.getElementById('bs-toast');
  toast.textContent = message;
  toast.classList.add('show');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}


/* ─────────────────────────────────────────
   13. INIT
───────────────────────────────────────── */

/**
 * Main initialization — called after data loads successfully.
 */
function init() {
  // Load persisted state
  loadStorage();

  // Pre-fill name input from localStorage
  const nameInput = document.getElementById('name-input');
  if (nameInput && userName) {
    nameInput.value = localStorage.getItem(LS_NAME) || '';
  }

  // Build sidebar controls
  renderConferenceFilters();
  renderStateDropdown();

  // Render initial data
  updateVisitCount();
  renderBadges();
  renderGrid();

  // Grid is default view — ensure map panel is hidden
  document.getElementById('map-view').classList.remove('active');
}

// Kick off the app
loadData();
