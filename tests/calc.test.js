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
    expect(r).toEqual({ sumW: 0, max: 0, totals: [0, 0], percents: [0, 0], missing: 0 });
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
