# SPDX-License-Identifier: MIT
"""The installed package reproduces goldens.json exactly: every piece (one clause), every line and every edge
case (a whole line through the normaliser and the clause chunker)."""
import json
import subprocess
import sys
from pathlib import Path

import pytest

import leokani_g2p

HERE = Path(__file__).parent
GOLD = json.loads((HERE / "goldens.json").read_text(encoding="utf-8"))                 # micro, the default
GOLDS = {"micro": GOLD, "mini": json.loads((HERE / "goldens-mini.json").read_text(encoding="utf-8"))}
_models: dict = {}


def model(variant):
    if variant not in _models:
        _models[variant] = leokani_g2p.load(variant=variant)
    return _models[variant]


def cases(key):
    return [pytest.param(v, g, id=f"{v}-{g['piece'][:40] if key == 'pieces' else g['id']}")
            for v, gold in GOLDS.items() for g in (gold[key] if key == "pieces" else gold["lines"] + gold["edge"])]


@pytest.mark.parametrize("variant", list(GOLDS))
def test_format(variant):
    assert GOLDS[variant]["format"] == leokani_g2p.FORMAT == model(variant).doc["format"]
    assert GOLDS[variant].get("variant", variant) == variant == model(variant).variant


@pytest.mark.parametrize("variant,g", cases("pieces"))
def test_pieces(variant, g):
    g2p = model(variant)
    assert g2p.normalize(g["piece"], pauses=False) == g["normalized"]
    assert g2p.piece(g["piece"]) == g["leokani"]


@pytest.mark.parametrize("variant,g", cases("lines"))
def test_lines(variant, g):
    g2p = model(variant)
    assert g2p.normalize(g["text"]) == g["normalized"]
    assert g2p.phonemize(g["text"]) == g["leokani"]


def test_counts():
    for gold in GOLDS.values():
        assert min(len(gold["pieces"]), len(gold["lines"]), len(gold["edge"])) > 100


def test_variants_differ():
    assert model("micro").lexicon is not model("mini").lexicon
    with pytest.raises(ValueError):
        leokani_g2p.load(variant="huge")


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
    m = GOLDS["mini"]["edge"][0]
    assert run("--variant", "mini", m["text"]).stdout == m["leokani"] + "\n"


def test_lazy():
    """lazy=True: the tables and common words first, the rest only when a piece needs them, same output."""
    g2p = leokani_g2p.load(lazy=True)
    assert g2p.loaded() == []
    assert g2p.phonemize("The cat sat.") == model("micro").phonemize("The cat sat.")
    g = GOLD["edge"][0]
    assert g2p.phonemize(g["text"]) == g["leokani"]
