/**
 * presets.js — Conference Realignment Simulator
 * Four preset alignment objects exported as window.PRESETS.
 *
 * Each preset has: { id, name, description, conferences }
 * conferences: { confId: [teamId, ...] }
 */

window.PRESETS = {

  /**
   * current2026 — exact mirror of teams.json default conferences
   */
  current2026: {
    id: 'current-2026',
    name: 'Current 2026',
    description: 'Default alignment as of the 2026 season',
    conferences: {
      'sec':           ['alabama', 'georgia', 'tennessee', 'lsu', 'florida'],
      'big-ten':       ['ohio-state', 'michigan', 'penn-state', 'oregon', 'usc'],
      'big-12':        ['texas', 'oklahoma', 'kansas-state', 'tcu', 'baylor'],
      'mountain-west': ['boise-state', 'fresno-state', 'utah-state', 'unlv', 'colorado-state']
    }
  },

  /**
   * superConferences — 4 conferences of 5 teams, split roughly geo
   * West  → mountain-west: boise-state, fresno-state, utah-state, unlv, colorado-state
   * West Coast + Midwest → big-ten: oregon, usc, ohio-state, michigan, penn-state
   * South → big-12: texas, oklahoma, tcu, baylor, kansas-state
   * Southeast → sec: alabama, georgia, tennessee, florida, lsu
   */
  superConferences: {
    id: 'super-conferences',
    name: 'Super Conferences',
    description: '4 geo-aligned mega-conferences of 5 teams each',
    conferences: {
      'sec':           ['alabama', 'georgia', 'tennessee', 'florida', 'lsu'],
      'big-ten':       ['ohio-state', 'michigan', 'penn-state', 'oregon', 'usc'],
      'big-12':        ['texas', 'oklahoma', 'tcu', 'baylor', 'kansas-state'],
      'mountain-west': ['boise-state', 'fresno-state', 'utah-state', 'unlv', 'colorado-state']
    }
  },

  /**
   * restoreTraditions — maximize rivalries kept within the same conference
   * Rivalry pairs from spec:
   *   alabama↔georgia, alabama↔tennessee, georgia↔florida
   *   ohio-state↔michigan, ohio-state↔penn-state, michigan↔penn-state
   *   texas↔oklahoma, texas↔tcu, oklahoma↔kansas-state
   *   boise-state↔fresno-state, boise-state↔utah-state, fresno-state↔unlv
   */
  restoreTraditions: {
    id: 'restore-traditions',
    name: 'Restore Traditions',
    description: 'Maximize historic rivalry games within same conference',
    conferences: {
      'sec':           ['alabama', 'georgia', 'tennessee', 'florida', 'lsu'],
      'big-ten':       ['ohio-state', 'michigan', 'penn-state', 'oregon', 'usc'],
      'big-12':        ['texas', 'oklahoma', 'tcu', 'kansas-state', 'baylor'],
      'mountain-west': ['boise-state', 'fresno-state', 'utah-state', 'unlv', 'colorado-state']
    }
  },

  /**
   * tvExecMode — round-robin by tv_market_size ascending (best markets first)
   * Sorted order (tv_market_size): usc(2), tcu(5), georgia(8), michigan(11),
   *   colorado-state(17), oregon(22), utah-state(31), ohio-state(32), texas(38),
   *   alabama(40), penn-state(40), unlv(40), oklahoma(44), florida(47), lsu(52),
   *   fresno-state(55), tennessee(61), kansas-state(65), baylor(94), boise-state(112)
   * Assigned round-robin across [sec, big-ten, big-12, mountain-west]:
   *   pos 1,5,9,13,17 → sec
   *   pos 2,6,10,14,18 → big-ten
   *   pos 3,7,11,15,19 → big-12
   *   pos 4,8,12,16,20 → mountain-west
   */
  tvExecMode: {
    id: 'tv-exec-mode',
    name: 'TV Exec Mode',
    description: 'Biggest TV markets spread evenly — round-robin by market rank',
    conferences: {
      'sec':           ['usc', 'colorado-state', 'texas', 'oklahoma', 'tennessee'],
      'big-ten':       ['tcu', 'oregon', 'alabama', 'florida', 'kansas-state'],
      'big-12':        ['georgia', 'utah-state', 'penn-state', 'lsu', 'baylor'],
      'mountain-west': ['michigan', 'ohio-state', 'unlv', 'fresno-state', 'boise-state']
    }
  }

};
