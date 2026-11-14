/** UI: verdrahtet DOM, Zustand und die reinen Module aus src/core. */
import { de as T } from '../strings.js';
import { $, esc, download, readFile, flash, copyFrom } from './dom.js';
import { parseTable } from '../core/parser.js';
import { calc, rank } from '../core/calc.js';
import { buildPrompt, buildReformatPrompt, promptStatus } from '../core/prompt.js';
import { buildMarkdown } from '../core/markdown.js';
import { activeCriteria, formatDate, slugify } from '../core/util.js';
import {
  freshState, emptyState, normalizeState, rowsFromTable, blankRows, hasScores, newId, cloneCriteria,
  serializeSession, parseSession, serializeCriteriaSet, parseCriteriaSet,
} from '../core/state.js';

const KEY = 'tradeoff-desk-v1';
const ui = { editCrit: false };
let storageOk = true;

/* ---------- Persistenz (localStorage, immer mit try/catch) ---------- */
function loadStored() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch (e) { return null; }
}
let S = loadStored() || freshState();
let saveTimer = null;
function persistNow() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; } catch (e) { storageOk = false; }
  $('storageNote').hidden = storageOk;
}
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(persistNow, 250); }
window.addEventListener('pagehide', persistNow);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistNow(); });

/* ---------- Schritte ---------- */
function showStep(n) {
  [1, 2, 3].forEach((i) => $('step' + i).classList.toggle('on', i === n));
  document.querySelectorAll('nav.tabs button').forEach((b) => {
    if (Number(b.dataset.step) === n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
  if (n === 2) renderMatrix();
  if (n === 3) renderExport();
  window.scrollTo(0, 0);
}
document.querySelector('nav.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-step]');
  if (b) showStep(Number(b.dataset.step));
});

/* ---------- Schritt 1: Produkte ---------- */
function renderChips() {
  $('chips').innerHTML = S.products
    .map((p, i) => '<span class="chip">' + esc(p) + '<button type="button" data-rm-prod="' + i + '" aria-label="' + esc(T.step1.remove(p)) + '">×</button></span>')
    .join('');
}
function addProducts(str) {
  String(str).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).forEach((p) => {
    if (!S.products.some((x) => x.toLowerCase() === p.toLowerCase())) S.products.push(p);
  });
  renderChips(); updatePrompt(); save();
}
$('prodAdd').addEventListener('click', () => { addProducts($('prodIn').value); $('prodIn').value = ''; $('prodIn').focus(); });
$('prodIn').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addProducts(e.target.value); e.target.value = ''; }
});
$('prodIn').addEventListener('blur', (e) => { if (e.target.value.trim()) { addProducts(e.target.value); e.target.value = ''; } });
$('chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rm-prod]');
  if (!b) return;
  S.products.splice(Number(b.dataset.rmProd), 1);
  renderChips(); updatePrompt(); save();
  $('prodIn').focus();
});
['zweck', 'kontext', 'hinweise'].forEach((id) => {
  $(id).addEventListener('input', (e) => { S[id] = e.target.value; updatePrompt(); save(); });
});

