# SPDX-License-Identifier: MIT
"""The installed package reproduces goldens.json exactly: every piece (one clause), every line and every edge
case (a whole line through the normaliser and the clause chunker)."""
import json
import subprocess
import sys
from pathlib import Path

import pytest

import leokani_g2p

GOLD = json.loads((Path(__file__).parent / "goldens.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def g2p():
    return leokani_g2p.load()


def test_format(g2p):
    assert GOLD["format"] == leokani_g2p.FORMAT == g2p.doc["format"]


@pytest.mark.parametrize("g", GOLD["pieces"], ids=lambda g: g["piece"][:40])
def test_pieces(g2p, g):
    assert g2p.normalize(g["piece"], pauses=False) == g["normalized"]
    assert g2p.piece(g["piece"]) == g["leokani"]


@pytest.mark.parametrize("g", GOLD["lines"] + GOLD["edge"], ids=lambda g: g["id"])
def test_lines(g2p, g):
    assert g2p.normalize(g["text"]) == g["normalized"]
    assert g2p.phonemize(g["text"]) == g["leokani"]


def test_counts():
    assert min(len(GOLD["pieces"]), len(GOLD["lines"]), len(GOLD["edge"])) > 100


def test_module_api():
    assert leokani_g2p.phonemize("") == ""
    text = "The wind was cold. So we read inside."
    assert leokani_g2p.phonemize(text) == " ".join(leokani_g2p.phonemize_chunks(text))
    assert len(leokani_g2p.phonemize_chunks(text)) == 2


def test_cli():
    run = lambda *a, **k: subprocess.run([sys.executable, "-m", "leokani_g2p", *a], capture_output=True,  # noqa: E731
                                         text=True, check=True, **k)
    g = GOLD["edge"][0]
    assert run(g["text"]).stdout == g["leokani"] + "\n"
    lines = [x["text"] for x in GOLD["lines"][:5]]
    assert run(input="\n".join(lines) + "\n").stdout.splitlines() == [x["leokani"] for x in GOLD["lines"][:5]]
    j = json.loads(run("--json", g["text"]).stdout)
    assert j["phonemes"] == g["leokani"]
    p = GOLD["pieces"][0]
    assert run("--piece", p["piece"]).stdout == p["leokani"] + "\n"
