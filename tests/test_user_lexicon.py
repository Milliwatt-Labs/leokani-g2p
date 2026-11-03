# SPDX-License-Identifier: MIT
"""Custom pronunciations: user-lexicon-goldens.json (shared by every port), loaded as JSON and as TSV."""
import json
from pathlib import Path

import pytest

import leokani_g2p

GOLD = json.loads((Path(__file__).parent / "user-lexicon-goldens.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def plain():
    return leokani_g2p.load()


@pytest.fixture(scope="module", params=["json", "tsv"])
def g2p(request, tmp_path_factory):
    d = tmp_path_factory.mktemp("lex")
    if request.param == "json":
        p = d / "names.json"
        p.write_text(json.dumps(GOLD["lexicon"], ensure_ascii=False), encoding="utf-8")
    else:
        p = d / "names.tsv"
        p.write_text(GOLD["tsv"], encoding="utf-8")
    return leokani_g2p.load(user_lexicon=str(p))


@pytest.mark.parametrize("g", GOLD["lines"], ids=lambda g: g["text"][:40])
def test_lines(g2p, plain, g):
    assert g2p.normalize(g["text"]) == g["normalized"]
    assert g2p.phonemize(g["text"]) == g["leokani"]
    assert plain.phonemize(g["text"]) == g["without"]


@pytest.mark.parametrize("g", GOLD["pieces"], ids=lambda g: g["piece"][:40])
def test_pieces(g2p, g):
    assert g2p.normalize(g["piece"], pauses=False) == g["normalized"]
    assert g2p.piece(g["piece"]) == g["leokani"]


@pytest.mark.parametrize("doc", GOLD["reject"], ids=lambda d: json.dumps(d, ensure_ascii=False)[:40])
def test_reject(doc):
    with pytest.raises((ValueError, AttributeError)):
        leokani_g2p.UserLexicon(doc, symbols=set("abcdefghijklmnopqrstuvwxyzˈˌ"))


def test_cli_lexicon(tmp_path, capsys):
    from leokani_g2p.cli import main
    p = tmp_path / "x.tsv"
    p.write_text("gif\t/ʤˈɪf/\n", encoding="utf-8")
    assert main(["--lexicon", str(p), "--piece", "gif"]) == 0
    assert capsys.readouterr().out.strip() == "ʤˈɪf"
