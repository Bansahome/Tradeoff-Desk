/** Prompt-Builder. Reine Funktion, Vorlage kommt aus src/config/prompt-template.json. */
import defaultTemplate from '../config/prompt-template.json';
import { activeCriteria } from './util.js';

/** Prüft, ob genug Eingaben für einen Prompt da sind. */
export function promptStatus(state) {
  if (state.products.length < 2) return { ok: false, reason: 'products' };
  if (activeCriteria(state.criteria).length < 1) return { ok: false, reason: 'criteria' };
  return { ok: true };
}

export function buildPrompt(state, tpl = defaultTemplate) {
  const crit = activeCriteria(state.criteria);
  const p = state.products;
  const h = tpl.headings;
  const L = [];
  L.push(tpl.intro, '');
  L.push(h.purpose, state.zweck.trim() || tpl.purposeMissing, '');
  L.push(h.products);
  p.forEach((x, i) => L.push(i + 1 + '. ' + x));
  if (state.kontext.trim()) L.push('', h.context, state.kontext.trim());
  if (state.hinweise.trim()) L.push('', h.notes, state.hinweise.trim());
  L.push('', h.criteria);
  crit.forEach((c, i) => L.push(i + 1 + '. ' + c.name.trim() + (c.hint.trim() ? ' – ' + c.hint.trim() : '')));
  L.push('', h.research);
  tpl.research.forEach((r) => L.push('- ' + r));
  L.push('', h.output);
  (state.suggest ? tpl.outputSuggest : tpl.output).forEach((o) => L.push(o.split('{products}').join(p.join(' | '))));
  L.push(state.suggest ? tpl.closingSuggest : tpl.closing);
  return L.join('\n');
}

/** Folge-Prompt, wenn der Chatbot statt der Tabelle einen Bericht geliefert hat. */
export function buildReformatPrompt(state, tpl = defaultTemplate) {
  const r = tpl.reformat;
  const prods = state.products.join(' | ');
  const L = [r.intro, '', r.table.split('{products}').join(prods)];
  activeCriteria(state.criteria).forEach((c, i) => L.push('   ' + (i + 1) + '. ' + c.name.trim()));
  L.push('', r.cells);
  if (state.suggest) r.restSuggest.forEach((x) => L.push(x.split('{products}').join(prods)));
  else r.rest.forEach((x) => L.push(x));
  L.push('', state.suggest ? r.closingSuggest : r.closing);
  return L.join('\n');
}

const mdCell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n+/g, '<br>').trim();

/** Aktuelle Faktentabelle aus dem Zustand als Markdown (ohne Bewertung). */
export function rowsToMarkdownTable(state) {
  const L = ['| Kriterium | ' + state.cols.map(mdCell).join(' | ') + ' |', '|---|' + state.cols.map(() => '---|').join('')];
  state.rows.forEach((r) => L.push('| ' + mdCell(r.name) + ' | ' + state.cols.map((_, j) => mdCell(r.cells[j] || '')).join(' | ') + ' |'));
  return L.join('\n');
}

/** Gegenprüfung ist möglich, sobald eine Tabelle mit Beschreibungen eingelesen ist. */
export function crosscheckStatus(state) {
  if (!state.rows.length) return { ok: false, reason: 'rows' };
  if (!state.rows.some((r) => r.cells.some(Boolean))) return { ok: false, reason: 'cells' };
  return { ok: true };
}

/** Prompt für ein zweites Modell, das die Tabelle des ersten gegenprüft. */
export function buildCrosscheckPrompt(state, tpl = defaultTemplate) {
  const c = tpl.crosscheck, h = tpl.headings;
  const L = [c.intro, '', h.purpose, state.zweck.trim() || tpl.purposeMissing];
  if (state.kontext.trim()) L.push('', h.context, state.kontext.trim());
  L.push('', c.tableHeading, rowsToMarkdownTable(state), '', c.rulesHeading);
  c.rules.forEach((r) => L.push('- ' + r));
  L.push('', c.tagsHeading);
  c.tags.forEach((t) => L.push('- ' + t));
  L.push('', c.outputHeading);
  c.output.forEach((o) => L.push(o.split('{products}').join(state.cols.join(' | '))));
  L.push(c.closing);
  return L.join('\n');
}
