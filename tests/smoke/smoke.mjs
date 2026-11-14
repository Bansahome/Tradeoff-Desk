// Browser-Smoke-Test gegen dist/tradeoff-desk.html über file://.
// Braucht Playwright (nicht Teil der Abhängigkeiten): global installiert oder `npm i -D playwright`.
// Aufruf: npm run build && npm run smoke   (SCREENSHOTS=1 schreibt Bilder nach docs/)
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('playwright-core'); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const file = path.join(root, 'dist', 'tradeoff-desk.html');
const url = pathToFileURL(file).href;
const outDir = path.join(root, 'tests', 'smoke', 'out');
await mkdir(outDir, { recursive: true });

const TABLE = `Hier die Antwort.

\`\`\`markdown
| Kriterium | Intune | WSUS | baramundi |
|:---|:---|:---|:---|
| Funktionsumfang | **Cloud-native**, Update Rings [1] | Nur Windows-Updates<br>Kein Cloud | Breites Paket [2] |
| Lizenzierung und Kosten | In vielen M365-Plänen enthalten [1] | Kostenlos | Eigene Lizenz, nicht belegt |
\`\`\`

Quellen
1. https://example.org (Stand 2026-01-01)`;

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();

const external = [];
const errors = [];
page.on('request', (r) => { const u = r.url(); if (!/^(file|data|blob|about):/.test(u)) external.push(u); });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const step = (n) => console.log('ok  ' + n);

await page.goto(url);
assert.equal(await page.title(), 'Tradeoff Desk');
assert.ok(!(await page.content()).includes('Varianten-Bewertung'), 'alter Arbeitstitel noch vorhanden');
step('Seite lädt über file://, Titel Tradeoff Desk');

// Schritt 1: Prompt
let prompt = await page.inputValue('#promptOut');
assert.match(prompt, /1\. Intune\n2\. WSUS\n3\. baramundi/);
await page.fill('#prodIn', 'Ivanti');
await page.press('#prodIn', 'Enter');
assert.match(await page.inputValue('#promptOut'), /4\. Ivanti/);
await page.click('[data-rm-prod="3"]');
assert.doesNotMatch(await page.inputValue('#promptOut'), /Ivanti/);
await page.fill('#critIn', 'Offline-Fähigkeit');
await page.press('#critIn', 'Enter');
assert.match(await page.inputValue('#promptOut'), /Offline-Fähigkeit/);
await page.fill('#kontext', '800 Clients, hybrid');
assert.match(await page.inputValue('#promptOut'), /KUNDENKONTEXT\n800 Clients, hybrid/);
await page.click('#copyPrompt');
await page.waitForFunction(() => document.getElementById('promptStatus').textContent.length > 0);
step('Prompt live, Chips, eigenes Kriterium, Kopieren-Rückmeldung: ' + (await page.textContent('#promptStatus')));

// Kriterien anpassen
await page.click('#critEdit');
await page.fill('[data-cname="0"]', 'Funktionen');
assert.match(await page.inputValue('#promptOut'), /1\. Funktionen – /);
await page.click('[data-cmove="0"][data-dir="1"]');
assert.match(await page.inputValue('#promptOut'), /1\. Lizenzierung und Kosten/);
await page.click('#critEdit');
step('Kriterien-Editor: umbenennen, verschieben');

// Kriterien-Set speichern/laden
const [dlCrit] = await Promise.all([page.waitForEvent('download'), page.click('#critEdit').then(() => page.click('#critSave'))]);
const critJson = JSON.parse(await readFile(await dlCrit.path(), 'utf8'));
assert.equal(critJson.type, 'criteria');
assert.equal(critJson.criteria[0].name, 'Lizenzierung und Kosten');
step('Kriterien-Set als JSON heruntergeladen');
await page.click('#critEdit');

