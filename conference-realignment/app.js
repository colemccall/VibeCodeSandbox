/**
 * app.js — Conference Realignment Simulator
 * Main logic: state management, drag-drop, analytics, undo/redo, URL hash, tab switching.
 */

import { renderVoronoi } from './voronoi.js';
import { getPresets }    from './presets.js';

// ─────────────────────────────────────────
// MODULE-LEVEL STATE
// ─────────────────────────────────────────

/** All loaded teams (array) */
let ALL_TEAMS = [];

/** All loaded conferences (array) */
let ALL_CONFERENCES = [];

/**
 * Current realignment state.
 * conferences: { confId: [teamId, ...] }
 */
const state = {
  conferences: {},
  analytics: {
    travel: {},
    rivalries: {},
    tv_markets: {},
    balance: {},
  },
};

/** Baseline state captured at page load for delta comparisons */
let baselineState = null;

/** Undo / redo history stacks */
const history = { past: [], future: [] };
const MAX_HISTORY = 50;

/** Leaflet map instance */
let leafletMap = null;

/** Active tab: 'conferences' | 'map' */
let activeTab = 'conferences';

/** Drag state */
let draggedTeamId   = null;
let dragSourceConfId = null;

// ─────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────

async function init() {
  // Load data files
  const [teamsRes, confsRes] = await Promise.all([
    fetch('./data/teams.json'),
    fetch('./data/conferences.json'),
  ]);
  ALL_TEAMS       = await teamsRes.json();
  ALL_CONFERENCES = await confsRes.json();

  // Expose for voronoi.js tooltip helper
  window.__appConferences = ALL_CONFERENCES;

  // Build default conferences map from teams' native conference field
  const defaultConf = {};
  ALL_CONFERENCES.forEach(c => (defaultConf[c.id] = []));
  ALL_TEAMS.forEach(t => {
    if (defaultConf[t.conference] !== undefined) {
      defaultConf[t.conference].push(t.id);
    }
  });

  // Try to restore from URL hash first
  const fromHash = parseHash();
  if (fromHash) {
    state.conferences = fromHash;
  } else {
    state.conferences = deepClone(defaultConf);
  }

  // Capture baseline
  baselineState = deepClone(state.conferences);

  // Compute initial analytics
  recomputeAnalytics();

  // Render UI
  renderHeader();
  renderAnalyticsPanel();
  renderMain();

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeydown);

  // Presets dropdown close-on-outside-click
  document.addEventListener('click', (e) => {
    const dd = document.getElementById('presets-dropdown');
    const btn = document.getElementById('btn-presets');
    if (dd && !dd.contains(e.target) && e.target !== btn) {
      dd.classList.remove('open');
    }
  });
}

// ─────────────────────────────────────────
// DEEP CLONE UTILITY
// ─────────────────────────────────────────

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ─────────────────────────────────────────
// URL HASH STATE
// ─────────────────────────────────────────

/** Encode current state into URL hash */
function encodeHash(conferences) {
  // Format: #v1:sec=alabama,georgia|big-ten=ohio-state,michigan
  const parts = Object.entries(conferences)
    .filter(([, teams]) => teams.length > 0)
    .map(([confId, teams]) => `${confId}=${teams.join(',')}`)
    .join('|');
  return '#v1:' + parts;
}

/** Parse URL hash back to conferences map. Returns null if invalid. */
function parseHash() {
  const raw = window.location.hash;
  if (!raw || !raw.startsWith('#v1:')) return null;
  try {
    const body = raw.slice(4); // strip '#v1:'
    const conf = {};
    ALL_CONFERENCES.forEach(c => (conf[c.id] = []));
    body.split('|').forEach(segment => {
      const eq = segment.indexOf('=');
      if (eq === -1) return;
      const confId = segment.slice(0, eq);
      const teams  = segment.slice(eq + 1).split(',').filter(Boolean);
      conf[confId] = teams;
    });
    return conf;
  } catch {
    return null;
  }
}

