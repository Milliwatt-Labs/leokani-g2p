# SPDX-License-Identifier: MIT
"""Kokoro-82M speaking Leokani G2P's phonemes instead of its own text front end.

    pip install "leokani-g2p @ git+https://github.com/Milliwatt-Labs/leokani-g2p" kokoro soundfile
    python kokoro_tts.py "Dr. Okafor lands at 7:45 AM." -o kokoro.wav
"""
import argparse

import numpy as np
import soundfile as sf
from kokoro import KPipeline

import leokani_g2p

ap = argparse.ArgumentParser()
ap.add_argument("text")
ap.add_argument("-o", "--out", default="kokoro.wav")
ap.add_argument("--voice", default="af_heart")
a = ap.parse_args()

pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
audio = []
for phonemes in leokani_g2p.phonemize_chunks(a.text):      # one clause chunk at a time (Kokoro takes up to 510)
    for result in pipeline.generate_from_tokens(phonemes, voice=a.voice):
        audio.append(result.audio.numpy())
sf.write(a.out, np.concatenate(audio), 24000)
print(a.out)