// Schritt 2
await page.click('#toStep2');
// Fehlerfall: langer Bericht ohne Tabelle -> Meldung, Folge-Prompt klappt auf
await page.fill('#pasted', 'Das ist ein langer Bericht ohne jede Tabelle. '.repeat(50));
await page.click('#parseBtn');
assert.match(await page.textContent('#parseStatus'), /Keine Tabelle erkannt/);
assert.equal(await page.locator('#fixBox').evaluate((d) => d.open), true);
assert.match(await page.inputValue('#fixOut'), /Genau eine Markdown-Tabelle[\s\S]*Intune \| WSUS \| baramundi/);
step('Bericht ohne Tabelle: klare Meldung, Folge-Prompt sichtbar');
// Datei-Import (.md aus dem Chat-Download)
const mdFile = path.join(outDir, 'antwort.md');
await (await import('node:fs/promises')).writeFile(mdFile, TABLE);
await page.setInputFiles('#pastedFile', mdFile);
await page.waitForFunction(() => document.getElementById('parseStatus').textContent.includes('eingelesen'));
assert.match(await page.inputValue('#pasted'), /\| Kriterium \| Intune/);
step('Datei laden: .md in das Einfügefeld übernommen');
// Gedrehte Tabelle (Produkte in Zeilen) wird umgestellt
await page.fill('#pasted', '| Produkt | Funktionsumfang | Lizenzierung und Kosten |\n|---|---|---|\n| Intune | a | b |\n| WSUS | c | d |\n| baramundi | e | f |');
await page.click('#parseBtn');
assert.match(await page.textContent('#parseStatus'), /2 Kriterien × 3 Produkte.*gedreht/);
step('Gedrehte Tabelle erkannt und umgestellt');
await page.evaluate(() => { document.getElementById('pasteBox').open = true; });
await page.fill('#pasted', TABLE);
await page.click('#parseBtn');
assert.match(await page.textContent('#parseStatus'), /2 Kriterien × 3 Produkte/);
const first = page.locator('.crit').first();
await first.locator('[data-act="weight"][data-v="5"]').click();
await first.locator('[data-act="score"][data-p="0"][data-v="5"]').click();
await first.locator('[data-act="score"][data-p="1"][data-v="2"]').click();
await first.locator('[data-act="score"][data-p="2"][data-v="3"]').click();
const second = page.locator('.crit').nth(1);
await second.locator('[data-act="score"][data-p="0"][data-v="4"]').click();
assert.match(await page.textContent('#matrix'), /noch nicht bewertet/);
// Tastatur: Fokus bleibt nach dem Klick erhalten
await page.focus('.crit >> nth=1 >> [data-act="score"][data-p="1"][data-v="1"]');
await page.keyboard.press('Enter');
const focused = await page.evaluate(() => document.activeElement && document.activeElement.dataset.v);
assert.equal(focused, '1', 'Fokus nach Neuzeichnen verloren');
await second.locator('[data-act="score"][data-p="2"][data-v="1"]').click();
const rankText = await page.textContent('.rank');
assert.match(rankText, /Intune.*5 \/ 5|Intune/s);
assert.ok(rankText.indexOf('Intune') < rankText.indexOf('WSUS'), 'Ranking: Intune zuerst');
step('Tabelle (Codeblock, <br>, Fett) übernommen, bewertet, Ranking, Fokus bleibt: ' + rankText.replace(/\s+/g, ' ').trim());

// Schritt 3
await page.click('#matrix >> text=Weiter zum Export');
const md = await page.inputValue('#mdOut');
assert.match(md, /^---\ntyp: variantenbewertung/);
assert.match(md, /\| \*\*Nutzwert\*\* \| 8 \|/);
assert.match(md, /Cloud-native, Update Rings \[1\]/);
await page.uncheck('#optFront');
assert.doesNotMatch(await page.inputValue('#mdOut'), /^---/);
await page.check('#optFront');
const [dlMd] = await Promise.all([page.waitForEvent('download'), page.click('#dlMd')]);
assert.match(dlMd.suggestedFilename(), /^tradeoff-desk-patch-management-fuer-windows-clients-\d{4}-\d{2}-\d{2}\.md$/);
assert.equal(await readFile(await dlMd.path(), 'utf8'), await page.inputValue('#mdOut'));
step('Markdown-Export und .md-Download: ' + dlMd.suggestedFilename());

