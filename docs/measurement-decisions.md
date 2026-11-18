# Measurement decision table and screen proposal

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

## 2 measurements

| OK | Loose | Tight | Decision | Reading orders covered |
|---:|---:|---:|---|---:|
| 2 | 0 | 0 | Recommend size | 1 |
| 1 | 1 | 0 | Remeasure same finger | 2 |
| 1 | 0 | 1 | Remeasure same finger | 2 |
| 0 | 2 | 0 | Measure next selected finger | 1 |
| 0 | 1 | 1 | Remeasure same finger | 2 |
| 0 | 0 | 2 | Measure next selected finger | 1 |

## 3 measurements

| OK | Loose | Tight | Decision | Reading orders covered |
|---:|---:|---:|---|---:|
| 3 | 0 | 0 | Recommend size | 1 |
| 2 | 1 | 0 | Recommend size | 3 |
| 2 | 0 | 1 | Recommend size | 3 |
| 1 | 2 | 0 | Measure next selected finger | 3 |
| 1 | 1 | 1 | Remeasure same finger | 6 |
| 1 | 0 | 2 | Measure next selected finger | 3 |
| 0 | 3 | 0 | Measure next selected finger | 1 |
| 0 | 2 | 1 | Remeasure same finger | 3 |
| 0 | 1 | 2 | Remeasure same finger | 3 |
| 0 | 0 | 3 | Measure next selected finger | 1 |

## 4 measurements

