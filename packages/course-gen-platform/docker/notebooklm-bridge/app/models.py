from __future__ import annotations

from datetime import datetime
from typing import Any
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class MediaSourceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(..., min_length=1, max_length=300)
    content: str = Field(..., min_length=1, max_length=200_000)

    @field_validator("title", "content", mode="before")
    @classmethod
    def trim_and_validate_not_blank(cls, value: Any) -> Any:
        if isinstance(value, str):
            trimmed = value.strip()
            if not trimmed:
                raise ValueError("must not be blank")
            return trimmed
        return value


class MediaGenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lesson_title: str = Field(..., min_length=1, max_length=300)
    script: str = Field(..., min_length=1)
    language: str = Field(..., min_length=2, max_length=16)
    voice: str | None = Field(default=None, max_length=128)
    course_id: str | None = Field(default=None, max_length=200)
    target_duration_minutes: int | None = Field(default=None, ge=1, le=120)
    duration_range_min_minutes: int | None = Field(default=None, ge=1, le=120)
    duration_range_max_minutes: int | None = Field(default=None, ge=1, le=120)
    sources: list[MediaSourceInput] | None = None
    audio_format: str | None = Field(default=None, max_length=64)
    audio_length: str | None = Field(default=None, max_length=64)
    video_format: str | None = Field(default=None, max_length=64)
    video_style: str | None = Field(default=None, max_length=64)

    @field_validator(
        "lesson_title",
        "script",
        "language",
        "voice",
        "course_id",
        "audio_format",
        "audio_length",
        "video_format",
        "video_style",
        mode="before",
    )
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

    @model_validator(mode="after")
    def validate_duration_range(self) -> "MediaGenerationRequest":
        if (
            self.duration_range_min_minutes is not None
            and self.duration_range_max_minutes is not None
            and self.duration_range_min_minutes > self.duration_range_max_minutes
        ):
            raise ValueError("duration_range_min_minutes must be <= duration_range_max_minutes")

        return self


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


TaskStatus = Literal["queued", "in_progress", "completed", "failed"]
MediaType = Literal["audio", "video"]


class MediaGenerationTaskStartResponse(BaseModel):
    task_id: str
    media_type: MediaType
    status: Literal["queued"]
    created_at: datetime


class MediaGenerationTaskStatusResponse(BaseModel):
    task_id: str
    media_type: MediaType
    status: TaskStatus
    created_at: datetime
    updated_at: datetime
    error: str | None = None


class AudioGenerationTaskResultResponse(BaseModel):
    task_id: str
    media_type: Literal["audio"]
    status: TaskStatus
    artifact: AudioGenerationResponse | None = None
    error: str | None = None


class VideoGenerationTaskResultResponse(BaseModel):
    task_id: str
    media_type: Literal["video"]
    status: TaskStatus
    artifact: VideoGenerationResponse | None = None
    error: str | None = None
