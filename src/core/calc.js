/** Nutzwert-Berechnung. Reine Funktionen. */

export const MAX_SCORE = 5;

/**
 * rows: [{ weight, scores:[number|null] }], colCount: Anzahl Produkte.
 * Unbewertete Felder (null/undefined) zählen als 0 und werden in `missing` gezählt.
 */
export function calc(rows, colCount) {
  let sumW = 0;
  let missing = 0;
  const totals = Array.from({ length: colCount }, () => 0);
  for (const r of rows) {
    sumW += r.weight;
    for (let j = 0; j < colCount; j++) {
      const s = r.scores ? r.scores[j] : null;
      if (s === null || s === undefined) missing++;
      else totals[j] += r.weight * s;
    }
  }
  const max = MAX_SCORE * sumW;
  const percents = totals.map((t) => (max ? Math.round((t / max) * 100) : 0));
  return { sumW, max, totals, percents, missing };
}

/** Ranking absteigend nach Nutzwert; bei Gleichstand bleibt die Spaltenreihenfolge. */
export function rank(cols, result) {
  return cols
    .map((name, index) => ({ name, index, total: result.totals[index], percent: result.percents[index] }))
    .sort((a, b) => b.total - a.total || a.index - b.index);
}
