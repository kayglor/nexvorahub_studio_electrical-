const out = {};
out.md = +R.md.toFixed(1); out.areaKva = +R.Z.kva.toFixed(1); out.zones = R.Z.rows.map(r => [r.z.type.slice(0, 24), r.dens, +r.kva.toFixed(1)]); out.equip = +R.Lo.kva.toFixed(1);
out.lifts = R.Li.rows.map(r => [r.load, r.v, +r.kw.toFixed(2), r.motor, +r.grp.toFixed(1), r.hcp && +r.hcp.toFixed(3), Math.round(r.interval)]);
out.pumps = R.P.rows.map(r => [r.motor, r.starter, +r.kva.toFixed(1), +r.startKva.toFixed(1)]);
out.circ = R.C.map(r => [r.k.ref, +r.ib.toFixed(1), r.inr, r.csa, r.Iz && +r.Iz.toFixed(1), r.vd && +r.vd.toFixed(2), r.zs && +r.zs.toFixed(3), r.cpc, r.status]);
out.tx = { n: R.nTx, kva: R.txKva, flc: R.flc && Math.round(R.flc), fl: R.flP && +R.flP.toFixed(1), inc: R.incomer, icw: R.icw, gen: R.gen, met: R.met, bond: R.bond, room: R.room && [R.room.L, R.room.W, +R.room.swA.toFixed(1)] };
out.dc = (() => { const d = R.Dfull; return [d.racks, d.it, Math.round(d.fac), Math.round(d.md), +d.pueP.toFixed(2), d.upsI, d.genI, d.txI, d.crah, d.chill, d.rackPdu]; })();
out.energy = [R.E.base, R.E.savKwh, R.E.imp, R.E.eui, R.E.bank, R.E.mdAfter].map(Math.round);
out.checks = CHECKS.map(c => c[2](R)[1]).join(',');
const errs = [];
for (const [id] of VIEWS) { try { view = id; render(); if (!document.querySelector('#main').innerHTML.length) errs.push(id + ': empty'); } catch (e) { errs.push(id + ': ' + e.stack.split('\n').slice(0, 2).join(' ')); } }
out.viewErrors = errs;
const sw = [];
for (const c of COUNTRIES.map(c => c.name)) {
  S.project.country = c;
  try {
    R = calcAll(); for (const [id] of VIEWS) { view = id; render(); } reportDoc(); csvSchedules();
    if (['United States', 'Canada', 'United Arab Emirates', 'Japan', 'Brazil', 'Australia', 'Germany', 'Nigeria', 'India', 'China'].includes(c)) sw.push([c, R.X.vln + '/' + R.X.vll, R.X.dreg, R.X.fam, Math.round(R.Z.kva), Math.round(R.md), R.C.map(x => x.status.replace('FAIL – ', 'F:')).join('|')]);
  } catch (e) { sw.push([c, 'ERR ' + e.message]); }
}
out.countriesTested = COUNTRIES.length; out.sweep = sw;
S.project.country = 'United Kingdom'; S.dc.include = true; R = calcAll(); out.withDC = Math.round(R.md); render();
for (const t of TIERS) { S.dc.tier = t[0]; R = calcAll(); out[t[0].slice(0, 8)] = [R.D.upsI, R.D.genI, R.D.txI, R.D.crah, R.D.paths]; }
out.reportLen = reportDoc().length; out.csvLines = csvSchedules().split('\n').length;

