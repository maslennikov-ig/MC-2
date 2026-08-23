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
    lesson_id: str | None = Field(default=None, max_length=200)
    target_duration_minutes: int | None = Field(default=None, ge=1, le=120)
    duration_range_min_minutes: int | None = Field(default=None, ge=1, le=120)
    duration_range_max_minutes: int | None = Field(default=None, ge=1, le=120)
    sources: list[MediaSourceInput] | None = None
    audio_format: str | None = Field(default=None, max_length=64)
    audio_length: str | None = Field(default=None, max_length=64)
    video_format: str | None = Field(default=None, max_length=64)
    video_style: str | None = Field(default=None, max_length=64)
    report_format: str | None = Field(default=None, max_length=64)
    flashcard_difficulty: str | None = Field(default=None, max_length=64)
    flashcard_count: int | None = Field(default=None, ge=5, le=50)
    mind_map_depth: int | None = Field(default=None, ge=2, le=5)
    infographic_orientation: str | None = Field(default=None, max_length=64)
    infographic_detail: str | None = Field(default=None, max_length=64)
    # Slide deck (mc2-6ye5z.4). notebooklm-py 0.8.0 takes SlideDeckFormat
    # (DETAILED_DECK=1, PRESENTER_SLIDES=2) and SlideDeckLength (DEFAULT=1,
    # SHORT=2); these carry the member NAME and the generator resolves it, so a
    # value the installed version does not know is refused by name rather than
    # sent as an integer that means something else.
    slide_deck_format: str | None = Field(default=None, max_length=64)
    slide_deck_length: str | None = Field(default=None, max_length=64)
    # `pdf` or `pptx` — the download format, not a generation option.
    slide_deck_output_format: str | None = Field(default=None, max_length=16)
    # Free-text steer, shared by slide deck and data table (mc2-6ye5z.4/.8).
    artifact_instructions: str | None = Field(default=None, max_length=4000)

    @field_validator(
        "lesson_title",
        "script",
        "language",
        "voice",
        "course_id",
        "lesson_id",
        "audio_format",
        "audio_length",
        "video_format",
        "video_style",
        "report_format",
        "flashcard_difficulty",
        "infographic_orientation",
        "infographic_detail",
        "slide_deck_format",
        "slide_deck_length",
        "slide_deck_output_format",
        "artifact_instructions",
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


class HealthCheckDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    passed: bool
    message: str | None = None


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok", "degraded"]
    service: str
    mode: str
    checks: list[HealthCheckDetail] = Field(default_factory=list)
    active_tasks: int = 0


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
MediaType = Literal[
    "audio",
    "video",
    "study_guide",
    "flashcards",
    "mind_map",
    "infographic",
    # mc2-6ye5z.4/.5/.8
    "slide_deck",
    "report",
    "data_table",
]


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


class TextGenerationResponse(BaseModel):
    content: str
    content_type: str  # "text/markdown" or "application/json"
    metadata: dict[str, Any] = Field(default_factory=dict)


class InfographicGenerationResponse(BaseModel):
    image_base64: str
    mime_type: str = "image/png"
    extension: str = "png"
    metadata: dict[str, Any] = Field(default_factory=dict)


class TextGenerationTaskResultResponse(BaseModel):
    task_id: str
    media_type: MediaType
    status: TaskStatus
    artifact: TextGenerationResponse | None = None
    error: str | None = None


class InfographicGenerationTaskResultResponse(BaseModel):
    task_id: str
    media_type: Literal["infographic"]
    status: TaskStatus
    artifact: InfographicGenerationResponse | None = None
    error: str | None = None


class BinaryArtifactGenerationResponse(BaseModel):
    """A downloaded artifact that is not text and not an image (mc2-6ye5z.4).

    The slide deck arrives as PDF or PPTX, so unlike the infographic the mime
    type and extension are not fixed: which one the caller gets depends on
    `slide_deck_output_format`, and a consumer that assumed PDF would mislabel
    a PPTX.
    """

    artifact_base64: str
    mime_type: str
    extension: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class BinaryArtifactTaskResultResponse(BaseModel):
    task_id: str
    media_type: Literal["slide_deck"]
    status: TaskStatus
    artifact: BinaryArtifactGenerationResponse | None = None
    error: str | None = None
