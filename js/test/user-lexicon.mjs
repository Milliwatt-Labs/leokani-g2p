// Custom pronunciations reproduce user-lexicon-goldens.json exactly, loaded from JSON and from TSV; an empty user
// lexicon gives the 'without' strings; every 'reject' document fails to load.
//   node test/user-lexicon.mjs [user-lexicon-goldens.json]
import { readFile } from 'node:fs/promises';
import { load, UserLexicon } from '../src/node.mjs';

const file = process.argv[2] || new URL('../../tests/user-lexicon-goldens.json', import.meta.url);
let gold;
try {
  gold = JSON.parse(await readFile(file, 'utf8'));
} catch (e) {
  console.log(`${file}: ${e.code || e.message}; pass the path of user-lexicon-goldens.json`);
  process.exit(1);
}
const show = (s) => s.replaceAll('', '⟨PH⟩');
const g2p = await load();
let fails = 0; let n = 0;
const check = (what, got, want) => {
  n++;
  if (got !== want) { fails++; console.log(`FAIL ${what}\n  got      ${JSON.stringify(show(got))}\n  expected ${JSON.stringify(show(want))}`); }
};

async function run(label) {
  for (const g of gold.lines) {
    check(`${label} normalize ${JSON.stringify(g.text)}`, g2p.normalize(g.text), g.normalized);
    check(`${label} phonemize ${JSON.stringify(g.text)}`, await g2p.phonemize(g.text), g.leokani);
  }
  for (const g of gold.pieces) {
    check(`${label} normalize piece ${JSON.stringify(g.piece)}`, g2p.normalize(g.piece, false), g.normalized);
    check(`${label} piece ${JSON.stringify(g.piece)}`, await g2p.piece(g.piece), g.leokani);
  }
}

// no user lexicon: the 'without' strings
for (const g of gold.lines) check(`without ${JSON.stringify(g.text)}`, await g2p.phonemize(g.text), g.without);

g2p.loadUserLexicon(gold.lexicon);
console.log(`json: ${g2p.userLexicon.size} entries`);
await run('json');
g2p.userLexicon.clear();
g2p.loadUserLexicon(gold.tsv, { format: 'tsv' });
console.log(`tsv: ${g2p.userLexicon.size} entries`);
await run('tsv');
// the same entries through the API, and a round trip through toJSON
const roundTrip = new UserLexicon().update(g2p.userLexicon).toJSON();
g2p.userLexicon.clear();
for (const [k, v] of Object.entries(gold.lexicon.words)) g2p.addPronunciation(k, v);
check('round trip', JSON.stringify(g2p.userLexicon.toJSON()), JSON.stringify(roundTrip));
await run('api');

for (const doc of gold.reject) {
  n++;
  const lex = new UserLexicon(null, { symbols: g2p.userLexicon.symbols });
  try {
    lex.update(doc);
    fails++;
    console.log(`FAIL reject: loaded ${JSON.stringify(doc)}`);
  } catch (e) {
    console.log(`reject ok: ${JSON.stringify(doc.words ?? doc).slice(0, 50)} -> ${e.message}`);
  }
}
g2p.userLexicon.clear();
for (const g of gold.lines) check(`cleared ${JSON.stringify(g.text)}`, await g2p.phonemize(g.text), g.without);
await g2p.dispose();
console.log(`${n - fails}/${n} checks passed, ${fails} failed`);
process.exitCode = fails ? 1 : 0;
