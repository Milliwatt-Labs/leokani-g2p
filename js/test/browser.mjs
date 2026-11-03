#!/usr/bin/env node
// npm run test:browser — the package in headless Chrome (no window, never takes focus), three ways:
//   main     src/index.mjs on a page's main thread, onnxruntime-web through an import map
//   worker   an esbuild bundle of the package inside a module Worker (models and .wasm next to the bundle)
//   esbuild  the same bundle on the main thread
// Each must reproduce every golden exactly, pass the user-lexicon parity file, raise no page errors and make no
// request to another origin.
//   node test/browser.mjs [--gold goldens.json ...] [--user user-lexicon-goldens.json]
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';
import { serve } from './serve.mjs';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const golds = []; let user = join(PKG, '..', 'tests', 'user-lexicon-goldens.json');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--gold') golds.push(resolve(args[++i]));
  else if (args[i] === '--user') user = resolve(args[++i]);
}
if (!golds.length) golds.push(join(PKG, '..', 'tests', 'goldens.json'));

const W = mkdtempSync(join(process.env.TK_SCRATCH ?? tmpdir(), 'leokani-g2p-browser-'));
mkdirSync(join(W, 'gold'));
const goldUrls = golds.map((f, i) => { const n = `${i}-${basename(f)}`; copyFileSync(f, join(W, 'gold', n)); return `/gold/${n}`; });
copyFileSync(user, join(W, 'gold', 'user.json'));
symlinkSync(PKG, join(W, 'pkg'));
cpSync(join(PKG, 'test', 'browser', 'harness.mjs'), join(W, 'harness.mjs'));
const cfg = JSON.stringify({ goldens: goldUrls, userGoldens: '/gold/user.json' });

// main thread through an import map
writeFileSync(join(W, 'main.html'), `<!doctype html><meta charset="utf-8"><title>main</title>
<script type="importmap">{"imports":{"onnxruntime-web/wasm":"/pkg/node_modules/onnxruntime-web/dist/ort.wasm.bundle.min.mjs"}}</script>
<script type="module">import * as L from '/pkg/src/index.mjs'; import { harness } from '/harness.mjs';
window.run = () => harness(L, ${cfg}); window.ready = true;</script>`);

// an esbuild bundle (worker and main thread)
const b = join(W, 'bundle'); mkdirSync(b);
writeFileSync(join(W, 'entry.mjs'), `export * from ${JSON.stringify(join(PKG, 'src', 'index.mjs'))};\n`);
const t = Date.now();
const r = spawnSync(join(PKG, 'node_modules', '.bin', 'esbuild'), [join(W, 'entry.mjs'), '--bundle', '--format=esm', '--platform=browser', `--outfile=${join(b, 'g2p.mjs')}`], { encoding: 'utf8' });
if (r.status !== 0) { console.log(`esbuild failed: ${r.stderr}`); process.exit(1); }
console.log(`esbuild bundle in ${Date.now() - t} ms: ${r.stderr.trim().split('\n').filter((x) => x.includes('g2p.mjs')).join(' ')}`);
for (const f of ['ort-wasm-simd-threaded.wasm']) copyFileSync(join(PKG, 'node_modules', 'onnxruntime-web', 'dist', f), join(b, f));
const bcfg = JSON.stringify({ goldens: goldUrls, userGoldens: '/gold/user.json', modelBase: '/pkg/models/' });
writeFileSync(join(W, 'esbuild.html'), `<!doctype html><meta charset="utf-8"><title>esbuild</title>
<script type="module">import * as L from '/bundle/g2p.mjs'; import { harness } from '/harness.mjs';
window.run = () => harness(L, ${bcfg}); window.ready = true;</script>`);
writeFileSync(join(W, 'worker.mjs'), `import * as L from '/bundle/g2p.mjs'; import { harness } from '/harness.mjs';
onmessage = async () => { try { postMessage(await harness(L, ${bcfg})); } catch (e) { postMessage({ error: String(e && e.stack || e) }); } };`);
writeFileSync(join(W, 'worker.html'), `<!doctype html><meta charset="utf-8"><title>worker</title>
<script type="module">window.run = () => new Promise((res) => { const w = new Worker('/worker.mjs', { type: 'module' });
w.onmessage = (e) => res(e.data); w.onerror = (e) => res({ error: e.message }); w.postMessage(1); }); window.ready = true;</script>`);

const server = await serve(W, { isolated: false });
const browser = await launch();
let failed = 0;
try {
  for (const v of ['main', 'worker', 'esbuild']) {
    const page = await browser.page();
    await page.goto(`${server.origin}/${v}.html`);
    await page.eval('new Promise((r) => { const t = () => window.ready ? r() : setTimeout(t, 20); t(); })');
    const res = await page.eval('window.run()', 600000);
    const foreign = page.requests().filter((u) => !u.startsWith(server.origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
    const errors = page.errors();
    const ok = !res.error && res.exact === res.total && !foreign.length && !errors.length;
    if (!ok) failed++;
    console.log(`${v}: ${res.error ? `ERROR ${res.error}` : `${res.exact}/${res.total} exact, load ${res.loadMs} ms, all ${res.ms} ms`}; ${page.requests().length} requests, ${foreign.length} to another origin, ${errors.length} page errors ${ok ? 'ok' : 'FAIL'}`);
    for (const f of res.failures || []) console.log(`  FAIL ${f.what}\n    got      ${f.got}\n    expected ${f.want}`);
    for (const e of errors) console.log(`  page error: ${e}`);
    for (const u of foreign) console.log(`  foreign request: ${u}`);
    await page.close();
  }
} finally {
  browser.close();
  await server.close();
  rmSync(W, { recursive: true, force: true });
}
console.log(failed ? `${failed} variant(s) failed` : 'all variants ok');
process.exit(failed ? 1 : 0);
