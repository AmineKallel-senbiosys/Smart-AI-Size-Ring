import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import assert from 'node:assert/strict';

// Load the production rules without adding a test runner dependency.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/lib/explore-flow.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const production = { exports: {} };
new Function('module', 'exports', compiled)(production, production.exports);
const { measurementAction, consensusSize, validFingerPlan, activeFingerIndex } = production.exports;

const labels = {
  recommend: 'Recommend size',
  remeasure: 'Remeasure same finger',
  'another-finger': 'Measure next selected finger',
};

// Independent expected outcomes, keyed by OK / Loose / Tight counts.
const expected = {
  '200': 'recommend', '110': 'remeasure', '101': 'remeasure',
  '020': 'another-finger', '011': 'remeasure', '002': 'another-finger',
  '300': 'recommend', '210': 'recommend', '201': 'recommend',
  '120': 'another-finger', '111': 'remeasure', '102': 'another-finger',
  '030': 'another-finger', '021': 'remeasure', '012': 'remeasure', '003': 'another-finger',
  '400': 'recommend', '310': 'recommend', '301': 'recommend',
  '220': 'remeasure', '211': 'remeasure', '202': 'remeasure',
  '130': 'another-finger', '121': 'remeasure', '112': 'remeasure', '103': 'another-finger',
  '040': 'another-finger', '031': 'remeasure', '022': 'remeasure', '013': 'remeasure', '004': 'another-finger',
};

const keys = ['ring', 'finger', 'jeweler', 'competitor'];
const values = [56, 55, 58]; // Same US 8, respectively OK / Loose / Tight.
const readingLabels = ['OK', 'Loose', 'Tight'];
const ordered = [];
for (const n of [2, 3, 4]) {
  for (let code = 0; code < 3 ** n; code++) {
    let remaining = code;
    const sequence = Array.from({ length: n }, () => {
      const digit = remaining % 3;
      remaining = Math.floor(remaining / 3);
      return digit;
    });
    const counts = [0, 1, 2].map((c) => sequence.filter((v) => v === c).length);
    const wanted = expected[counts.join('')];
    assert.ok(wanted, `Missing expected case: ${counts}`);
    assert.equal(measurementAction(...counts), wanted);
    const decision = consensusSize(sequence.map((c, i) => ({ key: keys[i], circMm: values[c] })));
    const actual = decision.verdict.status === 'remeasure' ? 'remeasure'
      : decision.verdict.fit === 'perfect' ? 'recommend'
        : 'another-finger';
    assert.equal(actual, wanted, `Wrong verdict for ${sequence}`);
    assert.equal(decision.sure, counts[0] === n);
    ordered.push({ n, sequence: sequence.map((c) => readingLabels[c]), counts, action: wanted });
  }
}
assert.equal(ordered.length, 117);
assert.equal(consensusSize([{ key: 'ring', circMm: 56 }, { key: 'finger', circMm: 61 }]).verdict.status, 'remeasure');
assert.equal(consensusSize([{ key: 'ring', circMm: 56 }, { key: 'finger', circMm: 56 }, { key: 'jeweler', circMm: 56 }, { key: 'competitor', circMm: 61 }]).verdict.status, 'remeasure');
assert.equal(consensusSize([{ key: 'ring', circMm: 49 }, { key: 'finger', circMm: 49 }]).verdict.status, 'unavailable');
assert.equal(consensusSize([{ key: 'ring', circMm: 49 }, { key: 'finger', circMm: 51.5 }]).verdict.status, 'remeasure');
for (const bad of [NaN, Infinity, -1, 0]) {
  assert.equal(consensusSize([{ key: 'ring', circMm: 56 }, { key: 'finger', circMm: bad }]).verdict.status, 'remeasure');
}
assert.equal(consensusSize([{ key: 'ring', circMm: 56 }]).verdict.status, 'remeasure');
assert.equal(consensusSize([{ key: 'ring', circMm: 56 }, { key: 'ring', circMm: 56 }]).verdict.status, 'remeasure');
const leftPicks = ['index', 'middle', 'ring'].map((finger) => ({ hand: 'left', finger }));
assert.equal(validFingerPlan(leftPicks), true);
assert.equal(validFingerPlan([leftPicks[0], leftPicks[0], leftPicks[2]]), false);
assert.equal(validFingerPlan(null), false);
assert.equal(validFingerPlan(leftPicks.slice(0, 2)), false);
assert.equal(validFingerPlan([...leftPicks, { hand: 'right', finger: 'pinky' }]), false);
for (const index of [0, 1, 2]) assert.equal(activeFingerIndex({ activeFingerIndex: index }), index);
for (const index of [-1, 3, 1.5, NaN]) assert.equal(activeFingerIndex({ activeFingerIndex: index }), 0);
console.log('Passed: all 117 ordered decisions, ties, size conflicts, invalid inputs, and finger-plan guards.');

