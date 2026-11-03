# Custom pronunciations

A user lexicon gives words your own pronunciation: a name the model misreads, a brand, a product code. Every
Leokani G2P port (Python, C, JavaScript, Swift) reads the same files and applies the same rules, so one file
works everywhere.

## Files

JSON:

```json
{
  "format": "leokani-g2p-user/1",
  "words": {
    "Leokani": "/lˌAOkˈɑni/",
    "Siobhan": "shivawn",
    "BBC": { "say": "B B C" },
    "gif": { "phonemes": "ʤˈɪf" }
  }
}
```

TSV, one entry per line, `key<TAB>value`. Blank lines and lines starting with `#` are skipped:

```
# names
Leokani	/lˌAOkˈɑni/
Siobhan	shivawn
```

A string value written `/like this/` is phonemes; any other string is a respelling. In JSON an object names the
kind outright: `{"phonemes": …}` or `{"say": …}`.

## Rules

1. **Before everything else.** Each word is looked up in the user lexicon before the built-in lexicon and before
   any rule for numbers, dates, abbreviations and so on. Quotes, brackets and trailing punctuation around a word
   are kept: `(Gauss's)` still has its brackets.
2. **Case.** A key with no capital letters matches the word in any casing. A key with a capital letter matches
   only that exact casing, and wins over a lowercase key. `’` and `'` are the same.
3. **Possessives.** If `Gauss's` (or `Gauss’s`) has no entry of its own, `Gauss` is used: phonemes get `ᵻz`
   after s z ʃ ʒ ʧ ʤ, `s` after p t k f θ, and `z` otherwise; a respelling gets `'s`. A plural possessive
   (`James'`) is said like the word.
4. **Phonemes** become the word's base pronunciation; the model still fits it to the sentence (stress, linking).
   They may use only the model's phoneme symbols, the stress marks `ˈ` and `ˌ`, and spaces between parts. Anything
   else is refused when the file is loaded.
5. **Respellings** are read as ordinary text in place of the word: numbers, the lexicon and letter-to-sound all
   apply. A respelling's own words are not looked up in the user lexicon again.
6. **Keys** are single tokens, with no spaces. Trailing punctuation is removed from a key (`Mx.` is stored as
   `Mx`). A later entry replaces an earlier one with the same key.

An empty user lexicon changes nothing.

## In JavaScript

```js
import { load, UserLexicon } from 'leokani-g2p';

const g2p = await load({ userLexicon: 'names.tsv' });        // Node: a .json or .tsv path
g2p.addPronunciation('Thibault', '/tˈibO/');
g2p.addPronunciation('kubernetes', 'koober netties');
g2p.loadUserLexicon(await (await fetch('/names.json')).text());   // JSON or TSV text
g2p.removePronunciation('Thibault');
JSON.stringify(g2p.userLexicon.toJSON());                    // save it back as a file
```

`add` and the loaders throw a `UserLexiconError` that names the key, the line and the bad symbol.
