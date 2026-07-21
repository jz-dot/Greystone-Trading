/* ============================================
   GSP TRADING - TAX REPORT (pure logic)

   Builds Schedule 3-style disposition rows and an income summary from
   the tracker's retained ledgers. CRA view only: NON-REGISTERED
   positions, identical property POOLED across taxable accounts per
   symbol, proceeds net of commission, everything in CAD at each
   transaction's stored (transaction-date) FX rate.

   Rows whose cost basis rests on approximations (broker-average import
   or estimated FX) are flagged 'approx' so a filer knows which numbers
   need backfilled history before they are filing-grade.
   ============================================ */

'use strict';

const TaxReport = (function () {
  const acbLib = (typeof module !== 'undefined' && module.exports)
    ? require('./acb.js')
    : (typeof ACB !== 'undefined' ? ACB : null);

  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function round2(v) { return Math.round(v * 100) / 100; }
  function yearOf(dateISO) { return String(dateISO || '').slice(0, 4); }

  // 'roc' and 'reinvest' are amount-based (no shares/price). Missing the
  // reinvest case here silently dropped every reinvested-distribution ACB
  // increase, making the tax pack overstate gains vs the live view.
  function toAcbTxn(t) {
    if (t.type === 'roc' || t.type === 'reinvest') {
      return { type: t.type, date: t.date, amount: num(t.amount), fxRate: num(t.fxRate) > 0 ? num(t.fxRate) : 1 };
    }
    return {
      type: t.type, date: t.date, shares: num(t.shares), price: num(t.price),
      commission: num(t.commission), fxRate: num(t.fxRate) > 0 ? num(t.fxRate) : 1,
    };
  }

  // positions: the tracker's stored shape [{ symbol, account, currency, txns }]
  // opts: { year: 'YYYY' | null for all }
  function buildDispositions(positions, opts) {
    if (!acbLib) throw new Error('acb.js not loaded');
    opts = opts || {};
    const year = opts.year ? String(opts.year) : null;

    const taxable = (Array.isArray(positions) ? positions : [])
      .filter(p => p && (p.account || 'non-registered') === 'non-registered' && Array.isArray(p.txns) && p.txns.length);

    const bySym = {};
    taxable.forEach(p => { (bySym[p.symbol] = bySym[p.symbol] || []).push(p); });

    const rows = [];
    Object.keys(bySym).sort().forEach(sym => {
      const group = bySym[sym];
      // A disposition is "approximate" when its ACB rests on a broker-average
      // import, an estimated FX rate, OR CDS distribution factors (which the
      // user is told to verify against the fund's own tax breakdown).
      const approx = group.some(p => (p.txns || []).some(t => t.source === 'broker-import' || t.source === 'cds-import' || t.fxEstimated));
      const merged = [];
      group.forEach(p => { (p.txns || []).forEach(t => merged.push(toAcbTxn(t))); });
      const result = acbLib.computeACB(merged);
      (result.ledger || []).forEach(r => {
        if (r.type === 'sell') {
          if (year && yearOf(r.date) !== year) return;
          rows.push({
            symbol: sym, type: 'sell', date: r.date, shares: r.shares,
            proceedsCad: round2(r.proceeds), acbCad: round2(r.costBasis),
            gainCad: round2(r.capitalGain), superficialLoss: !!r.superficialLoss,
            deniedLossCad: round2(num(r.deniedLoss)), approx: approx,
          });
        } else if (r.type === 'roc' && Math.abs(num(r.capitalGain)) > 0.005) {
          if (year && yearOf(r.date) !== year) return;
          // A ROC-excess is a deemed gain with NO proceeds of disposition;
          // proceedsCad stays 0 so the Schedule 3 proceeds subtotal isn't
          // inflated. Only gainCad carries the amount.
          rows.push({
            symbol: sym, type: 'roc-excess', date: r.date, shares: 0,
            proceedsCad: 0, acbCad: 0,
            gainCad: round2(num(r.capitalGain)), superficialLoss: false,
            deniedLossCad: 0, approx: approx,
          });
        }
      });
    });
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return rows;
  }

  function summarize(rows) {
    const s = { totalProceedsCad: 0, totalAcbCad: 0, totalGainCad: 0, gainsCad: 0, lossesCad: 0, superficialCount: 0, approxCount: 0, rowCount: 0 };
    (rows || []).forEach(r => {
      s.rowCount++;
      s.totalProceedsCad += num(r.proceedsCad);
      s.totalAcbCad += num(r.acbCad);
      s.totalGainCad += num(r.gainCad);
      if (num(r.gainCad) >= 0) s.gainsCad += num(r.gainCad); else s.lossesCad += num(r.gainCad);
      if (r.superficialLoss) s.superficialCount++;
      if (r.approx) s.approxCount++;
    });
    Object.keys(s).forEach(k => { if (k.slice(-3) === 'Cad') s[k] = round2(s[k]); });
    return s;
  }

  function csvEscape(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function dispositionsToCsv(rows, opts) {
    opts = opts || {};
    const headers = ['Symbol', 'Type', 'Date of disposition', 'Shares', 'Proceeds of disposition (CAD)', 'Adjusted cost base (CAD)', 'Gain (loss) (CAD)', 'Superficial loss', 'Denied loss (CAD)', 'Notes'];
    const lines = [headers.join(',')];
    (rows || []).forEach(r => {
      lines.push([
        r.symbol,
        r.type === 'roc-excess' ? 'ROC excess over ACB' : 'Disposition',
        r.date, r.shares, r.proceedsCad.toFixed(2), r.acbCad.toFixed(2), r.gainCad.toFixed(2),
        r.superficialLoss ? 'YES (loss denied, added to rebuy ACB)' : '',
        r.deniedLossCad ? r.deniedLossCad.toFixed(2) : '',
        r.approx ? 'Approximate cost basis (imported average or estimated FX) - backfill before filing' : '',
      ].map(csvEscape).join(','));
    });
    const s = summarize(rows);
    lines.push('');
    lines.push(['TOTALS', '', '', '', s.totalProceedsCad.toFixed(2), s.totalAcbCad.toFixed(2), s.totalGainCad.toFixed(2), s.superficialCount ? (s.superficialCount + ' superficial') : '', '', 'This tracker\'s ledger only: CRA pooling spans ALL your accounts and affiliated persons. Not tax advice.'].map(csvEscape).join(','));
    return lines.join('\r\n') + '\r\n';
  }

  function incomeToCsv(entries, opts) {
    opts = opts || {};
    const year = opts.year ? String(opts.year) : null;
    const headers = ['Symbol', 'Account', 'Kind', 'Date', 'Amount', 'Currency', 'FX rate', 'Amount (CAD)'];
    const lines = [headers.join(',')];
    let total = 0;
    (entries || [])
      .filter(e => !year || yearOf(e.date) === year)
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .forEach(e => {
        total += num(e.amountCad);
        lines.push([e.symbol, e.account, e.kind, e.date, num(e.amount).toFixed(2), e.currency, e.fxRate, num(e.amountCad).toFixed(2)].map(csvEscape).join(','));
      });
    lines.push('');
    lines.push(['TOTAL', '', '', '', '', '', '', round2(total).toFixed(2)].map(csvEscape).join(','));
    return lines.join('\r\n') + '\r\n';
  }

  return {
    buildDispositions: buildDispositions,
    summarize: summarize,
    dispositionsToCsv: dispositionsToCsv,
    incomeToCsv: incomeToCsv,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TaxReport;
} else if (typeof window !== 'undefined') {
  window.TaxReport = TaxReport;
}