if (process.argv.includes('--check')) process.exit(0);

const rows = [2, 3, 4].map((n) => {
  const group = [];
  for (let ok = n; ok >= 0; ok--) {
    for (let loose = n - ok; loose >= 0; loose--) {
      const another = n - ok - loose;
      const action = measurementAction(ok, loose, another);
      const permutations = ordered.filter((r) => r.n === n && r.counts.join() === [ok, loose, another].join()).length;
      group.push({ ok, loose, another, action, permutations });
    }
  }
  return { n, group };
});
const intro = `# Measurement decision table and screen proposal

Includes all three existing labels: **OK** (green), **Loose** (red), and **Tight** (black).
There are **31 unique count combinations**, representing **117 ordered possibilities**: 9 for two measurements, 27 for three, and 81 for four. The order and method do not change the decision. The complete ordered appendix is included below.

## Rules and priority

These are proposed product rules implemented in the Explore flow, not a guarantee of physical fit.

1. Choose one hand and exactly three distinct fingers, in preference order: primary, second, third.
2. Collect 2–4 readings from distinct methods for the **same active finger**. Skipped methods do not count. Never combine readings across fingers.
3. Invalid readings, mixed below-chart readings, or different US sizes → remeasure the same finger, regardless of label counts. All readings below the smallest chart size → size unavailable; offer the next selected finger. A competitor size above US 12 separately blocks confirmation and offers another finger.
4. For readings in the same US size band, a strict OK majority → recommend that size. All OK → “Your readings agree.” A majority is more than half: 2/2, 2/3, or 3/4.
5. Without an OK majority, any mixture of Loose and Tight → remeasure the same finger.
6. Otherwise, a strict Tight majority → measure the next selected finger; a strict Loose majority → measure the next selected finger as well.
7. All ties → remeasure the same finger. **2 OK + 2 Tight → Remeasure**, as requested.

The tables below assume valid readings in the same US size band. The priority exceptions above override every row.
`;
let markdown = intro;
for (const { n, group } of rows) {
  markdown += `\n## ${n} measurements\n\n| OK | Loose | Tight | Decision | Reading orders covered |\n|---:|---:|---:|---|---:|\n`;
  for (const r of group) markdown += `| ${r.ok} | ${r.loose} | ${r.another} | ${labels[r.action]} | ${r.permutations} |\n`;
}
markdown += `
## Screen and use-case proposal

No screenshot was attached; these examples follow the current app's visual style.

| Screen | Example text | Primary action | Behavior |
|---|---|---|---|
| Finger selection | “Choose your hand, then select three fingers in order.” Primary: left index. Second: left middle. Third: left ring. | Continue | Enabled only with one hand and three distinct fingers. |
| Measurement | “Measuring your left index finger · Choice 1 of 3.” | Save reading | Every method applies to this finger. Require at least two methods for a decision. |
| All OK | “Your readings agree. US 8. Every reading lands on US 8.” | Confirm my size | 2 OK / 0 Loose / 0 Tight; same US size. |
| OK majority | “Your recommended size: US 8. 3 of 4 readings are OK for US 8.” | Confirm my size | 3 OK / 0 Loose / 1 Tight; same US size. |
| Tie | “Measure again. 2 readings are OK and 2 indicate a tight fit. Measure your left index finger again.” | Measure again | Keep the active finger; clear its old readings and collect fresh ones. |
| Tight majority | “This ring may feel tight. Measure your left middle finger next.” | Measure my left middle finger | 1 OK / 0 Loose / 2 Tight. Advance to choice 2, clear all readings. |
| Second finger also tight | “Measure your left ring finger next.” | Measure my left ring finger | Advance to choice 3 with fresh readings. |
| Third finger also tight | “All three selected fingers have been tried. Choose three new fingers to continue.” | Choose three new fingers | Return to finger selection; do not loop back to choice 2. |
| Loose majority | “This ring may feel loose. Measure your left middle finger next.” | Measure my left middle finger | Advance to the next selected finger, clearing all previous readings. |
| Different sizes | “These readings don’t agree on one US size. Measure this same finger again.” | Measure again | Do not average US sizes, even if label counts have an OK majority. |

**Example journey:** select left index → left middle → left ring. On left index, 2 OK + 2 Tight triggers a retry on left index. If the retry gives 1 OK + 2 Tight, move to left middle. If left middle is also tight, move to left ring. If all three are unsuitable, choose a new set of three fingers.

## Every ordered possibility

M1–M4 are the included measurement methods; unused methods are omitted. Because the rules treat methods equally, all permutations of a count row share its result.

| Measurements | M1 | M2 | M3 | M4 | Decision |
|---:|---|---|---|---|---|
`;
for (const r of ordered) markdown += `| ${r.n} | ${[...r.sequence, ...Array(4 - r.n).fill('—')].join(' | ')} | ${labels[r.action]} |\n`;
fs.writeFileSync(path.join(root, 'docs/measurement-decisions.md'), markdown);

