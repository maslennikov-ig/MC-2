"""Re-mint the Google session from a durable master token, with no browser.

This is the cure for the failure that cost this service four months. The web cookies expired on
2026-03-31 and nobody noticed until 2026-08-22, for one structural reason: every refresh needed a
human with a browser and a password, so a refresh only ever happened *after* something had already
broken. `notebooklm-py` can mint a fresh cookie jar from a long-lived `aas_et/` master token with no
browser at all, which turns "someone must notice" into "the file gets rewritten on a schedule".

**Why it lives inside the bridge and not in a systemd timer.** `deploy/systemd` units in this
repository are deliberately NOT installed by CI — root ownership of the monitoring tree is the
security property, and `scripts/ci/check_monitoring_drift.py` exists precisely because a unit in the
repository proves nothing about the host. A timer would therefore be one more thing that is present
on one machine, absent on another, and green in `is-active` either way. Shipped in the image, the
refresh arrives wherever the image does, and its evidence is the file's mtime rather than a unit
state.

**Both bridges may run this against the same file.** Production and dev bind-mount the same host
directory, so two containers can be due at the same moment. That is safe rather than merely
tolerable: `persist_minted_jar` takes the shared `filelock` around an atomic rename, and the due
check is re-read under that same lock, so the second container sees a fresh file and skips.

Nothing here logs a token, a cookie or the account address. `/health` is unauthenticated.
"""

from __future__ import annotations

import asyncio
import logging
import pathlib
from dataclasses import dataclass
from datetime import UTC, datetime

from .config import Settings
from .models import HealthCheckDetail

logger = logging.getLogger("notebooklm_bridge.master_token")

#: Health check name. Deliberately distinct from `auth_expiry`, which answers "are the cookies
#: alive"; this one answers "can this service replace them without a person".
CHECK_NAME = "master_token"

_SECONDS_PER_HOUR = 3600.0
_SECONDS_PER_DAY = 86400.0


@dataclass(frozen=True, slots=True)
class RefreshOutcome:
    """What one pass of the loop actually did. `reason` is written for a log line."""

    refreshed: bool
    reason: str


@dataclass(frozen=True, slots=True)
class _Paths:
    storage: pathlib.Path
    token: pathlib.Path


def _resolve_paths(settings: Settings) -> _Paths | None:
    """Where the cookies and the master token live, or None when neither applies.

    The two paths do NOT resolve the same way, and the difference is a trap worth naming.
    `get_storage_path` falls back to the legacy home-root `storage_state.json` when the profile
    directory has no file, which is the layout this deployment actually uses.
    `get_master_token_path` has no such fallback — it always returns
    `$NOTEBOOKLM_HOME/profiles/default/master_token.json`. So the token is NOT written beside the
    cookies, whatever the upstream docstring says; it lands one directory deeper, and looking for it
    next to `storage_state.json` finds nothing.
    """
    if settings.notebooklm_auth_json or not settings.notebooklm_storage_path:
        return None
    try:
        from notebooklm.paths import get_master_token_path  # noqa: PLC0415 (optional dependency)
    except ImportError:
        return None
    return _Paths(
        storage=pathlib.Path(settings.notebooklm_storage_path),
        token=get_master_token_path(None),
    )


def _shadow_of(paths: _Paths) -> pathlib.Path | None:
    """The copy the CLI's startup migration leaves behind, if it is there.

    `notebooklm`'s group callback calls `ensure_profiles_dir()`, which MOVES a home-root
    `storage_state.json` into `profiles/default/` — copy, then delete the original. This deployment
    is deliberately on the flat layout: `NOTEBOOKLM_STORAGE_PATH` names the home-root file, and
    `generator._configure_notebooklm_home` derives `NOTEBOOKLM_HOME` from that file's PARENT, so the
    profile layout would resolve the master token one directory too deep. The migration therefore
    does not reorganise this directory, it empties it: both bridges bind-mount the same host path
    and both read the file that just moved.

    Measured on 2026-08-25. `notebooklm login --master-token-refresh` migrated, and the root file
    was gone the moment the command returned. The gate is the GROUP-level `--storage`, not the
    subcommand's: `if not storage and not has_env_auth_json()` reads the group callback's own
    parameter, so `notebooklm --storage PATH login …` skips the migration while
    `notebooklm login --master-token-refresh --storage PATH` does not. Two flags with one name, and
    the position is the whole difference.
    """
    shadow = paths.token.parent / paths.storage.name
    if shadow == paths.storage or not shadow.exists():
        return None
    return shadow


