/**
 * voronoi.js — Conference Realignment Simulator
 * Renders a D3 Voronoi overlay on a Leaflet map.
 * Exports renderVoronoi(teams, conferenceColors, map).
 */

// Import D3 Voronoi via ESM — d3 must be available as window.d3 or imported
// We reference the global `d3` object injected by the CDN script tag.

const VORONOI_PANE_ID = 'voronoi-svg-overlay';

// Module-level move handler so we can properly remove + re-add it
let _currentMapMoveHandler = null;

/**
 * renderVoronoi
 * @param {Array}  teams            — full teams array (with lat, lng, id, name, conference)
 * @param {Object} conferenceColors — { confId: hexColor }
 * @param {Object} leafletMap       — Leaflet map instance
 * @param {Object} state            — current state (state.conferences)
 */
export function renderVoronoi(teams, conferenceColors, leafletMap, state) {
  if (!leafletMap) return;
  if (typeof d3 === 'undefined') {
    console.warn('voronoi.js: d3 not available yet');
    return;
  }

  // Build reverse lookup: teamId -> conferenceId
  const teamConf = {};
  Object.entries(state.conferences).forEach(([confId, teamIds]) => {
    teamIds.forEach(id => (teamConf[id] = confId));
  });

  // --- SVG overlay ---
  // Use Leaflet's overlay pane for crisp re-rendering
  const mapContainer = leafletMap.getContainer();
  let svg = mapContainer.querySelector(`#${VORONOI_PANE_ID}`);
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = VORONOI_PANE_ID;
    svg.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 400;
    `;
    // Insert into Leaflet's overlayPane
    const pane = leafletMap.getPanes().overlayPane;
    pane.appendChild(svg);
  }

  // Clear previous render
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  // Helper: project lat/lng to pixel (relative to map top-left)
  function project(lat, lng) {
    const pt = leafletMap.latLngToContainerPoint([lat, lng]);
    return [pt.x, pt.y];
  }

  const size = leafletMap.getSize();
  svg.setAttribute('width', size.x);
  svg.setAttribute('height', size.y);

  // Build points array
  const points = teams
    .filter(t => teamConf[t.id]) // only assigned teams
    .map(t => {
      const [x, y] = project(t.lat, t.lng);
      return { x, y, team: t, confId: teamConf[t.id] };
    });

  if (points.length < 2) return;

  // D3 Voronoi
  const delaunay = d3.Delaunay.from(points, d => d.x, d => d.y);
  const voronoi  = delaunay.voronoi([0, 0, size.x, size.y]);

  // Draw cells
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  svg.appendChild(defs);

  points.forEach((pt, i) => {
    const cellPath = voronoi.renderCell(i);
    if (!cellPath) return;

    const color = conferenceColors[pt.confId] || '#888888';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', cellPath);
    path.setAttribute('fill', color);
    path.setAttribute('fill-opacity', '0.55');
    path.setAttribute('stroke', '#ffffff');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-opacity', '0.7');
    svg.appendChild(path);
  });

  // Draw team dots + hover tooltips (pointer-events enabled)
  const dotsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  dotsGroup.style.pointerEvents = 'all';
  svg.appendChild(dotsGroup);

  // Tooltip element (HTML, positioned absolute)
  let tooltip = mapContainer.querySelector('#voronoi-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'voronoi-tooltip';
    tooltip.style.cssText = `
      position: absolute;
      background: rgba(17,17,34,0.92);
      color: #fff;
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      padding: 6px 10px;
      border-radius: 6px;
      pointer-events: none;
      z-index: 500;
      display: none;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    `;
    mapContainer.style.position = 'relative';
    mapContainer.appendChild(tooltip);
  }

  points.forEach((pt) => {
    const color = conferenceColors[pt.confId] || '#888888';
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', pt.x);
    circle.setAttribute('cy', pt.y);
    circle.setAttribute('r', '7');
    circle.setAttribute('fill', color);
    circle.setAttribute('stroke', '#ffffff');
    circle.setAttribute('stroke-width', '2');
    circle.style.cursor = 'pointer';

    // Hover events
    circle.addEventListener('mouseenter', (e) => {
      const confName = getConfName(pt.confId);
      tooltip.innerHTML = `<strong>${pt.team.name}</strong><br/>${pt.team.city}, ${pt.team.state}<br/><em>${confName}</em>`;
      tooltip.style.display = 'block';
      positionTooltip(e, tooltip, mapContainer);
    });
    circle.addEventListener('mousemove', (e) => {
      positionTooltip(e, tooltip, mapContainer);
    });
    circle.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });

    dotsGroup.appendChild(circle);

    // Team short label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', pt.x);
    label.setAttribute('y', pt.y - 10);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-family', 'Barlow Condensed, sans-serif');
    label.setAttribute('font-size', '10');
    label.setAttribute('font-weight', '700');
    label.setAttribute('fill', '#ffffff');
    label.setAttribute('stroke', 'rgba(0,0,0,0.6)');
    label.setAttribute('stroke-width', '2');
    label.setAttribute('paint-order', 'stroke');
    label.style.pointerEvents = 'none';
    label.textContent = pt.team.short;
    dotsGroup.appendChild(label);
  });

  // Re-render when map pans / zooms — remove old handler first to avoid duplicates
  if (_currentMapMoveHandler) {
    leafletMap.off('moveend', _currentMapMoveHandler);
    leafletMap.off('zoomend', _currentMapMoveHandler);
  }
  _currentMapMoveHandler = () => renderVoronoi(teams, conferenceColors, leafletMap, state);
  leafletMap.on('moveend', _currentMapMoveHandler);
  leafletMap.on('zoomend', _currentMapMoveHandler);
}

/** Position tooltip near cursor, keeping it inside container */
function positionTooltip(e, tooltip, container) {
  const rect = container.getBoundingClientRect();
  let x = e.clientX - rect.left + 14;
  let y = e.clientY - rect.top - 10;
  // Clamp to container
  x = Math.min(x, rect.width - 160);
  y = Math.max(y, 0);
  tooltip.style.left = x + 'px';
  tooltip.style.top  = y + 'px';
}

/** Look up conference display name from window.__appConferences */
function getConfName(confId) {
  const confs = window.__appConferences || [];
  const c = confs.find(c => c.id === confId);
  return c ? c.full_name : confId;
}
