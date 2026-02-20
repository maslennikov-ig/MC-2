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
        default=240.0,
        gt=0,
        alias="NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS",
    )
    notebooklm_poll_interval_seconds: float = Field(
        default=2.0,
        gt=0,
        alias="NOTEBOOKLM_POLL_INTERVAL_SECONDS",
    )
    notebooklm_allow_fallback: bool = Field(
        default=True,
        alias="NOTEBOOKLM_ALLOW_FALLBACK",
    )
    notebooklm_api_key: str | None = Field(
        default=None,
        alias="NOTEBOOKLM_API_KEY",
    )
    notebooklm_storage_path: str | None = Field(
        default=None,
        alias="NOTEBOOKLM_STORAGE_PATH",
    )
    notebooklm_workspace_id: str | None = Field(
        default=None,
        alias="NOTEBOOKLM_WORKSPACE_ID",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