/** Debounced hash writer */
let _hashTimer = null;
function scheduleHashUpdate() {
  clearTimeout(_hashTimer);
  _hashTimer = setTimeout(() => {
    window.location.hash = encodeHash(state.conferences);
  }, 500);
}

// ─────────────────────────────────────────
// ANALYTICS ENGINE
// ─────────────────────────────────────────

/** Haversine distance in miles between two lat/lng pairs */
function haversine(lat1, lng1, lat2, lng2) {
  const R  = 3958.8; // Earth radius miles
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Compute average pairwise distance for teams in a conference */
function avgPairwiseDist(teamIds) {
  const teams = teamIds.map(id => ALL_TEAMS.find(t => t.id === id)).filter(Boolean);
  if (teams.length < 2) return 0;
  let total = 0, count = 0;
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      total += haversine(teams[i].lat, teams[i].lng, teams[j].lat, teams[j].lng);
      count++;
    }
  }
  return count ? Math.round(total / count) : 0;
}

/** Count total rivalries across all conferences where both teams are in the same conf */
function countRivalriesPreserved(conferences) {
  // Build team->conf map
  const tc = {};
  Object.entries(conferences).forEach(([cid, ids]) => ids.forEach(id => (tc[id] = cid)));

  let preserved = 0;
  const counted = new Set();
  ALL_TEAMS.forEach(team => {
    (team.rivalries || []).forEach(rivalId => {
      const key = [team.id, rivalId].sort().join('|');
      if (!counted.has(key)) {
        counted.add(key);
        if (tc[team.id] && tc[rivalId] && tc[team.id] === tc[rivalId]) {
          preserved++;
        }
      }
    });
  });
  return preserved;
}

/** Total rivalry pairs defined in the dataset */
function countTotalRivalries() {
  const counted = new Set();
  ALL_TEAMS.forEach(team => {
    (team.rivalries || []).forEach(rivalId => {
      const key = [team.id, rivalId].sort().join('|');
      counted.add(key);
    });
  });
  return counted.size;
}

function recomputeAnalytics() {
  const confs = state.conferences;

  // ── Travel burden ──
  const travel = {};
  let totalAvg = 0, confCount = 0;
  Object.entries(confs).forEach(([cid, ids]) => {
    const d = avgPairwiseDist(ids);
    travel[cid] = d;
    if (ids.length >= 2) { totalAvg += d; confCount++; }
  });
  travel._overall = confCount ? Math.round(totalAvg / confCount) : 0;

  // ── Rivalries ──
  const preserved = countRivalriesPreserved(confs);
  const total     = countTotalRivalries();
  const rivalries = { preserved, total, pct: total ? Math.round((preserved / total) * 100) : 0 };

  // ── TV Markets ──
  const tv_markets = {};
  Object.entries(confs).forEach(([cid, ids]) => {
    const teams = ids.map(id => ALL_TEAMS.find(t => t.id === id)).filter(Boolean);
    const markets = [...new Set(teams.map(t => t.tv_market))];
    // Sort by tv_market_size ascending (best/lowest DMA rank first)
    const ranked = markets
      .map(m => {
        const team = teams.find(t => t.tv_market === m);
        return { market: m, size: team ? team.tv_market_size : 999 };
      })
      .sort((a, b) => a.size - b.size);
    tv_markets[cid] = ranked.slice(0, 5).map(r => r.market);
  });

  // ── Balance ──
  const counts = Object.values(confs).map(ids => ids.length);
  const balance = {
    counts: Object.fromEntries(Object.entries(confs).map(([cid, ids]) => [cid, ids.length])),
    avg: counts.length ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length) : 0,
    min: Math.min(...counts),
    max: Math.max(...counts),
  };

  state.analytics = { travel, rivalries, tv_markets, balance };
}

