// Headless test of load-designer.html calculations and view rendering (no browser needed): node test-app.js
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../load-designer.html', 'utf8');
const data = html.match(/<script type="application\/json" id="dd">([\s\S]*?)<\/script>/)[1];
const aidc = html.match(/<script type="application\/json" id="aidc">([\s\S]*?)<\/script>/)[1];
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const el = () => ({ innerHTML: '', textContent: '', hidden: true, value: '', dataset: {}, classList: { remove() {}, add() {} }, addEventListener() {}, click() {}, focus() {} });
const els = {};
const document = { getElementById: (id) => id === 'dd' ? { textContent: data } : id === 'aidc' ? { textContent: aidc } : (els[id] = els[id] || el()), querySelector: (s) => (els[s] = els[s] || el()), addEventListener() {}, activeElement: null, createRange() { return { selectNodeContents() {} }; } };
const sandbox = { document, window: {}, location: { hash: '' }, localStorage: { getItem: () => null, setItem() {} }, addEventListener() {}, scrollTo() {}, getSelection: () => ({ removeAllRanges() {}, addRange() {} }), navigator: {}, setTimeout, clearTimeout, console };
const test = fs.readFileSync(__dirname + '/test-cases.js', 'utf8');
new Function(...Object.keys(sandbox), code + '\n' + test)(...Object.values(sandbox));
const failed = globalThis.__TEST_FAILURES || ['test cases did not finish'];
if (failed.length) { console.error('TESTS FAILED:', failed.join(', ')); process.exitCode = 1; } else console.log('ALL TESTS PASSED');
