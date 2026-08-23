from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import pathlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Annotated, Literal
from urllib.parse import urlparse
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
    HealthCheckDetail,
    HealthResponse,
    InfographicGenerationResponse,
    InfographicGenerationTaskResultResponse,
    MediaGenerationRequest,
    MediaGenerationTaskStartResponse,
    MediaGenerationTaskStatusResponse,
    TextGenerationResponse,
    TextGenerationTaskResultResponse,
    BinaryArtifactGenerationResponse,
    BinaryArtifactTaskResultResponse,
    VideoGenerationResponse,
    VideoGenerationTaskResultResponse,
)

logger = logging.getLogger("notebooklm_bridge.api")

TaskStatus = Literal["queued", "in_progress", "completed", "failed"]
TaskMediaType = Literal[
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


def _build_text_response(result: GenerationResult, media_type: str) -> TextGenerationResponse:
    return TextGenerationResponse(
        content=result.media_bytes.decode("utf-8"),
        content_type=result.mime_type,
        metadata=result.metadata or {},
    )


def _build_infographic_response(result: GenerationResult) -> InfographicGenerationResponse:
    return InfographicGenerationResponse(
        image_base64=base64.b64encode(result.media_bytes).decode("ascii"),
        mime_type=result.mime_type,
        extension=result.extension,
        metadata=result.metadata or {},
    )


def _build_binary_artifact_response(result: GenerationResult) -> BinaryArtifactGenerationResponse:
    """A non-text, non-image artifact: the slide deck's PDF or PPTX bytes.

    Mime type and extension come from the result rather than being defaulted,
    because this endpoint really does return two different file types.
    """
    return BinaryArtifactGenerationResponse(
        artifact_base64=base64.b64encode(result.media_bytes).decode("ascii"),
        mime_type=result.mime_type,
        extension=result.extension,
        metadata=result.metadata or {},
    )


PROXY_PROBE_TIMEOUT_SECONDS = 3.0

# A cookie that expires next week is not yet a fault, but it is the only warning
# anyone will get: once it goes, the client fails on CSRF extraction and the
# message blames the page structure.
AUTH_EXPIRY_WARN_DAYS = 14


async def _check_proxy_reachable(proxy_url: str) -> HealthCheckDetail:
    """Open the proxy port. Credentials never reach the message."""
    try:
        parsed = urlparse(proxy_url)
        host, port = parsed.hostname, parsed.port
        redacted = f"{parsed.scheme}://{host}:{port}"
    except Exception:
        return HealthCheckDetail(
            name="proxy", passed=False, message="Unparseable proxy URL",
        )

    if not host or not port:
        return HealthCheckDetail(
            name="proxy", passed=False, message="Proxy URL has no host or port",
        )

    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port),
            timeout=PROXY_PROBE_TIMEOUT_SECONDS,
        )
    except (OSError, asyncio.TimeoutError) as error:
        return HealthCheckDetail(
            name="proxy",
            passed=False,
            message=f"{redacted} unreachable: {type(error).__name__}",
        )

    writer.close()
    try:
        await writer.wait_closed()
    except OSError:
        pass
    return HealthCheckDetail(name="proxy", passed=True, message=f"{redacted} reachable")