/* ---------- Schritt 1: Kriterien ---------- */
function renderChecks() {
  const box = $('checks');
  box.classList.toggle('editing', ui.editCrit);
  $('critHint').hidden = !ui.editCrit;
  $('critTools').hidden = !ui.editCrit;
  $('critEdit').setAttribute('aria-pressed', String(ui.editCrit));
  $('critEdit').textContent = ui.editCrit ? T.step1.critEditDone : T.step1.critEdit;
  if (!ui.editCrit) {
    box.innerHTML = S.criteria
      .map((c, i) => '<label class="chk"><input type="checkbox" data-crit="' + i + '"' + (c.on ? ' checked' : '') + '><div><b>' + esc(c.name) + '</b>' + (c.hint ? '<span>' + esc(c.hint) + '</span>' : '') + '</div></label>')
      .join('');
    return;
  }
  const s = T.step1;
  box.innerHTML = S.criteria
    .map((c, i) => {
      const n = c.name || '#' + (i + 1);
      return '<div class="ce"><input type="checkbox" data-crit="' + i + '"' + (c.on ? ' checked' : '') + ' aria-label="' + esc(s.critOn(n)) + '">' +
        '<div class="ce-fields"><input type="text" data-cname="' + i + '" value="' + esc(c.name) + '" aria-label="' + esc(s.critName(i + 1)) + '">' +
        '<input type="text" data-chint="' + i + '" value="' + esc(c.hint) + '" aria-label="' + esc(s.critHintLabel(i + 1)) + '"></div>' +
        '<div class="ce-btns"><button type="button" data-cmove="' + i + '" data-dir="-1" aria-label="' + esc(s.critUp(n)) + '">↑</button>' +
        '<button type="button" data-cmove="' + i + '" data-dir="1" aria-label="' + esc(s.critDown(n)) + '">↓</button>' +
        '<button type="button" data-crm="' + i + '" aria-label="' + esc(s.critRemove(n)) + '">✕</button></div></div>';
    })
    .join('');
}
$('checks').addEventListener('change', (e) => {
  const i = e.target.dataset.crit;
  if (i === undefined) return;
  S.criteria[Number(i)].on = e.target.checked; updatePrompt(); save();
});
$('checks').addEventListener('input', (e) => {
  const d = e.target.dataset;
  if (d.cname !== undefined) S.criteria[Number(d.cname)].name = e.target.value;
  else if (d.chint !== undefined) S.criteria[Number(d.chint)].hint = e.target.value;
  else return;
  updatePrompt(); save();
});
$('checks').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  let focusSel = null;
  if (b.dataset.cmove !== undefined) {
    const i = Number(b.dataset.cmove), j = i + Number(b.dataset.dir);
    if (j < 0 || j >= S.criteria.length) return;
    const t = S.criteria[i]; S.criteria[i] = S.criteria[j]; S.criteria[j] = t;
    focusSel = '[data-cmove="' + j + '"][data-dir="' + b.dataset.dir + '"]';
  } else if (b.dataset.crm !== undefined) {
    S.criteria.splice(Number(b.dataset.crm), 1);
    focusSel = '#critEdit';
  } else return;
  renderChecks(); updatePrompt(); save();
  const el = focusSel && document.querySelector(focusSel);
  if (el) el.focus();
});
function addCrit() {
  const v = $('critIn').value.trim();
  if (!v) return;
  S.criteria.push({ id: newId(), name: v, hint: '', on: true });
  $('critIn').value = ''; renderChecks(); updatePrompt(); save();
}
$('critAdd').addEventListener('click', addCrit);
$('critIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCrit(); } });
$('critEdit').addEventListener('click', () => { ui.editCrit = !ui.editCrit; renderChecks(); });
$('critReset').addEventListener('click', () => {
  if (!window.confirm(T.step1.critResetConfirm)) return;
  S.criteria = cloneCriteria(); renderChecks(); updatePrompt(); save();
});
$('critSave').addEventListener('click', () => {
  const file = T.files.criteriaBase + '-' + formatDate(new Date()) + '.json';
  download(file, serializeCriteriaSet(S.criteria), 'application/json');
  flash($('critStatus'), T.step1.critSaved(file), 'ok');
});
$('critLoad').addEventListener('click', () => $('critFile').click());
$('critFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  const st = $('critStatus');
  let text;
  try { text = await readFile(f); } catch (err) { flash(st, T.step1.critErrors.read, 'warn'); return; }
  const res = parseCriteriaSet(text);
  if (!res.ok) { flash(st, T.step1.critErrors[res.error], 'warn'); return; }
  S.criteria = res.criteria; renderChecks(); updatePrompt(); save();
  flash(st, T.step1.critLoaded(res.criteria.length), 'ok');
});

/* ---------- Prompt ---------- */
function updatePrompt() {
  const ta = $('promptOut'), st = $('promptStatus'), btn = $('copyPrompt');
  const chk = promptStatus(S);
  if (!chk.ok) {
    ta.value = ''; btn.disabled = true;
    $('fixOut').value = ''; $('copyFix').disabled = true;
    st.className = 'status warn';
    st.textContent = chk.reason === 'products' ? T.step1.needProducts : T.step1.needCriteria;
    return;
  }
  btn.disabled = false;
  ta.value = buildPrompt(S);
  $('fixOut').value = buildReformatPrompt(S); $('copyFix').disabled = false;
  st.className = 'status'; st.textContent = '';
}
$('copyPrompt').addEventListener('click', () => copyFrom($('promptOut'), $('promptStatus'), T.copy));
$('copyFix').addEventListener('click', () => copyFrom($('fixOut'), $('fixStatus'), T.copy));
$('copyMd').addEventListener('click', () => copyFrom($('mdOut'), $('mdStatus'), T.copy));
$('toStep2').addEventListener('click', () => showStep(2));
$('resetAll').addEventListener('click', () => {
  if (!window.confirm(T.step1.resetConfirm)) return;
  S = emptyState(S);
  applyStateToInputs(); renderAll(); save();
});

