/**
 * Belastbarkeit des Ergebnisses. Reine Funktionen.
 * Prüft, ob Platz 1 stabil ist, wenn ein Gewicht oder eine einzelne Bewertung leicht abweicht.
 */
import { calc, rank } from './calc.js';

/** Alleiniger Spitzenreiter (nur Produkte im Rennen): { index } oder { tie:true } oder { index:null }. */
function leader(res) {
  let best = -1, bestT = -Infinity, tie = false;
  res.totals.forEach((t, j) => {
    if (res.eliminated[j]) return;
    if (t > bestT) { bestT = t; best = j; tie = false; }
    else if (t === bestT) tie = true;
  });
  if (best < 0) return { index: null, tie: false };
  return tie ? { index: -1, tie: true } : { index: best, tie: false };
}

const score = (r, j) => (r.scores[j] === null || r.scores[j] === undefined ? 0 : r.scores[j]);

/**
 * -> { ok:false } bei zu wenig Daten, sonst
 * { ok:true, verdict:'dominant'|'stable'|'fragile'|'tie', winner, runnerUp, tied, gap, gapPct,
 *   weightFlips, scoreFlips, missing, koOpen }
 * weightFlips: ein Gewicht allein ändert Platz 1. scoreFlips: ein Punkt mehr oder weniger bei einem bewerteten Feld.
 */
export function sensitivity(rows, cols) {
  const n = cols.length;
  const base = calc(rows, n);
  const ranked = rank(cols, base).filter((o) => !o.eliminated);
  if (!rows.length || ranked.length < 2) return { ok: false };
  const W = ranked[0], R = ranked[1];
  const common = { ok: true, winner: W.name, runnerUp: R.name, missing: base.missing, koOpen: base.koOpen, weightFlips: [], scoreFlips: [] };
  if (W.total === R.total) {
    return { ...common, verdict: 'tie', tied: ranked.filter((o) => o.total === W.total).map((o) => o.name), gap: 0, gapPct: 0 };
  }
  const gap = W.total - R.total;
  const gapPct = base.max ? Math.round((gap / base.max) * 100) : 0;
  const race = ranked.map((o) => o.index);
  const dominant = rows.every((r) => race.every((k) => k === W.index || score(r, W.index) >= score(r, k)));

  const flipInfo = (res) => {
    const l = leader(res);
    if (l.index === W.index) return null;
    return { newLeader: l.tie ? null : cols[l.index] };
  };

  const weightFlips = [];
  rows.forEach((row, i) => {
    for (let w = 1; w <= 5; w++) {
      if (w === row.weight) continue;
      const f = flipInfo(calc(rows.map((r, k) => (k === i ? { ...r, weight: w } : r)), n));
      if (f) weightFlips.push({ row: i, rowName: row.name, from: row.weight, to: w, delta: Math.abs(w - row.weight), ...f });
    }
  });
  weightFlips.sort((a, b) => a.delta - b.delta || rows[b.row].weight - rows[a.row].weight);

  const scoreFlips = [];
  rows.forEach((row, i) => {
    cols.forEach((product, j) => {
      const cur = row.scores[j];
      if (cur === null || cur === undefined) return;
      for (const d of [-1, 1]) {
        const nv = cur + d;
        if (nv < 0 || nv > 5) continue;
        const variant = rows.map((r, k) => (k === i ? { ...r, scores: r.scores.map((s, m) => (m === j ? nv : s)) } : r));
        const f = flipInfo(calc(variant, n));
        if (f) scoreFlips.push({ row: i, rowName: row.name, product, delta: d, ...f });
      }
    });
  });
  scoreFlips.sort((a, b) => rows[b.row].weight - rows[a.row].weight);

  const fragile = scoreFlips.length > 0 || weightFlips.some((f) => f.delta <= 1);
  const verdict = dominant ? 'dominant' : fragile ? 'fragile' : 'stable';
  return { ...common, verdict, gap, gapPct, weightFlips, scoreFlips };
}

/** Aufbereitung für UI und Export. t = strings.sens. -> { headline, details[] } */
export function sensitivityLines(s, t) {
  if (!s.ok) return { headline: t.noData, details: [] };
  const headline =
    s.verdict === 'tie' ? t.tie(s.tied)
    : s.verdict === 'dominant' ? t.dominant(s.winner)
    : s.verdict === 'stable' ? t.stable(s.winner, s.runnerUp, s.gap, s.gapPct)
    : t.fragile(s.winner, s.runnerUp, s.gap, s.gapPct);
  const details = [];
  s.weightFlips.slice(0, 3).forEach((f) => details.push(t.weightFlip(f.rowName, f.from, f.to, f.newLeader)));
  s.scoreFlips.slice(0, 2).forEach((f) => details.push(t.scoreFlip(f.product, f.rowName, f.delta, f.newLeader)));
  if (s.missing > 0) details.push(t.missingNote(s.missing));
  if (s.koOpen > 0) details.push(t.koOpenNote(s.koOpen));
  return { headline, details };
}
