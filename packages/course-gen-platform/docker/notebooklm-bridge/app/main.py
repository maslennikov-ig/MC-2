from __future__ import annotations

import asyncio
import base64
import logging
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, status

from .auth import require_bearer_token
from .config import Settings, get_settings
from .generator import (
    GenerationResult,
    MediaGenerationError,
    MediaGenerationTimeoutError,
    MediaGenerator,
    NotebookLMMediaGenerator,
)
from .models import (
    AudioGenerationResponse,
    AudioGenerationTaskResultResponse,
    HealthResponse,
    MediaGenerationRequest,
    MediaGenerationTaskStartResponse,
    MediaGenerationTaskStatusResponse,
    VideoGenerationResponse,
    VideoGenerationTaskResultResponse,
)

logger = logging.getLogger("notebooklm_bridge.api")

TaskStatus = Literal["queued", "in_progress", "completed", "failed"]
TaskMediaType = Literal["audio", "video"]


def _configure_bridge_logging() -> None:
    level_name = (
        os.getenv("NOTEBOOKLM_BRIDGE_LOG_LEVEL")
        or os.getenv("NOTEBOOKLM_LOG_LEVEL")
        or "INFO"
    ).upper()
    level = getattr(logging, level_name, logging.INFO)

    bridge_logger = logging.getLogger("notebooklm_bridge")
    bridge_logger.setLevel(level)
    if not bridge_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)s [%(name)s] %(message)s",
                datefmt="%H:%M:%S",
            )
        )
        bridge_logger.addHandler(handler)

    logging.getLogger("notebooklm_bridge.api").setLevel(level)
    logging.getLogger("notebooklm_bridge.generator").setLevel(level)


_configure_bridge_logging()


@lru_cache(maxsize=1)
def _build_default_generator() -> NotebookLMMediaGenerator:
    return NotebookLMMediaGenerator(get_settings())


def get_media_generator() -> MediaGenerator:
    return _build_default_generator()


def _build_audio_response(result: GenerationResult) -> AudioGenerationResponse:
    return AudioGenerationResponse(
        audio_base64=base64.b64encode(result.media_bytes).decode("ascii"),
        mime_type=result.mime_type,
        extension=result.extension,
        duration_seconds=result.duration_seconds,
        metadata=result.metadata or {},
    )


def _build_video_response(result: GenerationResult) -> VideoGenerationResponse:
    return VideoGenerationResponse(
        video_base64=base64.b64encode(result.media_bytes).decode("ascii"),
        mime_type=result.mime_type,
        extension=result.extension,
        duration_seconds=result.duration_seconds,
        metadata=result.metadata or {},
    )


@dataclass(slots=True)
class _AsyncTaskRecord:
    task_id: str
    media_type: TaskMediaType
    status: TaskStatus
    created_at: datetime
    updated_at: datetime
    result: GenerationResult | None = None
    error: str | None = None


