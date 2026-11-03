// Runs in the page or a Worker: every golden through the package, and the user-lexicon parity file.
// -> { exact, total, failures: [...], loadMs, ms }
export async function harness(L, { goldens, userGoldens, modelBase }) {
  const t0 = performance.now();
  const g2p = await L.load(modelBase ? { modelBase } : {});
  const loadMs = Math.round(performance.now() - t0);
  const failures = []; let total = 0;
  const check = (what, got, want) => { total++; if (got !== want) failures.push({ what, got, want }); };
  for (const url of goldens) {
    const gold = await (await fetch(url)).json();
    for (const g of gold.pieces) {
      check(`piece normalize ${g.piece}`, g2p.normalize(g.piece, false), g.normalized);
      check(`piece ${g.piece}`, await g2p.piece(g.piece), g.leokani);
    }
    for (const g of [...gold.lines, ...gold.edge]) {
      check(`${g.id} normalize`, g2p.normalize(g.text), g.normalized);
      check(`${g.id}`, await g2p.phonemize(g.text), g.leokani);
    }
  }
  if (userGoldens) {
    const u = await (await fetch(userGoldens)).json();
    for (const [label, src, opts] of [['json', u.lexicon], ['tsv', u.tsv, { format: 'tsv' }]]) {
      g2p.userLexicon.clear();
      g2p.loadUserLexicon(src, opts);
      for (const g of u.lines) {
        check(`user ${label} normalize ${g.text}`, g2p.normalize(g.text), g.normalized);
        check(`user ${label} ${g.text}`, await g2p.phonemize(g.text), g.leokani);
      }
      for (const g of u.pieces) check(`user ${label} piece ${g.piece}`, await g2p.piece(g.piece), g.leokani);
    }
    for (const doc of u.reject) {
      total++;
      try { new L.UserLexicon(null, { symbols: g2p.userLexicon.symbols }).update(doc); failures.push({ what: 'reject', got: 'loaded', want: JSON.stringify(doc) }); } catch { /* rejected */ }
    }
    g2p.userLexicon.clear();
  }
  const ms = Math.round(performance.now() - t0);
  await g2p.dispose();
  return { exact: total - failures.length, total, failures: failures.slice(0, 20), loadMs, ms };
}