def _check_auth_freshness(settings: Settings) -> HealthCheckDetail:
    """Report the earliest cookie expiry. Never reports a cookie name or value."""
    path = settings.notebooklm_storage_path
    if settings.notebooklm_auth_json or not path:
        return HealthCheckDetail(
            name="auth_expiry", passed=True, message="Not read from a storage file",
        )

    try:
        state = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
        expiries = [
            float(cookie["expires"])
            for cookie in state.get("cookies", [])
            if isinstance(cookie, dict) and (cookie.get("expires") or 0) > 0
        ]
    except (OSError, ValueError, TypeError) as error:
        return HealthCheckDetail(
            name="auth_expiry", passed=False, message=f"Unreadable: {type(error).__name__}",
        )

    if not expiries:
        return HealthCheckDetail(
            name="auth_expiry", passed=True, message="No expiring cookies stored",
        )

    earliest = datetime.fromtimestamp(min(expiries), UTC)
    days_left = (earliest - datetime.now(UTC)) / timedelta(days=1)
    return HealthCheckDetail(
        name="auth_expiry",
        passed=days_left > 0,
        message=(
            f"earliest cookie expires {earliest.date().isoformat()} "
            f"({days_left:.0f}d)"
            + (" — renew soon" if 0 < days_left <= AUTH_EXPIRY_WARN_DAYS else "")
        ),
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
            elif media_type == "video":
                result = await generator.generate_video_overview(request)
            elif media_type == "study_guide":
                result = await generator.generate_study_guide(request)
            elif media_type == "flashcards":
                result = await generator.generate_flashcards(request)
            elif media_type == "mind_map":
                result = await generator.generate_mind_map(request)
            elif media_type == "infographic":
                result = await generator.generate_infographic(request)
            elif media_type == "slide_deck":
                result = await generator.generate_slide_deck(request)
            elif media_type == "report":
                result = await generator.generate_report(request)
            elif media_type == "data_table":
                result = await generator.generate_data_table(request)
            else:
                raise MediaGenerationError(f"Unsupported media type: {media_type}")
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

    async def count_active_tasks(self) -> int:
        now = datetime.now(UTC)
        async with self._lock:
            self._prune_locked(now)
            return sum(
                1 for t in self._tasks.values()
                if t.status in {"queued", "in_progress"}
            )

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
        checks: list[HealthCheckDetail] = []

        # Check auth source availability
        if resolved_settings.notebooklm_auth_json:
            checks.append(HealthCheckDetail(
                name="auth_json", passed=True, message="Inline JSON configured",
            ))
        elif resolved_settings.notebooklm_storage_path:
            p = pathlib.Path(resolved_settings.notebooklm_storage_path)
            if p.is_file():
                size_kb = p.stat().st_size / 1024
                checks.append(HealthCheckDetail(
                    name="auth_file", passed=True,
                    message=f"{p.name} ({size_kb:.0f} KB)",
                ))
            else:
                checks.append(HealthCheckDetail(
                    name="auth_file", passed=False,
                    message=f"Not found: {p}",
                ))
        else:
            checks.append(HealthCheckDetail(
                name="auth", passed=False, message="No auth configured",
            ))

        # Check the SOCKS proxy is actually there, not merely named.
        #
        # This used to pass whenever HTTPS_PROXY was set to anything at all. On
        # 2026-08-22 the geo-bypass tunnel had been down for an unknown time —
        # nothing listening on the forwarded port, the upstream host refusing
        # port 22 — and both bridges reported healthy throughout, because the
        # environment variable was still set and the container's own
        # HEALTHCHECK only asks this endpoint for a 200. NotebookLM is
        # unreachable without the hop: a direct request lands on
        # https://notebook.google/ and the client fails extracting a CSRF token.
        # A name is not a route; open the socket.
        proxy_url = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
        if proxy_url:
            checks.append(await _check_proxy_reachable(proxy_url))
        else:
            checks.append(HealthCheckDetail(
                name="proxy", passed=False, message="No proxy configured",
            ))

        # Cookies expire, and the failure reads as "the page structure changed".
        checks.append(_check_auth_freshness(resolved_settings))

        # Count active tasks via public API
        active = await task_store.count_active_tasks()

        overall: Literal["ok", "degraded"] = (
            "ok" if all(c.passed for c in checks) else "degraded"
        )

        return HealthResponse(
            status=overall,
            service="notebooklm-bridge",
            mode=resolved_settings.notebooklm_generation_mode,
            checks=checks,
            active_tasks=active,
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

    # ── Study Guide endpoints ──────────────────────────────────────────

    @app.post(
        "/artifacts/study-guide/start",
        response_model=MediaGenerationTaskStartResponse,
        status_code=status.HTTP_202_ACCEPTED,
        dependencies=[Depends(require_bearer_token)],
    )
    async def start_study_guide_generation(
        request: MediaGenerationRequest,
        generator: Annotated[MediaGenerator, Depends(get_media_generator)],
    ) -> MediaGenerationTaskStartResponse:
        task = await task_store.start_task(
            media_type="study_guide",
            request=request,
            generator=generator,
        )
        return MediaGenerationTaskStartResponse(
            task_id=task.task_id,
            media_type="study_guide",
            status="queued",
            created_at=task.created_at,
        )

    @app.get(
        "/artifacts/study-guide/{task_id}/status",
        response_model=MediaGenerationTaskStatusResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    async def get_study_guide_generation_status(task_id: str) -> MediaGenerationTaskStatusResponse:
        task = await _resolve_task(task_id=task_id, media_type="study_guide")
        logger.info(
            "Bridge task status read: media=study_guide task=%s status=%s",
            task_id,
            task.status,
            extra={"media_type": "study_guide", "task_id": task_id, "status": task.status},
        )
        return MediaGenerationTaskStatusResponse(
            task_id=task.task_id,
            media_type="study_guide",
            status=task.status,
            created_at=task.created_at,
            updated_at=task.updated_at,
            error=task.error,
        )

    @app.get(
        "/artifacts/study-guide/{task_id}/result",
        response_model=TextGenerationTaskResultResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    async def get_study_guide_generation_result(task_id: str) -> TextGenerationTaskResultResponse:
        task = await _resolve_task(task_id=task_id, media_type="study_guide")
        artifact = _build_text_response(task.result, "study_guide") if task.result else None
        logger.info(
            "Bridge task result read: media=study_guide task=%s status=%s has_artifact=%s",
            task_id,
            task.status,
            bool(artifact),
            extra={
                "media_type": "study_guide",
                "task_id": task_id,
                "status": task.status,
                "has_artifact": bool(artifact),
            },
        )
        return TextGenerationTaskResultResponse(
            task_id=task.task_id,
            media_type="study_guide",
            status=task.status,
            artifact=artifact,
            error=task.error,
        )

    # ── Flashcards endpoints ───────────────────────────────────────────

    @app.post(
        "/artifacts/flashcards/start",
        response_model=MediaGenerationTaskStartResponse,
        status_code=status.HTTP_202_ACCEPTED,
        dependencies=[Depends(require_bearer_token)],
    )
    async def start_flashcards_generation(
        request: MediaGenerationRequest,
        generator: Annotated[MediaGenerator, Depends(get_media_generator)],
    ) -> MediaGenerationTaskStartResponse:
        task = await task_store.start_task(
            media_type="flashcards",
            request=request,
            generator=generator,
        )
        return MediaGenerationTaskStartResponse(
            task_id=task.task_id,
            media_type="flashcards",
            status="queued",
            created_at=task.created_at,
        )

    @app.get(
        "/artifacts/flashcards/{task_id}/status",
        response_model=MediaGenerationTaskStatusResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    async def get_flashcards_generation_status(task_id: str) -> MediaGenerationTaskStatusResponse:
        task = await _resolve_task(task_id=task_id, media_type="flashcards")
        logger.info(
            "Bridge task status read: media=flashcards task=%s status=%s",
            task_id,
            task.status,
            extra={"media_type": "flashcards", "task_id": task_id, "status": task.status},
        )
        return MediaGenerationTaskStatusResponse(
            task_id=task.task_id,
            media_type="flashcards",
            status=task.status,
            created_at=task.created_at,
            updated_at=task.updated_at,
            error=task.error,
        )

    @app.get(
        "/artifacts/flashcards/{task_id}/result",
        response_model=TextGenerationTaskResultResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    async def get_flashcards_generation_result(task_id: str) -> TextGenerationTaskResultResponse:
        task = await _resolve_task(task_id=task_id, media_type="flashcards")
        artifact = _build_text_response(task.result, "flashcards") if task.result else None
        logger.info(
            "Bridge task result read: media=flashcards task=%s status=%s has_artifact=%s",
            task_id,
            task.status,
            bool(artifact),
            extra={
                "media_type": "flashcards",
                "task_id": task_id,
                "status": task.status,
                "has_artifact": bool(artifact),
            },
        )
        return TextGenerationTaskResultResponse(
            task_id=task.task_id,
            media_type="flashcards",
            status=task.status,
            artifact=artifact,
            error=task.error,
        )

    # ── Mind Map endpoints ─────────────────────────────────────────────

    @app.post(
        "/artifacts/mind-map/start",
        response_model=MediaGenerationTaskStartResponse,
        status_code=status.HTTP_202_ACCEPTED,
        dependencies=[Depends(require_bearer_token)],
    )
    async def start_mind_map_generation(
        request: MediaGenerationRequest,
        generator: Annotated[MediaGenerator, Depends(get_media_generator)],
    ) -> MediaGenerationTaskStartResponse:
        task = await task_store.start_task(
            media_type="mind_map",
            request=request,
            generator=generator,
        )
        return MediaGenerationTaskStartResponse(
            task_id=task.task_id,
            media_type="mind_map",
            status="queued",
            created_at=task.created_at,
        )

    @app.get(
        "/artifacts/mind-map/{task_id}/status",
        response_model=MediaGenerationTaskStatusResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    async def get_mind_map_generation_status(task_id: str) -> MediaGenerationTaskStatusResponse:
        task = await _resolve_task(task_id=task_id, media_type="mind_map")
        logger.info(
            "Bridge task status read: media=mind_map task=%s status=%s",
            task_id,
            task.status,
            extra={"media_type": "mind_map", "task_id": task_id, "status": task.status},
        )
        return MediaGenerationTaskStatusResponse(
            task_id=task.task_id,
            media_type="mind_map",
            status=task.status,
            created_at=task.created_at,
            updated_at=task.updated_at,
            error=task.error,
        )

    @app.get(
        "/artifacts/mind-map/{task_id}/result",
        response_model=TextGenerationTaskResultResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    async def get_mind_map_generation_result(task_id: str) -> TextGenerationTaskResultResponse:
        task = await _resolve_task(task_id=task_id, media_type="mind_map")
        artifact = _build_text_response(task.result, "mind_map") if task.result else None
        logger.info(
            "Bridge task result read: media=mind_map task=%s status=%s has_artifact=%s",
            task_id,
            task.status,
            bool(artifact),
            extra={
                "media_type": "mind_map",
                "task_id": task_id,
                "status": task.status,
                "has_artifact": bool(artifact),
            },
        )
        return TextGenerationTaskResultResponse(
            task_id=task.task_id,
            media_type="mind_map",
            status=task.status,
            artifact=artifact,
            error=task.error,
        )

    # ── Infographic endpoints ──────────────────────────────────────────

    @app.post(
        "/artifacts/infographic/start",
        response_model=MediaGenerationTaskStartResponse,
        status_code=status.HTTP_202_ACCEPTED,
        dependencies=[Depends(require_bearer_token)],
    )
    async def start_infographic_generation(
        request: MediaGenerationRequest,
        generator: Annotated[MediaGenerator, Depends(get_media_generator)],
    ) -> MediaGenerationTaskStartResponse:
        task = await task_store.start_task(
            media_type="infographic",
            request=request,
            generator=generator,
        )
        return MediaGenerationTaskStartResponse(
            task_id=task.task_id,
            media_type="infographic",
            status="queued",
            created_at=task.created_at,
        )

    @app.get(
        "/artifacts/infographic/{task_id}/status",
        response_model=MediaGenerationTaskStatusResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    async def get_infographic_generation_status(task_id: str) -> MediaGenerationTaskStatusResponse:
        task = await _resolve_task(task_id=task_id, media_type="infographic")
        logger.info(
            "Bridge task status read: media=infographic task=%s status=%s",
            task_id,
            task.status,
            extra={"media_type": "infographic", "task_id": task_id, "status": task.status},
        )
        return MediaGenerationTaskStatusResponse(
            task_id=task.task_id,
            media_type="infographic",
            status=task.status,
            created_at=task.created_at,
            updated_at=task.updated_at,
            error=task.error,
        )

    @app.get(
        "/artifacts/infographic/{task_id}/result",
        response_model=InfographicGenerationTaskResultResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    async def get_infographic_generation_result(task_id: str) -> InfographicGenerationTaskResultResponse:
        task = await _resolve_task(task_id=task_id, media_type="infographic")
        artifact = _build_infographic_response(task.result) if task.result else None
        logger.info(
            "Bridge task result read: media=infographic task=%s status=%s has_artifact=%s",
            task_id,
            task.status,
            bool(artifact),
            extra={
                "media_type": "infographic",
                "task_id": task_id,
                "status": task.status,
                "has_artifact": bool(artifact),
            },
        )
        return InfographicGenerationTaskResultResponse(
            task_id=task.task_id,
            media_type="infographic",
            status=task.status,
            artifact=artifact,
            error=task.error,
        )

    # ── Slide deck endpoints ───────────────────────────────────────────
    #
    # Binary, not text: the result is PDF or PPTX bytes, so this trio uses
    # BinaryArtifactTaskResultResponse rather than the text one (mc2-6ye5z.4).

    @app.post(
        "/artifacts/slide-deck/start",
        response_model=MediaGenerationTaskStartResponse,
        status_code=status.HTTP_202_ACCEPTED,
        dependencies=[Depends(require_bearer_token)],
    )
    async def start_slide_deck_generation(
        request: MediaGenerationRequest,
        generator: Annotated[MediaGenerator, Depends(get_media_generator)],
    ) -> MediaGenerationTaskStartResponse:
        task = await task_store.start_task(
            media_type="slide_deck",
            request=request,
            generator=generator,
        )
        return MediaGenerationTaskStartResponse(
            task_id=task.task_id,
            media_type="slide_deck",
            status="queued",
            created_at=task.created_at,
        )

    @app.get(
        "/artifacts/slide-deck/{task_id}/status",
        response_model=MediaGenerationTaskStatusResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    async def get_slide_deck_generation_status(task_id: str) -> MediaGenerationTaskStatusResponse:
        task = await _resolve_task(task_id=task_id, media_type="slide_deck")
        logger.info(
            "Bridge task status read: media=slide_deck task=%s status=%s",
            task_id,
            task.status,
            extra={"media_type": "slide_deck", "task_id": task_id, "status": task.status},
        )
        return MediaGenerationTaskStatusResponse(
            task_id=task.task_id,
            media_type="slide_deck",
            status=task.status,
            created_at=task.created_at,
            updated_at=task.updated_at,
            error=task.error,
        )

    @app.get(
        "/artifacts/slide-deck/{task_id}/result",
        response_model=BinaryArtifactTaskResultResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    async def get_slide_deck_generation_result(task_id: str) -> BinaryArtifactTaskResultResponse:
        task = await _resolve_task(task_id=task_id, media_type="slide_deck")
        artifact = _build_binary_artifact_response(task.result) if task.result else None
        logger.info(
            "Bridge task result read: media=slide_deck task=%s status=%s has_artifact=%s",
            task_id,
            task.status,
            bool(artifact),
            extra={
                "media_type": "slide_deck",
                "task_id": task_id,
                "status": task.status,
                "has_artifact": bool(artifact),
            },
        )
        return BinaryArtifactTaskResultResponse(
            task_id=task.task_id,
            media_type="slide_deck",
            status=task.status,
            artifact=artifact,
            error=task.error,
        )

    # ── Report endpoints ──────────────────────────────────────────

    @app.post(
        "/artifacts/report/start",
        response_model=MediaGenerationTaskStartResponse,
        status_code=status.HTTP_202_ACCEPTED,
        dependencies=[Depends(require_bearer_token)],
    )
    async def start_report_generation(
        request: MediaGenerationRequest,
        generator: Annotated[MediaGenerator, Depends(get_media_generator)],
    ) -> MediaGenerationTaskStartResponse:
        task = await task_store.start_task(
            media_type="report",
            request=request,
            generator=generator,
        )
        return MediaGenerationTaskStartResponse(
            task_id=task.task_id,
            media_type="report",
            status="queued",
            created_at=task.created_at,
        )

    @app.get(
        "/artifacts/report/{task_id}/status",
        response_model=MediaGenerationTaskStatusResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    async def get_report_generation_status(task_id: str) -> MediaGenerationTaskStatusResponse:
        task = await _resolve_task(task_id=task_id, media_type="report")
        logger.info(
            "Bridge task status read: media=report task=%s status=%s",
            task_id,
            task.status,
            extra={"media_type": "report", "task_id": task_id, "status": task.status},
        )
        return MediaGenerationTaskStatusResponse(
            task_id=task.task_id,
            media_type="report",
            status=task.status,
            created_at=task.created_at,
            updated_at=task.updated_at,
            error=task.error,
        )

    @app.get(
        "/artifacts/report/{task_id}/result",
        response_model=TextGenerationTaskResultResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    async def get_report_generation_result(task_id: str) -> TextGenerationTaskResultResponse:
        task = await _resolve_task(task_id=task_id, media_type="report")
        artifact = _build_text_response(task.result, "report") if task.result else None
        logger.info(
            "Bridge task result read: media=report task=%s status=%s has_artifact=%s",
            task_id,
            task.status,
            bool(artifact),
            extra={
                "media_type": "report",
                "task_id": task_id,
                "status": task.status,
                "has_artifact": bool(artifact),
            },
        )
        return TextGenerationTaskResultResponse(
            task_id=task.task_id,
            media_type="report",
            status=task.status,
            artifact=artifact,
            error=task.error,
        )

    # ── Data table endpoints ──────────────────────────────────────────

    @app.post(
        "/artifacts/data-table/start",
        response_model=MediaGenerationTaskStartResponse,
        status_code=status.HTTP_202_ACCEPTED,
        dependencies=[Depends(require_bearer_token)],
    )
    async def start_data_table_generation(
        request: MediaGenerationRequest,
        generator: Annotated[MediaGenerator, Depends(get_media_generator)],
    ) -> MediaGenerationTaskStartResponse:
        task = await task_store.start_task(
            media_type="data_table",
            request=request,
            generator=generator,
        )
        return MediaGenerationTaskStartResponse(
            task_id=task.task_id,
            media_type="data_table",
            status="queued",
            created_at=task.created_at,
        )

    @app.get(
        "/artifacts/data-table/{task_id}/status",
        response_model=MediaGenerationTaskStatusResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    async def get_data_table_generation_status(task_id: str) -> MediaGenerationTaskStatusResponse:
        task = await _resolve_task(task_id=task_id, media_type="data_table")
        logger.info(
            "Bridge task status read: media=data_table task=%s status=%s",
            task_id,
            task.status,
            extra={"media_type": "data_table", "task_id": task_id, "status": task.status},
        )
        return MediaGenerationTaskStatusResponse(
            task_id=task.task_id,
            media_type="data_table",
            status=task.status,
            created_at=task.created_at,
            updated_at=task.updated_at,
            error=task.error,
        )

    @app.get(
        "/artifacts/data-table/{task_id}/result",
        response_model=TextGenerationTaskResultResponse,
        dependencies=[Depends(require_bearer_token)],
    )
    async def get_data_table_generation_result(task_id: str) -> TextGenerationTaskResultResponse:
        task = await _resolve_task(task_id=task_id, media_type="data_table")
        artifact = _build_text_response(task.result, "data_table") if task.result else None
        logger.info(
            "Bridge task result read: media=data_table task=%s status=%s has_artifact=%s",
            task_id,
            task.status,
            bool(artifact),
            extra={
                "media_type": "data_table",
                "task_id": task_id,
                "status": task.status,
                "has_artifact": bool(artifact),
            },
        )
        return TextGenerationTaskResultResponse(
            task_id=task.task_id,
            media_type="data_table",
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
