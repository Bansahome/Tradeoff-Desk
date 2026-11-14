/** Nutzwert-Berechnung inkl. K.-o.-Kriterien. Reine Funktionen. */

export const MAX_SCORE = 5;

/**
 * rows: [{ weight, scores:[number|null], ko?, koMin? }], colCount: Anzahl Produkte.
 * Unbewertete Felder (null/undefined) zählen als 0 und werden in `missing` gezählt.
 * K.-o.: Hat eine Zeile `ko`, scheidet ein Produkt mit weniger als `koMin` Punkten (Standard 1) aus.
 * Offene K.-o.-Felder (noch unbewertet) scheiden nicht aus, werden aber gezählt (`koOpen`, `koOpenBy`).
 * Ausgeschiedene Produkte behalten ihren Nutzwert, sie stehen nur nicht mehr im Rennen.
 */
export function calc(rows, colCount) {
  let sumW = 0;
  let missing = 0;
  let koOpen = 0;
  const totals = Array.from({ length: colCount }, () => 0);
  const eliminated = Array.from({ length: colCount }, () => false);
  const reasons = Array.from({ length: colCount }, () => []);
  const koOpenBy = Array.from({ length: colCount }, () => 0);
  for (const r of rows) {
    sumW += r.weight;
    const min = r.koMin || 1;
    for (let j = 0; j < colCount; j++) {
      const s = r.scores ? r.scores[j] : null;
      const unrated = s === null || s === undefined;
      if (unrated) missing++;
      else totals[j] += r.weight * s;
      if (r.ko) {
        if (unrated) { koOpen++; koOpenBy[j]++; }
        else if (s < min) { eliminated[j] = true; reasons[j].push(r.name); }
      }
    }
  }
  const max = MAX_SCORE * sumW;
  const percents = totals.map((t) => (max ? Math.round((t / max) * 100) : 0));
  return { sumW, max, totals, percents, missing, eliminated, reasons, koOpen, koOpenBy };
}

/**
 * Ranking: Produkte im Rennen zuerst (absteigend nach Nutzwert), danach die ausgeschiedenen.
 * Bei Gleichstand bleibt die Spaltenreihenfolge.
 */
export function rank(cols, result) {
  return cols
    .map((name, index) => ({
      name,
      index,
      total: result.totals[index],
      percent: result.percents[index],
      eliminated: result.eliminated[index],
      reasons: result.reasons[index],
    }))
    .sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || b.total - a.total || a.index - b.index);
}