// Sitzung speichern, Speicher leeren, laden
const [dlSess] = await Promise.all([page.waitForEvent('download'), page.click('#sessSave')]);
const sessPath = path.join(outDir, 'sitzung.json');
await dlSess.saveAs(sessPath);
const sess = JSON.parse(await readFile(sessPath, 'utf8'));
assert.equal(sess.app, 'tradeoff-desk');
assert.equal(sess.state.rows.length, 2);
// Frischer Kontext = anderer Rechner / anderer Kollege: Sitzung per JSON laden
const fresh = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const pf = await fresh.newPage();
pf.on('request', (r) => { const u = r.url(); if (!/^(file|data|blob|about):/.test(u)) external.push(u); });
await pf.goto(url);
assert.equal(await pf.inputValue('#kontext'), '', 'frischer Kontext ist nicht leer');
await pf.setInputFiles('#sessFile', sessPath);
await pf.waitForFunction(() => document.getElementById('sessStatus').textContent.includes('geladen'));
assert.match(await pf.textContent('.rank'), /Intune/);
assert.equal(await pf.locator('.crit').count(), 2);
await pf.click('nav.tabs button[data-step="1"]');
assert.equal(await pf.inputValue('#kontext'), '800 Clients, hybrid');
step('Sitzung als JSON gespeichert und in frischem Browser-Kontext wieder geladen');

// Kaputte Datei liefert eine Fehlermeldung statt eines Absturzes
await pf.setInputFiles('#sessFile', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"foo":1}') });
await pf.waitForFunction(() => document.getElementById('sessStatus').textContent.includes('nicht aus Tradeoff Desk'));
step('Fremde JSON-Datei wird sauber abgelehnt');

// Persistenz über Reload
await page.waitForTimeout(400);
await page.reload();
assert.equal(await page.inputValue('#kontext'), '800 Clients, hybrid');
assert.match(await page.inputValue('#promptOut'), /Offline-Fähigkeit/);
assert.ok(await page.evaluate(() => localStorage.getItem('tradeoff-desk-v1') !== null));
step('Persistenz über Reload (localStorage tradeoff-desk-v1)');
await fresh.close();

// App ohne localStorage
const ctx2 = await browser.newContext();
await ctx2.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
const p2 = await ctx2.newPage();
const err2 = [];
p2.on('pageerror', (e) => err2.push(String(e)));
await p2.goto(url);
await p2.fill('#prodIn', 'Test');
await p2.press('#prodIn', 'Enter');
assert.match(await p2.inputValue('#promptOut'), /4\. Test/);
await p2.waitForTimeout(500);
assert.equal(await p2.isVisible('#storageNote'), true);
assert.deepEqual(err2, []);
step('App funktioniert mit gesperrtem localStorage, Hinweis sichtbar');
await ctx2.close();

// Mobil 360 px: kein horizontales Scrollen
const mob = await browser.newContext({ viewport: { width: 360, height: 740 } });
const pm = await mob.newPage();
await pm.goto(url);
for (const n of [1, 2, 3]) {
  await pm.click(`nav.tabs button[data-step="${n}"]`);
  if (n === 2) { await pm.click('#blankBtn'); }
  const over = await pm.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 0, `Schritt ${n}: horizontaler Überlauf ${over}px bei 360 px`);
}
step('360 px: kein horizontaler Überlauf in allen drei Schritten');
await mob.close();

// Dunkelmodus
const dark = await browser.newContext({ colorScheme: 'dark' });
const pd = await dark.newPage();
await pd.goto(url);
assert.equal(await pd.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(14, 20, 28)');
step('Dunkelmodus über prefers-color-scheme');
await dark.close();

if (process.env.SCREENSHOTS) {
  const sc = await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
  const ps = await sc.newPage();
  await ps.goto(url);
  await ps.fill('#kontext', '800 Clients, hybrid Entra-joined, 3 Standorte, kleines IT-Team');
  await ps.screenshot({ path: path.join(root, 'docs', 'screenshot-1-prompt.png') });
  await ps.click('nav.tabs button[data-step="2"]');
  await ps.fill('#pasted', TABLE);
  await ps.click('#parseBtn');
  const c = ps.locator('.crit');
  for (const [i, s] of [[0, [5, 2, 3]], [1, [4, 5, 1]]]) for (let j = 0; j < 3; j++) await c.nth(i).locator(`[data-act="score"][data-p="${j}"][data-v="${s[j]}"]`).click();
  await ps.screenshot({ path: path.join(root, 'docs', 'screenshot-2-bewerten.png') });
  await sc.close();
  step('Screenshots nach docs/ geschrieben');
}

await browser.close();
assert.deepEqual(external, [], 'Externe Netzwerkanfragen: ' + external.join(', '));
step('Keine einzige Netzwerkanfrage nach außen');
assert.deepEqual(errors, [], 'Konsolenfehler: ' + errors.join(' | '));
step('Keine Konsolenfehler');
console.log('\nSmoke-Test bestanden.');