def reconcile_layout(paths: _Paths) -> str | None:
    """Undo a CLI migration: leave the newest session at the configured path, and no shadow.

    Self-healing rather than a rule in a runbook. A rule would be obeyed until the one night it is
    not, and the symptom — `auth_file: Not found` on two bridges at once — reads as a lost secret
    rather than as a tool that reorganised a directory.
    """
    shadow = _shadow_of(paths)
    if shadow is None:
        return None

    from filelock import FileLock  # noqa: PLC0415 (transitive dep of notebooklm-py)

    # Same lock file `persist_minted_jar` takes, so a reconcile cannot race a mint.
    lock = paths.storage.parent / f".{paths.storage.name}.lock"
    with FileLock(str(lock), timeout=10.0):
        if not shadow.exists():  # a peer container reconciled while we waited
            return None
        configured_age = _age_seconds(paths.storage)
        shadow_age = _age_seconds(shadow)
        if configured_age is None or (shadow_age is not None and shadow_age < configured_age):
            shadow.replace(paths.storage)
            return f"restored {paths.storage} from {shadow} after a CLI layout migration"
        shadow.unlink()
        return f"removed the stale {shadow} left by a CLI layout migration"


def _age_seconds(path: pathlib.Path, *, now: datetime | None = None) -> float | None:
    """How long ago the cookie file was last written, or None if it is not there."""
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return None
    reference = now or datetime.now(UTC)
    return reference.timestamp() - mtime


def describe(settings: Settings) -> HealthCheckDetail:
    """Say out loud whether this service can replace its own cookies.

    A missing master token is reported as a FAILED check on purpose. It is not an outage — the
    existing cookies keep working — but it is the exact condition that went unobserved for four
    months, and the whole point of this epic is that a silent gap is worse than a loud one. Nothing
    downstream gates on `status`; `scripts/nlm-preflight.sh` and the container HEALTHCHECK both
    check only for HTTP 200, so a `degraded` here costs no traffic.
    """
    paths = _resolve_paths(settings)
    if paths is None:
        return HealthCheckDetail(
            name=CHECK_NAME, passed=True, message="Not read from a storage file"
        )
    if not settings.notebooklm_master_token_refresh_enabled:
        return HealthCheckDetail(
            name=CHECK_NAME,
            passed=True,
            message="Browserless refresh disabled by configuration",
        )
    if not paths.token.is_file():
        return HealthCheckDetail(
            name=CHECK_NAME,
            passed=False,
            message=(
                f"No master token at {paths.token} — refreshing cookies still needs a browser. "
                "Bootstrap with `notebooklm login --master-token --account EMAIL --oauth-token …`"
            ),
        )

    shadow = _shadow_of(paths)
    if shadow is not None:
        return HealthCheckDetail(
            name=CHECK_NAME,
            passed=False,
            message=(
                f"A CLI layout migration forked the session into {shadow}; the next refresh tick "
                "reconciles it. Run the CLI as `notebooklm --storage PATH login …` — the "
                "group-level flag is the one that skips the migration"
            ),
        )

    interval = settings.notebooklm_master_token_refresh_interval_seconds
    age = _age_seconds(paths.storage)
    if age is None:
        return HealthCheckDetail(
            name=CHECK_NAME,
            passed=True,
            message="Master token present; cookie file not written yet",
        )
    due_in_hours = (interval - age) / _SECONDS_PER_HOUR
    when = f"due in {due_in_hours:.0f}h" if due_in_hours > 0 else "due now"
    return HealthCheckDetail(
        name=CHECK_NAME,
        passed=True,
        message=(
            f"Browserless re-mint armed; cookies rewritten {age / _SECONDS_PER_HOUR:.0f}h ago, "
            f"next {when}"
        ),
    )