| OK | Loose | Tight | Decision | Reading orders covered |
|---:|---:|---:|---|---:|
| 4 | 0 | 0 | Recommend size | 1 |
| 3 | 1 | 0 | Recommend size | 4 |
| 3 | 0 | 1 | Recommend size | 4 |
| 2 | 2 | 0 | Remeasure same finger | 6 |
| 2 | 1 | 1 | Remeasure same finger | 12 |
| 2 | 0 | 2 | Remeasure same finger | 6 |
| 1 | 3 | 0 | Measure next selected finger | 4 |
| 1 | 2 | 1 | Remeasure same finger | 12 |
| 1 | 1 | 2 | Remeasure same finger | 12 |
| 1 | 0 | 3 | Measure next selected finger | 4 |
| 0 | 4 | 0 | Measure next selected finger | 1 |
| 0 | 3 | 1 | Remeasure same finger | 4 |
| 0 | 2 | 2 | Remeasure same finger | 6 |
| 0 | 1 | 3 | Remeasure same finger | 4 |
| 0 | 0 | 4 | Measure next selected finger | 1 |

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
| 2 | OK | OK | — | — | Recommend size |
| 2 | Loose | OK | — | — | Remeasure same finger |
| 2 | Tight | OK | — | — | Remeasure same finger |
| 2 | OK | Loose | — | — | Remeasure same finger |
| 2 | Loose | Loose | — | — | Measure next selected finger |
| 2 | Tight | Loose | — | — | Remeasure same finger |
| 2 | OK | Tight | — | — | Remeasure same finger |
| 2 | Loose | Tight | — | — | Remeasure same finger |
| 2 | Tight | Tight | — | — | Measure next selected finger |
| 3 | OK | OK | OK | — | Recommend size |
| 3 | Loose | OK | OK | — | Recommend size |
| 3 | Tight | OK | OK | — | Recommend size |
| 3 | OK | Loose | OK | — | Recommend size |
| 3 | Loose | Loose | OK | — | Measure next selected finger |
| 3 | Tight | Loose | OK | — | Remeasure same finger |
| 3 | OK | Tight | OK | — | Recommend size |
| 3 | Loose | Tight | OK | — | Remeasure same finger |
| 3 | Tight | Tight | OK | — | Measure next selected finger |
| 3 | OK | OK | Loose | — | Recommend size |
| 3 | Loose | OK | Loose | — | Measure next selected finger |
| 3 | Tight | OK | Loose | — | Remeasure same finger |
| 3 | OK | Loose | Loose | — | Measure next selected finger |
| 3 | Loose | Loose | Loose | — | Measure next selected finger |
| 3 | Tight | Loose | Loose | — | Remeasure same finger |
| 3 | OK | Tight | Loose | — | Remeasure same finger |
| 3 | Loose | Tight | Loose | — | Remeasure same finger |
| 3 | Tight | Tight | Loose | — | Remeasure same finger |
| 3 | OK | OK | Tight | — | Recommend size |
| 3 | Loose | OK | Tight | — | Remeasure same finger |
| 3 | Tight | OK | Tight | — | Measure next selected finger |
| 3 | OK | Loose | Tight | — | Remeasure same finger |
| 3 | Loose | Loose | Tight | — | Remeasure same finger |
| 3 | Tight | Loose | Tight | — | Remeasure same finger |
| 3 | OK | Tight | Tight | — | Measure next selected finger |
| 3 | Loose | Tight | Tight | — | Remeasure same finger |
| 3 | Tight | Tight | Tight | — | Measure next selected finger |
| 4 | OK | OK | OK | OK | Recommend size |
| 4 | Loose | OK | OK | OK | Recommend size |
| 4 | Tight | OK | OK | OK | Recommend size |
| 4 | OK | Loose | OK | OK | Recommend size |
| 4 | Loose | Loose | OK | OK | Remeasure same finger |
| 4 | Tight | Loose | OK | OK | Remeasure same finger |
| 4 | OK | Tight | OK | OK | Recommend size |
| 4 | Loose | Tight | OK | OK | Remeasure same finger |
| 4 | Tight | Tight | OK | OK | Remeasure same finger |
| 4 | OK | OK | Loose | OK | Recommend size |
| 4 | Loose | OK | Loose | OK | Remeasure same finger |
| 4 | Tight | OK | Loose | OK | Remeasure same finger |
| 4 | OK | Loose | Loose | OK | Remeasure same finger |
| 4 | Loose | Loose | Loose | OK | Measure next selected finger |
| 4 | Tight | Loose | Loose | OK | Remeasure same finger |
| 4 | OK | Tight | Loose | OK | Remeasure same finger |
| 4 | Loose | Tight | Loose | OK | Remeasure same finger |
| 4 | Tight | Tight | Loose | OK | Remeasure same finger |
| 4 | OK | OK | Tight | OK | Recommend size |
| 4 | Loose | OK | Tight | OK | Remeasure same finger |
| 4 | Tight | OK | Tight | OK | Remeasure same finger |
| 4 | OK | Loose | Tight | OK | Remeasure same finger |
| 4 | Loose | Loose | Tight | OK | Remeasure same finger |
| 4 | Tight | Loose | Tight | OK | Remeasure same finger |
| 4 | OK | Tight | Tight | OK | Remeasure same finger |
| 4 | Loose | Tight | Tight | OK | Remeasure same finger |
| 4 | Tight | Tight | Tight | OK | Measure next selected finger |
| 4 | OK | OK | OK | Loose | Recommend size |
| 4 | Loose | OK | OK | Loose | Remeasure same finger |
| 4 | Tight | OK | OK | Loose | Remeasure same finger |
| 4 | OK | Loose | OK | Loose | Remeasure same finger |
| 4 | Loose | Loose | OK | Loose | Measure next selected finger |
| 4 | Tight | Loose | OK | Loose | Remeasure same finger |
| 4 | OK | Tight | OK | Loose | Remeasure same finger |
| 4 | Loose | Tight | OK | Loose | Remeasure same finger |
| 4 | Tight | Tight | OK | Loose | Remeasure same finger |
| 4 | OK | OK | Loose | Loose | Remeasure same finger |
| 4 | Loose | OK | Loose | Loose | Measure next selected finger |
| 4 | Tight | OK | Loose | Loose | Remeasure same finger |
| 4 | OK | Loose | Loose | Loose | Measure next selected finger |
| 4 | Loose | Loose | Loose | Loose | Measure next selected finger |
| 4 | Tight | Loose | Loose | Loose | Remeasure same finger |
| 4 | OK | Tight | Loose | Loose | Remeasure same finger |
| 4 | Loose | Tight | Loose | Loose | Remeasure same finger |
| 4 | Tight | Tight | Loose | Loose | Remeasure same finger |
| 4 | OK | OK | Tight | Loose | Remeasure same finger |
| 4 | Loose | OK | Tight | Loose | Remeasure same finger |
| 4 | Tight | OK | Tight | Loose | Remeasure same finger |
| 4 | OK | Loose | Tight | Loose | Remeasure same finger |
| 4 | Loose | Loose | Tight | Loose | Remeasure same finger |
| 4 | Tight | Loose | Tight | Loose | Remeasure same finger |
| 4 | OK | Tight | Tight | Loose | Remeasure same finger |
| 4 | Loose | Tight | Tight | Loose | Remeasure same finger |
| 4 | Tight | Tight | Tight | Loose | Remeasure same finger |
| 4 | OK | OK | OK | Tight | Recommend size |
| 4 | Loose | OK | OK | Tight | Remeasure same finger |
| 4 | Tight | OK | OK | Tight | Remeasure same finger |
| 4 | OK | Loose | OK | Tight | Remeasure same finger |
| 4 | Loose | Loose | OK | Tight | Remeasure same finger |
| 4 | Tight | Loose | OK | Tight | Remeasure same finger |
| 4 | OK | Tight | OK | Tight | Remeasure same finger |
| 4 | Loose | Tight | OK | Tight | Remeasure same finger |
| 4 | Tight | Tight | OK | Tight | Measure next selected finger |
| 4 | OK | OK | Loose | Tight | Remeasure same finger |
| 4 | Loose | OK | Loose | Tight | Remeasure same finger |
| 4 | Tight | OK | Loose | Tight | Remeasure same finger |
| 4 | OK | Loose | Loose | Tight | Remeasure same finger |
| 4 | Loose | Loose | Loose | Tight | Remeasure same finger |
| 4 | Tight | Loose | Loose | Tight | Remeasure same finger |
| 4 | OK | Tight | Loose | Tight | Remeasure same finger |
| 4 | Loose | Tight | Loose | Tight | Remeasure same finger |
| 4 | Tight | Tight | Loose | Tight | Remeasure same finger |
| 4 | OK | OK | Tight | Tight | Remeasure same finger |
| 4 | Loose | OK | Tight | Tight | Remeasure same finger |
| 4 | Tight | OK | Tight | Tight | Measure next selected finger |
| 4 | OK | Loose | Tight | Tight | Remeasure same finger |
| 4 | Loose | Loose | Tight | Tight | Remeasure same finger |
| 4 | Tight | Loose | Tight | Tight | Remeasure same finger |
| 4 | OK | Tight | Tight | Tight | Measure next selected finger |
| 4 | Loose | Tight | Tight | Tight | Remeasure same finger |
| 4 | Tight | Tight | Tight | Tight | Measure next selected finger |
