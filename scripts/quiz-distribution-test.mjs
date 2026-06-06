#!/usr/bin/env node
// Guard: enumerate every Q1–Q5 answer combination, score → match among the 3
// shipped creatures, and assert the distribution is balanced (no creature < 22%
// or > 45%). Run: `node scripts/quiz-distribution-test.mjs`. Keep the weights in
// sync with web/src/data/quiz-questions.ts and the anchors with personality.ts.

const W = { attach: 1.0, curio: 1.0, express: 1.3 };
const EPS = 2.0;
const ANCHORS = {
  mochi_pudding: { attach: 6, curio: -5, express: 6 },
  echo_fox: { attach: -6, curio: 6, express: -5 },
  ember_imp: { attach: 6, curio: 3, express: 8 },
};

// Q1–Q5 option weights — mirror web/src/data/quiz-questions.ts.
const Q = [
  [{ attach: 3 }, { attach: 2 }, { attach: 0 }, { attach: -2 }],
  [{ curio: 3, express: 1 }, { curio: 1 }, { curio: -1 }, { curio: -3, express: -1 }],
  [{ attach: 2, express: 3 }, { attach: 1, express: 2 }, { express: -1 }, { attach: -1, express: -2 }],
  [{ attach: 2, curio: 1, express: 2 }, { attach: 1, express: -2 }, { attach: -2, express: 1 }, { attach: -1, curio: -1, express: -1 }],
  [{ attach: 1, curio: 2, express: 2 }, { curio: -2, express: -1 }, { curio: 2, express: -1 }, { attach: -1, curio: -2 }],
];

const dist2 = (v, a) => {
  const da = v.attach - a.attach, dc = v.curio - a.curio, de = v.express - a.express;
  return W.attach * da * da + W.curio * dc * dc + W.express * de * de;
};
const loudest = (v) => {
  const s = { attach: Math.abs(v.attach) * W.attach, curio: Math.abs(v.curio) * W.curio, express: Math.abs(v.express) * W.express };
  let b = "express";
  if (s.attach > s[b]) b = "attach";
  if (s.curio > s[b]) b = "curio";
  return b;
};
function match(v) {
  const r = Object.entries(ANCHORS).map(([k, a]) => ({ k, d: dist2(v, a) })).sort((x, y) => x.d - y.d);
  if (r[1].d - r[0].d > EPS) return r[0].k;
  const best = r[0].d;
  const tied = r.filter((x) => x.d - best <= EPS);
  const ax = loudest(v);
  const ba = tied.map((t) => ({ k: t.k, da: Math.abs(v[ax] - ANCHORS[t.k][ax]) })).sort((a, b) => a.da - b.da);
  if (ba.length === 1 || ba[0].da !== ba[1].da) return ba[0].k;
  return tied[0].k;
}

const tally = { mochi_pudding: 0, echo_fox: 0, ember_imp: 0 };
let n = 0;
(function rec(i, v) {
  if (i === Q.length) { tally[match(v)]++; n++; return; }
  for (const w of Q[i]) {
    rec(i + 1, {
      attach: v.attach + (w.attach ?? 0),
      curio: v.curio + (w.curio ?? 0),
      express: v.express + (w.express ?? 0),
    });
  }
})(0, { attach: 0, curio: 0, express: 0 });

let ok = true;
for (const [k, c] of Object.entries(tally)) {
  const pct = (100 * c) / n;
  const bad = pct < 22 || pct > 45;
  if (bad) ok = false;
  console.log(`${k.padEnd(14)} ${c.toString().padStart(4)}  ${pct.toFixed(1).padStart(5)}%  ${bad ? "OUT OF BAND" : "ok"}`);
}
console.log(`total ${n}`);
if (!ok) { console.error("FAIL: a creature is outside the 22–45% band"); process.exit(1); }
console.log("PASS: distribution balanced");