/** Debounced analytics recompute + re-render */
let _analyticsTimer = null;
function scheduleAnalytics() {
  clearTimeout(_analyticsTimer);
  _analyticsTimer = setTimeout(() => {
    recomputeAnalytics();
    renderAnalyticsPanel();
    if (activeTab === 'map' && leafletMap) {
      renderMap();
    }
  }, 100);
}

// ─────────────────────────────────────────
// DELTA HELPERS
// ─────────────────────────────────────────

/**
 * Return delta info for a numeric metric.
 * For travel: lower is better (green if decreased).
 * For rivalries: higher is better (green if increased).
 */
function deltaClass(current, baseline, lowerIsBetter = false) {
  if (current === baseline) return 'flat';
  if (lowerIsBetter) return current < baseline ? 'up' : 'down';
  return current > baseline ? 'up' : 'down';
}

function deltaSymbol(current, baseline, lowerIsBetter = false) {
  if (current === baseline) return '—';
  const diff = current - baseline;
  const arrow = diff > 0 ? '▲' : '▼';
  return `${arrow} ${Math.abs(diff)}`;
}

// ─────────────────────────────────────────
// RENDER: HEADER
// ─────────────────────────────────────────

function renderHeader() {
  const hdr = document.getElementById('app-header');
  if (!hdr) return;
  hdr.innerHTML = `
    <div class="bs-header app-realignment">
      <div class="bs-header-top">
        <div>
          <div class="bs-logo">Realignment Simulator</div>
          <div class="bs-logo-sub">Drag teams. Redraw the map. Break the internet.</div>
        </div>
        <div class="header-actions">
          <button class="btn-action" id="btn-undo" title="Undo (Ctrl+Z)">Undo ↩</button>
          <button class="btn-action btn-action--primary" id="btn-reset">Reset</button>
          <div class="presets-wrap">
            <button class="btn-action btn-action--primary" id="btn-presets">Presets ▾</button>
            <div class="presets-dropdown" id="presets-dropdown"></div>
          </div>
          <button class="btn-action btn-action--primary" id="btn-export">Export</button>
        </div>
      </div>

      <div id="ad-header" class="ad-placeholder ad-leaderboard">
        <span>Advertisement · 728×90</span>
      </div>

      <div class="bs-tabs">
        <button class="bs-tab ${activeTab === 'conferences' ? 'active' : ''}" data-tab="conferences">Conferences</button>
        <button class="bs-tab ${activeTab === 'map' ? 'active' : ''}" data-tab="map">Map</button>
      </div>
    </div>
  `;

  // Wire up header buttons
  document.getElementById('btn-reset').addEventListener('click', handleReset);
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-export').addEventListener('click', handleExport);
  document.getElementById('btn-presets').addEventListener('click', togglePresetsDropdown);
  document.querySelectorAll('.bs-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  renderPresetsDropdown();
}

function renderPresetsDropdown() {
  const dd = document.getElementById('presets-dropdown');
  if (!dd) return;
  const presets = getPresets(ALL_TEAMS, ALL_CONFERENCES);
  dd.innerHTML = presets.map(p => `
    <button class="preset-item" data-preset="${p.id}">
      <span class="preset-name">${p.name}</span>
      <span class="preset-desc">${p.description}</span>
    </button>
  `).join('');
  dd.querySelectorAll('.preset-item').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });
}

function togglePresetsDropdown() {
  const dd = document.getElementById('presets-dropdown');
  if (dd) dd.classList.toggle('open');
}

// ─────────────────────────────────────────
// RENDER: ANALYTICS PANEL
// ─────────────────────────────────────────

