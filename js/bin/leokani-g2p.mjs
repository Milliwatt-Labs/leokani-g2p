#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Leokani G2P by Milliwatt Labs (milliwattlabs.com): the same command line as the Python package's.
//   leokani-g2p "Dr. Okafor lands at 7:45 AM."
//   leokani-g2p --chunks "One clause. And another."
//   leokani-g2p --json "It costs $4.99."
//   leokani-g2p --user-lexicon names.tsv "Siobhan met Thibault."
//   leokani-g2p < book.txt > book.phonemes
import { load, loadUserLexiconFile, VERSION } from '../src/node.mjs';

const HELP = `usage: leokani-g2p [--chunks] [--piece] [--json] [--user-lexicon FILE] [--model DIR] [--threads N] [text ...]

English text to Kokoro-style phonemes. With no text, reads lines from stdin.

  --chunks             one clause chunk per output line
  --piece              treat each input as one clause with no punctuation
  --json               one JSON object per input line
  --user-lexicon FILE  custom pronunciations (.json or .tsv); may be repeated
  --model DIR          folder with leokani-g2p.json.gz and the .onnx files
  --threads N          inference threads (default 1)
  --version            print the version`;

const a = { text: [], users: [], threads: 1 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const x = argv[i];
  const val = () => { if (i + 1 >= argv.length) { console.error(`leokani-g2p: ${x} needs a value`); process.exit(2); } return argv[++i]; };
  if (x === '--chunks') a.chunks = true;
  else if (x === '--piece') a.piece = true;
  else if (x === '--json') a.json = true;
  else if (x === '--user-lexicon') a.users.push(val());
  else if (x === '--model') a.model = val();
  else if (x === '--threads') a.threads = Number(val());
  else if (x === '--version') { console.log(`leokani-g2p ${VERSION}`); process.exit(0); }
  else if (x === '-h' || x === '--help') { console.log(HELP); process.exit(0); }
  else if (x === '--') a.text.push(...argv.slice(i + 1)), i = argv.length;
  else if (x.startsWith('--')) { console.error(`leokani-g2p: unknown option ${x}\n${HELP}`); process.exit(2); }
  else a.text.push(x);
}

let g2p;
try {
  g2p = await load({ modelDir: a.model, threads: a.threads, sha256: a.model ? false : undefined });
} catch (e) {
  console.error(`leokani-g2p: can't load the model from ${a.model || 'the package'}: ${e.message}`);
  process.exit(1);
}
for (const f of a.users) {
  try {
    await loadUserLexiconFile(g2p, f);
  } catch (e) {
    console.error(`leokani-g2p: ${e.message}`);
    process.exit(1);
  }
}

// Python's json.dumps(..., ensure_ascii=False): ", " and ": " separators.
const dumps = (o) => `{${Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}: ${Array.isArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(', ')}]` : JSON.stringify(v)}`).join(', ')}}`;

async function one(text) {
  const chunks = a.piece ? [await g2p.piece(text)] : await g2p.phonemizeChunks(text);
  if (a.json) return dumps({ text, phonemes: chunks.join(' '), chunks }) + '\n';
  if (a.chunks) return chunks.map((c) => c + '\n').join('');
  return chunks.join(' ') + '\n';
}

if (a.text.length) {
  process.stdout.write(await one(a.text.join(' ')));
} else {
  // Lines end at \n only, like Python's sys.stdin (readline would also split at \r, U+2028 and U+2029).
  process.stdin.setEncoding('utf8');
  let buf = '';
  for await (const part of process.stdin) {
    const lines = (buf + part).split('\n');
    buf = lines.pop();
    for (const ln of lines) process.stdout.write(await one(ln));
  }
  if (buf) process.stdout.write(await one(buf));
}
await g2p.dispose();
