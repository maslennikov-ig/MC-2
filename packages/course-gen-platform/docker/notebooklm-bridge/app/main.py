from __future__ import annotations

import base64
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, status

from .auth import require_bearer_token
from .config import Settings, get_settings
from .generator import (
    MediaGenerationError,
    MediaGenerationTimeoutError,
    MediaGenerator,
    NotebookLMMediaGenerator,
)
from .models import (
    AudioGenerationResponse,
    HealthResponse,
    MediaGenerationRequest,
    VideoGenerationResponse,
)


@lru_cache(maxsize=1)
def _build_default_generator() -> NotebookLMMediaGenerator:
    return NotebookLMMediaGenerator(get_settings())


def get_media_generator() -> MediaGenerator:
    return _build_default_generator()


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(
        title="NotebookLM Bridge",
        description="Bridge service for NotebookLM audio/video artifact generation",
        version="1.0.0",
    )

    if settings is not None:
        app.dependency_overrides[get_settings] = lambda: settings

    @app.get("/health", response_model=HealthResponse)
    async def health(
        resolved_settings: Annotated[Settings, Depends(get_settings)],
    ) -> HealthResponse:
        return HealthResponse(
            status="ok",
            service="notebooklm-bridge",
            mode=resolved_settings.notebooklm_generation_mode,
        )

    @app.post(
        "/artifacts/generate-audio",
        response_model=AudioGenerationResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    async def generate_audio(
        request: MediaGenerationRequest,
        generator: Annotated[MediaGenerator, Depends(get_media_generator)],
    ) -> AudioGenerationResponse:
        try:
            result = await generator.generate_audio(request)
        except MediaGenerationTimeoutError as error:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Audio generation timed out",
            ) from error
        except MediaGenerationError as error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Audio generation failed",
            ) from error

        return AudioGenerationResponse(
            audio_base64=base64.b64encode(result.media_bytes).decode("ascii"),
            mime_type=result.mime_type,
            extension=result.extension,
            duration_seconds=result.duration_seconds,
            metadata=result.metadata or {},
        )

    @app.post(
        "/video/generate-overview",
        response_model=VideoGenerationResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    async def generate_video_overview(
        request: MediaGenerationRequest,
        generator: Annotated[MediaGenerator, Depends(get_media_generator)],
    ) -> VideoGenerationResponse:
        try:
            result = await generator.generate_video_overview(request)
        except MediaGenerationTimeoutError as error:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Video generation timed out",
            ) from error
        except MediaGenerationError as error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Video generation failed",
            ) from error

        return VideoGenerationResponse(
            video_base64=base64.b64encode(result.media_bytes).decode("ascii"),
            mime_type=result.mime_type,
            extension=result.extension,
            duration_seconds=result.duration_seconds,
            metadata=result.metadata or {},
        )

    return app


app = create_app()