function renderAnalyticsPanel() {
  const panel = document.getElementById('analytics-panel');
  if (!panel) return;

  const { travel, rivalries, tv_markets, balance } = state.analytics;

  // Compute deltas vs baseline (if baseline exists)
  let travelBase = null, rivalBase = null;
  if (baselineState) {
    const bClone = deepClone(state);
    bClone.conferences = baselineState;
    // Recompute baseline analytics without clobbering current
    const bTravel = {};
    let bTotalAvg = 0, bConfCount = 0;
    Object.entries(baselineState).forEach(([cid, ids]) => {
      const d = avgPairwiseDist(ids);
      bTravel[cid] = d;
      if (ids.length >= 2) { bTotalAvg += d; bConfCount++; }
    });
    bTravel._overall = bConfCount ? Math.round(bTotalAvg / bConfCount) : 0;
    const bPres = countRivalriesPreserved(baselineState);
    travelBase  = bTravel._overall;
    rivalBase   = bPres;
  }

  const travelDeltaCls = travelBase !== null ? deltaClass(travel._overall, travelBase, true) : 'flat';
  const travelDeltaTxt = travelBase !== null ? deltaSymbol(travel._overall, travelBase, true) : '—';
  const rivalDeltaCls  = rivalBase !== null  ? deltaClass(rivalries.preserved, rivalBase, false) : 'flat';
  const rivalDeltaTxt  = rivalBase !== null  ? deltaSymbol(rivalries.preserved, rivalBase, false) : '—';

  // Build per-conference balance rows
  const balanceRows = ALL_CONFERENCES.map(c => {
    const count = balance.counts[c.id] || 0;
    const warn  = count < 8 || count > 20;
    return `<div class="balance-row ${warn ? 'balance-warn' : ''}">
      <span class="balance-conf" style="color:${c.color}">${c.name}</span>
      <span class="balance-count">${count} teams ${warn ? '⚠' : ''}</span>
    </div>`;
  }).join('');

  // Build top TV markets (aggregate across all conferences)
  const allMarkets = Object.values(tv_markets).flat();
  const uniqueMarkets = [...new Set(allMarkets)];
  const topMarketsStr = uniqueMarkets.slice(0, 5).join(', ') || '—';

  panel.innerHTML = `
    <div class="analytics-header">
      <span class="bs-display-sm">Analytics</span>
    </div>

    <div class="bs-analytics-grid">
      <div class="bs-analytic">
        <div class="bs-analytic-label">Avg Travel</div>
        <div class="bs-analytic-value">${travel._overall.toLocaleString()}</div>
        <div class="bs-analytic-sub">miles per conf</div>
        <div class="bs-analytic-delta ${travelDeltaCls}">${travelDeltaTxt}</div>
      </div>
      <div class="bs-analytic">
        <div class="bs-analytic-label">Rivalries</div>
        <div class="bs-analytic-value">${rivalries.preserved}/${rivalries.total}</div>
        <div class="bs-analytic-sub">${rivalries.pct}% preserved</div>
        <div class="bs-analytic-delta ${rivalDeltaCls}">${rivalDeltaTxt}</div>
      </div>
      <div class="bs-analytic">
        <div class="bs-analytic-label">Balance</div>
        <div class="bs-analytic-value">${balance.avg}</div>
        <div class="bs-analytic-sub">avg teams</div>
        <div class="bs-analytic-delta flat">min ${balance.min} · max ${balance.max}</div>
      </div>
      <div class="bs-analytic">
        <div class="bs-analytic-label">Top Markets</div>
        <div class="bs-analytic-value" style="font-size:13px;line-height:1.3;">${topMarketsStr}</div>
        <div class="bs-analytic-sub">by DMA rank</div>
        <div class="bs-analytic-delta flat">&nbsp;</div>
      </div>
    </div>

    <div class="analytics-section">
      <div class="analytics-section-title">Conference Balance</div>
      ${balanceRows}
    </div>

    <div class="analytics-section">
      <div class="analytics-section-title">Travel Burden</div>
      ${ALL_CONFERENCES.map(c => `
        <div class="travel-row">
          <span class="travel-conf" style="color:${c.color}">${c.name}</span>
          <span class="travel-val">${(travel[c.id] || 0).toLocaleString()} mi</span>
        </div>
      `).join('')}
    </div>

    <div class="analytics-section">
      <div class="analytics-section-title">Top TV Markets by Conf</div>
      ${ALL_CONFERENCES.map(c => `
        <div class="market-row">
          <span class="market-conf" style="color:${c.color}">${c.name}</span>
          <span class="market-val">${(tv_markets[c.id] || []).join(', ') || '—'}</span>
        </div>
      `).join('')}
    </div>

    <div id="ad-sidebar" class="ad-placeholder ad-sidebar">
      <span>Advertisement · 300×250</span>
    </div>
  `;
}

