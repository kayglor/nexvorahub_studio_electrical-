// Operational check of the published app: node check-live.js [url-or-file]
// Downloads the live site (default https://studio.nexvorahubconnection.com), then, with no browser:
// - opens every stage and report with the worked example and with a blank project, and records any error
// - runs the core calculations, every CSV export and the Excel workbook export
// - checks the build stamp matches the local build, so you know the latest version is live
// Exit code 0 = fully operational, 1 = something failed (listed).
const fs = require('fs'), path = require('path');
const src = process.argv[2] || 'https://studio.nexvorahubconnection.com/';
(async () => {
  const t0 = Date.now(), problems = [], ok = [];
  let html;
  try { html = /^https?:/.test(src) ? await (await fetch(src + (src.includes('?') ? '&' : '?') + 'v=' + Date.now(), { cache: 'no-store' })).text() : fs.readFileSync(src, 'utf8'); }
  catch (e) { console.log('FAIL: could not load ' + src + ' – ' + e.message); process.exit(1); }
  const pick = id => { const m = html.match(new RegExp('<script type="application/json" id="' + id + '">([\\s\\S]*?)</script>')); return m ? m[1] : ''; };
  const code = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1];
  if (!code) { console.log('FAIL: no application script found at ' + src); process.exit(1); }
  const local = path.join(__dirname, '..', '..', 'site', 'index.html');
  if (/^https?:/.test(src) && fs.existsSync(local)) { const same = fs.readFileSync(local, 'utf8').replace(/\r\n/g, '\n') === html.replace(/\r\n/g, '\n'); (same ? ok : problems).push(same ? 'Live site matches the latest local build' : 'Live site differs from the local build (deploy pending or not pushed)'); }
  const data = { dd: pick('dd'), aidc: pick('aidc'), coverage: pick('coverage'), access: pick('access') };
  const el = () => ({ innerHTML: '', textContent: '', hidden: true, value: '', dataset: {}, classList: { remove() {}, add() {} }, addEventListener() {}, click() {}, focus() {} });
  const els = {};
  const document = { getElementById: id => data[id] != null && data[id] !== '' ? { textContent: data[id] } : (els[id] = els[id] || el()), querySelector: s => (els[s] = els[s] || el()), addEventListener() {}, activeElement: null, createRange() { return { selectNodeContents() {} }; }, body: { classList: { add() {}, remove() {} }, appendChild() {} }, createElement: () => el(), title: '' };
  const sandbox = { document, window: {}, location: { hash: '' }, localStorage: { getItem: () => null, setItem() {} }, addEventListener() {}, scrollTo() {}, getSelection: () => ({ removeAllRanges() {}, addRange() {} }), navigator: {}, setTimeout, clearTimeout, console: { log() {}, warn() {}, error() {} } };
  const probe = `
    const res = { views: [], errs: [], exports: [] };
    const all = [...VIEWS.map(v => v[0]), ...EXTRA_VIEWS];
    const visit = (label) => all.forEach(v => { try { view = v; R = calcAll(); render(); const h = document.querySelector('#main').innerHTML || ''; if (h.length < 200) res.errs.push(label + ' / ' + v + ': page nearly empty'); res.views.push(label + ':' + v); } catch (e) { res.errs.push(label + ' / ' + v + ': ' + e.message); } });
    visit('example');
    [['Design schedules CSV', csvSchedules], ['BOQ CSV', csvBoq], ['LV test results CSV', csvLV], ['Testing & commissioning CSV', csvTc], ['Registers CSV', csvRegs], ['Facilities CSV', csvFm]].forEach(([n, f]) => { try { const t = f(); if (!t || t.length < 50) res.errs.push(n + ': empty'); else res.exports.push(n); } catch (e) { res.errs.push(n + ': ' + e.message); } });
    [['Excel workbook', () => xlsxProject()], ['Facilities Excel', () => typeof xlsxFm === 'function' ? xlsxFm() : null]].forEach(([n, f]) => { try { const b = f(); if (b === null) return; if (!(b && b.length > 2000 && b[0] === 0x50 && b[1] === 0x4b)) res.errs.push(n + ': invalid'); else res.exports.push(n + ' (' + Math.round(b.length / 1024) + ' kB)'); } catch (e) { res.errs.push(n + ': ' + e.message); } });
    try { const r = reportDoc(); if (!r || r.length < 1000) res.errs.push('Design report: empty'); else res.exports.push('Design report'); } catch (e) { res.errs.push('Design report: ' + e.message); }
    res.md = R.md; res.tx = R.txKva; res.circ = R.C.length; res.views_n = all.length;
    // same steps as the app's "New blank project" button
    try { const ex = exampleProject(); S = upgrade({ ...ex, project: { ...ex.project, name: '', ref: '', client: '', site: '', example: false }, zones: [], loads: [], lifts: [], pumps: [], circuits: [], dwgRooms: [], essLoads: [], review: { sheets: [], map: {}, areas: {}, vaSock: '' }, compliance: {}, cl: {} }); visit('blank'); } catch (e) { res.errs.push('blank project: ' + e.message); }
    globalThis.__CHECK = res;`;
  try { new Function(...Object.keys(sandbox), code + '\n' + probe)(...Object.values(sandbox)); }
  catch (e) { problems.push('App failed to start: ' + e.message); }
  const r = globalThis.__CHECK;
  if (r) {
    ok.push(r.views_n + ' stages and reports open with the worked example and a blank project');
    ok.push('Example: maximum demand ' + Math.round(r.md) + ' kVA, transformer ' + r.tx + ' kVA, ' + r.circ + ' circuits');
    ok.push('Exports: ' + r.exports.join(', '));
    r.errs.forEach(e => problems.push(e));
  } else if (!problems.length) problems.push('Check did not complete');
  console.log('NexvoraHub Studio operational check – ' + src + ' – ' + new Date().toISOString().slice(0, 16).replace('T', ' '));
  ok.forEach(m => console.log('  OK   ' + m));
  problems.forEach(m => console.log('  FAIL ' + m));
  console.log(problems.length ? 'NOT FULLY OPERATIONAL (' + problems.length + ' problem' + (problems.length > 1 ? 's' : '') + ')' : 'FULLY OPERATIONAL', '–', ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  process.exit(problems.length ? 1 : 0);
})();
