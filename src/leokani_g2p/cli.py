# SPDX-License-Identifier: MIT
# Leokani G2P by Milliwatt Labs (milliwattlabs.com)
"""leokani-g2p: English text to Kokoro-style phonemes.

    leokani-g2p "Hello there, Sam."          # one line -> phonemes
    leokani-g2p < book.txt                    # one output line per input line
    leokani-g2p --chunks "A long line. With clauses."
    leokani-g2p --json "It costs $4.99."
"""
from __future__ import annotations

import argparse
import json
import sys


def main(argv: list[str] | None = None) -> int:
    from . import HERE, LeokaniG2P, __version__

    ap = argparse.ArgumentParser(prog="leokani-g2p", description="English text to Kokoro-style phonemes.")
    ap.add_argument("text", nargs="*", help="text to convert (default: read lines from stdin)")
    ap.add_argument("--chunks", action="store_true", help="one clause chunk per output line")
    ap.add_argument("--piece", action="store_true", help="treat each input as one clause with no punctuation")
    ap.add_argument("--json", action="store_true", help="one JSON object per input line")
    ap.add_argument("--model", default=HERE, help="folder with leokani-g2p.json.gz and the .onnx files")
    ap.add_argument("--threads", type=int, default=1, help="ONNX Runtime threads (default 1)")
    ap.add_argument("--version", action="version", version=f"leokani-g2p {__version__}")
    a = ap.parse_args(argv)

    try:
        g2p = LeokaniG2P(a.model, a.threads)
    except (OSError, SystemExit) as e:
        print(f"leokani-g2p: can't load the model from {a.model}: {e}", file=sys.stderr)
        return 1

    lines = [" ".join(a.text)] if a.text else (ln.rstrip("\n") for ln in sys.stdin)
    out = sys.stdout
    for text in lines:
        chunks = [g2p.piece(text)] if a.piece else g2p.phonemize_chunks(text)
        if a.json:
            out.write(json.dumps({"text": text, "phonemes": " ".join(chunks), "chunks": chunks},
                                 ensure_ascii=False) + "\n")
        elif a.chunks:
            out.write("".join(c + "\n" for c in chunks))
        else:
            out.write(" ".join(chunks) + "\n")
        out.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