// ---- AI data centre power planning (ai-dc-data.json) ----
const aiFail = [], near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const chk = (name, ok, got) => { if (!ok) aiFail.push(name + (got !== undefined ? ' got ' + JSON.stringify(got) : '')); };
// library integrity: every real platform has typical kW, liquid share, architecture, source URL and as-of date
AI_PLAT.slice(1).forEach(p => chk('platform data ' + p.name, p.kw[0] <= p.kw[1] && p.kw[1] <= p.kw[2] && p.liquid >= 0 && p.liquid <= 1 && /^https:\/\//.test(p.url) && isFinite(Date.parse(p.asOf)) && ['ac', 'dc'].includes(p.arch) && p.podRacks > 0));
chk('custom platform first', AI_PLAT[0].name === AI_CUSTOM && AI_PLAT[0].kw[1] == null);
chk('library version/date', !!AIDC.version && isFinite(Date.parse(AIDC.asOf)) && AIDC.staleMonths === 6);
// stale flag: older than 6 months
const ref = new Date('2026-11-05T00:00:00Z');
chk('stale 10 months', aiStale('2026-01-01', ref) === true); chk('fresh 1 month', aiStale('2026-10-01', ref) === false); chk('no date not stale', aiStale('', ref) === false);
chk('age months', near(aiAgeMonths('2026-05-05', ref), 6, 0.02), aiAgeMonths('2026-05-05', ref));
// default custom project keeps the original model (no liquid split, no DC adjustment)
S.dc.tier = 'Tier III – Concurrently maintainable'; R = calcAll();
chk('custom no liquid', R.D.ai.liqHeat === 0 && R.D.ai.cdu === 0 && R.D.ai.convAdj === 0 && R.D.crah === RED('N+1', Math.ceil(R.D.heat / 150)));
// GB300 NVL72, 100 racks
const dcSave = JSON.parse(JSON.stringify(S.dc));
S.dc.platform = 'NVIDIA GB300 NVL72'; applyPlatform(S.dc.platform); S.dc.method = 'By rack count'; S.dc.racks = 100; R = calcAll();
let D = R.D, a = D.ai;
chk('GB300 fills density', S.dc.density === 138 && S.dc.liquid === 0.85 && S.dc.arch === AI_ARCH.ac.name, [S.dc.density, S.dc.liquid, S.dc.arch]);
chk('GB300 IT', D.it === 13800, D.it);
chk('liquid heat', near(a.liqHeat, 11730), a.liqHeat); chk('air heat', near(a.airHeat, D.heat - 11730), a.airHeat);
chk('CDU count N+1', a.cdu === 9, a.cdu);
chk('CRAH on residual air', D.crah === RED('N+1', Math.ceil(a.airHeat / 150)), D.crah);
chk('rack amps AC', near(a.rackAac, 138000 / (Math.sqrt(3) * 400 * 0.95)), a.rackAac); chk('rack amps DC', near(a.rackAdc, 172.5), a.rackAdc);
chk('pods', a.pods === 13 && a.podKw === 1104, [a.pods, a.podKw]);
chk('cooling split', near(D.cool, 11730 * COOL['Direct-to-chip liquid cooling'] + a.airHeat * COOL[S.dc.cooling]), D.cool);
const effAC = S.dc.upsEff * AI_ARCH.ac.dist * AI_ARCH.ac.psu, effDC = AI_ARCH.dc.rect * AI_ARCH.dc.dist * AI_ARCH.dc.psu, l54 = 13800 * AI_ARCH.ac.psu;
chk('conversion AC/DC', near(a.convAC, l54 / effAC - l54) && near(a.convDC, l54 / effDC - l54) && a.convSave > 0 && a.convAdj === 0, [a.convAC, a.convDC]);
chk('DC more efficient by 3–7%', effDC - effAC > 0.03 && effDC - effAC < 0.07, effDC - effAC);
const facAC = D.fac;
// switch to 800 V DC: facility load falls by the conversion-loss difference
S.dc.arch = AI_ARCH.dc.name; R = calcAll(); D = R.D; a = D.ai;
chk('DC facility reduction', near(facAC - D.fac, a.convSave * 1.015), facAC - D.fac);
chk('DC rack power text', /800 V DC/.test(D.rackPdu), D.rackPdu);
// training dynamics + grid-forming BESS
Object.assign(S.dc, { swing: 0.5, ramp: 2, bessRed: 0.5, bessMin: 15 }); R = calcAll(); a = R.D.ai;
chk('swing MW', near(a.swingMW, 6.9) && near(a.rampMWs, 3.45), [a.swingMW, a.rampMWs]);
chk('BESS', near(a.bessMW, 3.45) && near(a.bessMWh, 0.8625) && near(a.residMW, 3.45) && near(a.bessMVA, 3.45 / 0.9), [a.bessMW, a.bessMWh]);
chk('BESS range 40–60%', AI_DYN.bessReduction[0] === 0.4 && AI_DYN.bessReduction[1] === 0.6 && AI_DYN.mitigations.some(m => /capping/i.test(m)) && AI_DYN.mitigations.some(m => /checkpoint/i.test(m)));
// views, report and CSV carry the new results
view = 'data-centre'; render(); const dcHtml = document.querySelector('#main').innerHTML;
chk('view AI section', /AI \/ high-density power planning/.test(dcHtml) && /Grid-forming BESS/.test(dcHtml) && /Platform data as of/.test(dcHtml) && /Mitigations/.test(dcHtml));
const rep = reportDoc(), csv = csvSchedules();
chk('report AI rows', /AI \/ GPU platform/.test(rep) && /Grid-forming BESS/.test(rep) && /Conversion losses/.test(rep) && /not verified code/.test(rep));
chk('csv AI rows', /DATA CENTRE \/ AI POWER PLANNING/.test(csv) && /Grid-forming BESS power/.test(csv) && /Current per rack \(800 V DC\)/.test(csv));
// Kyber planned platform recommends 800 V DC
applyPlatform('NVIDIA Kyber / Rubin Ultra NVL576 (planned)'); chk('Kyber DC', S.dc.arch === AI_ARCH.dc.name && S.dc.density === 600);
// projects saved before these fields existed are upgraded
const old = upgrade({ v: 1, dc: { density: 12 } }); chk('upgrade old project', old.dc.density === 12 && old.dc.platform === AI_CUSTOM && old.dc.arch === AI_ARCH.ac.name && old.dc.liquid === 0);
S.dc = dcSave; R = calcAll();
out.aiDc = [D.it, Math.round(D.fac), Math.round(a.liqHeat), a.cdu, +a.rackAac.toFixed(1), +a.rackAdc.toFixed(1), Math.round(a.convAC), Math.round(a.convDC), +a.bessMW.toFixed(2), +a.bessMWh.toFixed(3)];
out.aiChecks = aiFail.length ? aiFail : 'all passed';

// ---- electrical drawing generator (rooms → luminaires, sockets, circuits, checks, DXF) ----
const dwFail = [], dchk = (name, ok, got) => { if (!ok) dwFail.push(name + (got !== undefined ? ' got ' + JSON.stringify(got) : '')); };
const dwSave = JSON.stringify({ dwg: S.dwg, rooms: S.dwgRooms, country: S.project.country });
const findChk = (W, item, st) => W.chk.filter(c => c.item === item && (!st || c.st === st));
Object.keys(SOCK_BY_COUNTRY).forEach(c => dchk('socket map country exists ' + c, COUNTRIES.some(x => x.name === c)));
S.project.country = 'United Kingdom'; R = calcAll(); let W = R.W;
const [off, meet, corr, wc, tea] = W.rooms;
dchk('UK socket system', W.sock.n === 'BS 1363 13 A (Type G)' && W.sock.ring === 1 && W.lightIn === 6);
dchk('lumen method office', off.nLum === 79 && near(off.Eavg, 79 * 4000 * 0.48 / 300) && off.Eavg >= 500, [off.nLum, off.Eavg]);
dchk('lumen method meeting/corridor/WC/tea', meet.nLum === 8 && corr.nLum === 6 && wc.nLum === 6 && tea.nLum === 5, [meet.nLum, corr.nLum, wc.nLum, tea.nLum]);
dchk('socket guidance', off.nSock === 30 && meet.nSock === 3 && corr.nSock === 1 && wc.nSock === 0 && tea.nSock === 4, W.rooms.map(o => o.nSock));
dchk('emergency counts', off.nEm === 2 && meet.nEm === 0 && corr.nEm === 2 && wc.nEm === 1 && tea.nEm === 1, W.rooms.map(o => o.nEm));
const LC = W.C.filter(c => c.kind === 'L'), PC = W.C.filter(c => c.kind === 'P');
dchk('lighting circuits within 80% of 6 A and 20 points (UK practice)', LC.length === 6 && LC.every(c => c.w <= 0.8 * 6 * 230 * 0.9 + 1e-6 && c.pts <= 20) && LC.reduce((a, c) => a + c.pts, 0) === 79 + 8 + 6 + 6 + 5 + 6, LC.map(c => [c.pts, Math.round(c.w)]));
dchk('UK has no numeric rule – practice default stated', W.lightPts === 20 && !W.lpRule && /Design practice/.test(W.lpRef) && findChk(W, 'Lighting points per circuit', 'ok').length === 6, W.lpRef);
// regional lighting-point rules
const lpCase = (country, user) => { S.project.country = country; S.dwg.maxLightPts = user ?? ''; R = calcAll(); return R.W; };
let LW = lpCase('France'); dchk('France NF C 15-100: 8 points', LW.lightPts === 8 && LW.C.filter(c => c.kind === 'L').every(c => c.pts <= 8) && /NF C 15-100/.test(LW.lpRef));
LW = lpCase('Spain'); dchk('Spain ITC-BT-25: 30 points', LW.lightPts === 30 && LW.C.filter(c => c.kind === 'L').every(c => c.pts <= 30) && /ITC-BT-25/.test(LW.lpRef));
LW = lpCase('India'); dchk('India IS 732: 10 points and 800 W', LW.lightPts === 10 && LW.C.filter(c => c.kind === 'L').every(c => c.pts <= 10 && c.w <= 800 + 1e-6) && /IS 732/.test(LW.lpRef));
LW = lpCase('Canada'); dchk('Canada CEC 8-304: 12 outlets', LW.lightPts === 12 && LW.C.filter(c => c.kind === 'L').every(c => c.pts <= 12) && /8-304/.test(LW.lpRef));
LW = lpCase('United States'); dchk('US NEC: load-based, practice default', LW.lightPts === 20 && /no numeric limit/.test(LW.lpRef));
LW = lpCase('United Kingdom', 12); dchk('user limit applies', LW.lightPts === 12 && LW.C.filter(c => c.kind === 'L').every(c => c.pts <= 12) && /Your limit/.test(LW.lpRef));
LW = lpCase('United Kingdom'); R = calcAll();
dchk('every luminaire circuited', W.rooms.every(o => o.lc.reduce((a, x) => a + x[1], 0) === o.nLum + o.nEm) && W.rooms.every(o => o.pc.reduce((a, x) => a + x[1], 0) === o.nSock));
dchk('rings ≤ 100 m²', PC.length === 4 && PC.every(c => c.area <= 100 + 1e-6 && c.cc.ring && c.cc.inr === 32 && c.cc.csa === 2.5), PC.map(c => [Math.round(c.area), c.pts]));
const Lr1 = 2 * 10 + 2 * 35 * (10 / 30);
dchk('ring VD and Zs (OSG method)', near(PC[0].len, Lr1) && near(PC[0].cc.vd, 18 * 6.5 * Lr1 / 1000 / 230 * 100) && near(PC[0].cc.zs, 0.35 + DD.R12TE[CSA.indexOf(2.5)] * Lr1 / 4 * 1.2 / 1000), [PC[0].len, PC[0].cc.vd, PC[0].cc.zs]);
dchk('lighting circuits use 6 A RCBO and pass', LC.every(c => c.cc.inr === 6 && /RCBO/.test(c.cc.dev.n) && /^PASS/.test(c.cc.status)), LC.map(c => c.cc.status));
dchk('example has no failures', W.nBad === 0, W.chk.filter(c => c.st === 'bad'));
dchk('ways check', findChk(W, 'Distribution board ways', 'ok').length === 1);
// parameter checks react to bad inputs
S.dwg.rcd = false; R = calcAll(); dchk('no RCD on sockets fails', findChk(R.W, 'Additional protection by 30 mA RCD', 'bad').length === PC.length);
S.dwg.rcd = true; S.dwgRooms[0].nLum = 40; R = calcAll(); dchk('too few luminaires fails lux', R.W.chk.some(c => c.scope === off.r.name && c.item === 'Maintained illuminance' && c.st === 'bad'));
S.dwgRooms[0].nLum = ''; S.dwgRooms[3].type = 'Bathroom / shower'; S.dwgRooms[3].nSock = 1; R = calcAll(); dchk('bathroom socket warns', findChk(R.W, 'Socket-outlets in bathroom', 'warn').length === 1);
S.dwgRooms[3].type = 'Toilets / WC'; S.dwgRooms[3].nSock = ''; S.dwgRooms[2].nEm = 0; R = calcAll(); dchk('missing emergency fails', R.W.chk.some(c => c.scope === corr.r.name && c.item === 'Emergency lighting' && c.st === 'bad'));
S.dwgRooms[2].nEm = ''; S.dwgRooms[1].L = 0; R = calcAll(); dchk('zero dimension fails', findChk(R.W, 'Room dimensions', 'bad').length === 1);
S.dwgRooms[1].L = 6; S.dwg.ways = 12; R = calcAll(); dchk('few ways warns', findChk(R.W, 'Distribution board ways', 'warn').length === 1, R.W.C.length);
S.dwg.ways = 24; S.dwg.uf = 1.2; R = calcAll(); dchk('UF out of range fails', findChk(R.W, 'Utilisation factor', 'bad').length === 1);
S.dwg.uf = 0.6; S.dwg.sockType = 'Schuko CEE 7/3 16 A (Type F)'; R = calcAll(); dchk('socket mismatch warns', findChk(R.W, 'Socket-outlet system matches region', 'warn').length === 1 && R.W.C.filter(c => c.kind === 'P').every(c => c.pts <= 8 && c.cc.inr === 16));
S.dwg.sockType = '';
// other regions
S.project.country = 'United States'; R = calcAll(); W = R.W;
dchk('US NEMA, 180 VA rule, 20 A', /NEMA/.test(W.sock.n) && W.ptsLim === 13 && W.lightIn === 20 && W.vaSock === 180 && W.C.filter(c => c.kind === 'P').every(c => c.pts <= 13 && c.cc.inr === 20), [W.sock.n, W.ptsLim]);
S.project.country = 'Germany'; R = calcAll(); dchk('Germany Schuko 8 per circuit', /Schuko/.test(R.W.sock.n) && R.W.ptsLim === 8 && R.W.lightIn === 10);
S.project.country = 'Australia'; R = calcAll(); dchk('Australia AS/NZS 3112', /3112/.test(R.W.sock.n));
// DXF and SVG for every country
let dxfBad = [];
for (const c of COUNTRIES) { S.project.country = c.name; R = calcAll(); const G = dwgGeom(R.W), dxf = toDXF(G), svg = toSVG(G); const lines = dxf.split('\r\n'); lines.pop();
  if (!/^0\r\nSECTION\r\n2\r\nHEADER/.test(dxf) || !dxf.endsWith('0\r\nEOF\r\n') || lines.length % 2 || /NaN|undefined|Infinity/.test(dxf + svg) || /[^\x00-\x7f]/.test(dxf) || lines.some((l, i) => i % 2 === 0 && !/^\s*\d+$/.test(l))) dxfBad.push(c.name); }
dchk('DXF valid for all countries', !dxfBad.length, dxfBad);
S.project.country = 'United Kingdom'; R = calcAll();
const G = dwgGeom(R.W), dxf = toDXF(G), cnt = t => (dxf.match(new RegExp('\\r\\n0\\r\\n' + t + '\\r\\n', 'g')) || []).length;
dchk('DXF layers and entities', DWG_LAYERS.every(([n]) => dxf.includes('\r\n2\r\n' + n + '\r\n')) && /AC1009/.test(dxf) && cnt('LINE') > 300 && cnt('CIRCLE') > 20 && cnt('TEXT') > 100, [cnt('LINE'), cnt('CIRCLE'), cnt('TEXT')]);
view = 'drawings'; render(); const dwHtml = document.querySelector('#main').innerHTML;
dchk('drawings view', /Parameter checks/.test(dwHtml) && /<svg/.test(dwHtml) && /Final circuit schedule/.test(dwHtml));
dchk('report + csv', /Lighting and small power – final circuits/.test(reportDoc()) && /FINAL CIRCUITS/.test(csvSchedules()) && /ROOM LOAD SHEET/.test(csvSchedules()));
dchk('old project upgrade', (() => { const o = upgrade({ v: 1, dc: {} }); return Array.isArray(o.dwgRooms) && o.dwgRooms.length === 0 && o.dwg.board === 'DB-L1'; })());
const sv = JSON.parse(dwSave); S.dwg = sv.dwg; S.dwgRooms = sv.rooms; S.project.country = sv.country; R = calcAll();
out.dwg = [R.W.rooms.map(o => [o.nLum, Math.round(o.Eavg), o.nSock, o.nEm]), R.W.C.map(c => [c.ref, c.pts, Math.round(c.w), c.cc.csa, c.cc.status]), [R.W.nOk, R.W.nWarn, R.W.nBad], dxf.length];
out.dwgChecks = dwFail.length ? dwFail : 'all passed';

// ---- drawing review: DXF import, legend learning, counts by room, pre-checks ----
const rvFail = [], rchk = (name, ok, got) => { if (!ok) rvFail.push(name + (got !== undefined ? ' got ' + JSON.stringify(got) : '')); };
const rvSave = JSON.stringify(S.review);
const sDXF = (() => {
  const o = [], p = (c, v) => o.push(String(c), String(v));
  const T = (x, y, h, s, ly = 'TEXT') => { p(0, 'TEXT'); p(8, ly); p(10, x); p(20, y); p(30, 0); p(40, h); p(1, s); };
  const I = (n, x, y, ly = '0', at) => { p(0, 'INSERT'); p(8, ly); p(2, n); p(10, x); p(20, y); p(30, 0); if (at) { p(66, 1); Object.entries(at).forEach(([k, v]) => { p(0, 'ATTRIB'); p(8, ly); p(10, x); p(20, y); p(40, 100); p(1, v); p(2, k); }); p(0, 'SEQEND'); } };
  const RM = (x1, y1, x2, y2) => { p(0, 'LWPOLYLINE'); p(8, 'A-ROOM'); p(90, 4); p(70, 1); [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].forEach(([x, y]) => { p(10, x); p(20, y); }); };
  p(0, 'SECTION'); p(2, 'HEADER'); p(9, '$INSUNITS'); p(70, 4); p(0, 'ENDSEC');
  p(0, 'SECTION'); p(2, 'BLOCKS'); p(0, 'BLOCK'); p(8, '0'); p(2, 'LUM1'); p(0, 'CIRCLE'); p(8, '0'); p(10, 0); p(20, 0); p(40, 300); p(0, 'ENDBLK'); p(0, 'ENDSEC');
  p(0, 'SECTION'); p(2, 'ENTITIES');
  T(50000, 20000, 450, '%%ULEGEND');
  I('LUM1', 50500, 18500); T(52000, 18500, 270, 'L1'); T(53000, 18600, 300, 'LED PANEL 600x600, 230V, 36 WATT, 3600 LUMENS');
  I('EM1', 50500, 17000); T(52000, 17000, 270, 'L2'); T(53000, 17000, 300, 'SAME AS L1 BUT WITH BACK UP BATTERY FOR 3 HOURS');
  I('SOCK', 50500, 15500); T(52000, 15500, 270, 'S1'); T(53000, 15500, 300, 'TWIN SWITCHED SOCKET OUTLET 13A');
  RM(0, 0, 10000, 10000); RM(10000, 0, 20000, 2000);
  p(0, 'MTEXT'); p(8, 'TEXT'); p(10, 4000); p(20, 5000); p(40, 250); p(1, '{\\fArial|b1;OFFICE}');
  T(14000, 1000, 250, 'CORRIDOR');
  [[2000, 2000], [5000, 2000], [8000, 2000], [2000, 8000], [5000, 8000], [8000, 8000]].forEach(([x, y]) => I('LUM1', x, y));
  I('EM1', 5000, 6000); [[500, 500], [9500, 500], [9500, 9500], [500, 9500]].forEach(([x, y]) => I('SOCK', x, y, 'E-POWER', { CCT: 'P1' }));
  I('LUM1', 12000, 1000); I('LUM1', 18000, 1000); I('FURN-DESK', 3000, 4000, 'FURN');
  p(0, 'TEXT'); p(8, 'TEXT'); p(67, 1); p(10, 0); p(20, 0); p(40, 100); p(1, 'PAPER SPACE NOTE');
  p(0, 'ENDSEC'); p(0, 'EOF');
  return o.join('\r\n');
})();
const pd = parseDXF(sDXF);
rchk('parse units / entities', pd.units === 4 && pd.ents.filter(e => e.type === 'INSERT').length === 3 + 6 + 1 + 4 + 3 && !pd.ents.some(e => e.text === 'PAPER SPACE NOTE') && pd.ents.some(e => e.text === 'OFFICE'), [pd.units, pd.ents.length]);
rchk('ATTRIB read', pd.ents.filter(e => e.type === 'INSERT' && e.name === 'SOCK' && e.attribs.CCT === 'P1').length === 4);
rchk('dxfClean', dxfClean('%%ULEGEND') === 'LEGEND' && dxfClean('{\\fArial|b1;OFFICE}') === 'OFFICE' && dxfClean('A\\PB') === 'A B' && dxfClean('\\U+00D8 50') === 'Ø 50');
let threw = ''; try { parseDXF('AutoCAD Binary DXF\r\n'); } catch (e) { threw = e.message; } rchk('binary DXF rejected', /Binary DXF/.test(threw));
const shT = analyzeDrawing(pd.ents, pd.units, 'test.dxf');
const lg = Object.fromEntries(shT.legend.map(e => [e.block, e]));
rchk('legend learned', shT.legendFound && shT.legend.length === 3 && lg.LUM1.code === 'L1' && lg.LUM1.w === 36 && lg.LUM1.lm === 3600 && lg.LUM1.type === 'Luminaire' && lg.EM1.type === 'Emergency luminaire' && lg.EM1.w === 36 && lg.SOCK.type === 'Socket', shT.legend.map(e => [e.block, e.code, e.type, e.w]));
rchk('rooms from outlines', shT.roomMode === 'outlines' && shT.rooms.length === 2 && near(shT.rooms.find(r => r.name === 'OFFICE').area, 100) && near(shT.rooms.find(r => r.name === 'CORRIDOR').area, 20), shT.rooms);
rchk('legend symbols excluded from counts', shT.blocks.LUM1.n === 8 && shT.blocks.EM1.n === 1 && shT.blocks.SOCK.n === 4, shT.blocks);
S.project.country = 'United Kingdom'; S.review = { sheets: [shT], map: {}, areas: {}, vaSock: '' }; R = calcAll(); let RV = R.RV;
const off2 = RV.rooms.find(r => r.name === 'OFFICE'), cor2 = RV.rooms.find(r => r.name === 'CORRIDOR');
rchk('room counts and load', off2.lum === 6 && off2.em === 1 && off2.sock === 4 && off2.lightW === 7 * 36 && near(off2.lpd, 2.52) && cor2.lum === 2 && cor2.em === 0, [off2, cor2]);
rchk('escape route without emergency fails', RV.chk.some(c => c.scope === 'CORRIDOR' && c.item === 'Emergency lighting on escape route' && c.st === 'bad'));
rchk('open area > 60 m² has emergency', !RV.chk.some(c => c.scope === 'OFFICE' && c.item === 'Open-area emergency lighting'));
rchk('unknown symbol flagged', RV.chk.some(c => c.scope === 'FURN-DESK' && c.item === 'Unidentified symbol'));
rchk('socket load', RV.tot.sock === 4 && RV.sockVA === 800);
S.review.map['FURN-DESK'] = { type: 'Ignore' }; S.review.map.LUM1 = { w: 30 }; S.review.areas.CORRIDOR = 25; R = calcAll(); RV = R.RV;
rchk('mapping corrections apply', !RV.chk.some(c => c.scope === 'FURN-DESK') && RV.rooms.find(r => r.name === 'OFFICE').lightW === 6 * 30 + 36 && RV.eff.find(e => e.block === 'LUM1').src === 'You' && RV.rooms.find(r => r.name === 'CORRIDOR').area === 25);
// conflicting legends across two drawings + fluorescent + shared block
const sh2 = analyzeDrawing(parseDXF(sDXF.replace('36 WATT, 3600 LUMENS', 'FLUORESCENT 4x14W, 3000 LUMENS').replace('\r\nL2\r\n', '\r\nL1\r\n')).ents, 4, 'other.dxf');
S.review = { sheets: [shT, sh2], map: {}, areas: {}, vaSock: '' }; R = calcAll(); RV = R.RV;
rchk('legends disagree detected', RV.chk.some(c => c.scope === 'LUM1' && c.item === 'Legends disagree' && c.st === 'bad'), RV.chk.map(c => c.item));
rchk('4x14W parsed as 56 W and fluorescent flagged', sh2.legend.find(e => e.block === 'LUM1').w === 56 && sh2.legend.find(e => e.block === 'LUM1').fluo);
rchk('shared block warned', sh2.amb.LUM1 === undefined && sh2.legend.filter(e => e.code === 'L1').length === 2);
view = 'review'; render(); const rvHtml = document.querySelector('#main').innerHTML;
rchk('review view', /Symbol mapping/.test(rvHtml) && /Load sheet by room/.test(rvHtml) && /Pre-checks/.test(rvHtml));
rchk('review report + csv', /Drawing review \(imported DXF\)/.test(reportDoc()) && /DRAWING REVIEW – LOAD SHEET BY ROOM/.test(csvSchedules()) && /DRAWING REVIEW – PRE-CHECKS/.test(csvSchedules()));
rchk('old project upgrade review', (() => { const o = upgrade({ v: 1 }); return Array.isArray(o.review.sheets) && typeof o.review.map === 'object'; })());
S.review = JSON.parse(rvSave); R = calcAll();
view = 'review'; render(); rchk('empty review view', /No drawings imported yet/.test(document.querySelector('#main').innerHTML));
out.review = [shT.legend.length, shT.rooms.map(r => [r.name, Math.round(r.area)]), Object.fromEntries(Object.entries(shT.blocks).map(([k, v]) => [k, v.n]))];
out.reviewChecks = rvFail.length ? rvFail : 'all passed';

// ---- design on a submitted layout: rooms from walls, overlay DXF in the drawing's own coordinates ----
const lyFail = [], lchk = (name, ok, got) => { if (!ok) lyFail.push(name + (got !== undefined ? ' got ' + JSON.stringify(got) : '')); };
const lySave = JSON.stringify({ dwg: S.dwg, rooms: S.dwgRooms, country: S.project.country });
// Plan (mm): OFFICE 6 × 4 m at (1000,1000) and CORRIDOR 6 × 2 m above it; door gap in the shared wall; windows on the south façade.
const lyDXF = (k = 1, units = 4) => {
  const o = [], p = (c, v) => o.push(String(c), String(v)), Ln = (x1, y1, x2, y2, ly = 'A-WALL') => { p(0, 'LINE'); p(8, ly); p(10, x1 * k); p(20, y1 * k); p(30, 0); p(11, x2 * k); p(21, y2 * k); p(31, 0); };
  p(0, 'SECTION'); p(2, 'HEADER'); p(9, '$INSUNITS'); p(70, units); p(0, 'ENDSEC'); p(0, 'SECTION'); p(2, 'ENTITIES');
  Ln(1000, 1000, 2500, 1000); Ln(2500, 1000, 5500, 1000, 'A-WINDOW'); Ln(5500, 1000, 7000, 1000); // south: wall + window + wall
  Ln(7000, 1000, 7000, 7000); Ln(1000, 1000, 1000, 7000); Ln(1000, 7000, 7000, 7000); // east, west, north
  Ln(1000, 5000, 3000, 5000); Ln(3900, 5000, 7000, 5000); // shared wall with a 0.9 m door gap
  p(0, 'TEXT'); p(8, 'A-TEXT'); p(10, 3500 * k); p(20, 3000 * k); p(30, 0); p(40, 200 * k); p(1, 'OFFICE');
  p(0, 'TEXT'); p(8, 'A-TEXT'); p(10, 3200 * k); p(20, 6000 * k); p(30, 0); p(40, 200 * k); p(1, 'CORRIDOR');
  p(0, 'ENDSEC'); p(0, 'EOF'); return o.join('\r\n');
};
const pl = parseDXF(lyDXF());
lchk('LINE entities read', pl.ents.filter(e => e.type === 'LINE').length === 8 && pl.ents.find(e => e.type === 'LINE').x2 === 2500);
const ly = detectLayout(pl.ents, pl.units, 'plan.dxf'), lo = ly.rooms.find(r => r.name === 'OFFICE'), lc = ly.rooms.find(r => r.name === 'CORRIDOR');
lchk('rooms sized from walls', ly.rooms.length === 2 && lo.ok && lc.ok && near(lo.L, 6, 1e-3) && near(lo.W, 4, 1e-3) && near(lc.L, 6, 1e-3) && near(lc.W, 2, 1e-3) && near(lo.x0, 1000) && near(lo.y0, 1000) && near(lc.y0, 5000), ly.rooms);
lchk('room types from labels', lo.type === 'Office – cellular' && lc.type === 'Corridor / circulation');
S.project.country = 'United Kingdom'; applyLayout(ly); R = calcAll();
lchk('applied as generator rooms', S.dwgRooms.length === 2 && S.dwgRooms[0].ox === lo.x0 && R.W.rooms.every(o => o.A > 0) && !R.W.chk.some(c => c.item === 'Room size from layout'));
let LG = toDXF(dwgGeom(R.W)), Gm = dwgGeom(R.W);
const fit = Gm.P.filter(q => q.t === 'C' && q.ly === 'E-LIGHT' && q.y > 500); // plan area only (legend samples sit below)
const inside = (q, r) => q.x > r.x0 && q.x < r.x0 + r.L * 1000 && q.y > r.y0 && q.y < r.y0 + r.W * 1000;
lchk('overlay fittings inside real rooms', Gm.overlay && fit.length > 0 && fit.every(q => inside(q, lo) || inside(q, lc)), fit.slice(0, 3));
lchk('architecture kept out of the DXF', !/X-ARCH/.test(LG) && Gm.P.some(q => q.ly === 'X-ARCH'));
lchk('schedule placed below the layout', Gm.P.filter(q => q.ly === 'E-TABLE').every(q => (q.y1 ?? q.y) < 1000));
// same plan drawn in metres: rooms identical, geometry scaled into metres
const plm = parseDXF(lyDXF(0.001, 6)), lym = detectLayout(plm.ents, plm.units, 'plan-m.dxf'), lom = lym.rooms.find(r => r.name === 'OFFICE');
lchk('metre drawing', lym.uM === 1 && near(lom.L, 6, 1e-3) && near(lom.x0, 1, 1e-6), lom);
applyLayout(lym); R = calcAll(); const Gmm = dwgGeom(R.W), fm = Gmm.P.filter(q => q.t === 'C' && q.ly === 'E-LIGHT' && q.y > 0.5);
lchk('metre overlay scaled', fm.every(q => q.x > 0.9 && q.x < 7.1 && q.y > 0.9 && q.y < 7.1 && q.r < 1) && Gmm.P.filter(q => q.t === 'T').every(q => q.h < 1), fm.slice(0, 2));
const fail = detectLayout(parseDXF(lyDXF().replace(/A-WALL/g, 'NOTES').replace(/A-WINDOW/g, 'NOTES')).ents, 4, 'x.dxf');
lchk('falls back to all lines when no wall layer', fail.wallMode === 'all lines' && fail.rooms.every(r => r.ok));
view = 'drawings'; render(); lchk('drawings view shows layout', /Designing on the layout/.test(document.querySelector('#main').innerHTML));
const sv2 = JSON.parse(lySave); S.dwg = sv2.dwg; S.dwgRooms = sv2.rooms; S.project.country = sv2.country; R = calcAll();
out.layout = ly.rooms.map(r => [r.name, +r.L.toFixed(2), +r.W.toFixed(2), r.ok]);
out.layoutChecks = lyFail.length ? lyFail : 'all passed';
// energy intensity without an area schedule: drawing rooms' area, else "not known" (never a false pass)
{ const zs = S.zones, rs = S.dwgRooms, dci = S.dc.include, eFail = []; S.dc.include = false;
  S.zones = []; R = calcAll(); if (!(R.W.area > 0 && near(R.E.eui, R.E.imp / R.W.area))) eFail.push('EUI from drawing rooms got ' + R.E.eui);
  S.dwgRooms = []; R = calcAll(); const ec = CHECKS.find(c => /Energy metering/.test(c[0]))[2](R); if (isFinite(R.E.eui) || ec[1] !== 'na' || !/not known/.test(ec[0])) eFail.push('no area got ' + JSON.stringify([R.E.eui, ec]));
  view = 'energy'; render(); if (/NaN/.test(document.querySelector('#main').innerHTML + reportDoc())) eFail.push('NaN shown');
  S.zones = zs; S.dwgRooms = rs; S.dc.include = dci; R = calcAll(); out.energyAreaChecks = eFail.length ? eFail : 'all passed'; }
// ---- panel schedules read from a DXF table; optional maximum-demand basis ----
{ const pFail = [], pchk = (n, ok, got) => { if (!ok) pFail.push(n + (got !== undefined ? ' got ' + JSON.stringify(got) : '')); };
  const pvSave = JSON.stringify(S.review);
  // two schedules side by side (text height 0.3, as in the course drawing); B has an arithmetic slip and a small incomer
  const sch = (() => { const o = [], p = (c, v) => o.push(String(c), String(v)), T = (x, y, s, h = 0.3) => { p(0, 'TEXT'); p(8, 'PS'); p(10, x); p(20, y); p(30, 0); p(40, h); p(1, s); };
    p(0, 'SECTION'); p(2, 'ENTITIES');
    const one = (dx, name, cats, conn, df, dem, total, stated, mcb) => {
      T(dx + 4.7, 20.35, 'PANEL:'); T(dx + 6.2, 20.3, name, 0.4); T(dx - 4.6, 19.6, '400/230V&50HZ'); T(dx + 0.4, 19.7, 'ISC=25 KA');
      T(dx + 3.7, -1, mcb + ' AMPS TRIP/FRAME'); T(dx + 9, -1, 'MCCB');
      T(dx - 7.4, -3.43, `TOTAL CONNECTED LOAD ${stated} KVA`);
      cats.forEach((c, i) => T(dx + 2.3 + 1.7 * i, -2.45, c)); T(dx + 2.3 + 1.7 * cats.length, -2.45, 'TOTAL');
      T(dx, -3.06, 'CONN. KVA'); conn.forEach((v, i) => T(dx + 2.6 + 1.7 * i, -3.1, v)); T(dx + 2.6 + 1.7 * cats.length, -3.12, total[0]);
      T(dx, -3.71, 'DEM. FACTOR'); df.forEach((v, i) => T(dx + 2.6 + 1.7 * i, -3.75, v));
      T(dx, -4.4, 'DEMAND KVA'); dem.forEach((v, i) => T(dx + 2.6 + 1.7 * i, -4.45, v)); T(dx + 2.6 + 1.7 * cats.length, -4.45, total[1]);
    };
    one(-32.7, 'DB-A', ['LIGHTING', 'S.OUTLET'], ['20', '10'], ['0.8', '0.5'], ['16', '5'], ['30', '21'], '30', '63/100');
    one(-10.7, 'DB-B', ['MOTORS', 'MISC.'], ['40', '20'], ['1', '0.5'], ['40', '10'], ['60', '60'], '62', '50/100');
    p(0, 'ENDSEC'); p(0, 'EOF'); return o.join('\r\n'); })();
  const ps = analyzeDrawing(parseDXF(sch).ents, 6, 'panels.dxf'), A = ps.panels.find(q => q.name === 'DB-A'), B = ps.panels.find(q => q.name === 'DB-B');
  pchk('two panels found', ps.panels.length === 2 && A && B, ps.panels.map(q => q.name));
  pchk('panel A read', A.vll === 400 && A.vln === 230 && A.isc === 25 && A.trip === 63 && A.frame === 100 && A.dev === 'MCCB' && A.conn === 30 && A.dem === 21 && A.stated === 30 && A.cats.length === 2 && A.cats[0].name === 'Lighting' && A.cats[0].df === 0.8 && A.cats[1].name === 'Socket outlets' && A.cats[1].dem === 5, A);
  pchk('panel B read', B.trip === 50 && B.conn === 60 && B.dem === 60 && B.cats[0].name === 'Motors' && near(B.demCalc, 50), B);
  S.project.country = 'United Kingdom'; S.review = { sheets: [ps], map: {}, areas: {}, vaSock: '', mdBasis: 'area' }; R = calcAll();
  const pc = R.RV.chk, has = (sc, it, st) => pc.some(c => c.scope === 'Panel ' + sc && c.item === it && c.st === st);
  pchk('A breaker ok', has('DB-A', 'Incoming breaker vs demand current', 'ok'));
  pchk('B demand 87 A on 50 A fails', has('DB-B', 'Incoming breaker vs demand current', 'bad') && near(R.RV.panels.find(q => q.name === 'DB-B').iDem, 60000 / (Math.sqrt(3) * 400)));
  pchk('B demand-factor slip and stated total flagged', has('DB-B', 'Demand factors applied', 'warn') && has('DB-B', 'Stated total connected load', 'warn'));
  pchk('no legend/room noise for schedule-only drawing', !pc.some(c => /Legend found|Room outlines|Unidentified/.test(c.item)), pc.map(c => c.item));
  const mdArea = R.md;
  S.review.mdBasis = 'panels'; R = calcAll();
  pchk('panel basis', R.PB === 81 && near(R.md, (81 + R.Li.kva + R.P.kva + (R.D ? R.D.md : 0)) * (1 + S.project.spare)) && R.md !== mdArea, [R.PB, R.md]);
  view = 'review'; render(); const ph = document.querySelector('#main').innerHTML; pchk('review view panels', /Panel schedules/.test(ph) && /Maximum demand basis/.test(ph) && /DB-B/.test(ph));
  view = 'sizing'; render(); pchk('sizing shows panel basis', /Panel schedules/.test(document.querySelector('#main').innerHTML));
  pchk('report + csv', /based on the imported panel schedules/.test(reportDoc()) && /PANEL SCHEDULES \(imported\) – used as maximum demand basis/.test(csvSchedules()));
  S.review = JSON.parse(pvSave); R = calcAll(); pchk('default basis unchanged', R.PB == null && near(R.md, mdArea));
  out.panels = ps.panels.map(q => [q.name, q.conn, q.dem, q.trip, q.vll]);
  out.panelChecks = pFail.length ? pFail : 'all passed'; }
// ---- hardening: CSV formula injection, labelled form fields ----
{ const hFail = [], nm = S.project.name, ld = S.loads.length ? S.loads[0].desc : null;
  S.project.name = '=HYPERLINK("http://x","click")'; if (S.loads.length) S.loads[0].desc = '@SUM(A1)'; R = calcAll();
  const csv = csvSchedules();
  if (!csv.includes(`"'=HYPERLINK(""http://x"",""click"")"`)) hFail.push('formula not neutralised');
  if (S.loads.length && !csv.includes(`"'@SUM(A1)"`)) hFail.push('@ not neutralised');
  if (/(^|,)"=/m.test(csv) || /(^|,)"@/m.test(csv) || /(^|,)"\+/m.test(csv)) hFail.push('a cell still starts with = @ +');
  if (!/"-?\d/.test(csv)) hFail.push('numbers changed');
  S.project.name = nm; if (ld != null) S.loads[0].desc = ld; R = calcAll();
  view = 'project'; render(); if (!/<label for="project_name">/.test(document.querySelector('#main').innerHTML)) hFail.push('labels not linked to inputs');
  out.hardeningChecks = hFail.length ? hFail : 'all passed'; }
// ---- regional coverage register ----
{ const cFail = [], cchk = (n, ok, got) => { if (!ok) cFail.push(n + (got !== undefined ? ' got ' + JSON.stringify(got) : '')); };
  const K = coverageAll(), by = n => K.rows.find(r => r.name === n);
  cchk('levels add up to all countries', K.full + K.supported + K.indicative + K.unavailable === COUNTRIES.length && K.rows.length === 94, [K.full, K.supported, K.indicative, K.unavailable]);
  cchk('UK full, native BS 7671', by('United Kingdom').level === 'full' && /native/.test(by('United Kingdom').cable));
  cchk('Germany supported with VDE deviation note', by('Germany').level === 'supported' && by('Germany').notes.some(t => /VDE/.test(t)));
  cchk('US and Canada indicative', by('United States').level === 'indicative' && by('Canada').level === 'indicative' && /AWG/.test(by('United States').notes.join(' ')));
  cchk('Australia indicative (AS/NZS 3008 needed)', by('Australia').level === 'indicative' && /3008/.test(by('Australia').notes.join(' ')));
  cchk('100–127 V systems indicative', ['Brazil', 'Japan', 'Taiwan'].every(n => by(n).level === 'indicative'));
  cchk('Russia not offered', by('Russia').level === 'unavailable' && !by('Russia').ready);
  cchk('nothing ready until verified', K.ready === 0);
  COV.verified.Germany = { edition: 'DIN VDE 0100 (HD 60364) – test', date: '2026-11-08', by: 'Test engineer' };
  cchk('verification makes a supported country ready', coverageOf(COUNTRIES.find(c => c.name === 'Germany')).ready === true && coverageAll().ready === 1);
  COV.verified['United States'] = { edition: 'NEC 2023', date: '2026-11-08' };
  cchk('indicative stays not ready even if verified', coverageOf(COUNTRIES.find(c => c.name === 'United States')).ready === false);
  delete COV.verified.Germany; delete COV.verified['United States'];
  view = 'coverage'; render(); const ch = document.querySelector('#main').innerHTML;
  cchk('coverage view', /Regional coverage/.test(ch) && /Ready to sell/.test(ch) && (ch.match(/<tr/g) || []).length >= 95);
  const S0 = S.project.country; S.project.country = 'France'; R = calcAll();
  cchk('report states coverage of the project country', /Regional coverage for France: Supported/.test(reportDoc()) && /NF C 15-100 prescriptive/.test(reportDoc()));
  S.project.country = S0; R = calcAll();
  const cv = csvCoverage(); cchk('coverage CSV', cv.split('\r\n').length === 96 && /"Russia".*"Not offered"/.test(cv));
  out.coverage = [K.full, K.supported, K.indicative, K.unavailable];
  out.coverageChecks = cFail.length ? cFail : 'all passed'; }
// ---- regional cable data: AWG equivalents, US device ratings, imported table packs ----
{ const tFail = [], tchk = (n, ok, got) => { if (!ok) tFail.push(n + (got !== undefined ? ' got ' + JSON.stringify(got) : '')); }; const XP0 = S.sizing.expand; S.sizing.expand = 0; R = calcAll();
  const S0 = S.project.country, C0 = JSON.stringify(S.circuits);
  tchk('AWG equivalents', awgOf(1.5) === '14 AWG' && awgOf(2.5) === '12 AWG' && awgOf(4) === '10 AWG' && awgOf(95) === '4/0 AWG' && awgOf(240) === '500 kcmil' && awgOf(600) === '> 1000 kcmil', [awgOf(2.5), awgOf(95), awgOf(240)]);
  S.project.country = 'United States'; R = calcAll();
  tchk('US devices use NEC 240.6(A) ratings', R.C.filter(c => c.inr).every(c => NEC_STD.includes(c.inr)), R.C.map(c => c.inr));
  tchk('US sizes carry AWG', R.C.filter(c => c.csa).every(c => c.awg && /AWG|kcmil/.test(c.awg)) && /≈ \d+ AWG|≈ .*kcmil|≈ \d\/0 AWG/.test(reportDoc()) && /AWG equivalent/.test(csvSchedules()));
  view = 'circuits'; render(); tchk('circuits view shows AWG + source', /AWG/.test(document.querySelector('#main').innerHTML) && /NEC 240\.6\(A\)/.test(document.querySelector('#main').innerHTML));
  S.project.country = 'United Kingdom'; R = calcAll();
  tchk('UK unchanged: IEC ratings, no AWG', R.C.every(c => !c.awg) && R.C.map(c => c.inr).join() === '6,20,200,80', R.C.map(c => c.inr));
  // packs
  tchk('template is structurally valid', validatePack(packTemplate()).length === 0, validatePack(packTemplate()));
  tchk('bad pack rejected with reasons', validatePack({ combos: [{ name: 'x', temp: 60, it1: [1, 2] }] }).length >= 3);
  const base = R.C.find(c => c.k.ref === 'S01');
  const big = { source: 'Test table – doubled ratings', licence: 'TEST', combos: DD.COMBOS.map(c => ({ name: 'Pack ' + (c.name || c.n), temp: c.temp, it1: c.it1.map(v => v * 2), mv1: c.mv1, it3: c.it3.map(v => v * 2), mv3: c.mv3 })) };
  tchk('test pack valid', validatePack(big).length === 0, validatePack(big));
  S.cablePack = big; R = calcAll(); const withPack = R.C.find(c => c.k.ref === 'S01');
  tchk('pack changes sizing', withPack.csa < base.csa && /Test table – doubled ratings \(imported – licence: TEST\)/.test(cableSource()), [base.csa, withPack.csa]);
  tchk('report names the pack', /Cable data: Test table – doubled ratings/.test(reportDoc()));
  view = 'drawings'; render(); tchk('drawing cable list uses pack names', /Pack /.test(document.querySelector('#main').innerHTML));
  delete S.cablePack; R = calcAll(); tchk('built-in restored', R.C.find(c => c.k.ref === 'S01').csa === base.csa && cableSource() === 'BS 7671 Appendix 4 (built-in)');
  view = 'drawings'; render(); tchk('drawing cable list has names (bug fix)', (document.querySelector('#main').innerHTML.match(/<option value="\d"[^>]*>([^<]*)<\/option>/g) || []).some(o => /Twin &amp; earth/.test(o)));
  S.project.country = S0; S.circuits = JSON.parse(C0); R = calcAll();
  S.sizing.expand = XP0; R = calcAll(); out.cableChecks = tFail.length ? tFail : 'all passed'; }
// ---- paid access groundwork (open by default) ----
{ const aFail = [], achk = (n, ok, got) => { if (!ok) aFail.push(n + (got !== undefined ? ' got ' + JSON.stringify(got) : '')); };
  const M0 = ACCESS.mode, U0 = ACCESS.checkoutUrl, L0 = LIC, C0 = S.project.country;
  achk('shipped open: nothing gated', ACCESS.mode === 'open' && ACCESS.proActions.every(a => !proBlocked(a)));
  view = 'account'; render(); achk('account view (open)', /All features are currently free/.test(document.querySelector('#main').innerHTML));
  ACCESS.mode = 'pro'; LIC = null;
  achk('pro mode gates Pro actions only', ['dl-report', 'dl-dxf', 'load-dxf', 'load-pack', 'dl-csv'].every(proBlocked) && !proBlocked('save-json') && !proBlocked('dl-coverage') && !proBlocked('new'));
  ACCESS.checkoutUrl = 'https://example.lemonsqueezy.com/buy/test'; render();
  achk('account view (pro) shows plans, checkout and key field', /Buy NexvoraHub Studio Pro/.test(document.querySelector('#main').innerHTML) && /licKey/.test(document.querySelector('#main').innerHTML) && /£19/.test(document.querySelector('#main').innerHTML));
  achk('rail offers Get Pro', /Get Pro/.test(document.querySelector('#rail').innerHTML));
  LIC = licenceFromResponse('ABCD-1234', { valid: true, license_key: { status: 'active', expires_at: '2027-11-08T00:00:00Z' }, meta: { product_name: 'NexvoraHub Studio Pro' }, instance: { id: 'i1' } });
  achk('valid licence unlocks', licenceOK() && !proBlocked('dl-report') && LIC.instance === 'i1');
  render(); achk('account shows active licence', /Active/.test(document.querySelector('#main').innerHTML) && /…1234/.test(document.querySelector('#main').innerHTML));
  LIC = licenceFromResponse('BAD', { valid: false, error: 'license_key not found.' });
  achk('invalid licence stays locked', !licenceOK() && proBlocked('dl-report') && /not found/.test(LIC.status));
  LIC = licenceFromResponse('EXP', { valid: true, license_key: { status: 'expired' } }); achk('expired licence locked', !licenceOK());
  S.project.country = 'Russia'; LIC = null; render(); achk('not offered in sanctioned region', projectNotOffered() && /Not offered/.test(document.querySelector('#main').innerHTML) && !/Buy NexvoraHub/.test(document.querySelector('#main').innerHTML));
  ACCESS.mode = M0; ACCESS.checkoutUrl = U0; LIC = L0; S.project.country = C0; R = calcAll();
  out.accessChecks = aFail.length ? aFail : 'all passed'; }
// ---- report translations ----
{ const lFail = [], lchk2 = (n, ok, got) => { if (!ok) lFail.push(n + (got !== undefined ? ' got ' + JSON.stringify(got) : '')); };
  const L0 = S.project.lang; S.project.lang = 'en'; const en = reportDoc();
  lchk2('English default unchanged', /<html lang="en">/.test(en) && /1\. Summary/.test(en) && !/TRANSLATION_NOTE|Rapport traduit/.test(en));
  const expect = { fr: ['Synthèse', "Bilan des charges par surface", 'Hypothèses et limites', 'Rapport traduit'], es: ['Resumen', 'Demanda máxima', 'Lista de verificación de cumplimiento', 'Informe traducido'], pt: ['Resumo', 'Quadro de cabos e proteções', 'Premissas e limitações', 'Relatório traduzido'], ar: ['الملخص', 'الطلب الأقصى', 'الافتراضات والقيود', 'تقرير مترجم'] };
  for (const [l, words] of Object.entries(expect)) {
    S.project.lang = l; const d = reportDoc();
    lchk2(l + ' headings and note', words.every(w => d.includes(w)), words.filter(w => !d.includes(w)));
    lchk2(l + ' no English section titles left', !/<h2>\d+\. (Summary|Maximum demand|Compliance checklist|Assumptions and limitations)<\/h2>/.test(d));
    lchk2(l + ' standard paragraphs translated', !d.includes('This report supports, and does not replace'));
    lchk2(l + ' values untouched', d.includes(f0(R.md) + ' kVA'));
  }
  S.project.lang = 'ar'; const ar = reportDoc(); lchk2('Arabic right-to-left', /<html lang="ar" dir="rtl">/.test(ar) && /\[dir=rtl\] table\.r th/.test(ar));
  view = 'report'; render(); lchk2('report view: selector + rtl paper', /Report language/.test(document.querySelector('#main').innerHTML) && /id="paper" lang="ar" dir="rtl"/.test(document.querySelector('#main').innerHTML));
  S.project.lang = 'xx'; lchk2('unknown language falls back to English', rLang() === 'en');
  lchk2('every language has every string', ['fr', 'es', 'pt', 'ar'].every(l => Object.keys(I18N.fr).every(k => I18N[l][k])));
  S.project.lang = L0; R = calcAll();
  out.languages = Object.keys(I18N).length + 1; out.translationChecks = lFail.length ? lFail : 'all passed'; }
// ---- Save as PDF + layout appendix ----
{ const pFail = []; let printed = null, after = null; const cls = new Set();
  document.body = document.body || { classList: { add: c => cls.add(c), remove: c => cls.delete(c) } };
  window.print = () => { printed = { title: document.title, printing: cls.has('print-report') }; };
  window.addEventListener = (ev, fn) => { if (ev === 'afterprint') after = fn; }; window.removeEventListener = () => {};
  document.title = 'NexvoraHub Studio'; view = 'project'; printReport();
  if (!printed) pFail.push('print not called');
  else { if (!printed.printing) pFail.push('report-only print mode not set'); if (!/-electrical-load-design-report$/.test(printed.title)) pFail.push('PDF file name not set: ' + printed.title); }
  if (view !== 'report') pFail.push('did not switch to the report');
  if (after) after(); if (cls.has('print-report') || document.title !== 'NexvoraHub Studio') pFail.push('not restored after printing');
  const d = reportDoc(); if (!(R.W.rooms.length && /class="dwg-appendix"/.test(d) && /<svg/.test(d) && /Appendix – electrical layout drawing/.test(d))) pFail.push('layout appendix missing');
  const L0 = S.project.lang; S.project.lang = 'fr'; if (!/Annexe – plan d’implantation électrique/.test(reportDoc())) pFail.push('appendix heading not translated'); S.project.lang = L0;
  view = 'report'; render(); if (!/data-act="dl-pdf"/.test(document.querySelector('#main').innerHTML)) pFail.push('Save as PDF button missing');
  out.pdfChecks = pFail.length ? pFail : 'all passed'; }
// ---- NEC Article 220 general lighting demand factors (NEC countries) ----
{ const nFail = [], nchk = (n, ok, got) => { if (!ok) nFail.push(n + (got !== undefined ? ' got ' + JSON.stringify(got) : '')); };
  const T23 = NEC_LIGHT_DF['2023'].classes, T20 = NEC_LIGHT_DF['2020'].classes;
  // the user's worked examples
  nchk('office (all other occupancies): 70,000 VA at 100%', tieredDemand(70000, T23.other[1]).demand === 70000);
  const wh = tieredDemand(30000, T23.warehouse[1]); nchk('storage warehouse: 30,000 VA → 21,250 VA', wh.demand === 21250 && wh.parts[0][0] === 12500 && wh.parts[1][0] === 17500, wh);
  // other bands
  nchk('dwelling 150,000 VA → 51,450 VA', near(tieredDemand(150000, T23.dwelling[1]).demand, 3000 + 117000 * 0.35 + 30000 * 0.25));
  nchk('dwelling below 3,000 VA at 100%', tieredDemand(2500, T23.dwelling[1]).demand === 2500);
  nchk('hotel 2023 (50/40/30) 150,000 VA → 57,000 VA', near(tieredDemand(150000, T23.hotel[1]).demand, 57000));
  nchk('hotel 2020 (60/50/35) 150,000 VA → 69,500 VA', near(tieredDemand(150000, T20.hotel[1]).demand, 69500));
  nchk('hospital 2020 (40/20) 80,000 VA → 26,000 VA; no hospital row in 2023', near(tieredDemand(80000, T20.hospital[1]).demand, 26000) && !T23.hospital);
  // in a project: United States, office 20,000 ft² + storage warehouse 25,000 ft²
  const Z0 = JSON.stringify(S.zones), C0 = S.project.country, M0 = S.project.mdMethod, E0 = S.project.necEdition, U0 = OCC.Office.nec;
  S.project.country = 'United States'; S.project.necEdition = '2023';
  S.zones = [{ id: 'n1', desc: 'Offices', type: 'Office – fully air-conditioned', area: 20000 / 10.7639, ovr: '' }, { id: 'n2', desc: 'Storage', type: 'Warehouse – unheated', area: 25000 / 10.7639, ovr: '' }];
  OCC.Office.nec = 3.5; R = calcAll();
  const off = R.NL.classes.find(c => c.k === 'other'), whc = R.NL.classes.find(c => c.k === 'warehouse');
  nchk('project: office 20,000 ft² × 3.5 VA/ft² = 70,000 VA at 100%', near(off.va, 70000) && near(off.demand, 70000), off);
  nchk('project: warehouse 25,000 ft² × 1.2 VA/ft² = 30,000 VA → 21,250 VA', near(whc.va, 30000) && near(whc.demand, 21250), whc);
  nchk('area-density method is still the default', R.NB == null && near(R.sub, R.Z.kva + R.Lo.kva + R.Li.kva + R.P.kva + (R.D ? R.D.md : 0)));
  S.project.mdMethod = 'nec220'; R = calcAll();
  nchk('NEC Article 220 basis used for maximum demand', near(R.NB, 91.25) && near(R.sub, 91.25 + R.NR + R.LoN.kva + R.Li.kva + R.P.kva + (R.D ? R.D.md : 0)), [R.NB, R.NR, R.sub]);
  // receptacles (other than dwelling units): first 10 kVA @100%, remainder @50%
  nchk('receptacle bands: 30,000 VA → 20,000 VA', tieredDemand(30000, [[10000, 1], [Infinity, 0.5]]).demand === 20000);
  nchk('office minimum 1 VA/ft² governs with no outlet count: 20,000 VA → 15,000 VA', near(R.NL.rec.va, 20000) && near(R.NL.rec.demand, 15000) && R.NL.rec.governs === 'office', R.NL.rec);
  S.project.necRecCount = 150; R = calcAll(); nchk('150 outlets × 180 VA = 27,000 VA governs → 18,500 VA', near(R.NL.rec.va, 27000) && near(R.NL.rec.demand, 18500) && R.NL.rec.governs === 'calculated', R.NL.rec);
  S.project.necOfficeVA = false; S.project.necRecCount = 20; R = calcAll(); nchk('office rule off: 20 × 180 = 3,600 VA at 100%', near(R.NL.rec.demand, 3600));
  const sockRows = S.loads.filter(l => l.cat === 'Small power – general sockets').length;
  S.loads.push({ id: 'ns', db: 'DB-1', desc: 'General sockets', cat: 'Small power – general sockets', qty: 1, kw: 12, pf: 1, ku: '', df: '' });
  S.project.necRecSource = 'stage3'; R = calcAll();
  nchk('Stage 3 general sockets as the receptacle source, and not counted twice', near(R.NL.rec.stage3VA, 12000 + 0) || sockRows > 0 ? R.LoN.rows.every(r => r.l.cat !== 'Small power – general sockets') && near(R.NL.rec.demand, 11000) : false, [R.NL.rec.stage3VA, R.NL.rec.demand]);
  view = 'area'; render(); nchk('Stage 2 shows receptacle section', /NEC receptacle load – other than dwelling units/.test(document.querySelector('#main').innerHTML) && /NEC 2023 Table 220.47/.test(document.querySelector('#main').innerHTML));
  nchk('report + csv include receptacles', /NEC receptacles \(NEC 2023 Table 220\.47\)/.test(reportDoc()) && /Receptacles \(NEC 2023 Table 220\.47\)/.test(csvSchedules()));
  S.loads = S.loads.filter(l => l.id !== 'ns'); delete S.project.necRecSource; delete S.project.necRecCount; delete S.project.necOfficeVA; R = calcAll();
  view = 'area'; render(); const ah = document.querySelector('#main').innerHTML;
  nchk('Stage 2 shows the NEC panel', /NEC Article 220 – general lighting load/.test(ah) && /first 12,500 VA × 100%; next 17,500 VA × 50%/.test(ah) && /NEC 2023 Table 220.45/.test(ah));
  view = 'sizing'; render(); nchk('supply sizing shows the NEC basis', /NEC general lighting \(Art\. 220\)/.test(document.querySelector('#main').innerHTML));
  const rd = reportDoc(), cv = csvSchedules();
  nchk('report + csv', /NEC general lighting load \(Article 220\)/.test(rd) && /Maximum demand by NEC Article 220/.test(rd) && /NEC ARTICLE 220 GENERAL LIGHTING \(NEC 2023 Table 220\.45\) – used for maximum demand/.test(cv));
  S.project.necEdition = '2020'; R = calcAll(); nchk('2020 edition selectable', R.NL.ref === 'NEC 2020 Table 220.42');
  S.project.country = 'United Kingdom'; R = calcAll(); nchk('not applied outside NEC countries', R.NL === null && R.NB === null);
  S.project.country = 'Canada'; R = calcAll(); nchk('not applied to CEC (Canada)', R.NL === null);
  OCC.Office.nec = U0; S.zones = JSON.parse(Z0); S.project.country = C0; S.project.mdMethod = M0; S.project.necEdition = E0; R = calcAll();
  out.necLightingChecks = nFail.length ? nFail : 'all passed'; }
// ---- workbook improvements: essential-load generator sizing, NEC continuous loads, method comparison ----
{ const wFail = [], wchk = (n, ok, got) => { if (!ok) wFail.push(n + (got !== undefined ? ' got ' + JSON.stringify(got) : '')); }; const XP0 = S.sizing.expand; S.sizing.expand = 0; R = calcAll();
  const SZ0 = JSON.stringify(S.sizing), C0 = S.project.country, CI0 = JSON.stringify(S.circuits), M0 = S.project.mdMethod;
  S.project.country = 'United Kingdom'; R = calcAll();
  wchk('default generator method unchanged (share of MD)', R.genInfo.method === 'share' && near(R.ess, R.md * S.sizing.essential * S.sizing.genMargin) && R.gen === nextStd(GEN, R.ess), [R.genInfo.method, R.ess, R.gen]);
  S.sizing.genMethod = 'schedule'; R = calcAll(); const G = R.genInfo;
  wchk('essential loads: kW × ks ÷ pf', near(G.rows.map(r => r.kva).reduce((a, b) => a + b, 0), 10 + 27.5 + 30 + 22.5), G.rows.map(r => r.kva));
  wchk('fire pumps added from Stage 4', near(G.fireKva, R.P.life) && R.P.life > 0, G.fireKva);
  wchk('× margin → next standard generator', near(R.ess, (90 + R.P.life) * 1.25) && R.gen === nextStd(GEN, R.ess), [R.ess, R.gen]);
  wchk('largest motor start checked against the set', G.bigStart && /Smoke extract/.test(G.bigStart.name) && near(G.bigStart.kva, 22 / (0.9 * 0.85) * 6) && G.startSt === 'ok', G.bigStart);
  S.sizing.genFire = false; R = calcAll(); wchk('fire pumps can be excluded', R.genInfo.fireKva === 0 && near(R.ess, 90 * 1.25));
  S.essLoads[1].kw = 90; S.sizing.genFire = true; R = calcAll(); wchk('large motor flags transient dip', ['warn', 'bad'].includes(R.genInfo.startSt), R.genInfo.startRatio); S.essLoads[1].kw = 22;
  view = 'sizing'; render(); const sh = document.querySelector('#main').innerHTML;
  wchk('sizing view: schedule + method comparison', /Essential load/.test(sh) && /Include fire pumps from Stage 4/.test(sh) && /Maximum demand – method comparison/.test(sh) && /BS 7671 Chapter 56/.test(sh));
  const rd = reportDoc(), cv = csvSchedules();
  wchk('report + csv: essential loads and comparison', /Essential loads \(standby generator\)/.test(rd) && /essential-load schedule/.test(rd) && /Method comparison/.test(rd) && /ESSENTIAL LOADS – STANDBY GENERATOR/.test(cv) && /MAXIMUM DEMAND – METHOD COMPARISON/.test(cv));
  // method comparison
  wchk('comparison: area method used, NEC as cross-check outside NEC countries', R.CMP[0].k === 'area' && R.CMP[0].used && near(R.CMP[0].md, R.md) && R.CMP.some(m => m.k === 'nec' && /Cross-check only/.test(m.note)), R.CMP.map(m => [m.k, Math.round(m.md), m.used]));
  S.project.country = 'United States'; S.project.mdMethod = 'nec220'; R = calcAll();
  wchk('comparison: NEC method used in the US', R.CMP.find(m => m.used).k === 'nec' && near(R.CMP.find(m => m.used).md, R.md), R.CMP.map(m => [m.k, Math.round(m.md), m.used]));
  // continuous loads (NEC/CEC)
  S.circuits.forEach(k => { k.cont = 'Yes'; }); R = calcAll();
  wchk('NEC continuous: device ≥ 125% × Ib at a 240.6(A) rating', R.C.filter(c => c.ib && c.inr).every(c => c.inr >= c.ib * 1.25 - 1e-9 && NEC_STD.includes(c.inr)) && R.C.some(c => /continuous load/.test(c.spec || '')), R.C.map(c => [Math.round(c.ib * 10) / 10, c.inr]));
  S.circuits.forEach(k => { k.cont = 'No'; }); R = calcAll(); const noCont = R.C.map(c => c.inr);
  wchk('non-continuous at 100%', R.C.filter(c => c.ib && c.inr).every(c => c.inr >= c.ib - 1e-9));
  view = 'circuits'; render(); wchk('circuits view has Continuous column in NEC countries', /Continuous \(125%\)/.test(document.querySelector('#main').innerHTML));
  S.project.country = 'United Kingdom'; S.circuits.forEach(k => { k.cont = 'Yes'; }); R = calcAll();
  wchk('no 125% rule outside NEC/CEC', R.C.map(c => c.inr).join() === '6,20,200,80'); view = 'circuits'; render(); wchk('no Continuous column in IEC countries', !/Continuous \(125%\)/.test(document.querySelector('#main').innerHTML));
  wchk('formatters show – for missing values', f0(null) === '–' && f2(undefined) === '–' && f1(0) === '0.0');
  S.sizing = JSON.parse(SZ0); S.project.country = C0; S.circuits = JSON.parse(CI0); S.project.mdMethod = M0; R = calcAll();
  S.sizing.expand = XP0; R = calcAll(); out.workbookChecks = wFail.length ? wFail : 'all passed'; }
// ---- distribution boards: fault levels, IEC 61439 checks; load growth ----
{ const bFail = [], bchk = (n, ok, got) => { if (!ok) bFail.push(n + (got !== undefined ? ' got ' + JSON.stringify(got) : '')); }; const XP0 = S.sizing.expand; S.sizing.expand = 0; R = calcAll();
  const C0 = S.project.country, CI0 = JSON.stringify(S.circuits), B0 = JSON.stringify(S.boards || {}), SZ0 = JSON.stringify(S.sizing), P0 = JSON.stringify(S.project), DC0 = S.dc.include;
  S.project.country = 'United Kingdom'; S.dc.include = false; R = calcAll();
  bchk('RDF defaults (IEC 61439-2 Table 101)', [1, 2, 3, 4, 5, 6, 9, 10, 24].map(rdfDefault).join() === '1,0.9,0.9,0.8,0.8,0.7,0.7,0.6,0.6');
  const msb = R.BD.boards.find(b => b.name === 'MSB'), gf = R.BD.boards.find(b => b.name === 'DB-GF');
  bchk('main board fault = transformer LV fault level', near(msb.faultKA, R.flP, 1e-6) && msb.source === 'Transformer LV', [msb.faultKA, R.flP]);
  // independent recalculation for DB-GF: source R/X from the LV fault level (X/R 6) + sub-main S01 impedance
  const s01 = R.C.find(c => c.k.ref === 'S01'), Zs = R.X.vll / (Math.sqrt(3) * R.flP * 1000), Rs = Zs / Math.sqrt(37), Xs = 6 * Rs;
  const Rc = s01.mvSel / 1000 / Math.sqrt(3) * s01.k.len, Xc = 0.08e-3 * s01.k.len, expect = R.X.vll / (Math.sqrt(3) * Math.hypot(Rs + Rc, Xs + Xc)) / 1000;
  bchk('sub-board fault level from transformer + sub-main', near(gf.faultKA, expect, 1e-6) && gf.faultKA < msb.faultKA && /S01 95 mm² × 60 m/.test(gf.path.join(' ')), [gf.faultKA, expect]);
  bchk('board supply from "Feeds board" and from description', feedsOf({ desc: 'Sub-main to DB-2F' }) === 'DB-2F' && feedsOf({ to: 'DB-X', desc: 'Sub-main to DB-2F' }) === 'DB-X');
  const c01 = R.C.find(c => c.k.ref === 'C01');
  bchk('calculated fault level used where PFC is blank', near(c01.pfcAuto, +gf.faultKA.toFixed(1)) && c01.status === 'PASS');
  S.circuits.find(k => k.ref === 'C01').icn = 10; R = calcAll(); bchk('10 kA device at 11.5 kA fails breaking capacity', R.C.find(c => c.k.ref === 'C01').fail === 'Breaking capacity');
  S.circuits.find(k => k.ref === 'C01').pfc = 6; R = calcAll(); bchk('an entered PFC overrides the calculated one', R.C.find(c => c.k.ref === 'C01').pfcAuto == null && R.C.find(c => c.k.ref === 'C01').status === 'PASS');
  S.circuits.find(k => k.ref === 'C01').pfc = ''; S.sizing.autoPfc = false; R = calcAll(); bchk('automatic PFC can be switched off', R.C.every(c => c.pfcAuto == null));
  S.sizing.autoPfc = true; S.circuits.find(k => k.ref === 'C01').icn = 15;
  S.circuits.find(k => k.ref === 'C02').kw = 4; R = calcAll(); let g2 = R.BD.boards.find(b => b.name === 'DB-GF');
  bchk('outgoing unit above RDF flagged (18.3 A on 20 A × 0.9)', g2.overRdf.map(c => c.k.ref).join() === 'C02', g2.overRdf.map(c => c.k.ref));
  S.boards = { 'DB-GF': { rdf: 1 } }; R = calcAll(); bchk('RDF override (manufacturer value) clears it', R.BD.boards.find(b => b.name === 'DB-GF').overRdf.length === 0);
  S.boards = { 'DB-GF': { incomer: 5, icw: 10 } }; R = calcAll(); g2 = R.BD.boards.find(b => b.name === 'DB-GF');
  bchk('incomer overload and fault above rating fail', g2.incSt === 'bad' && g2.faultSt === 'bad');
  S.boards = { 'DB-GF': { incomer: 63, icw: 25 } }; R = calcAll(); g2 = R.BD.boards.find(b => b.name === 'DB-GF'); bchk('within incomer and rating pass', g2.incSt === 'ok' && g2.faultSt === 'ok');
  view = 'circuits'; render(); const ch = document.querySelector('#main').innerHTML;
  bchk('Stage 7 boards panel', /Distribution boards – fault level and assembly checks/.test(ch) && /IEC 61439-2 Table 101/.test(ch) && /Feeds board/.test(ch));
  S.project.country = 'United States'; R = calcAll(); bchk('RDF check not applied to NEC panelboards', R.BD.boards.every(b => !b.rdfApplies && !b.overRdf.length) && /NEC 408\.36/.test((view = 'circuits', render(), document.querySelector('#main').innerHTML)));
  S.project.country = 'United Kingdom';
  // load growth
  S.project.growthPct = 3; S.project.growthYears = 10; S.project.date = '2026-11-10'; R = calcAll(); const GR = R.GR;
  bchk('growth: demand × 1.03^t', GR && near(GR.endKva, R.sub * Math.pow(1.03, 10)) && GR.steps.map(s2 => s2.year).join() === '2026,2031,2036', GR && GR.steps.map(s2 => s2.year));
  const tx = GR.caps.find(c => /Transformer/.test(c.name));
  bchk('transformer adequate-until year', tx && tx.until === 2026 + Math.floor(Math.log(tx.cap / R.sub) / Math.log(1.03)), tx);
  bchk('spare (design MD) used up after ln(1.2)/ln(1.03) ≈ 6 years', GR.caps[0].until === 2026 + Math.floor(Math.log(1.2) / Math.log(1.03)), GR.caps[0]);
  view = 'sizing'; render(); bchk('Stage 6 growth tables', /Load growth/.test(document.querySelector('#main').innerHTML) && /Adequate until/.test(document.querySelector('#main').innerHTML));
  const rd = reportDoc(), cv = csvSchedules();
  bchk('report + csv', /Load growth/.test(rd) && /Distribution boards and fault levels/.test(rd) && /LOAD GROWTH \(3\.0%\/yr\)/.test(cv) && /DISTRIBUTION BOARDS – FAULT LEVEL AND ASSEMBLY CHECKS/.test(cv));
  S.project.growthPct = ''; R = calcAll(); bchk('no projection without a growth rate', R.GR === null);
  S.circuits = JSON.parse(CI0); S.boards = JSON.parse(B0); S.sizing = JSON.parse(SZ0); S.project = JSON.parse(P0); S.project.country = C0; S.dc.include = DC0; R = calcAll();
  out.boards = R.BD.boards.map(b => [b.name, b.faultKA != null ? +b.faultKA.toFixed(2) : null, b.rdf, b.incSt]);
  S.sizing.expand = XP0; R = calcAll(); out.boardChecks = bFail.length ? bFail : 'all passed'; }
// ---- generator sets, bill of quantities, design review sign-off ----
{ const gF = [], gchk = (n, ok, got) => { if (!ok) gF.push(n + (got !== undefined ? ' got ' + JSON.stringify(got) : '')); };
  const SZ0 = JSON.stringify(S.sizing), SO0 = JSON.stringify(S.signoff || {}), DC0 = S.dc.include, C0 = S.project.country;
  S.project.country = 'United Kingdom'; S.dc.include = false; R = calcAll();
  gchk('auto: one set when it fits (unchanged)', R.genCfg.duty === 1 && R.genCfg.installed === 1 && R.genCfg.unit === R.gen, R.genCfg);
  S.sizing.essential = 1; S.sizing.genMargin = 5; R = calcAll();
  gchk('auto: fewest sets that fit the largest standard rating', R.genCfg.duty > 1 && R.genCfg.unit === nextStd(GEN, R.ess / R.genCfg.duty) && !nextStd(GEN, R.ess / (R.genCfg.duty - 1)), [R.ess, R.genCfg]);
  S.sizing.genRed = 'N+1'; R = calcAll(); gchk('N+1 adds a standby set', R.genCfg.installed === R.genCfg.duty + 1 && R.genCfg.parallel);
  S.sizing.genSets = 6; R = calcAll(); gchk('chosen number of duty sets', R.genCfg.duty === 6 && R.genCfg.unit === nextStd(GEN, R.ess / 6) && /7 × .* kVA prime \(N\+1, 6 duty\)/.test(genText()), genText());
  gchk('motor start compared with duty capacity', R.genInfo.bigStart ? near(R.genInfo.startRatio, R.genInfo.bigStart.kva / R.genCfg.dutyKva) : true);
  view = 'sizing'; render(); gchk('sizing view: duty sets + redundancy', /Duty sets/.test(document.querySelector('#main').innerHTML) && /Redundancy/.test(document.querySelector('#main').innerHTML));
  // BOQ
  const items = boqItems(), q = re => items.filter(i => re.test(i.desc)).reduce((a, i) => a + i.qty, 0);
  gchk('BOQ generators = installed sets, paralleling panel', q(/^Diesel generator set/) === 7 && q(/paralleling switchboard/) === 1);
  S.sizing = JSON.parse(SZ0); R = calcAll(); const it2 = boqItems(), q2 = re => it2.filter(i => re.test(i.desc)).reduce((a, i) => a + i.qty, 0);
  gchk('BOQ transformers', q2(/^Transformer /) === R.nTx);
  const devCount = R.C.filter(c => c.inr).length + R.W.C.filter(c => c.cc.inr).length;
  gchk('BOQ device count = all circuits', it2.filter(i => i.sec === 'D').reduce((a, i) => a + i.qty, 0) === devCount, devCount);
  const cabTotal = it2.filter(i => i.sec === 'E').reduce((a, i) => a + i.qty, 0), lenTotal = R.C.filter(c => c.spec).reduce((a, c) => a + (+c.k.len || 0), 0) + R.W.C.filter(c => c.cc.csa).reduce((a, c) => a + c.len, 0);
  gchk('BOQ cable metres ≈ lengths + 10%', cabTotal >= lenTotal * 1.1 && cabTotal <= lenTotal * 1.1 + it2.filter(i => i.sec === 'E').length, [cabTotal, lenTotal]);
  gchk('BOQ luminaires and sockets from the drawings', q2(/^Luminaire:/) === R.W.rooms.reduce((a, o) => a + o.nLum, 0) && q2(/^Socket-outlet/) === R.W.sockN && q2(/^Emergency luminaire/) === R.W.rooms.reduce((a, o) => a + o.nEm, 0));
  gchk('BOQ always has earthing and testing', it2.some(i => i.sec === 'J' && /earthing/.test(i.desc)) && it2.some(i => /Inspection, testing/.test(i.desc)));
  view = 'boq'; render(); const bh = document.querySelector('#main').innerHTML;
  gchk('BOQ view with PDF and CSV buttons', /Bill of quantities – electrical services/.test(bh) && /data-act="dl-boq-pdf"/.test(bh) && /data-act="dl-boq-csv"/.test(bh) && /<th>Rate<\/th>/.test(bh));
  const cb = csvBoq(); gchk('BOQ CSV: one line per item, no HTML entities', cb.split('\r\n').length === it2.length + 2 && !/&amp;/.test(cb) && /Twin & earth/.test(cb));
  let printedTitle = null; const pr0 = window.print; window.print = () => { printedTitle = document.title; }; view = 'project'; printReport(null, 'boq'); window.print = pr0;
  gchk('BOQ PDF: switches to the BOQ and names the file', view === 'boq' && /-bill-of-quantities$/.test(printedTitle), printedTitle);
  // sign-off
  S.signoff = { items: {}, approver: '', approverQual: '', approverDate: '' };
  gchk('sign-off starts not approved', !signoffState().approved && signoffState().reviewed === 0 && signoffState().pill === 'warn');
  SIGNOFF_ITEMS.forEach(([k]) => { S.signoff.items[k] = { status: 'Reviewed – no comments', by: 'K. Akintayo', date: '2026-11-10' }; });
  gchk('all reviewed but no approver: not approved', !signoffState().approved);
  Object.assign(S.signoff, { approver: 'Kayode Akintayo', approverQual: 'CEng MIET', approverDate: '2026-11-10' });
  gchk('approved when all reviewed + approver + date', signoffState().approved && signoffState().label === 'Design approved for issue');
  S.signoff.items.cables.status = 'Action required'; gchk('action required overrides', !signoffState().approved && signoffState().pill === 'bad');
  S.signoff.items.cables.status = 'Reviewed – comments addressed';
  view = 'compliance'; render(); gchk('compliance view sign-off panel', /Design review and sign-off/.test(document.querySelector('#main').innerHTML) && /Qualifications \/ registration/.test(document.querySelector('#main').innerHTML));
  const rd = reportDoc(); gchk('report sign-off section', /Design review and sign-off/.test(rd) && /Design approved for issue/.test(rd) && /Kayode Akintayo, CEng MIET – 2026-11-10/.test(rd));
  view = 'boq'; render(); gchk('BOQ shows the approver', /Kayode Akintayo, CEng MIET – 2026-11-10/.test(document.querySelector('#main').innerHTML));
  gchk('sign-off in CSV', /DESIGN REVIEW AND SIGN-OFF – Design approved for issue/.test(csvSchedules()));
  gchk('old projects get a sign-off record', (() => { const o = upgrade({ v: 1 }); return o.signoff && typeof o.signoff.items === 'object'; })());
  S.sizing = JSON.parse(SZ0); S.signoff = JSON.parse(SO0); S.dc.include = DC0; S.project.country = C0; R = calcAll();
  out.genBoqSignoffChecks = gF.length ? gF : 'all passed'; }
// ---------- expansion allowance (15–25%) on transformer, generator and cable final ratings ----------
{ const xF = [], xchk = (n, ok, got) => { if (!ok) xF.push(n + (got !== undefined ? ' got ' + JSON.stringify(got) : '')); };
  const SZ0 = JSON.stringify(S.sizing), C0 = S.project.country, DC0 = S.dc.include; S.project.country = 'United Kingdom'; S.dc.include = false;
  xchk('default allowance 20% on all three', S.sizing.expand === 0.2 && S.sizing.expTx && S.sizing.expGen && S.sizing.expCab);
  R = calcAll(); const tx20 = R.txKva, md = R.md;
  xchk('every applied rating meets the allowance', R.XP.rows.length >= 3 && R.XP.nBad === 0 && R.XP.rows.every(x => x.st === 'ok' && x.h >= 0.2 - 1e-9), R.XP.rows.map(x => [x.item, +x.h.toFixed(3), x.st]));
  xchk('cables rated for Ib × 1.2', R.C.filter(c => c.ib && c.inr).every(c => c.inr >= c.ib * 1.2 - 1e-9 && c.Iz >= c.inr), R.C.map(c => [c.k.ref, c.ib, c.inr]));
  S.sizing.expand = 0; R = calcAll(); const in0 = R.C.map(c => c.inr).join(); S.sizing.expand = 0.2; R = calcAll();
  xchk('allowance raises some cable ratings', in0 !== R.C.map(c => c.inr).join(), in0);
  xchk('example stays a passing design with 20%', R.C.every(c => /^PASS/.test(c.status)), R.C.map(c => c.status));
  S.sizing.txLoading = 1; S.sizing.expand = 0.25; R = calcAll();
  xchk('transformer firm capacity ≥ MD × 1.25 even at 100% loading', R.txKva * R.nTx >= md * 1.25 - 1e-9 && R.txKva === TX.find(t => t >= md * 1.25), [R.txKva, md]);
  S.sizing.expTx = false; R = calcAll(); xchk('switching transformers off uses target loading only', R.txKva === TX.find(t => t >= md) && R.XP.rows[0].st === 'na', R.txKva);
  S.sizing.expTx = true; S.sizing.txLoading = 0.8; S.sizing.genMargin = 1; S.sizing.expand = 0.15; R = calcAll();
  xchk('generator margin at least 1 + allowance', near(R.genInfo.margin, 1.15, 1e-9) && near(R.ess, R.genInfo.base * 1.15, 1e-6), R.genInfo.margin);
  S.sizing.genMargin = 1.25; R = calcAll(); xchk('a larger generator margin is kept', near(R.genInfo.margin, 1.25, 1e-9));
  S.sizing.expand = 0.3; R = calcAll(); xchk('outside 15–25% warns', !R.XP.ok && /outside 15–25%/.test((view = 'sizing', render(), document.querySelector('#main').innerHTML)));
  S.sizing.expand = 0.2; R = calcAll(); view = 'sizing'; render(); const h = document.querySelector('#main').innerHTML;
  xchk('sizing view section and table', /Expansion allowance on rated equipment/.test(h) && /Final rated value/.test(h) && /All ratings ≥ 20%/.test(h));
  const rd = reportDoc(); xchk('report section and summary', /Expansion allowance on rated equipment/.test(rd) && /20% on transformers, generators, cables/.test(rd));
  xchk('CSV section', /EXPANSION ALLOWANCE 20%/.test(csvSchedules()));
  xchk('checklist row', CHECKS.some(c => /Expansion allowance/.test(c[0])) && CHECKS[0][2](R)[1] === 'ok');
  xchk('old projects get the allowance', (() => { const o = upgrade({ v: 1, sizing: { txCount: 1 } }); return o.sizing.expand === 0.2 && o.sizing.expCab === true; })());
  S.sizing = JSON.parse(SZ0); S.dc.include = DC0; S.project.country = C0; R = calcAll();
  out.expansionChecks = xF.length ? xF : 'all passed'; }

// ---- Save project = .json + PDF ----
{ const sFail = [], saved = []; let printedNote = null; const save0 = save, pr0 = window.print;
  save = async (name, data, what) => { saved.push({ name, data, what }); };
  window.print = () => { printedNote = document.title; };
  saveProjectFiles().then(() => {
    if (saved.length !== 1 || !/-load-design\.json$/.test(saved[0].name)) sFail.push('json not saved: ' + JSON.stringify(saved.map(x => x.name)));
    else { const o = JSON.parse(saved[0].data); if (o.v !== 1 || o.project.name !== S.project.name || !Array.isArray(o.zones)) sFail.push('saved json does not reopen'); }
    if (!printedNote || !/-electrical-load-design-report$/.test(printedNote)) sFail.push('PDF print not started after the json');
    render(); if (!/Save project \(\.json \+ PDF\)/.test(document.querySelector('#rail').innerHTML) || !/Open project \(\.json\)/.test(document.querySelector('#rail').innerHTML)) sFail.push('rail buttons not updated');
    save = save0; window.print = pr0;
    console.log('saveBothChecks =', JSON.stringify(sFail.length ? sFail : 'all passed'));
    if (sFail.length) (globalThis.__TEST_FAILURES = globalThis.__TEST_FAILURES || []).push('saveBothChecks');
  }); }
// ---- legal links in the app ----
{ const gFail = []; render(); const rail = document.querySelector('#rail').innerHTML;
  if (!['terms.html', 'privacy.html', 'refunds.html'].every(u => rail.includes(`href="${u}"`))) gFail.push('rail legal links missing');
  view = 'account'; render(); if (!/Refund policy/.test(document.querySelector('#main').innerHTML)) gFail.push('account page refund link missing');
  out.legalLinkChecks = gFail.length ? gFail : 'all passed'; }
for (const [k, v] of Object.entries(out)) console.log(k, '=', JSON.stringify(v));
// make failures visible to scripts and CI (test-app.js sets the exit code)
globalThis.__TEST_FAILURES = Object.entries(out).filter(([k, v]) => (/Checks$/.test(k) && v !== 'all passed') || (k === 'viewErrors' && v.length) || (k === 'countriesTested' && v !== 94) || (k === 'sweep' && JSON.stringify(v).includes('ERR'))).map(([k]) => k);
