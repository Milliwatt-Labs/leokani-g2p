# SPDX-License-Identifier: MIT
# Leokani G2P by Milliwatt Labs (milliwattlabs.com)
"""Leokani G2P: English text to Kokoro-style phonemes, without espeak-ng.

    import leokani_g2p
    leokani_g2p.phonemize("Dr. Okafor lands at 7:45 AM.")      # -> one phoneme string
    leokani_g2p.phonemize_chunks("One clause. And another.")    # -> one string per clause chunk

    g2p = leokani_g2p.LeokaniG2P()                              # load once, call many times
    g2p.phonemize("Hello there.")
"""
from __future__ import annotations

from .runtime import FORMAT, HERE, LeokaniG2P

__version__ = "1.0.0"
__all__ = ["LeokaniG2P", "FORMAT", "load", "phonemize", "phonemize_chunks", "__version__"]

_default: LeokaniG2P | None = None


def load(model_dir: str | None = None, threads: int = 1) -> LeokaniG2P:
    """A new LeokaniG2P. model_dir: a folder with leokani-g2p.json.gz and the .onnx files (default: the package's)."""
    return LeokaniG2P(model_dir or HERE, threads)


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
