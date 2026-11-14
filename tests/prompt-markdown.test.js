import { describe, it, expect } from 'vitest';
import { buildPrompt, promptStatus } from '../src/core/prompt.js';
import { buildMarkdown } from '../src/core/markdown.js';
import { freshState } from '../src/core/state.js';

function sample() {
  const s = freshState();
  s.kontext = '800 Clients, hybrid Entra-joined,\nkleines IT-Team';
  s.hinweise = 'Offline-Standorte prüfen';
  return s;
}

describe('Prompt-Builder', () => {
  it('Snapshot mit Kontext und Hinweisen', () => {
    expect(buildPrompt(sample())).toMatchSnapshot();
  });
  it('Snapshot mit leeren Optionalfeldern und Fallback beim Zweck', () => {
    const s = freshState();
    s.zweck = '';
    expect(buildPrompt(s)).toMatchSnapshot();
  });
  it('nutzt nur angekreuzte Kriterien mit Namen und trägt Produkte in das Ausgabeformat ein', () => {
    const s = freshState();
    s.criteria.forEach((c) => { c.on = false; });
    s.criteria[1].on = true;
    s.criteria.push({ id: 'x', name: 'Offline-Fähigkeit', hint: '', on: true });
    const p = buildPrompt(s);
    expect(p).toContain('1. Lizenzierung und Kosten – Benötigte Lizenz');
    expect(p).toContain('2. Offline-Fähigkeit\n');
    expect(p).not.toContain('Funktionsumfang');
    expect(p).toContain('in dieser Reihenfolge: Intune | WSUS | baramundi.');
  });
  it('verwendet eine übergebene Vorlage', () => {
    const tpl = { intro: 'I', headings: { purpose: 'P', products: 'PR', context: 'C', notes: 'N', criteria: 'K', research: 'R', output: 'O' }, purposeMissing: '-', research: ['r1'], output: ['o {products}'], closing: 'Ende' };
    const lines = buildPrompt(freshState(), tpl).split('\n');
    expect(lines.slice(-6)).toEqual(['R', '- r1', '', 'O', 'o Intune | WSUS | baramundi', 'Ende']);
  });
  it('promptStatus meldet fehlende Eingaben', () => {
    const s = freshState();
    expect(promptStatus(s)).toEqual({ ok: true });
    s.products = ['Nur eins'];
    expect(promptStatus(s)).toEqual({ ok: false, reason: 'products' });
    s.products = ['A', 'B']; s.criteria.forEach((c) => { c.on = false; });
    expect(promptStatus(s)).toEqual({ ok: false, reason: 'criteria' });
  });
});

function scored() {
  const s = sample();
  s.cols = ['Intune', 'WSUS', 'baramundi | Suite'];
  s.rows = [
    { name: 'Funktionsumfang', weight: 5, cells: ['Cloud-native.\nMit Update Rings.', 'Nur Updates | kein Cloud', ''], scores: [5, 2, 3] },
    { name: 'Lizenzierung und Kosten', weight: 3, cells: ['In M365 enthalten', '', 'Eigene Lizenz'], scores: [4, null, 1] },
  ];
  return s;
}

describe('Markdown-Export', () => {
  const date = '2026-01-15';
  it('Snapshot mit Frontmatter und Beschreibungen', () => {
    expect(buildMarkdown(scored(), { date })).toMatchSnapshot();
  });
  it('Snapshot ohne Frontmatter und ohne Beschreibungen', () => {
    const s = scored(); s.frontmatter = false; s.details = false;
    expect(buildMarkdown(s, { date })).toMatchSnapshot();
  });
  it('Snapshot ohne Beschreibungstexte, alles bewertet, ohne Zweck und Kontext', () => {
    const s = scored(); s.zweck = ''; s.kontext = '';
    s.rows.forEach((r) => { r.cells = r.cells.map(() => ''); r.scores = r.scores.map(() => 2); });
    expect(buildMarkdown(s, { date })).toMatchSnapshot();
  });
  it('meldet unbewertete Felder und rechnet sie als 0', () => {
    const md = buildMarkdown(scored(), { date });
    expect(md).toContain('1 Feld ist nicht bewertet');
    expect(md).toContain('| **Nutzwert** | 8 | **37** von 40 |');
  });
  it('escaped Pipes in Produktnamen und quotet sie im Frontmatter nicht falsch', () => {
    const md = buildMarkdown(scored(), { date });
    expect(md).toContain('baramundi \\| Suite');
    expect(md).toContain('varianten: [Intune, WSUS, "baramundi | Suite"]');
  });
});
