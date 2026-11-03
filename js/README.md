# Leokani G2P for JavaScript

English text to Kokoro-style phonemes, without espeak-ng, in browsers (on the page or in a Web Worker) and in
Node 20+.

Leokani G2P is a small, fast English phonemizer from [Milliwatt Labs](https://milliwattlabs.com). It produces espeak compatible phoneme codes, made from the ground up: the same Kokoro/misaki-style codes
Leokani-tts and Kokoro use. It contains no espeak-ng code or data files.

This package gives exactly the output of the Python package
([github.com/Milliwatt-Labs/leokani-g2p](https://github.com/Milliwatt-Labs/leokani-g2p)): it reproduces every
string in `goldens.json`. It runs on WebAssembly through onnxruntime-web, makes no network requests of its own,
and needs no server.

## Install

```bash
npm i leokani-g2p
```

The model files are in the package's `models/` folder: micro (the default, 19 MB) at the top and mini (21.8 MB,
better on names and rare words) in `models/mini/`. Pass `load({ variant: 'mini' })` for mini. The files are read when you call `load()`, not when you import the package.

## Quick start

```js
import { load } from 'leokani-g2p';

const g2p = await load();
await g2p.phonemize('Dr. Okafor lands at 7:45 AM.');
// 'dˈɑktəɹ ˈɑkæfəɹ lˈændz æt sˈɛvən fˈɔɹɾi fˈIv ˌAˈɛm.'

await g2p.phonemizeChunks('A long paragraph. Of several clauses.');
// ['ə lˈɔŋ pˈæɹəɡɹˌæf.', 'ʌv sˈɛvɹᵊl klˈɔzᵻz.']

await g2p.piece('the wind was cold');   // one clause with no punctuation
g2p.normalize('It costs $4.99.');       // 'It costs 4 dollars and 99 cents.'
```

Or without managing an instance (the model loads on the first call):

```js
import { phonemize } from 'leokani-g2p';
await phonemize('Hello there.');
```

Numbers, money, dates, times, units, phone numbers, emails, web addresses and versions are written out as words
first (`"$4.99"` is read as "4 dollars and 99 cents").

## Custom pronunciations

Give names, brands and places your own pronunciation. A value in slashes is phonemes; anything else is a
respelling, read as ordinary text.

```js
const g2p = await load({
  userLexicon: {
    format: 'leokani-g2p-user/1',
    words: { Siobhan: 'shivawn', Gauss: '/ɡˈWs/', BBC: { say: 'B B C' } },
  },
});
g2p.addPronunciation('Thibault', '/tˈibO/');
await g2p.phonemize("Siobhan read Gauss's paper.");
// 'ʃˈɪvɔn ɹˈid ɡˈWsᵻz pˈApəɹ.'
```

- A key in lowercase matches any casing (`nguyen` matches `Nguyen` and `NGUYEN`); a key with a capital matches
  only that casing, and wins.
- Possessives come for free: `Gauss's` → `ɡˈWsᵻz`, `Kate's` → `kˈAts`, `James'` → the same as `James`.
- Files: `g2p.loadUserLexicon(text)` takes JSON or TSV text (`key<TAB>value` per line, `#` comments). In Node,
  `load({ userLexicon: 'names.tsv' })` or `loadUserLexiconFile(g2p, 'names.json')`.
- `g2p.userLexicon` is a `UserLexicon` you can change at any time (`add`, `delete`, `clear`, `toJSON`).

The format is the same in every Leokani G2P port. [USER-LEXICON.md](USER-LEXICON.md) has the rules.

## API

### `load(options)` → `Promise<LeokaniG2P>`

| Option | |
|---|---|
| `modelBase` | Browsers: the URL of a folder holding the four model files. Default: the package's `models/`. A query string, such as a signed URL's token, is kept on every file's URL. |
| `modelDir` | Node: the folder (path or `file:` URL) holding the four model files. |
| `files` | The files' bytes instead: `{ lexicon, encoder, decoder, context }`. |
| `userLexicon` | Custom pronunciations: a `{format, words}` document, a `{word: value}` object, a `UserLexicon`, or in Node a `.json`/`.tsv` path. |
| `variant` | `'micro'` (default) or `'mini'`. |
| `threads` | Inference threads. Default 1. |
| `wasmPaths` | Browsers: where onnxruntime-web's `.wasm` file is, if your bundler doesn't copy it. |
| `backend` | Node: `'wasm'` (default), `'onnxruntime-node'` or `'auto'` (onnxruntime-node when it's installed). |
| `sha256` | `false` skips the check that the model files are the ones this release was tested with. |

### `LeokaniG2P`

| | |
|---|---|
| `phonemize(text)` | A line or paragraph → one phoneme string. |
| `phonemizeChunks(text)` | → one phoneme string per clause chunk. Kokoro takes up to 510 phoneme characters at a time, so pass it one chunk at a time. |
| `piece(clause)` | One clause with no punctuation → phonemes. |
| `normalize(text)` | The text as it will be read, with numbers and symbols written out. |
| `addPronunciation(word, value)`, `removePronunciation(word)`, `loadUserLexicon(source)` | Custom pronunciations. |
| `dispose()` | Frees the inference sessions. |

## Model files

| file | |
|---|---|
| `leokani-g2p.json.gz` | lexicon, weak forms, number words |
| `oov-encoder.onnx`, `oov-decoder.onnx` | letter-to-sound for words outside the lexicon |
| `context.onnx` | how each word is said in its clause |
| `mini/` | the same four files for the mini variant |

To serve them from your own host or CDN, copy `node_modules/leokani-g2p/models/` and pass `modelBase`. They are
also on Hugging Face: [milliwattlabs/leokani-g2p](https://huggingface.co/milliwattlabs/leokani-g2p).

## Bundlers

Vite, webpack and esbuild bundle the package as is. If yours doesn't copy files referenced by
`new URL(…, import.meta.url)`, copy `models/` and onnxruntime-web's `ort-wasm-simd-threaded.wasm` next to your
build, and pass `modelBase` and `wasmPaths`.

## Command line

```bash
npx leokani-g2p "Hello there. How was your day?"
npx leokani-g2p --chunks "It costs \$4.99 today. Call 555-0142."
npx leokani-g2p --json "Email hello@milliwattlabs.com."
npx leokani-g2p --user-lexicon names.tsv "Siobhan met Thibault."
npx leokani-g2p < book.txt > book.phonemes
```

The options and output are the same as the Python command line's.

## Limits

- American English only.
- Output is Kokoro/misaki-style phonemes, not espeak-ng's own IPA, and there is no audio: it is the text front
  end only.
- Unusual names and rare words outside the lexicon can be misread; add them as custom pronunciations.
- Heteronyms ("read", "lead", "wind", "lives") are picked from nearby words, and the guess can be wrong.

## Tests

```bash
npm test                 # unit tests, every golden, the custom-pronunciation parity file (Node)
npm run test:browser     # the same goldens in headless Chrome: page, Worker, esbuild bundle
```

## License

- Code: [MIT](LICENSE).
- Model weights (`*.onnx`), the lexicon (`leokani-g2p.json.gz`) and the goldens: [CC BY 4.0](LICENSE-CC-BY-4.0.txt).

Credit it as: **Leokani G2P by Milliwatt Labs (milliwattlabs.com)**. The lexicon's word list includes words
from the [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict) (BSD-2-Clause) and place names from
[GeoNames](https://www.geonames.org) (CC BY 4.0). The phoneme codes are those of
[misaki](https://github.com/hexgrad/misaki) and [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) by
hexgrad (Apache-2.0). See [NOTICE](NOTICE) for every credit.
