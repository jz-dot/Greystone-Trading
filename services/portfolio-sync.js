/* ============================================
   GSP TRADING - PORTFOLIO CLOUD SYNC (pure logic)

   Decides which copy of the portfolio wins when a signed-in user's
   local (localStorage) and cloud (Supabase) copies differ. The rules
   are deliberately conservative: when we cannot prove the local copy
   is newer, the account copy wins, and the local copy is snapshotted
   first so nothing is ever silently destroyed.

   This module is pure (no network, no storage, no Date.now) so the
   decision table is unit-testable. app.js supplies the timestamps and
   performs the actual reads/writes.
   ============================================ */

'use strict';

const PortfolioSync = (function () {

  function parseTs(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) return v;
    const t = Date.parse(v);
    return isFinite(t) ? t : null;
  }

  function hasContent(doc) {
    if (!doc || typeof doc !== 'object') return false;
    const pos = doc.positions;
    const realized = doc.realized;
    const activity = doc.activity;
    return (Array.isArray(pos) && pos.length > 0) ||
           (Array.isArray(realized) && realized.length > 0) ||
           (Array.isArray(activity) && activity.length > 0);
  }

  /*
   * decide(local, remote) -> { action, backupLocal, reason }
   *   local:  { savedAt, hasData }  the browser copy
   *   remote: { savedAt, hasData }  the account copy
   *
   * Actions:
   *   'none' - nothing to do (both empty, or copies provably in step)
   *   'push' - local wins, upload it
   *   'pull' - account wins, replace local (backupLocal says whether to
   *            snapshot the local copy first; true whenever local had data)
   *
   * The asymmetry is intentional: an untimestamped local copy loses to an
   * existing account copy (the account is the cross-device source of truth),
   * but it is snapshotted before being replaced.
   */
  function decide(local, remote) {
    local = local || {};
    remote = remote || {};
    const localTs = parseTs(local.savedAt);
    const remoteTs = parseTs(remote.savedAt);
    const localHas = !!local.hasData;
    const remoteHas = !!remote.hasData;

    if (!localHas && !remoteHas) {
      return { action: 'none', backupLocal: false, reason: 'both empty' };
    }
    if (localHas && !remoteHas) {
      return { action: 'push', backupLocal: false, reason: 'no account copy yet' };
    }
    if (!localHas && remoteHas) {
      return { action: 'pull', backupLocal: false, reason: 'local empty, account has data' };
    }

    // Both sides have data.
    if (localTs === null) {
      // Legacy local copy that predates sync metadata: account wins, but
      // never without a snapshot of what was local.
      return { action: 'pull', backupLocal: true, reason: 'local copy has no sync timestamp; account is source of truth' };
    }
    if (remoteTs === null) {
      return { action: 'push', backupLocal: false, reason: 'account copy has no timestamp; local is newer by construction' };
    }
    if (remoteTs > localTs) {
      return { action: 'pull', backupLocal: true, reason: 'account copy is newer' };
    }
    if (localTs > remoteTs) {
      return { action: 'push', backupLocal: false, reason: 'local copy is newer' };
    }
    return { action: 'none', backupLocal: false, reason: 'copies in step' };
  }

  // Assemble the cloud document from the tracker's storage slices.
  function buildDoc(positions, realized, activity, savedAtISO) {
    return {
      version: 1,
      savedAt: savedAtISO,
      positions: Array.isArray(positions) ? positions : [],
      realized: Array.isArray(realized) ? realized : [],
      activity: Array.isArray(activity) ? activity : [],
    };
  }

  // Validate a document fetched from the cloud before applying it locally.
  function isValidDoc(doc) {
    return !!(doc && typeof doc === 'object' && !Array.isArray(doc) &&
      Array.isArray(doc.positions) && Array.isArray(doc.realized) &&
      Array.isArray(doc.activity));
  }

  return {
    decide: decide,
    buildDoc: buildDoc,
    isValidDoc: isValidDoc,
    hasContent: hasContent,
    parseTs: parseTs,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PortfolioSync;
} else if (typeof window !== 'undefined') {
  window.PortfolioSync = PortfolioSync;
}
