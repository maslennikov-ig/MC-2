from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class MediaGenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lesson_title: str = Field(..., min_length=1, max_length=300)
    script: str = Field(..., min_length=1)
    language: str = Field(..., min_length=2, max_length=16)
    voice: str | None = Field(default=None, max_length=128)

    @field_validator("lesson_title", "script", "language", "voice", mode="before")
    @classmethod
    def trim_and_validate_not_blank(cls, value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, str):
            trimmed = value.strip()
            if not trimmed:
                raise ValueError("must not be blank")
            return trimmed
        return value


class HealthResponse(BaseModel):
    status: str
    service: str
    mode: str


class AudioGenerationResponse(BaseModel):
    audio_base64: str
    mime_type: str
    extension: str
    duration_seconds: float | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class VideoGenerationResponse(BaseModel):
    video_base64: str
    mime_type: str
    extension: str
    duration_seconds: float | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

