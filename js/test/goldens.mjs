// The port reproduces goldens.json exactly: every piece (one clause) through piece(), every line and edge case
// through the whole front end (normalize, clean, chunks, pieces).
//   node test/goldens.mjs [goldens.json ...] [--backend wasm|onnxruntime-node] [--model-dir dir] [--variant micro|mini]
// With no files it checks both variants: tests/goldens.json on micro and tests/goldens-mini.json on mini.
import { readFile } from 'node:fs/promises';
import { load } from '../src/node.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? undefined : args.splice(i, 2)[1]; };
const backend = opt('--backend') || 'wasm';
const modelDir = opt('--model-dir');
const only = opt('--variant');
const gold = (v) => new URL(`../../tests/${v === 'micro' ? 'goldens' : `goldens-${v}`}.json`, import.meta.url);
const runs = args.length ? [{ variant: only, files: args }]
  : (only ? [only] : ['micro', 'mini']).map((v) => ({ variant: v, files: [gold(v)] }));

const t0 = Date.now();
let fails = 0; let total = 0;
const show = (s) => s.replaceAll('', '⟨PH⟩');
for (const run of runs) {
const g2p = await load({ backend, modelDir, variant: run.variant, sha256: modelDir ? false : undefined });
console.log(`loaded ${g2p.variant} (${g2p.backend}) in ${g2p.loadMs} ms`);
for (const f of run.files) {
  const gold = JSON.parse(await readFile(f, 'utf8'));
  if (gold.variant && gold.variant !== g2p.variant) { console.log(`${f}: goldens for ${gold.variant}, model ${g2p.variant}`); fails++; continue; }
  if (gold.format !== 'leokani-g2p/1') { console.log(`${f}: format ${gold.format}`); fails++; continue; }
  const name = String(f).split('/').slice(-3).join('/');
  let n = 0; let bad = 0; let syncThrew = 0; const t = Date.now();
  for (const g of gold.pieces) {
    n++;
    const norm = await g2p.normalizeAsync(g.piece, false);
    const ph = await g2p.piece(g.piece);
    if (norm !== g.normalized || ph !== g.leokani) {
      bad++;
      console.log(`FAIL piece ${JSON.stringify(g.piece)}\n  normalized ${JSON.stringify(show(norm))}\n  expected   ${JSON.stringify(show(g.normalized))}\n  leokani    ${ph}\n  expected   ${g.leokani}`);
    }
  }
  for (const g of [...gold.lines, ...gold.edge]) {
    n++;
    // the synchronous normalize may throw NeedWords or NeedOov before the line has been read (an all-caps word the
    // letter-to-sound model says), never anything else; after normalizeAsync it must give the same string
    let before = null;
    try { before = g2p.normalize(g.text); } catch (e) { if (e?.name !== 'NeedOov' && e?.name !== 'NeedWords') throw e; syncThrew++; }
    const norm = await g2p.normalizeAsync(g.text);
    const ph = await g2p.phonemize(g.text);
    const after = g2p.normalize(g.text);
    if ((before !== null && before !== norm) || after !== norm) { bad++; console.log(`FAIL ${g.id} sync normalize ${JSON.stringify(before)} / ${JSON.stringify(after)}`); continue; }
    if (norm !== g.normalized || ph !== g.leokani) {
      bad++;
      console.log(`FAIL ${g.id} ${JSON.stringify(g.text)}\n  normalized ${JSON.stringify(show(norm))}\n  expected   ${JSON.stringify(show(g.normalized))}\n  leokani    ${ph}\n  expected   ${g.leokani}`);
    }
  }
  console.log(`${name}: ${n - bad}/${n} exact (pieces ${gold.pieces.length}, lines ${gold.lines.length}, edge ${gold.edge.length}; sync normalize waited on the model for ${syncThrew}) in ${Date.now() - t} ms`);
  fails += bad; total += n;
}
await g2p.dispose();
}
console.log(`${total - fails}/${total} exact, ${fails} failed, ${Date.now() - t0} ms`);
process.exitCode = fails ? 1 : 0;
