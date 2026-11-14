import { describe, it, expect } from 'vitest';
import { buildPrompt, buildReformatPrompt, buildCrosscheckPrompt, crosscheckStatus, rowsToMarkdownTable, promptStatus } from '../src/core/prompt.js';
import { buildMarkdown } from '../src/core/markdown.js';
import { freshState } from '../src/core/state.js';

function sample() {
  const s = freshState();
  s.kontext = '800 Clients, hybrid Entra-joined,\nkleines IT-Team';
  s.hinweise = 'Offline-Standorte prüfen';
  return s;
}

describe('Folge-Prompt', () => {
  it('Snapshot', () => {
    expect(buildReformatPrompt(sample())).toMatchSnapshot();
  });
  it('Snapshot mit Bewertungsvorschlag', () => {
    const s = sample(); s.suggest = true;
    expect(buildReformatPrompt(s)).toMatchSnapshot();
  });
});

describe('Prompt mit Bewertungsvorschlag', () => {
  it('Snapshot', () => {
    const s = sample(); s.suggest = true;
    expect(buildPrompt(s)).toMatchSnapshot();
  });
  it('verlangt die Vorschlagstabelle und verbietet keine Zahlen mehr, aber eine Empfehlung', () => {
    const s = sample(); s.suggest = true;
    const p = buildPrompt(s);
    expect(p).toContain('„Bewertungsvorschlag“ als zweite Markdown-Tabelle');
    expect(p).toContain('endgültige Gewichtung und Bewertung mache ich selbst');
    expect(p).not.toContain('Gib keine Punktbewertung');
  });
  it('ohne Option bleibt der Prompt ohne Punktebewertung', () => {
    const p = buildPrompt(sample());
    expect(p).toContain('Gib keine Punktbewertung');
    expect(p).not.toContain('Bewertungsvorschlag');
  });
});

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

describe('Markdown-Export mit Modellvorschlägen', () => {
  const withSug = () => {
    const s = scored();
    s.rows[0].sug = { weight: { value: 4, why: 'Kernanforderung des Kunden' }, scores: [{ value: 5, why: 'Update Rings [1]' }, { value: 2, why: 'nur Updates' }, null] };
    s.rows[1].sug = { weight: null, scores: [{ value: 3, why: 'enthalten | aber begrenzt' }, null, { value: 1, why: 'eigene Lizenz' }] };
    return s;
  };
  it('Snapshot mit Vorschlägen, Begründung und endgültigem Wert', () => {
    expect(buildMarkdown(withSug(), { date: '2026-01-15' })).toMatchSnapshot();
  });
  it('lässt den Abschnitt weg, wenn die Option aus ist', () => {
    const s = withSug(); s.sugExport = false;
    expect(buildMarkdown(s, { date: '2026-01-15' })).not.toContain('Vorschläge des Modells');
  });
  it('Vorschläge ändern die Nutzwert-Rechnung nicht', () => {
    const a = buildMarkdown(scored(), { date: '2026-01-15' });
    const b = buildMarkdown(withSug(), { date: '2026-01-15' });
    expect(b.split('## Vorschläge des Modells')[0].trim()).toBe(a.trim());
  });
});

describe('Gegenprüfungs-Prompt', () => {
  it('Snapshot mit eingelesener Tabelle', () => {
    expect(buildCrosscheckPrompt(scored())).toMatchSnapshot();
  });
  it('rowsToMarkdownTable escaped Pipes und wandelt Zeilenumbrüche', () => {
    const t = rowsToMarkdownTable(scored());
    expect(t).toContain('| Kriterium | Intune | WSUS | baramundi \\| Suite |');
    expect(t).toContain('Cloud-native.<br>Mit Update Rings.');
    expect(t).toContain('Nur Updates \\| kein Cloud');
  });
  it('crosscheckStatus verlangt eingelesene Beschreibungen', () => {
    const s = freshState();
    expect(crosscheckStatus(s)).toEqual({ ok: false, reason: 'rows' });
    s.cols = ['A', 'B']; s.rows = [{ name: 'K', weight: 3, cells: ['', ''], scores: [null, null] }];
    expect(crosscheckStatus(s)).toEqual({ ok: false, reason: 'cells' });
    expect(crosscheckStatus(scored())).toEqual({ ok: true });
  });
});

describe('Markdown-Export: K.-o., Belastbarkeit, Entscheidung, Gegenprüfung', () => {
  const date = '2026-01-15';
  const full = () => {
    const s = scored();
    s.rows[1].ko = true; s.rows[1].koMin = 2;
    s.rows[1].scores = [4, 1, 3];
    s.rows[0].checks = ['ok', 'fix', null];
    s.rows[1].checks = [null, 'old', 'unproven'];
    s.note = { decision: 'Intune wird führendes System.', assumptions: 'Alle Clients sind Entra-joined.', risks: 'WAN-Standorte offen.\nZweite Zeile.' };
    return s;
  };
  it('Snapshot', () => {
    expect(buildMarkdown(full(), { date })).toMatchSnapshot();
  });
  it('zeigt K.-o. am Kriterium und den Status je Produkt', () => {
    const md = buildMarkdown(full(), { date });
    expect(md).toContain('| Lizenzierung und Kosten (K.-o. ab 2) | 3 |');
    expect(md).toContain('| **Status** | | im Rennen | ausgeschieden (Lizenzierung und Kosten) | im Rennen |');
  });
  it('ohne K.-o.-Kriterium keine Statuszeile', () => {
    expect(buildMarkdown(scored(), { date })).not.toContain('**Status**');
  });
  it('Belastbarkeit lässt sich abschalten', () => {
    const s = full(); s.sensExport = false;
    expect(buildMarkdown(s, { date })).not.toContain('Belastbarkeit des Ergebnisses');
    expect(buildMarkdown(full(), { date })).toContain('## Belastbarkeit des Ergebnisses');
  });
  it('Entscheidungsabschnitt nur mit Inhalt', () => {
    expect(buildMarkdown(scored(), { date })).not.toContain('Entscheidung und Begründung');
    const s = scored(); s.note = { decision: '', assumptions: 'Nur Annahmen', risks: '  ' };
    const md = buildMarkdown(s, { date });
    expect(md).toContain('### Annahmen\n\nNur Annahmen');
    expect(md).not.toContain('### Entscheidung\n');
    expect(md).not.toContain('### Risiken');
  });
});

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