// ─────────────────────────────────────────
// RENDER: MAIN (tab content)
// ─────────────────────────────────────────

function renderMain() {
  const main = document.getElementById('main-content');
  if (!main) return;

  if (activeTab === 'conferences') {
    renderConferencesTab(main);
  } else {
    renderMapTab(main);
  }
}

// ─────────────────────────────────────────
// RENDER: CONFERENCES TAB (drag-drop board)
// ─────────────────────────────────────────

function renderConferencesTab(container) {
  // Build lookup: id -> team object
  const teamMap = {};
  ALL_TEAMS.forEach(t => (teamMap[t.id] = t));

  // Collect custom conferences (not in ALL_CONFERENCES)
  const knownIds = new Set(ALL_CONFERENCES.map(c => c.id));
  const customConfs = Object.keys(state.conferences)
    .filter(id => !knownIds.has(id))
    .map(id => ({ id, name: id, full_name: id, color: '#888888', tier: 2 }));

  const allConfs = [...ALL_CONFERENCES, ...customConfs];

  const html = `
    <div class="conf-board" id="conf-board">
      ${allConfs.map(conf => renderConferenceColumn(conf, state.conferences[conf.id] || [], teamMap)).join('')}
      <div class="conf-column conf-column--add">
        <button class="btn-add-conf" id="btn-add-conf">+ New Conference</button>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Wire drag-drop on newly rendered elements
  bindDragDrop();

  // Wire delete column buttons
  container.querySelectorAll('.btn-delete-col').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteConference(btn.dataset.conf));
  });

  // Wire add conference button
  const addBtn = document.getElementById('btn-add-conf');
  if (addBtn) addBtn.addEventListener('click', handleAddConference);
}

function renderConferenceColumn(conf, teamIds, teamMap) {
  const confObj = ALL_CONFERENCES.find(c => c.id === conf.id) || conf;
  const teams   = teamIds.map(id => teamMap[id]).filter(Boolean);

  return `
    <div class="conf-column"
         data-conf-id="${conf.id}"
         id="col-${conf.id}">
      <div class="conf-col-header" style="border-top: 3px solid ${confObj.color || conf.color || '#888'}">
        <div class="conf-col-title">
          <span class="conf-col-name">${conf.full_name || conf.name}</span>
          <span class="conf-col-badge">${teams.length}</span>
        </div>
        <button class="btn-delete-col" data-conf="${conf.id}" title="Remove conference">×</button>
      </div>
      <div class="conf-col-body droptarget" data-conf-id="${conf.id}">
        ${teams.map(team => renderTeamCard(team, conf.id)).join('')}
      </div>
    </div>
  `;
}

function renderTeamCard(team, confId) {
  return `
    <div class="team-card"
         draggable="true"
         data-team-id="${team.id}"
         data-conf-id="${confId}"
         title="${team.name} · ${team.city}, ${team.state}">
      <div class="team-card-swatch" style="background:${team.primary_color}"></div>
      <div class="team-card-body">
        <span class="team-card-name">${team.name}</span>
        <span class="team-card-meta">${team.city}, ${team.state}</span>
      </div>
      <span class="team-card-short" style="color:${team.primary_color}">${team.short}</span>
    </div>
  `;
}

// ─────────────────────────────────────────
// DRAG AND DROP (HTML5 Drag API)
// ─────────────────────────────────────────

function bindDragDrop() {
  // Team cards — draggable
  document.querySelectorAll('.team-card[draggable]').forEach(card => {
    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragend', onDragEnd);
  });

  // Drop targets — conference columns
  document.querySelectorAll('.droptarget').forEach(target => {
    target.addEventListener('dragover', onDragOver);
    target.addEventListener('dragleave', onDragLeave);
    target.addEventListener('drop', onDrop);
  });
}

function onDragStart(e) {
  draggedTeamId   = e.currentTarget.dataset.teamId;
  dragSourceConfId = e.currentTarget.dataset.confId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedTeamId);
  e.currentTarget.classList.add('dragging');
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.droptarget').forEach(el => el.classList.remove('drag-over'));
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function onDragLeave(e) {
  // Only remove if leaving the target itself (not entering a child)
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drag-over');
  }
}

function onDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  const targetConfId = e.currentTarget.dataset.confId;
  if (!draggedTeamId || !targetConfId) return;
  if (targetConfId === dragSourceConfId) return; // same column, no-op

  // Push history before mutation
  pushHistory();

  // Remove from source
  const src = state.conferences[dragSourceConfId];
  if (src) {
    state.conferences[dragSourceConfId] = src.filter(id => id !== draggedTeamId);
  }

  // Add to target
  if (!state.conferences[targetConfId]) state.conferences[targetConfId] = [];
  state.conferences[targetConfId].push(draggedTeamId);

  draggedTeamId   = null;
  dragSourceConfId = null;

  // Update analytics + hash
  scheduleAnalytics();
  scheduleHashUpdate();

  // Re-render board
  renderMain();
}

// ─────────────────────────────────────────
// CONFERENCE MANAGEMENT
// ─────────────────────────────────────────

function handleAddConference() {
  const name = window.prompt('Enter new conference name:');
  if (!name || !name.trim()) return;
  const id = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!id) return;
  if (state.conferences[id] !== undefined) {
    alert(`A conference with id "${id}" already exists.`);
    return;
  }
  pushHistory();
  state.conferences[id] = [];
  renderMain();
  scheduleHashUpdate();
}

function handleDeleteConference(confId) {
  const teams = state.conferences[confId] || [];
  if (teams.length > 0) {
    alert(`Cannot remove "${confId}" — move all ${teams.length} team(s) out first.`);
    return;
  }
  if (!confirm(`Remove conference "${confId}"?`)) return;
  pushHistory();
  delete state.conferences[confId];
  renderMain();
  scheduleHashUpdate();
}

// ─────────────────────────────────────────
// RENDER: MAP TAB
// ─────────────────────────────────────────

function renderMapTab(container) {
  container.innerHTML = `<div id="leaflet-map" style="width:100%;height:600px;"></div>`;
  // Init map after DOM is ready
  requestAnimationFrame(() => initMap());
}

function initMap() {
  if (typeof L === 'undefined') {
    console.warn('Leaflet not loaded yet');
    return;
  }
  const mapEl = document.getElementById('leaflet-map');
  if (!mapEl) return;

  // Destroy previous instance if any
  if (leafletMap) {
    leafletMap.remove();
    leafletMap = null;
  }

  leafletMap = L.map('leaflet-map', {
    center: [38.5, -96.5],
    zoom: 4,
    zoomSnap: 0.5,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
  }).addTo(leafletMap);

  renderMap();
}

function renderMap() {
  if (!leafletMap) return;

  // Build conference colors map
  const confColors = {};
  ALL_CONFERENCES.forEach(c => (confColors[c.id] = c.color));
  // Custom conferences get a generated color
  Object.keys(state.conferences).forEach(id => {
    if (!confColors[id]) confColors[id] = hashColor(id);
  });

  renderVoronoi(ALL_TEAMS, confColors, leafletMap, state);
}

/** Simple deterministic color from a string */
function hashColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${((hash >>> 0) % 360)}, 55%, 40%)`;
}

