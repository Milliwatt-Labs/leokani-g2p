# Leokani G2P

English text to Kokoro-style phonemes, without espeak-ng.

Leokani G2P is a small, fast English phonemizer from [Milliwatt Labs](https://milliwattlabs.com). It produces espeak compatible phoneme codes, made from the ground up: the same Kokoro/misaki-style codes
Leokani-tts and Kokoro use. It contains no espeak-ng code or data files.

It needs only `numpy` and `onnxruntime` and about 19 MB of model files, and takes under a millisecond per line on
one CPU thread. The code is MIT and the model files are CC BY 4.0, so you can use it in commercial products with
attribution.

```console
$ leokani-g2p "Dr. Okafor lands at 7:45 AM."
dˈɑktəɹ ˈɑkæfəɹ lˈændz æt sˈɛvən fˈɔɹɾi fˈIv ˌAˈɛm.
```

## Two sizes

| variant | letter-to-sound params | files | |
| --- | ---: | ---: | --- |
| `micro` (default) | 2.22M | 19.0 MB | the same size as v1.0 |
| `mini` | 2.94M | 21.8 MB | better on names and rare words |

Both ship in the package; pick one with `variant="mini"` or `--variant mini`.

## Install

```bash
pip install "leokani-g2p @ git+https://github.com/Milliwatt-Labs/leokani-g2p"
```

Python 3.10 or newer. The model files ship inside the package. They are also on Hugging Face:
[milliwattlabs/leokani-g2p](https://huggingface.co/milliwattlabs/leokani-g2p).

## Quick start

```bash
leokani-g2p "Hello there. How was your day?"
leokani-g2p --chunks "It costs \$4.99 today. Call 555-0142."   # one clause chunk per line
leokani-g2p --json "Email hello@milliwattlabs.com."          # text, phonemes and chunks as JSON
leokani-g2p < book.txt > book.phonemes                        # one output line per input line
python -m leokani_g2p "Same thing, without the script."
```

```python
import leokani_g2p

leokani_g2p.phonemize("The wind was cold, so we read inside.")
# 'ðə wˈɪnd wʌz kˈOld, sˌO wi ɹˈid ɪnsˈId.'

leokani_g2p.phonemize_chunks("A long paragraph. Of several clauses.")
# ['ə lˈɔŋ pˈæɹəɡɹˌæf.', 'ʌv sˈɛvɹᵊl klˈɔzᵻz.']

g2p = leokani_g2p.load(threads=1)       # load once, reuse
g2p.phonemize("Hello there.")
g2p.piece("the wind was cold")           # one clause with no punctuation, no chunking

mini = leokani_g2p.load(variant="mini")  # the larger model
```

Numbers, money, dates, times, units, phone numbers, emails, web addresses and versions are written out as words
before conversion (`"$4.99"` is read as "4 dollars and 99 cents").

## Custom pronunciations

Names, brands and places the lexicon gets wrong: give phonemes, or a respelling that is read as text. They are
checked before the lexicon and every text rule, and possessives follow ("Siobhan's").

```python
g2p.add_pronunciation("Leokani", phonemes="lˌAOkˈɑni")
g2p.add_pronunciation("Siobhan", say="shivawn")
g2p.load_user_lexicon("names.tsv")       # or .json; also LeokaniG2P(user_lexicon=...)
```

```bash
leokani-g2p --lexicon names.tsv "Siobhan met Aoife."
```

The rules and the JSON/TSV formats: [USER-LEXICON.md](USER-LEXICON.md).

## JavaScript

Browsers and Node 20+, from the [`js/`](js/) folder (npm package `leokani-g2p`). Same output as the Python
package: it reproduces `tests/goldens.json` exactly.

```js
import { load } from 'leokani-g2p';

const g2p = await load({ userLexicon: { Siobhan: 'shivawn' } });
await g2p.phonemize('Siobhan lands at 7:45 AM.');
```

See [js/README.md](js/README.md) for bundlers, Workers and the command line, and
[js/USER-LEXICON.md](js/USER-LEXICON.md) for custom pronunciations (the same rules as
[USER-LEXICON.md](USER-LEXICON.md)).

## With Kokoro

The output uses Kokoro's phoneme codes, so a Kokoro voice can read it directly instead of running its own text
front end ([examples/kokoro_tts.py](examples/kokoro_tts.py)):

```python
import numpy as np, soundfile as sf
from kokoro import KPipeline
import leokani_g2p

pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
audio = [r.audio.numpy()
         for ps in leokani_g2p.phonemize_chunks("Dr. Okafor lands at 7:45 AM.")
         for r in pipeline.generate_from_tokens(ps, voice="af_heart")]
sf.write("kokoro.wav", np.concatenate(audio), 24000)
```

Kokoro takes up to 510 phoneme characters at a time, so pass it one chunk at a time.

## With Leokani-tts

[Leokani-tts 7M](https://huggingface.co/milliwattlabs/leokani-tts-7M) ships Leokani G2P in its `g2p/` folder.
`--g2p leokani` uses it in place of espeak-ng:

```bash
hf download milliwattlabs/leokani-tts-7M --local-dir leokani-tts
cd leokani-tts
pip install numpy onnxruntime
python leokani_onnx.py "Hello there. How was your day?" --g2p leokani -o hello.wav
```

Or pass the phonemes yourself:

```bash
python leokani_onnx.py --phonemes "$(leokani-g2p 'Hello there.')" -o hello.wav
```

Try Leokani-tts in your browser: [Leokani-tts 7M on Hugging Face Spaces](https://huggingface.co/spaces/milliwattlabs/leokani-tts-7M-demo).

## Accuracy

How often Leokani G2P reads test text held out from building the model the same as the reference (American
English, Kokoro's codes). Sentence references are espeak-ng's output (commit 8269af04, through misaki 0.9.4's
mapping); the letters and same-spelling rows use our own reference readings. Those last three tests are new in 1.2.

| test | v1.0 | 1.2 micro (default) | 1.2 mini |
| --- | ---: | ---: | ---: |
| held-out sentences, five test sets (1,940), apart from text read differently on purpose | 99.28 % | 99.33 % | 99.33 % |
| sentences built around unseen names (577) | 83.36 % | 91.33 % | 93.07 % |
| more sentences with unseen names (600) | 70.5 % | 85.0 % | 87.5 % |
| unseen rare words | 72.1 % | 80.1 % | 81.1 % |
| numbers, units, web addresses, abbreviations (165) | — | 78.2 % | 78.2 % |
| spelled-out letters and initialisms (148) | — | 88.5 % | 88.5 % |
| words spelled the same but said differently (213) | — | 87.3 % | 87.3 % |

Rare words that aren't in the lexicon are the weak spot, which is why names score lower. Mini is the better
choice for text full of names; on everyday sentences the two give the same output.

## Size and speed

| file | params | size |
| --- | ---: | ---: |
| `context.onnx`: how each word is said in its clause | 1.34M | 5.4 MB |
| `oov-encoder.onnx` + `oov-decoder.onnx`: letter-to-sound for words outside the lexicon | 2.22M | 9.0 MB |
| `leokani-g2p.json.gz`: lexicon, weak forms, number words | | 4.7 MB |
| `mini/`: the same four files for the mini variant | 2.94M + 1.34M | 21.8 MB |

On one CPU thread with the per-word cache warm: 0.26 ms per line on everyday sentences, about 0.6 ms on text full
of numbers, units and abbreviations (Apple M3 Pro).

## Limits

- American English only.
- Output is Kokoro/misaki-style phonemes, not espeak-ng's own IPA, and there is no audio: it is the text front
  end only.
- Unusual names and rare words outside the lexicon can be misread (see Accuracy).
- Some text is read on purpose differently from espeak-ng: amounts, units, emails and versions are said as words,
  and the pronoun "I" is always stressed.
- Heteronyms ("read", "lead", "wind", "lives") are picked from nearby words, and the guess can be wrong.

## Tests

```bash
pip install "leokani-g2p[test] @ git+https://github.com/Milliwatt-Labs/leokani-g2p"
git clone https://github.com/Milliwatt-Labs/leokani-g2p && cd leokani-g2p
pytest tests
```

`tests/goldens.json` holds outputs that the package, or a port of it, must reproduce exactly.

## License

- Code (the `leokani_g2p` package, its command-line tool, tests and examples): [MIT](LICENSE).
- Model weights (`*.onnx`), the lexicon (`leokani-g2p.json.gz`) and `tests/goldens.json`:
  [CC BY 4.0](LICENSE-CC-BY-4.0.txt).

Credit it as: **Leokani G2P by Milliwatt Labs (milliwattlabs.com)**. The lexicon's word list includes words
from the [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict) (BSD-2-Clause) and place names from
[GeoNames](https://www.geonames.org) (CC BY 4.0). The phoneme codes are those of
[misaki](https://github.com/hexgrad/misaki) and [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) by
hexgrad (Apache-2.0). See [NOTICE](NOTICE) for every credit.