/* ---------- Schritt 2: Tabelle einlesen ---------- */
$('parseBtn').addEventListener('click', () => {
  const st = $('parseStatus');
  S.pasted = $('pasted').value; save();
  const res = parseTable(S.pasted, { products: S.products });
  if (!res.ok) { flash(st, T.step2.parseErrors[res.error], 'warn'); $('fixBox').open = true; return; }
  if (hasScores(S) && !window.confirm(T.step2.overwriteConfirm)) return;
  S.cols = res.cols; S.rows = rowsFromTable(res); save();
  flash(st, T.step2.parsed(res.rows.length, res.cols.length) + (res.transposed ? T.step2.transposed : ''), 'ok');
  $('pasteBox').open = false;
  renderMatrix();
});
$('blankBtn').addEventListener('click', () => {
  const st = $('parseStatus');
  if (!promptStatus(S).ok) { flash(st, T.step2.blankMissing, 'warn'); return; }
  if (hasScores(S) && !window.confirm(T.step2.overwriteConfirm)) return;
  const b = blankRows(S);
  S.cols = b.cols; S.rows = b.rows; save();
  st.textContent = ''; $('pasteBox').open = false;
  renderMatrix();
});
$('fileBtn').addEventListener('click', () => $('pastedFile').click());
$('pastedFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  const st = $('parseStatus');
  try { $('pasted').value = await readFile(f); } catch (err) { flash(st, T.step2.fileError, 'warn'); return; }
  S.pasted = $('pasted').value; save();
  flash(st, T.step2.fileLoaded(f.name), 'ok');
});
$('pasted').addEventListener('input', (e) => { S.pasted = e.target.value; save(); });

/* ---------- Schritt 2: Bewerten ---------- */
function seg(kind, r, p, from, to, cur, label) {
  let h = '<div class="seg" role="group" aria-label="' + esc(label) + '">';
  for (let v = from; v <= to; v++) {
    h += '<button type="button" data-act="' + kind + '" data-r="' + r + '" data-p="' + p + '" data-v="' + v + '" aria-pressed="' + (cur === v) + '">' + v + '</button>';
  }
  return h + '</div>';
}
function renderMatrix() {
  const box = $('matrix');
  if (!S.rows.length) {
    box.innerHTML = '<div class="card empty-state">' + esc(T.step2.empty) + '</div>';
    $('pasteBox').open = true;
    return;
  }
  // Fokus über das Neuzeichnen retten, damit Tastaturbedienung nicht abreißt
  const a = document.activeElement;
  let sel = null;
  if (a && a.dataset && a.dataset.act && box.contains(a)) {
    sel = '[data-act="' + a.dataset.act + '"][data-r="' + a.dataset.r + '"][data-p="' + a.dataset.p + '"]' + (a.dataset.v !== undefined ? '[data-v="' + a.dataset.v + '"]' : '');
  }
  const c = calc(S.rows, S.cols.length);
  let h = '<div class="card"><h2>' + esc(T.step2.summary) + '</h2><div class="rank">';
  rank(S.cols, c).forEach((o) => {
    h += '<div class="rank-row"><div class="rank-name">' + esc(o.name) + '</div><div class="track" aria-hidden="true"><div class="fill" style="width:' + o.percent + '%"></div></div><div class="num">' + esc(T.step2.rankValue(o.total, c.max, o.percent)) + '</div></div>';
  });
  h += '</div>';
  h += c.missing > 0
    ? '<p class="status warn" style="margin:12px 0 0">' + esc(T.step2.missing(c.missing)) + '</p>'
    : '<p class="status ok" style="margin:12px 0 0">' + esc(T.step2.allDone) + '</p>';
  h += '<div class="bar-actions"><button type="button" class="btn primary" data-act="toExport" data-r="" data-p="">' + esc(T.step2.toExport) + '</button></div></div>';
  h += '<p class="hint" style="margin:0 0 10px">' + esc(T.step2.legend) + '</p>';
  S.rows.forEach((r, i) => {
    h += '<article class="crit"><div class="crit-head"><h3>' + esc(r.name) + '</h3><div class="w"><span>' + esc(T.step2.weight) + '</span>' +
      seg('weight', i, 0, 1, 5, r.weight, T.step2.weightFor(r.name)) +
      '<button type="button" class="linkbtn" data-act="rmRow" data-r="' + i + '" data-p="0" aria-label="' + esc(T.step2.removeRowAria(r.name)) + '">' + esc(T.step2.removeRow) + '</button></div></div><div class="prods">';
    S.cols.forEach((pn, j) => {
      const t = r.cells[j] || '';
      h += '<div class="prod"><h4>' + esc(pn) + '</h4><p class="txt' + (t ? '' : ' empty') + '">' + esc(t || T.step2.noDesc) + '</p>' +
        seg('score', i, j, 0, 5, r.scores[j], T.step2.scoreFor(pn, r.name)) + '</div>';
    });
    h += '</div></article>';
  });
  box.innerHTML = h;
  if (sel) { const el = box.querySelector(sel); if (el) el.focus({ preventScroll: true }); }
}
$('matrix').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act, r = Number(b.dataset.r), p = Number(b.dataset.p), v = Number(b.dataset.v);
  if (act === 'toExport') { showStep(3); return; }
  if (act === 'score') S.rows[r].scores[p] = S.rows[r].scores[p] === v ? null : v;
  else if (act === 'weight') S.rows[r].weight = v;
  else if (act === 'rmRow') S.rows.splice(r, 1);
  save(); renderMatrix();
});

