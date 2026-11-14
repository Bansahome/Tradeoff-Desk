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
  tpl.output.forEach((o) => L.push(o.split('{products}').join(p.join(' | '))));
  L.push(tpl.closing);
  return L.join('\n');
}

/** Folge-Prompt, wenn der Chatbot statt der Tabelle einen Bericht geliefert hat. */
export function buildReformatPrompt(state, tpl = defaultTemplate) {
  const r = tpl.reformat;
  const L = [r.intro, '', r.table.split('{products}').join(state.products.join(' | '))];
  activeCriteria(state.criteria).forEach((c, i) => L.push('   ' + (i + 1) + '. ' + c.name.trim()));
  L.push('', r.cells, ...r.rest, '', r.closing);
  return L.join('\n');
}
