# Custom pronunciations (user lexicon)

Leokani G2P 1.1 lets you fix how a word is said: a brand, a person, a place. Every port (Python, C,
JavaScript, Swift) reads the same files and gives the same output; `user-lexicon-goldens.json` is the parity
file they all check.

## Entries

A key is one token (no spaces). A value is either:

- **phonemes**, written `/like this/` (or `{"phonemes": "..."}` in JSON), using the release's symbols
  (`outSymbols` in `leokani-g2p.json.gz`, plus `ˈ` and `ˌ`);
- a **respelling**, plain text (or `{"say": "..."}`), read as if it were written in the line instead.

```json
{
  "format": "leokani-g2p-user/1",
  "words": {
    "Leokani": "/lˌAOkˈɑni/",
    "Siobhan": "shivawn",
    "BBC": {"say": "B B C"},
    "gif": {"phonemes": "ʤˈɪf"}
  }
}
```

The same entries as TSV (key, a tab, the value; blank lines and `#` lines are skipped):

```
# key<TAB>value
Leokani	/lˌAOkˈɑni/
Siobhan	shivawn
BBC	B B C
gif	/ʤˈɪf/
```

## Rules

1. **Checked first.** A token's leading and trailing punctuation is set aside and the rest is looked up before
   the built-in lexicon and before any text rule (numbers, dates, abbreviations).
2. **Case.** A key with no capital letter matches any casing (`gif` matches `GIF`, `Gif`). A key with a capital
   matches only that casing (`BBC` doesn't match `bbc`), and wins over a lowercase key.
3. **Possessives.** `Leokani's` and `Leokani’s` fall back to `Leokani`. Phonemes get `ᵻz` after s z ʃ ʒ ʧ ʤ, `s`
   after p t k f θ, else `z`; a respelling gets `'s`. `James'` falls back to `James` with nothing added.
4. **Phonemes** become the word's pronunciation; the word still takes part in the sentence's linking and stress.
5. **Respellings** go through the normal rules, lexicon and letter-to-sound model, so `C++` → `C plus plus`
   works. A respelling's words are not looked up in the user lexicon again.
6. Later entries replace earlier ones with the same key. Loading is all or nothing: a bad entry (two words,
   empty value, unknown phoneme symbol, a file that isn't `leokani-g2p-user/1`) rejects the file.

The JSON Schema is `leokani-g2p-user-lexicon.schema.json`.

## Python

```python
from leokani_g2p import LeokaniG2P

g = LeokaniG2P(user_lexicon="my-words.json")       # or .tsv, or a dict
g.add_pronunciation("Leokani", phonemes="lˌAOkˈɑni")
g.add_pronunciation("Siobhan", say="shivawn")
g.load_user_lexicon("more-words.tsv")
print(g.phonemize("Siobhan's Leokani demo."))
```

Command line: `python leokani_g2p.py --lexicon my-words.json --text "Siobhan's demo."`

## C

```c
lkg *g = lkg_open("leokani-g2p.lkg");
lkg_add_phonemes(g, "Leokani", "lˌAOkˈɑni");
lkg_add_respelling(g, "Siobhan", "shivawn");
if (lkg_load_user_lexicon(g, "my-words.json") != 0) fprintf(stderr, "%s\n", lkg_error(g));
```