async def _mint_and_persist(paths: _Paths) -> None:
    """The re-mint itself: master token -> fresh cookie jar -> `storage_state.json`.

    Calls the public `notebooklm.auth` surface rather than `notebooklm.cli.services.login`, which
    would drag in the CLI package and its browser-capture import for four lines of work this image
    can do directly.
    """
    from notebooklm.auth import (  # noqa: PLC0415 (optional dependency, resolved at call time)
        mint_cookies,
        persist_minted_jar,
        read_master_token,
    )

    record = await asyncio.to_thread(read_master_token, paths.token)
    if record is None:
        raise FileNotFoundError(f"No master token at {paths.token}")
    jar = await mint_cookies(record["email"], record["master_token"], record["android_id"])
    await asyncio.to_thread(persist_minted_jar, paths.storage, jar, email=record.get("email"))


async def refresh_if_due(settings: Settings) -> RefreshOutcome:
    """Re-mint when the cookie file has aged past the interval. Idempotent across containers."""
    paths = _resolve_paths(settings)
    if paths is None:
        return RefreshOutcome(False, "no storage file configured")
    if not settings.notebooklm_master_token_refresh_enabled:
        return RefreshOutcome(False, "disabled by configuration")
    if not paths.token.is_file():
        return RefreshOutcome(False, f"no master token at {paths.token}")

    # Before deciding whether the cookies are due, make sure we are looking at the right file.
    repaired = await asyncio.to_thread(reconcile_layout, paths)
    if repaired is not None:
        logger.warning("Master-token layout reconciled: %s", repaired)

    interval = settings.notebooklm_master_token_refresh_interval_seconds
    age = _age_seconds(paths.storage)
    if age is not None and age < interval:
        return RefreshOutcome(False, f"cookies are {age / _SECONDS_PER_HOUR:.0f}h old, not due")

    await _mint_and_persist(paths)
    return RefreshOutcome(True, f"re-minted cookies into {paths.storage}")


async def refresh_loop(settings: Settings) -> None:
    """Wake on a fixed tick and re-mint when due. Cancelled by the application lifespan.

    A failure here is logged and the loop continues: a re-mint that fails leaves the existing
    cookies untouched — `mint_cookies` raises before `persist_minted_jar` is reached — so the
    service is no worse off than before the attempt, and the next tick will try again. The cause is
    formatted INTO the message rather than left to `exc_info`, because this repository's log
    pipeline prints only `message` and a swallowed cause has cost a run before.
    """
    tick = settings.notebooklm_master_token_refresh_check_interval_seconds
    interval_days = settings.notebooklm_master_token_refresh_interval_seconds / _SECONDS_PER_DAY
    logger.info(
        "Master-token cookie refresh armed: checking every %.0fh, re-minting after %.1fd",
        tick / _SECONDS_PER_HOUR,
        interval_days,
    )
    while True:
        await asyncio.sleep(tick)
        try:
            outcome = await refresh_if_due(settings)
        except asyncio.CancelledError:
            raise
        except Exception as error:  # noqa: BLE001 — any mint/transport failure; keep the loop alive
            logger.warning(
                "Master-token cookie refresh failed, cookies left as they were: %s: %s",
                type(error).__name__,
                error,
            )
            continue
        if outcome.refreshed:
            logger.info("Master-token cookie refresh: %s", outcome.reason)
        else:
            logger.debug("Master-token cookie refresh skipped: %s", outcome.reason)
