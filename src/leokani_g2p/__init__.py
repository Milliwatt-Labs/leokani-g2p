# SPDX-License-Identifier: MIT
# Leokani G2P by Milliwatt Labs (milliwattlabs.com)
"""Leokani G2P: English text to Kokoro-style phonemes, without espeak-ng.

    import leokani_g2p
    leokani_g2p.phonemize("Dr. Okafor lands at 7:45 AM.")      # -> one phoneme string
    leokani_g2p.phonemize_chunks("One clause. And another.")    # -> one string per clause chunk

    g2p = leokani_g2p.LeokaniG2P()                              # load once, call many times
    mini = leokani_g2p.load(variant="mini")                     # the larger model: better on names and rare words
    g2p.phonemize("Hello there.")

    leokani_g2p.add_pronunciation("Siobhan", say="shivawn")     # custom pronunciations (USER-LEXICON.md)
    leokani_g2p.add_pronunciation("Leokani", phonemes="lˌAOkˈɑni")
"""
from __future__ import annotations

from .runtime import DEFAULT_VARIANT, FORMAT, HERE, VARIANTS, LeokaniG2P, UserLexicon

__version__ = "1.3.0"
__all__ = ["LeokaniG2P", "UserLexicon", "FORMAT", "VARIANTS", "DEFAULT_VARIANT", "load", "phonemize", "phonemize_chunks", "add_pronunciation",
           "load_user_lexicon", "__version__"]

_default: LeokaniG2P | None = None


def load(model_dir: str | None = None, threads: int = 1, user_lexicon=None, variant: str | None = None,
         lazy: bool = False) -> LeokaniG2P:
    """A new LeokaniG2P. variant: "micro" (default) or "mini". model_dir: a folder with the .data and
    .onnx files (default: the package's). user_lexicon: custom pronunciations, a .json or .tsv path, a dict or a
    UserLexicon. lazy: read the rare-word file and start each model only when a piece first needs it."""
    return LeokaniG2P(model_dir or HERE, threads, user_lexicon=user_lexicon, variant=variant, lazy=lazy)


def _model() -> LeokaniG2P:
    global _default
    if _default is None:
        _default = load()
    return _default


def phonemize(text: str) -> str:
    """A line or paragraph -> Kokoro-style phonemes, with stress marks and punctuation."""
    return _model().phonemize(text)


def phonemize_chunks(text: str) -> list[str]:
    """A line or paragraph -> phonemes, one string per clause chunk."""
    return _model().phonemize_chunks(text)


def add_pronunciation(word: str, value=None, *, phonemes: str | None = None, say: str | None = None) -> None:
    """A custom pronunciation for phonemize(): add_pronunciation("gif", phonemes="ʤˈɪf"),
    add_pronunciation("Siobhan", say="shivawn"), or a value "/phonemes/" or a respelling."""
    _model().add_pronunciation(word, value, phonemes=phonemes, say=say)


def load_user_lexicon(path: str) -> None:
    """Add the custom pronunciations in a .json or .tsv file to phonemize()."""
    _model().load_user_lexicon(path)
