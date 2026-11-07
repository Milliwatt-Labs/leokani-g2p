# Changelog

## 1.3.0 (2026-11-07)

- Much smaller model files, same output: micro is 10.2 MB (19.0 MB in 1.2) and 4.9 MB when a web server sends it
  with Brotli (17.7 MB in 1.2); mini is 10.8 MB (21.8 MB), 6.0 MB with Brotli (20.3 MB).
- The lexicon is now two files, `leokani-g2p.data` (the tables and the most common words, enough for a first
  sentence) and `leokani-g2p-words.data` (every other word), read in place instead of unpacked into memory. A word
  the letter-to-sound model already says right is stored as the word alone.
- Accuracy is unchanged or slightly better on every test set (see Accuracy). 5 of the 2,539 golden entries changed
  in micro and 6 in mini, all in words outside the lexicon or in all-caps letter readings.
- A word the letter-to-sound model says is decoded the first time it is seen, so a line full of new words is slower
  than in 1.2 (0.92 ms vs 0.40 ms per line on one thread); once seen, 0.42 ms vs 0.38 ms.
- JavaScript: `load()` reads the files it needs as they are needed (`lazy: false` reads them all at once), and
  `normalizeAsync(text)` is new. The synchronous `normalize(text)` now throws `NeedOov` for an all-caps word like
  "NBA" until the letter-to-sound model has said it (and `NeedWords` before the words file is read); after
  `normalizeAsync` or `phonemize` has read a line, `normalize` gives the same result for it. Prefer `normalizeAsync`.

## 1.2.0 (2026-11-03)

- Two sizes: `micro`, the default and the same size as 1.0, and `mini`, a larger letter-to-sound model that is
  better on names and rare words. Pick one with `variant="mini"` or `--variant mini`.
- Larger lexicon: unseen names 83.4 % → 91.3 % (micro) and 93.1 % (mini); unseen rare words 72.1 % → 80.1 % and
  81.1 %.
- Text reading: acronyms and words, spelled-out letters, Roman numerals, web addresses and emails, units, ranges
  and phone numbers.
- Words spelled the same but said differently ("live", "lead", "tear") are picked from nearby words.
- Custom pronunciations: `add_pronunciation`, `load_user_lexicon` and `--lexicon` (see USER-LEXICON.md).
- JavaScript package for browsers and Node (`js/`, npm `leokani-g2p`) and a Swift package
  ([leokani-g2p-swift](https://github.com/Milliwatt-Labs/leokani-g2p-swift)), with the same output.

## 1.0.0 (2026-11-01)

- First release.
