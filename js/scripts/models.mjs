// Copy both variants' model files into models/ (micro) and models/mini/, and pin their sizes and sha256s in
// src/models.mjs.
//   node scripts/models.mjs [dir]   default dir: ../src/leokani_g2p (the Python package's files; mini in dir/mini)
//   node scripts/models.mjs --check  fail unless models/ matches src/models.mjs
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NAMES = ['leokani-g2p.json.gz', 'oov-encoder.onnx', 'oov-decoder.onnx', 'context.onnx'];
const VARIANTS = { micro: '', mini: 'mini' };   // name -> subfolder, as in src/models.mjs
const check = process.argv.includes('--check');
const src = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(root, '..', 'src', 'leokani_g2p'));
const out = path.join(root, 'models');
const hash = (b) => createHash('sha256').update(b).digest('hex');

if (check) {
  const { MODEL_FILES } = await import(new URL('../src/models.mjs', import.meta.url));
  let bad = 0;
  for (const [v, sub] of Object.entries(VARIANTS)) {
    for (const n of NAMES) {
      const rel = path.join('models', sub, n);
      const pin = MODEL_FILES[v]?.[n];
      let b = null;
      try { b = await readFile(path.join(root, rel)); } catch (e) { console.log(`${rel}: missing (${e.code})`); bad++; continue; }
      const ok = pin && pin.sha256 === hash(b) && pin.bytes === b.length;
      console.log(`${rel}: ${b.length} bytes ${ok ? 'ok' : `MISMATCH (pinned ${pin?.bytes} bytes ${pin?.sha256})`}`);
      if (!ok) bad++;
    }
  }
  for (const n of ['LICENSE', 'LICENSE-CC-BY-4.0.txt', 'NOTICE']) {
    try { await readFile(path.join(root, n)); } catch { console.log(`${n}: missing (run npm run models)`); bad++; }
  }
  process.exit(bad ? 1 : 0);
}
const pins = {};
for (const [v, sub] of Object.entries(VARIANTS)) {
  await mkdir(path.join(out, sub), { recursive: true });
  pins[v] = {};
  for (const n of NAMES) {
    const from = path.join(src, sub, n);
    const b = await readFile(from);
    await copyFile(from, path.join(out, sub, n));
    pins[v][n] = { bytes: b.length, sha256: hash(b) };
    console.log(`${path.relative(process.cwd(), from)} -> ${path.join('models', sub, n)}: ${b.length} bytes, sha256 ${pins[v][n].sha256.slice(0, 16)}…`);
  }
}
// the licence files ship with the npm package; the repository's copies are the originals
for (const n of ['LICENSE', 'LICENSE-CC-BY-4.0.txt', 'NOTICE']) {
  await copyFile(path.join(root, '..', n), path.join(root, n));
  console.log(`../${n} -> ${n}`);
}
await writeFile(path.join(root, 'src', 'models.mjs'), `// Written by scripts/models.mjs: the model files this release was tested with, per variant.
// micro (the default) is in models/, mini in models/mini/.
export const VARIANTS = ${JSON.stringify(VARIANTS)};
export const DEFAULT_VARIANT = 'micro';
export const MODEL_FILES = ${JSON.stringify(pins, null, 2)};
`);
console.log('wrote src/models.mjs');