// ─────────────────────────────────────────
// TAB SWITCHING
// ─────────────────────────────────────────

function switchTab(tab) {
  activeTab = tab;
  // Update tab buttons
  document.querySelectorAll('.bs-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  renderMain();
}

// ─────────────────────────────────────────
// UNDO / REDO
// ─────────────────────────────────────────

function pushHistory() {
  history.past.push(deepClone(state.conferences));
  if (history.past.length > MAX_HISTORY) history.past.shift();
  history.future = []; // clear redo stack on new action
}

function undo() {
  if (!history.past.length) return;
  history.future.push(deepClone(state.conferences));
  state.conferences = history.past.pop();
  afterHistoryChange();
}

function redo() {
  if (!history.future.length) return;
  history.past.push(deepClone(state.conferences));
  state.conferences = history.future.pop();
  afterHistoryChange();
}

function afterHistoryChange() {
  recomputeAnalytics();
  renderAnalyticsPanel();
  renderMain();
  scheduleHashUpdate();
}

// ─────────────────────────────────────────
// RESET
// ─────────────────────────────────────────

function handleReset() {
  if (!confirm('Reset all teams to the default 2026 alignment? This will clear your undo history.')) return;
  history.past   = [];
  history.future = [];

  const defaultConf = {};
  ALL_CONFERENCES.forEach(c => (defaultConf[c.id] = []));
  ALL_TEAMS.forEach(t => {
    if (defaultConf[t.conference] !== undefined) {
      defaultConf[t.conference].push(t.id);
    }
  });

  state.conferences = deepClone(defaultConf);
  baselineState     = deepClone(defaultConf);

  recomputeAnalytics();
  renderAnalyticsPanel();
  renderMain();
  scheduleHashUpdate();
}

// ─────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────

async function handleExport() {
  // Copy URL to clipboard
  const url = window.location.href.split('#')[0] + encodeHash(state.conferences);
  try {
    await navigator.clipboard.writeText(url);
    showToast('URL copied to clipboard!');
  } catch {
    // fallback
    window.prompt('Copy this URL:', url);
  }

  // html2canvas screenshot
  if (typeof html2canvas !== 'undefined') {
    try {
      const canvas = await html2canvas(document.body, { useCORS: true });
      const a = document.createElement('a');
      a.download = 'realignment.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    } catch (err) {
      console.warn('html2canvas failed:', err);
    }
  }
}

// ─────────────────────────────────────────
// PRESETS
// ─────────────────────────────────────────

function applyPreset(presetId) {
  const presets = getPresets(ALL_TEAMS, ALL_CONFERENCES);
  const preset  = presets.find(p => p.id === presetId);
  if (!preset) return;

  pushHistory();
  const newConf = preset.getConferences();

  // Ensure all default conferences exist in newConf
  ALL_CONFERENCES.forEach(c => {
    if (!newConf[c.id]) newConf[c.id] = [];
  });

  state.conferences = newConf;

  // Close dropdown
  const dd = document.getElementById('presets-dropdown');
  if (dd) dd.classList.remove('open');

  recomputeAnalytics();
  renderAnalyticsPanel();
  renderMain();
  scheduleHashUpdate();
}

// ─────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ─────────────────────────────────────────

function handleKeydown(e) {
  if (e.ctrlKey && e.key === 'z') {
    e.preventDefault();
    undo();
  } else if (e.ctrlKey && e.key === 'y') {
    e.preventDefault();
    redo();
  }
}

// ─────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────

function showToast(msg, duration = 2500) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'bs-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// ─────────────────────────────────────────
// KICK OFF
// ─────────────────────────────────────────

init().catch(console.error);