class _AsyncTaskStore:
    def __init__(self) -> None:
        self._tasks: dict[str, _AsyncTaskRecord] = {}
        self._lock = asyncio.Lock()
        self._terminal_task_retention = timedelta(hours=4)

    async def start_task(
        self,
        *,
        media_type: TaskMediaType,
        request: MediaGenerationRequest,
        generator: MediaGenerator,
    ) -> _AsyncTaskRecord:
        now = datetime.now(UTC)
        task_id = uuid4().hex
        task = _AsyncTaskRecord(
            task_id=task_id,
            media_type=media_type,
            status="queued",
            created_at=now,
            updated_at=now,
        )

        async with self._lock:
            self._prune_locked(now)
            self._tasks[task_id] = task

        logger.info(
            "Bridge task queued: media=%s task=%s status=%s course=%s",
            media_type,
            task_id,
            task.status,
            request.course_id or "ephemeral",
            extra={
                "media_type": media_type,
                "task_id": task_id,
                "status": task.status,
                "course_id": request.course_id,
            },
        )
        asyncio.create_task(
            self._run_task(
                task_id=task_id,
                media_type=media_type,
                request=request,
                generator=generator,
            )
        )

        return task

    async def get_task(self, task_id: str) -> _AsyncTaskRecord | None:
        now = datetime.now(UTC)
        async with self._lock:
            self._prune_locked(now)
            return self._tasks.get(task_id)

    async def _run_task(
        self,
        *,
        task_id: str,
        media_type: TaskMediaType,
        request: MediaGenerationRequest,
        generator: MediaGenerator,
    ) -> None:
        await self._mark_status(task_id, "in_progress")
        logger.info(
            "Bridge task started: media=%s task=%s status=in_progress",
            media_type,
            task_id,
            extra={"media_type": media_type, "task_id": task_id, "status": "in_progress"},
        )

        try:
            if media_type == "audio":
                result = await generator.generate_audio(request)
            else:
                result = await generator.generate_video_overview(request)
        except MediaGenerationError as error:
            error_message = str(error).strip() or "generation failed"
            await self._mark_failed(task_id, error_message)
            logger.warning(
                "Bridge task failed: media=%s task=%s status=failed error=%s",
                media_type,
                task_id,
                error_message,
                extra={
                    "media_type": media_type,
                    "task_id": task_id,
                    "status": "failed",
                    "error": error_message,
                },
            )
            return
        except Exception as error:  # pragma: no cover - safety net
            error_message = str(error).strip() or type(error).__name__
            await self._mark_failed(task_id, error_message)
            logger.exception(
                "Bridge task failed with unexpected error",
                extra={
                    "media_type": media_type,
                    "task_id": task_id,
                    "status": "failed",
                    "error": error_message,
                },
            )
            return

        await self._mark_completed(task_id, result)
        logger.info(
            "Bridge task completed: media=%s task=%s status=completed bytes=%s",
            media_type,
            task_id,
            len(result.media_bytes),
            extra={
                "media_type": media_type,
                "task_id": task_id,
                "status": "completed",
                "artifact_size_bytes": len(result.media_bytes),
            },
        )

    async def _mark_status(self, task_id: str, status_value: TaskStatus) -> None:
        async with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return
            task.status = status_value
            task.updated_at = datetime.now(UTC)

    async def _mark_failed(self, task_id: str, error_message: str) -> None:
        async with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return
            task.status = "failed"
            task.error = error_message
            task.updated_at = datetime.now(UTC)

    async def _mark_completed(self, task_id: str, result: GenerationResult) -> None:
        async with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return
            task.status = "completed"
            task.result = result
            task.updated_at = datetime.now(UTC)

    def _prune_locked(self, now: datetime) -> None:
        stale_ids = [
            task_id
            for task_id, task in self._tasks.items()
            if task.status in {"completed", "failed"}
            and now - task.updated_at > self._terminal_task_retention
        ]
        for task_id in stale_ids:
            self._tasks.pop(task_id, None)


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(
        title="NotebookLM Bridge",
        description="Bridge service for NotebookLM audio/video artifact generation",
        version="1.0.0",
    )
    task_store = _AsyncTaskStore()

    if settings is not None:
        app.dependency_overrides[get_settings] = lambda: settings

    async def _resolve_task(task_id: str, media_type: TaskMediaType) -> _AsyncTaskRecord:
        task = await task_store.get_task(task_id)
        if task is None or task.media_type != media_type:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{media_type} task not found",
            )
        return task

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
        "/artifacts/generate-audio/start",
        response_model=MediaGenerationTaskStartResponse,
        status_code=status.HTTP_202_ACCEPTED,
        dependencies=[Depends(require_bearer_token)],
    )
    @app.post(
        "/artifacts/audio/start",
        response_model=MediaGenerationTaskStartResponse,
        status_code=status.HTTP_202_ACCEPTED,
        dependencies=[Depends(require_bearer_token)],
        include_in_schema=False,
    )
    async def start_audio_generation(
        request: MediaGenerationRequest,
        generator: Annotated[MediaGenerator, Depends(get_media_generator)],
    ) -> MediaGenerationTaskStartResponse:
        task = await task_store.start_task(
            media_type="audio",
            request=request,
            generator=generator,
        )
        return MediaGenerationTaskStartResponse(
            task_id=task.task_id,
            media_type="audio",
            status="queued",
            created_at=task.created_at,
        )

    @app.get(
        "/artifacts/generate-audio/{task_id}/status",
        response_model=MediaGenerationTaskStatusResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    @app.get(
        "/artifacts/audio/{task_id}/status",
        response_model=MediaGenerationTaskStatusResponse,
        dependencies=[Depends(require_bearer_token)],
        include_in_schema=False,
    )
    async def get_audio_generation_status(task_id: str) -> MediaGenerationTaskStatusResponse:
        task = await _resolve_task(task_id=task_id, media_type="audio")
        logger.info(
            "Bridge task status read: media=audio task=%s status=%s",
            task_id,
            task.status,
            extra={"media_type": "audio", "task_id": task_id, "status": task.status},
        )
        return MediaGenerationTaskStatusResponse(
            task_id=task.task_id,
            media_type="audio",
            status=task.status,
            created_at=task.created_at,
            updated_at=task.updated_at,
            error=task.error,
        )

    @app.get(
        "/artifacts/generate-audio/{task_id}/result",
        response_model=AudioGenerationTaskResultResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    @app.get(
        "/artifacts/audio/{task_id}/result",
        response_model=AudioGenerationTaskResultResponse,
        dependencies=[Depends(require_bearer_token)],
        include_in_schema=False,
    )
    async def get_audio_generation_result(task_id: str) -> AudioGenerationTaskResultResponse:
        task = await _resolve_task(task_id=task_id, media_type="audio")
        artifact = _build_audio_response(task.result) if task.result else None
        logger.info(
            "Bridge task result read: media=audio task=%s status=%s has_artifact=%s",
            task_id,
            task.status,
            bool(artifact),
            extra={
                "media_type": "audio",
                "task_id": task_id,
                "status": task.status,
                "has_artifact": bool(artifact),
            },
        )
        return AudioGenerationTaskResultResponse(
            task_id=task.task_id,
            media_type="audio",
            status=task.status,
            artifact=artifact,
            error=task.error,
        )

    @app.post(
        "/video/generate-overview/start",
        response_model=MediaGenerationTaskStartResponse,
        status_code=status.HTTP_202_ACCEPTED,
        dependencies=[Depends(require_bearer_token)],
    )
    @app.post(
        "/video/overview/start",
        response_model=MediaGenerationTaskStartResponse,
        status_code=status.HTTP_202_ACCEPTED,
        dependencies=[Depends(require_bearer_token)],
        include_in_schema=False,
    )
    async def start_video_generation(
        request: MediaGenerationRequest,
        generator: Annotated[MediaGenerator, Depends(get_media_generator)],
    ) -> MediaGenerationTaskStartResponse:
        task = await task_store.start_task(
            media_type="video",
            request=request,
            generator=generator,
        )
        return MediaGenerationTaskStartResponse(
            task_id=task.task_id,
            media_type="video",
            status="queued",
            created_at=task.created_at,
        )

    @app.get(
        "/video/generate-overview/{task_id}/status",
        response_model=MediaGenerationTaskStatusResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    @app.get(
        "/video/overview/{task_id}/status",
        response_model=MediaGenerationTaskStatusResponse,
        dependencies=[Depends(require_bearer_token)],
        include_in_schema=False,
    )
    async def get_video_generation_status(task_id: str) -> MediaGenerationTaskStatusResponse:
        task = await _resolve_task(task_id=task_id, media_type="video")
        logger.info(
            "Bridge task status read: media=video task=%s status=%s",
            task_id,
            task.status,
            extra={"media_type": "video", "task_id": task_id, "status": task.status},
        )
        return MediaGenerationTaskStatusResponse(
            task_id=task.task_id,
            media_type="video",
            status=task.status,
            created_at=task.created_at,
            updated_at=task.updated_at,
            error=task.error,
        )

    @app.get(
        "/video/generate-overview/{task_id}/result",
        response_model=VideoGenerationTaskResultResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    @app.get(
        "/video/overview/{task_id}/result",
        response_model=VideoGenerationTaskResultResponse,
        dependencies=[Depends(require_bearer_token)],
        include_in_schema=False,
    )
    async def get_video_generation_result(task_id: str) -> VideoGenerationTaskResultResponse:
        task = await _resolve_task(task_id=task_id, media_type="video")
        artifact = _build_video_response(task.result) if task.result else None
        logger.info(
            "Bridge task result read: media=video task=%s status=%s has_artifact=%s",
            task_id,
            task.status,
            bool(artifact),
            extra={
                "media_type": "video",
                "task_id": task_id,
                "status": task.status,
                "has_artifact": bool(artifact),
            },
        )
        return VideoGenerationTaskResultResponse(
            task_id=task.task_id,
            media_type="video",
            status=task.status,
            artifact=artifact,
            error=task.error,
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
            logger.warning("Audio generation timed out")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Audio generation timed out",
            ) from error
        except MediaGenerationError as error:
            error_message = str(error).strip()
            detail = (
                f"Audio generation failed: {error_message}"
                if error_message
                else "Audio generation failed"
            )
            logger.exception("Audio generation failed", extra={"detail": detail})
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=detail,
            ) from error

        return _build_audio_response(result)

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
            logger.warning("Video generation timed out")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Video generation timed out",
            ) from error
        except MediaGenerationError as error:
            error_message = str(error).strip()
            detail = (
                f"Video generation failed: {error_message}"
                if error_message
                else "Video generation failed"
            )
            logger.exception("Video generation failed", extra={"detail": detail})
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=detail,
            ) from error

        return _build_video_response(result)

    return app


app = create_app()
