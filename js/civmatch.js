// Ear & Pen: checking an answer to a civics question (pure functions, run the same in the page and in tests).
// An official answer counts when your answer has its key words (in any order, in any sentence):
// words in "(…)" are optional, filler words are ignored, a typo or a recognition slip of one letter is forgiven.

const STOP = new Set("a an the of to in on at for by and or is are was were be been it its they their them that this these those with from as do does did has have had he she his her we our you your i me my so not no can will would should may might".split(" "));
// words that rarely decide an answer ("Christmas Day" = "Christmas"); if an answer is only these, they all count
const WEAK = new Set("day battle united us u s america president because there just only year branch amendment original".split(" "));

const stem = w => w.length > 4 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") ? w.slice(0, -1) : w;
export function words(text, norm) {
  return norm(text).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).map(stem);
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const near = (w, x) => w === x || (w.length >= 5 && x.length >= 5 && lev(w, x) <= (w.length >= 9 ? 2 : 1));

// an official answer → the words that must be said
export function keyWords(answer, norm) {
  const core = String(answer).replace(/\[[^\]]*\]/g, " ").replace(/\([^)]*\)/g, " ");
  const all = words(core, norm).filter(w => !STOP.has(w));
  const strong = all.filter(w => !WEAK.has(w));
  return [...new Set(strong.length ? strong : all)];
}
// "Antietam/Sharpsburg" → either
const variants = a => /\w\/\w/.test(a) && !/\s/.test(a.replace(/\([^)]*\)/g, "").trim().split("/")[0]) ? a.split("/") : [a];

export function answerHit(answer, said, norm) {
  return variants(answer).some(v => {
    const need = keyWords(v, norm);
    if (!need.length) return false;
    const got = need.filter(w => said.some(x => near(w, x))).length;
    return got >= Math.ceil(need.length * 0.75 - 1e-9) && (need.length < 2 || got >= Math.min(need.length, 2));
  });
}

// q: {answers, need}; alts: what was typed or recognised (several guesses)
export function grade(q, alts, norm) {
  let best = { ok: false, hits: [], heard: alts[0] || "" };
  for (const heard of alts) {
    const said = words(heard, norm);
    const hits = q.answers.filter(a => answerHit(a, said, norm));
    // two official answers that say the same thing ("Citizens" / "U.S. citizens") count once
    const distinct = [];
    for (const h of hits) { const k = keyWords(h, norm).join(" "); if (!distinct.some(d => d.k === k)) distinct.push({ h, k }); }
    const r = { ok: distinct.length >= (q.need || 1), hits, count: distinct.length, heard };
    if (r.ok && !best.ok || r.count > (best.count || 0)) best = r;
    if (best.ok) break;
  }
  return best;
}
