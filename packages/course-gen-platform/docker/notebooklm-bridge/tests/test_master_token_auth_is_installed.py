"""The image must be able to re-mint its own cookies.

Master-token auth is the cure for the failure that cost this service four months: cookies
expired on 31 March 2026, nobody noticed until 22 August, because every refresh needed a human
with a browser and therefore happened only after something had already broken.

That cure has one dependency, `gpsoauth`, and it arrives through an OPTIONAL extra —
`notebooklm-py[headless]`. `notebooklm._auth.master_token` imports it lazily, so dropping the
extra does not fail the build, does not fail startup, and does not fail any existing test. It
fails months later, at the moment a token is due to be re-minted and nobody is watching.

That is the same shape as the original defect, which is why it gets a test rather than a comment.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REQUIREMENTS = Path(__file__).resolve().parent.parent / "requirements.txt"


def requirement_lines() -> list[str]:
    return [
        line.strip()
        for line in REQUIREMENTS.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def test_notebooklm_py_keeps_the_headless_extra() -> None:
    """Without `[headless]` the master-token path cannot run inside this image."""
    assert any(
        line.startswith("notebooklm-py[") and "headless" in line for line in requirement_lines()
    ), "notebooklm-py must carry the [headless] extra; master-token auth needs gpsoauth"


def test_master_token_auth_can_actually_import_gpsoauth() -> None:
    """The declaration is not the installation — check the module is really there.

    `_require_gpsoauth` is the same guard the library uses at the top of an exchange or a re-mint,
    so calling it here fails for exactly the reason a 3am cron would.
    """
    master_token = pytest.importorskip(
        "notebooklm._auth.master_token",
        reason="notebooklm-py is not installed in this environment",
    )

    import gpsoauth  # noqa: PLC0415 - the point of the test

    assert master_token._require_gpsoauth() is gpsoauth


def test_every_requirement_has_an_upper_bound() -> None:
    """A floor is not a range.

    `notebooklm-py>=0.1.0` once let the build DATE choose the version: `:latest` built
    2026-08-10 got 0.8.0 while `:develop` built 2026-06-04 got 0.6.0, and production ran two
    minors ahead of dev across a release that restructured error handling, with nobody having
    chosen either. The extra re-introduces the same hazard through the back door — it declares
    only `gpsoauth>=1.1.0`, and gpsoauth 2.0.0 exists — so the bound is stated here as well.

    An exact pin (`==`) is a range of one and passes.
    """
    unbounded = [
        line
        for line in requirement_lines()
        if re.search(r">=", line) and "<" not in line and "==" not in line
    ]

    assert unbounded == [], f"requirements without an upper bound: {unbounded}"
