from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Service configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    notebooklm_bridge_token: str = Field(
        ...,
        min_length=1,
        alias="NOTEBOOKLM_BRIDGE_TOKEN",
    )
    notebooklm_generation_mode: Literal["auto", "notebooklm", "fallback"] = Field(
        default="auto",
        alias="NOTEBOOKLM_GENERATION_MODE",
    )
    notebooklm_generation_timeout_seconds: float = Field(
        default=3600.0,
        gt=0,
        alias="NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS",
    )
    notebooklm_http_timeout_seconds: float = Field(
        default=60.0,
        gt=0,
        alias="NOTEBOOKLM_HTTP_TIMEOUT_SECONDS",
    )
    notebooklm_poll_interval_seconds: float = Field(
        default=2.0,
        gt=0,
        alias="NOTEBOOKLM_POLL_INTERVAL_SECONDS",
    )
    notebooklm_poll_http_timeout_seconds: float = Field(
        default=8.0,
        gt=0,
        alias="NOTEBOOKLM_POLL_HTTP_TIMEOUT_SECONDS",
    )
    notebooklm_poll_error_retry_limit: int = Field(
        default=12,
        ge=1,
        alias="NOTEBOOKLM_POLL_ERROR_RETRY_LIMIT",
    )
    notebooklm_proactive_recovery_start_seconds: float = Field(
        default=180.0,
        ge=0.0,
        alias="NOTEBOOKLM_PROACTIVE_RECOVERY_START_SECONDS",
    )
    notebooklm_proactive_recovery_interval_seconds: float = Field(
        default=60.0,
        gt=0.0,
        alias="NOTEBOOKLM_PROACTIVE_RECOVERY_INTERVAL_SECONDS",
    )
    notebooklm_global_generation_concurrency: int = Field(
        default=4,
        ge=1,
        alias="NOTEBOOKLM_GLOBAL_GENERATION_CONCURRENCY",
    )
    notebooklm_queue_wait_timeout_seconds: float = Field(
        default=259200.0,  # 72 hours — supports large batch runs (100+ enrichments)
        gt=0,
        alias="NOTEBOOKLM_QUEUE_WAIT_TIMEOUT_SECONDS",
    )
    notebooklm_allow_fallback: bool = Field(
        default=False,
        alias="NOTEBOOKLM_ALLOW_FALLBACK",
    )
    notebooklm_auth_json: str | None = Field(
        default=None,
        alias="NOTEBOOKLM_AUTH_JSON",
    )
    notebooklm_storage_path: str | None = Field(
        default=None,
        alias="NOTEBOOKLM_STORAGE_PATH",
    )
    notebooklm_master_token_refresh_enabled: bool = Field(
        default=True,
        alias="NOTEBOOKLM_MASTER_TOKEN_REFRESH_ENABLED",
    )
    # Seven days against a ~400-day session is not about the long-lived cookies — those outlive any
    # schedule. It is about the ROTATING half (__Secure-1PSIDTS, __Secure-3PSIDTS, SIDCC), which the
    # client re-issues only while it is working. An idle bridge stops rotating them, which is how a
    # file that looked alive on 31 March was dead by April with nobody touching it.
    notebooklm_master_token_refresh_interval_seconds: float = Field(
        default=604800.0,
        gt=0,
        alias="NOTEBOOKLM_MASTER_TOKEN_REFRESH_INTERVAL_SECONDS",
    )
    # How often to look, not how often to re-mint. Cheap: a stat() on one file.
    notebooklm_master_token_refresh_check_interval_seconds: float = Field(
        default=3600.0,
        gt=0,
        alias="NOTEBOOKLM_MASTER_TOKEN_REFRESH_CHECK_INTERVAL_SECONDS",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