/* ---------- Schritt 3: Export ---------- */
function mdFilename() {
  return T.files.mdBase + '-' + (slugify(S.zweck) || T.files.mdFallback) + '-' + formatDate(new Date()) + '.md';
}
function renderExport() {
  $('optFront').checked = !!S.frontmatter;
  $('optDetails').checked = !!S.details;
  const st = $('mdStatus');
  if (!S.rows.length) {
    $('mdOut').value = ''; flash(st, T.step3.noData, 'warn');
    $('copyMd').disabled = true; $('dlMd').disabled = true;
    return;
  }
  $('copyMd').disabled = false; $('dlMd').disabled = false;
  st.textContent = ''; st.className = 'status';
  $('mdOut').value = buildMarkdown(S, { date: formatDate(new Date()) });
}
$('optFront').addEventListener('change', (e) => { S.frontmatter = e.target.checked; save(); renderExport(); });
$('optDetails').addEventListener('change', (e) => { S.details = e.target.checked; save(); renderExport(); });
$('dlMd').addEventListener('click', () => {
  const file = mdFilename();
  download(file, $('mdOut').value, 'text/markdown;charset=utf-8');
  flash($('mdStatus'), T.step3.downloaded(file), 'ok');
});

/* ---------- Sitzung speichern / laden ---------- */
$('sessSave').addEventListener('click', () => {
  const file = T.files.sessionBase + '-' + (slugify(S.zweck) || T.files.mdFallback) + '-' + formatDate(new Date()) + '.json';
  download(file, serializeSession(S), 'application/json');
  flash($('sessStatus'), T.session.saved(file), 'ok');
});
$('sessLoad').addEventListener('click', () => $('sessFile').click());
$('sessFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  const st = $('sessStatus');
  let text;
  try { text = await readFile(f); } catch (err) { flash(st, T.session.errors.read, 'warn'); return; }
  const res = parseSession(text);
  if (!res.ok) { flash(st, T.session.errors[res.error], 'warn'); return; }
  S = res.state;
  applyStateToInputs(); renderAll(); persistNow();
  flash(st, T.session.loaded, 'ok');
  showStep(S.rows.length ? 2 : 1);
});

/* ---------- Start ---------- */
function applyStateToInputs() {
  $('zweck').value = S.zweck; $('kontext').value = S.kontext;
  $('hinweise').value = S.hinweise; $('pasted').value = S.pasted;
}
function renderAll() {
  renderChips(); renderChecks(); updatePrompt();
  $('pasteBox').open = !S.rows.length;
  $('matrix').innerHTML = '';
  if ($('step2').classList.contains('on')) renderMatrix();
  if ($('step3').classList.contains('on')) renderExport();
}
applyStateToInputs();
renderAll();

