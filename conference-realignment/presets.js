/**
 * presets.js — Conference Realignment Simulator
 * Four preset alignment objects for quick loading.
 */

/**
 * Build a TV Exec Mode assignment:
 * Sort teams by tv_market_size ascending (best markets first),
 * then assign round-robin across conferences to maximize top markets per conf.
 * @param {Array} teams
 * @param {Array} conferenceIds
 * @returns {Object} conferences map { confId: [teamId, ...] }
 */
function buildTVExecMode(teams, conferenceIds) {
  const sorted = [...teams].sort((a, b) => a.tv_market_size - b.tv_market_size);
  const conf = {};
  conferenceIds.forEach(id => (conf[id] = []));
  sorted.forEach((team, i) => {
    conf[conferenceIds[i % conferenceIds.length]].push(team.id);
  });
  return conf;
}

/**
 * Build Restore Traditions:
 * Maximize rivalries kept within the same conference.
 * Uses a greedy approach: for each team, pick conference where most of its rivals already sit.
 */
function buildRestoreTraditions(teams, conferenceIds) {
  const conf = {};
  conferenceIds.forEach(id => (conf[id] = []));

  // Build rivalry map
  const rivalMap = {};
  teams.forEach(t => {
    rivalMap[t.id] = t.rivalries || [];
  });

  // Assign teams — each to the conf that maximizes rival co-placement so far
  // Seed with original assignments first
  const order = [...teams].sort((a, b) => (b.rivalries?.length || 0) - (a.rivalries?.length || 0));
  const assigned = {};

  order.forEach(team => {
    // Count how many rivals are in each conf already
    const scores = {};
    conferenceIds.forEach(id => (scores[id] = 0));
    (rivalMap[team.id] || []).forEach(rId => {
      if (assigned[rId]) scores[assigned[rId]] += 2;
    });

    // Find least-populated conf among tied leaders, to also maintain balance
    const max = Math.max(...Object.values(scores));
    const candidates = conferenceIds.filter(id => scores[id] === max);
    const pick = candidates.sort((a, b) => conf[a].length - conf[b].length)[0];

    conf[pick].push(team.id);
    assigned[team.id] = pick;
  });

  return conf;
}

/**
 * Export PRESETS array — loaded by app.js.
 * Each preset: { id, name, description, getConferences(teams, conferences) }
 */
export function getPresets(teams, conferences) {
  const confIds = conferences.map(c => c.id);

  return [
    {
      id: 'current-2026',
      name: 'Current 2026',
      description: 'Default alignment as of the 2026 season',
      getConferences() {
        // Restore exact original alignment from teams data
        const conf = {};
        confIds.forEach(id => (conf[id] = []));
        teams.forEach(t => {
          if (conf[t.conference] !== undefined) {
            conf[t.conference].push(t.id);
          }
        });
        return conf;
      },
    },
    {
      id: 'super-conferences',
      name: 'Super Conferences',
      description: '4 mega-conferences of 5 teams each',
      getConferences() {
        // Divide teams into geographic quadrants -> one per conf
        const conf = {};
        confIds.forEach(id => (conf[id] = []));

        // Sort by longitude (west to east), split into 4 bands
        const sorted = [...teams].sort((a, b) => a.lng - b.lng);
        sorted.forEach((team, i) => {
          const bucket = Math.floor(i / 5); // 5 teams per conf
          conf[confIds[Math.min(bucket, confIds.length - 1)]].push(team.id);
        });
        return conf;
      },
    },
    {
      id: 'restore-traditions',
      name: 'Restore Traditions',
      description: 'Maximize historic rivalry games within same conference',
      getConferences() {
        return buildRestoreTraditions(teams, confIds);
      },
    },
    {
      id: 'tv-exec-mode',
      name: 'TV Exec Mode',
      description: 'Greedy round-robin by TV market size — biggest markets spread evenly',
      getConferences() {
        return buildTVExecMode(teams, confIds);
      },
    },
  ];
}