const tableHtml = rows.map(({ n, group }) => `<section><h2>${n} measurements <small>${group.length} combinations · ${3 ** n} reading orders</small></h2><div class="scroll"><table><thead><tr><th>OK</th><th>Loose</th><th>Tight</th><th>Decision</th><th>Orders</th></tr></thead><tbody>${group.map((r) => `<tr><td>${r.ok}</td><td>${r.loose}</td><td>${r.another}</td><td><span class="pill ${r.action}">${labels[r.action]}</span></td><td>${r.permutations}</td></tr>`).join('')}</tbody></table></div></section>`).join('');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ring measurement decisions</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f7f6f2;color:#243e35;font:16px/1.55 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:48px 24px}h1{font:44px/1.1 Georgia,serif;margin:10px 0 18px}h2{font:28px Georgia,serif;margin:0 0 20px}h3{font:24px Georgia,serif;margin:12px 0}p{max-width:850px}small{display:block;color:#6a746d;font:13px system-ui;margin-top:8px}.eyebrow{letter-spacing:.14em;font-size:12px;color:#85672e;text-transform:uppercase}section{background:white;border:1px solid #dddeda;border-radius:22px;padding:24px;margin-top:24px}.note{padding:18px 22px;background:#eee8d9;border-radius:14px}.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;text-align:left}th{font-size:12px;color:#6a746d}td,th{padding:12px;border-bottom:1px solid #e7e8e4}tbody tr:last-child td{border:0}.pill{display:inline-block;border-radius:20px;padding:5px 11px;font-size:13px;background:#eee}.recommend{background:#e1eee5;color:#245b39}.remeasure{background:#fff0d5;color:#76511b}.another-finger{background:#243e35;color:white}.screens{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.screen{border:1px solid #dddeda;border-radius:22px;padding:22px;background:#faf9f6;text-align:center}.screen p{font-size:14px}.cta{padding:12px;border-radius:12px;background:#243e35;color:white;font-size:14px;margin-top:22px}.size{font:68px Georgia,serif;margin:14px}.choice{display:flex;gap:6px;margin:20px 0}.choice span{border:1px solid #c7cbbf;padding:10px 6px;border-radius:12px;flex:1;font-size:12px}.choice b{display:block;font-size:14px}.legend{display:flex;gap:14px;flex-wrap:wrap}.legend span{font-size:14px}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}.reading{display:flex;justify-content:space-around;margin:14px 0}.reading span{border:1px solid #deded5;border-radius:12px;padding:12px;font-size:13px}li{margin:10px 0}@media(max-width:850px){.screens{grid-template-columns:1fr}h1{font-size:34px}main{padding:26px 16px}}@media print{body{background:white}main{padding:0}section{break-inside:avoid}.screens{grid-template-columns:repeat(3,1fr)}.pill{border:1px solid #ccc}}
</style><main><div class="eyebrow">VELIA · Decision proposal</div><h1>Every measurement outcome.<br>One clear next step.</h1><p>2, 3, and 4 measurements. <b>31 count combinations · 117 ordered possibilities.</b> Require one hand and three distinct fingers, then measure one finger at a time.</p><div class="legend"><span><i class="dot" style="background:#31845a"></i>OK</span><span><i class="dot" style="background:#c45d50"></i>Loose</span><span><i class="dot" style="background:#222"></i>Tight</span></div>
<p class="note"><b>Your example: 2 OK + 2 Tight → Remeasure the same finger.</b><br>There is no strict majority. Keep the selected finger and collect fresh measurements.</p>
<section><h2>Proposed decision rules</h2><ol><li>Use 2–4 valid readings from distinct methods on the same finger.</li><li>Different US sizes or a mixture of below-chart and in-chart readings → remeasure. All below chart → size unavailable. A competitor size above US 12 blocks confirmation.</li><li>A strict OK majority recommends a size: 2 of 2, 2 of 3, or 3 of 4.</li><li>Without an OK majority, mixed Loose and Tight readings → remeasure.</li><li>Otherwise, an Tight majority advances to the next finger; a Loose majority also advances to the next finger.</li><li>Ties → remeasure. After the third finger, choose three new fingers.</li></ol><small>These are proposed product rules, implemented in the Explore flow. Agreement among readings is not a guarantee of physical fit.</small></section>
${tableHtml}
<section><h2>Screen proposal</h2><small>Based on the current app; no screenshot was attached. These are static screen examples.</small><div class="screens" style="margin-top:22px"><div class="screen"><div class="eyebrow">01 · Finger plan</div><h3>Where will you wear it?</h3><p>Choose your hand, then select three fingers in order.</p><div class="choice"><span>Primary<b>Left index</b></span><span>Second<b>Left middle</b></span><span>Third<b>Left ring</b></span></div><p>We’ll measure your first choice, then move to the next if needed.</p><div class="cta">Continue</div></div><div class="screen"><div class="eyebrow">02 · A tied result</div><h3>Measure again</h3><p>Measuring left index · Choice 1 of 3</p><div class="reading"><span>2<br><b>OK</b></span><span>2<br><b>Tight</b></span></div><p>These readings disagree. Measure your left index finger again.</p><div class="cta">Measure again</div></div><div class="screen"><div class="eyebrow">03 · Next finger</div><h3>Try your second choice</h3><div class="reading"><span>1<br><b>OK</b></span><span>2<br><b>Tight</b></span></div><p>This ring may feel tight. Measure your left middle finger next with fresh readings.</p><div class="cta">Measure my left middle finger</div></div></div></section>
<section><h2>Use cases</h2><p><b>Readings agree:</b> 2 OK in US 8 → “Your readings agree” → confirm US 8.</p><p><b>OK majority:</b> 3 OK + 1 Tight in US 8 → recommend US 8; show “3 of 4 readings are OK.”</p><p><b>Loose majority:</b> 1 OK + 2 Loose → “This ring may feel loose. Measure your left middle finger next.” Advance to the next selected finger with fresh readings.</p><p><b>Progression:</b> left index → left middle → left ring. Keep the current choice on remeasurement. Advance only for another-finger or unavailable outcomes. Clear previous readings each time.</p><p><b>Three fingers exhausted:</b> “All three selected fingers have been tried. Choose three new fingers to continue.”</p></section></main></html>`;
fs.writeFileSync(path.join(root, 'docs/measurement-decisions.html'), html);
console.log('Generated docs/measurement-decisions.md and docs/measurement-decisions.html.');
