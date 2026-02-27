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
        default=3600.0,
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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
