#!/bin/sh
# Leokani-tts with Leokani G2P: no espeak-ng needed. The model repo bundles Leokani G2P in its g2p/ folder.
set -e
hf download milliwattlabs/leokani-tts-7M --local-dir leokani-tts
cd leokani-tts
pip install numpy onnxruntime
python leokani_onnx.py "Hello there. How was your day?" --g2p leokani -o hello.wav

# Or bring the phonemes yourself, from the leokani-g2p package:
python leokani_onnx.py --phonemes "$(leokani-g2p 'Hello there. How was your day?')" -o hello2.wav
