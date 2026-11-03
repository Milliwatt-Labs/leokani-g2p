# Changelog

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
