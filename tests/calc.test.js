import { describe, it, expect } from 'vitest';
import { calc, rank } from '../src/core/calc.js';

const rows = [
  { weight: 5, scores: [5, 2, 0] },
  { weight: 3, scores: [1, 4, 4] },
  { weight: 2, scores: [3, 3, 5] },
];

describe('calc', () => {
  it('gewichtet Punkte und summiert je Produkt', () => {
    const r = calc(rows, 3);
    expect(r.totals).toEqual([5 * 5 + 3 * 1 + 2 * 3, 5 * 2 + 3 * 4 + 2 * 3, 0 + 12 + 10]);
    expect(r.sumW).toBe(10);
    expect(r.max).toBe(50);
    expect(r.missing).toBe(0);
  });

  it('berechnet den Erfüllungsgrad gerundet in Prozent', () => {
    const r = calc(rows, 3);
    expect(r.percents).toEqual([68, 56, 44]);
  });

  it('zählt unbewertete Felder als 0 und meldet sie', () => {
    const r = calc(
      [
        { weight: 4, scores: [5, null] },
        { weight: 1, scores: [null, undefined] },
      ],
      2,
    );
    expect(r.totals).toEqual([20, 0]);
    expect(r.missing).toBe(3);
    expect(r.percents).toEqual([80, 0]);
  });

  it('meldet fehlende Einträge, wenn scores kürzer als die Spaltenzahl ist', () => {
    const r = calc([{ weight: 2, scores: [5] }], 3);
    expect(r.totals).toEqual([10, 0, 0]);
    expect(r.missing).toBe(2);
  });

  it('teilt nicht durch 0 ohne Kriterien', () => {
    const r = calc([], 2);
    expect(r).toEqual({ sumW: 0, max: 0, totals: [0, 0], percents: [0, 0], missing: 0, eliminated: [false, false], reasons: [[], []], koOpen: 0, koOpenBy: [0, 0] });
  });

  it('bewertet 0 Punkte als bewertet (nicht fehlend)', () => {
    expect(calc([{ weight: 3, scores: [0] }], 1).missing).toBe(0);
  });
});

describe('rank', () => {
  it('sortiert absteigend und behält bei Gleichstand die Spaltenreihenfolge', () => {
    const r = calc([{ weight: 1, scores: [3, 5, 3] }], 3);
    expect(rank(['A', 'B', 'C'], r).map((x) => x.name)).toEqual(['B', 'A', 'C']);
  });
});

describe('K.-o.-Kriterien', () => {
  const rows = [
    { name: 'Lizenz', weight: 2, ko: true, koMin: 1, scores: [3, 0, null] },
    { name: 'Security', weight: 3, ko: true, koMin: 3, scores: [4, 5, 2] },
    { name: 'Funktion', weight: 5, scores: [5, 5, 5] },
  ];
  it('scheidet Produkte unter der Mindestpunktzahl aus und nennt die Gründe', () => {
    const r = calc(rows, 3);
    expect(r.eliminated).toEqual([false, true, true]);
    expect(r.reasons).toEqual([[], ['Lizenz'], ['Security']]);
  });
  it('ausgeschiedene Produkte behalten ihren Nutzwert', () => {
    expect(calc(rows, 3).totals).toEqual([6 + 12 + 25, 0 + 15 + 25, 0 + 6 + 25]);
  });
  it('offene K.-o.-Felder scheiden nicht aus, werden aber gezählt', () => {
    const r = calc(rows, 3);
    expect(r.koOpen).toBe(1);
    expect(r.koOpenBy).toEqual([0, 0, 1]);
  });
  it('Standard der Mindestpunkte ist 1: nur 0 scheidet aus', () => {
    const r = calc([{ name: 'K', weight: 1, ko: true, scores: [0, 1] }], 2);
    expect(r.eliminated).toEqual([true, false]);
  });
  it('ohne ko-Flag scheidet nichts aus', () => {
    expect(calc([{ name: 'K', weight: 1, scores: [0] }], 1).eliminated).toEqual([false]);
  });
  it('rank stellt Ausgeschiedene ans Ende, auch mit höherem Nutzwert', () => {
    const r = calc(
      [
        { name: 'K', weight: 5, ko: true, scores: [0, 3, 2] },
        { name: 'F', weight: 5, scores: [5, 1, 3] },
      ],
      3,
    );
    const ranked = rank(['A', 'B', 'C'], r);
    expect(ranked.map((x) => x.name)).toEqual(['C', 'B', 'A']);
    expect(ranked.map((x) => x.eliminated)).toEqual([false, false, true]);
    expect(ranked[2].reasons).toEqual(['K']);
  });
});
