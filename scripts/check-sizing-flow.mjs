import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

function loadTs(file, require) {
  const loaded = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, require);
  return loaded.exports;
}
const shared = loadTs('src/lib/explore-flow.ts');
const { decideReadings, readingFromCirc } = loadTs('src/components/explore/sizing-decision.ts', (name) => {
  assert.equal(name, '@/lib/explore-flow');
  return shared;
});
const ids = ['known', 'kit', 'ring', 'strip'];
const labels = ['OK', 'Loose', 'Tight'];
const values = [51.5, 51, 53];
const appendix = fs.readFileSync('docs/measurement-decisions.md', 'utf8').split('## Every ordered possibility')[1];
const rows = appendix.split('\n').filter((line) => /^\| \d/.test(line));
assert.equal(rows.length, 117);
for (const row of rows) {
  const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
  const readings = cells.slice(1, 5).filter((cell) => cell !== '—').map((cell, i) => readingFromCirc(ids[i], values[labels.indexOf(cell)]));
  const expected = cells[5] === 'Recommend size' ? 'recommend' : cells[5] === 'Remeasure same finger' ? 'remeasure' : 'next';
  assert.equal(decideReadings(readings).d, expected, row);
}
const screenshot = [readingFromCirc('known', 51), readingFromCirc('kit', 51.9), readingFromCirc('ring', 51), readingFromCirc('strip', 51.5)];
assert.deepEqual(decideReadings(screenshot), { d: 'remeasure', why: 'mixed' });
assert.deepEqual(decideReadings([readingFromCirc('known', 51), readingFromCirc('strip', 51)]), { d: 'next', why: 'loose' });
assert.deepEqual(decideReadings([readingFromCirc('known', 53), readingFromCirc('strip', 53)]), { d: 'next', why: 'another' });
assert.deepEqual(decideReadings([readingFromCirc('known', 51.5), readingFromCirc('kit', 51.9), readingFromCirc('ring', 56)]), { d: 'remeasure', why: 'sizes' });
assert.deepEqual(decideReadings([readingFromCirc('known', 51.5)]), { d: 'more' });
assert.deepEqual(decideReadings([readingFromCirc('known', 49), readingFromCirc('strip', 49)]), { d: 'next', why: 'loose' });
assert.deepEqual(decideReadings([readingFromCirc('known', 51.5), { id: 'kit', circMm: null, us: null, color: 'black', tooLarge: true, enteredUs: 14 }]), { d: 'next', why: 'another' });
console.log('Passed all 117 table cases, screenshot tie, loose/tight next-finger decisions, size disagreement, insufficient readings, and out-of-range readings.');
