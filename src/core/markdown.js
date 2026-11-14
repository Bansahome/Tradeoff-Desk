/** Markdown-Export der Nutzwertanalyse. Reine Funktion. */
import { de } from '../strings.js';
import { calc } from './calc.js';
import { formatDate } from './util.js';

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n+/g, ' ');
const oneLine = (s) => String(s).replace(/\n+/g, ' ');
/** YAML-Listenelement, bei Sonderzeichen in Anführungszeichen. */
const yamlItem = (s) => (/[,:\[\]{}#&*!|>'"%@`]|^\s|\s$/.test(s) ? '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : s);

export function buildMarkdown(state, { date = formatDate(new Date()) } = {}, t = de.md) {
  const c = calc(state.rows, state.cols.length);
  const L = [];
  if (state.frontmatter) {
    L.push('---', 'typ: variantenbewertung', 'datum: ' + date, 'varianten: [' + state.cols.map(yamlItem).join(', ') + ']', 'tags: [variantenbewertung]', '---', '');
  }
  const zweck = state.zweck.trim();
  L.push('# ' + t.title + (zweck ? ': ' + zweck : ''), '');
  if (state.kontext.trim()) L.push('**' + t.context + ':** ' + oneLine(state.kontext.trim()), '');
  L.push('## ' + t.matrix, '', t.legend, '');
  L.push('| ' + t.criterion + ' | ' + t.weight + ' | ' + state.cols.map(cell).join(' | ') + ' |');
  L.push('|---|:-:|' + state.cols.map(() => ':-:|').join(''));
  state.rows.forEach((r) => {
    L.push('| ' + cell(r.name) + ' | ' + r.weight + ' | ' + state.cols.map((_, j) => (r.scores[j] === null || r.scores[j] === undefined ? t.unscored : r.scores[j])).join(' | ') + ' |');
  });
  L.push('| **' + t.total + '** | ' + c.sumW + ' | ' + c.totals.map((x) => '**' + x + '** ' + t.of + ' ' + c.max).join(' | ') + ' |');
  L.push('| **' + t.fulfil + '** | | ' + c.percents.map((p) => '**' + p + ' %**').join(' | ') + ' |');
  L.push('');
  if (c.missing > 0) L.push('_' + t.missing(c.missing) + '_', '');
  if (state.details && state.rows.some((r) => r.cells.some(Boolean))) {
    L.push('## ' + t.details, '');
    state.rows.forEach((r) => {
      L.push('### ' + r.name, '');
      state.cols.forEach((pn, j) => {
        if (r.cells[j]) L.push('- **' + pn + ':** ' + oneLine(r.cells[j]));
      });
      L.push('');
    });
  }
  if (state.sugExport && state.rows.some((r) => r.sug)) {
    L.push('## ' + t.sug, '', '_' + t.sugNote + '_', '');
    state.rows.forEach((r) => {
      if (!r.sug) return;
      L.push('### ' + r.name, '');
      const fin = (v) => (v === null || v === undefined ? t.unscored : v);
      const line = (label, sg, final) => sg && L.push('- **' + label + ':** ' + t.proposal + ' ' + sg.value + ' (' + t.final + ' ' + fin(final) + ')' + (sg.why ? ' – ' + oneLine(sg.why) : ''));
      line(t.weight, r.sug.weight, r.weight);
      state.cols.forEach((pn, j) => line(pn, r.sug.scores[j], r.scores[j]));
      L.push('');
    });
  }
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
