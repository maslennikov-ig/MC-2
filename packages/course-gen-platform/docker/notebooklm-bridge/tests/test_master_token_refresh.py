"""The bridge must be able to replace its own cookies, and must say so when it cannot.

Two failures are covered here, and both were measured on the live dev bridge on 2026-08-25 rather
than reasoned about:

1. **The silence.** Cookies expired 2026-03-31 and were noticed 2026-08-22, because refreshing
   needed a person with a browser. A master token removes the person; a health check that FAILS
   while no master token is present removes the silence.
2. **The layout fork.** `notebooklm login --master-token-refresh` runs the CLI's startup migration,
   which MOVES the home-root `storage_state.json` into `profiles/default/`. Both bridges read the
   home-root path, so the file the service depends on disappeared the moment that command returned.
   The reconcile below is what makes that self-healing instead of an outage.
"""

from __future__ import annotations

import asyncio
import json
import os
import pathlib
import time

import pytest

from app.config import Settings
from app.master_token_refresh import (
    CHECK_NAME,
    _Paths,
    describe,
    reconcile_layout,
    refresh_if_due,
)

pytest.importorskip("notebooklm.paths", reason="notebooklm-py is not installed in this environment")


def _settings(tmp_path: pathlib.Path, **overrides: object) -> Settings:
    return Settings(
        NOTEBOOKLM_BRIDGE_TOKEN="test-token",
        NOTEBOOKLM_STORAGE_PATH=str(tmp_path / "storage_state.json"),
        **overrides,
    )


def _write_storage(path: pathlib.Path, *, age_seconds: float = 0.0) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"cookies": []}), encoding="utf-8")
    if age_seconds:
        stamp = time.time() - age_seconds
        os.utime(path, (stamp, stamp))


def _write_token(path: pathlib.Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "version": 1,
                "email": "someone@example.com",
                "android_id": "0123456789abcdef",
                "master_token": "aas_et/not-a-real-token",
            }
        ),
        encoding="utf-8",
    )


@pytest.fixture
def home(tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch) -> pathlib.Path:
    """Point notebooklm-py's path resolution at a throwaway home, as the container does."""
    monkeypatch.setenv("NOTEBOOKLM_HOME", str(tmp_path))
    return tmp_path


def test_missing_master_token_fails_the_check_out_loud(home: pathlib.Path) -> None:
    """Not an outage — the existing cookies still work — but never again a silent one."""
    _write_storage(home / "storage_state.json")
    detail = describe(_settings(home))
    assert detail.name == CHECK_NAME
    assert detail.passed is False
    assert "master token" in (detail.message or "")


def test_present_master_token_reports_when_the_next_re_mint_is_due(home: pathlib.Path) -> None:
    _write_storage(home / "storage_state.json")
    _write_token(home / "profiles" / "default" / "master_token.json")
    detail = describe(_settings(home))
    assert detail.passed is True
    assert "due" in (detail.message or "")


def test_inline_auth_json_has_no_file_to_refresh(home: pathlib.Path) -> None:
    detail = describe(_settings(home, NOTEBOOKLM_AUTH_JSON='{"cookies": []}'))
    assert detail.passed is True
    assert "Not read from a storage file" in (detail.message or "")


def test_fresh_cookies_are_not_re_minted(home: pathlib.Path) -> None:
    """The tick is hourly; the interval is a week. Only the interval may spend a network call."""
    _write_storage(home / "storage_state.json")
    _write_token(home / "profiles" / "default" / "master_token.json")
    outcome = asyncio.run(refresh_if_due(_settings(home)))
    assert outcome.refreshed is False
    assert "not due" in outcome.reason


def test_disabled_refresh_never_mints(home: pathlib.Path) -> None:
    _write_storage(home / "storage_state.json", age_seconds=30 * 86400)
    _write_token(home / "profiles" / "default" / "master_token.json")
    outcome = asyncio.run(
        refresh_if_due(_settings(home, NOTEBOOKLM_MASTER_TOKEN_REFRESH_ENABLED=False))
    )
    assert outcome.refreshed is False
    assert "disabled" in outcome.reason


# --- the layout fork -------------------------------------------------------------------


def _paths(home: pathlib.Path) -> _Paths:
    return _Paths(
        storage=home / "storage_state.json",
        token=home / "profiles" / "default" / "master_token.json",
    )


def test_reconcile_restores_the_file_the_cli_migration_moved_away(home: pathlib.Path) -> None:
    """The outage case: the configured path is gone and the session sits in profiles/default."""
    shadow = home / "profiles" / "default" / "storage_state.json"
    _write_storage(shadow)
    shadow.write_text(json.dumps({"cookies": [{"name": "SID"}]}), encoding="utf-8")

    repaired = reconcile_layout(_paths(home))

    assert repaired is not None and "restored" in repaired
    assert not shadow.exists()
    restored = json.loads((home / "storage_state.json").read_text(encoding="utf-8"))
    assert restored["cookies"][0]["name"] == "SID"


def test_reconcile_drops_a_stale_shadow_without_touching_live_cookies(
    home: pathlib.Path,
) -> None:
    """The other half: a re-mint already rewrote the configured path, so the copy is stale."""
    shadow = home / "profiles" / "default" / "storage_state.json"
    _write_storage(shadow, age_seconds=600)
    shadow.write_text(json.dumps({"cookies": [{"name": "stale"}]}), encoding="utf-8")
    os.utime(shadow, (time.time() - 600, time.time() - 600))
    _write_storage(home / "storage_state.json")
    (home / "storage_state.json").write_text(
        json.dumps({"cookies": [{"name": "live"}]}), encoding="utf-8"
    )

    repaired = reconcile_layout(_paths(home))

    assert repaired is not None and "stale" in repaired
    assert not shadow.exists()
    kept = json.loads((home / "storage_state.json").read_text(encoding="utf-8"))
    assert kept["cookies"][0]["name"] == "live"


def test_reconcile_is_a_no_op_on_a_clean_layout(home: pathlib.Path) -> None:
    _write_storage(home / "storage_state.json")
    assert reconcile_layout(_paths(home)) is None


def test_a_forked_layout_is_reported_before_anything_reads_the_wrong_file(
    home: pathlib.Path,
) -> None:
    """`auth_file` still passes while the fork exists — only this check names the cause."""
    _write_storage(home / "storage_state.json")
    _write_token(home / "profiles" / "default" / "master_token.json")
    _write_storage(home / "profiles" / "default" / "storage_state.json")

    detail = describe(_settings(home))

    assert detail.passed is False
    assert "--storage PATH login" in (detail.message or "")
