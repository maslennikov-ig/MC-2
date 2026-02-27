from __future__ import annotations

import asyncio
import importlib
import io
import logging
import math
import os
import tempfile
import wave
from collections import deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal, Protocol, runtime_checkable

from .config import Settings
from .models import MediaGenerationRequest

logger = logging.getLogger("notebooklm_bridge.generator")

MediaType = Literal["audio", "video"]


class MediaGenerationError(RuntimeError):
    """Raised when NotebookLM media generation fails."""


class MediaGenerationTimeoutError(MediaGenerationError):
    """Raised when NotebookLM generation exceeds timeout."""


class MediaGenerationPollError(MediaGenerationError):
    """Raised when NotebookLM generation polling fails repeatedly."""


class MediaGenerationUnavailableError(MediaGenerationError):
    """Raised when notebooklm-py cannot be used."""


class MediaGenerationProactiveRecovery(Exception):
    """Internal exception to signal successful proactive recovery with downloaded bytes."""
    def __init__(
        self,
        selection: RecoverySelection,
        media_bytes: bytes,
        mime_type: str,
        extension: str,
    ):
        self.selection = selection
        self.media_bytes = media_bytes
        self.mime_type = mime_type
        self.extension = extension


class _GlobalGenerationQueue:
    def __init__(self, max_concurrency: int, wait_timeout_seconds: float):
        self._max_concurrency = max_concurrency
        self._wait_timeout_seconds = wait_timeout_seconds
        self._active_count = 0
        self._waiters: deque[object] = deque()
        self._condition = asyncio.Condition()

    @asynccontextmanager
    async def slot(self, media_type: MediaType) -> AsyncIterator[None]:
        await self._acquire_slot(media_type)
        try:
            yield
        finally:
            await self._release_slot()

    async def _acquire_slot(self, media_type: MediaType) -> None:
        waiter = object()
        loop = asyncio.get_running_loop()
        started_at = loop.time()

        async with self._condition:
            self._waiters.append(waiter)
            logger.info(
                "NotebookLM queue enqueued: media=%s active=%s queued=%s max=%s",
                media_type,
                self._active_count,
                max(len(self._waiters) - 1, 0),
                self._max_concurrency,
                extra={
                    "media_type": media_type,
                    "active": self._active_count,
                    "queued": max(len(self._waiters) - 1, 0),
                    "max_concurrency": self._max_concurrency,
                },
            )
            try:
                while True:
                    is_front_waiter = self._waiters and self._waiters[0] is waiter
                    if is_front_waiter and self._active_count < self._max_concurrency:
                        self._waiters.popleft()
                        self._active_count += 1
                        self._condition.notify_all()
                        wait_ms = round((loop.time() - started_at) * 1000, 2)
                        logger.info(
                            "NotebookLM queue acquired: media=%s wait_ms=%s active=%s queued=%s max=%s",
                            media_type,
                            wait_ms,
                            self._active_count,
                            len(self._waiters),
                            self._max_concurrency,
                            extra={
                                "media_type": media_type,
                                "wait_ms": wait_ms,
                                "active": self._active_count,
                                "queued": len(self._waiters),
                                "max_concurrency": self._max_concurrency,
                            },
                        )
                        return

                    elapsed_seconds = loop.time() - started_at
                    remaining_seconds = self._wait_timeout_seconds - elapsed_seconds
                    if remaining_seconds <= 0:
                        queued_count = max(len(self._waiters) - 1, 0)
                        active_count = self._active_count
                        self._remove_waiter(waiter)
                        self._condition.notify_all()
                        raise MediaGenerationTimeoutError(
                            "Timed out waiting for NotebookLM generation queue slot after "
                            f"{elapsed_seconds:.2f}s "
                            f"(media_type={media_type}, "
                            f"active={active_count}, "
                            f"queued={queued_count}, "
                            f"max_concurrency={self._max_concurrency})"
                        )

                    try:
                        await asyncio.wait_for(
                            self._condition.wait(),
                            timeout=remaining_seconds,
                        )
                    except TimeoutError:
                        continue
            except BaseException:
                self._remove_waiter(waiter)
                self._condition.notify_all()
                raise

    async def _release_slot(self) -> None:
        async with self._condition:
            if self._active_count > 0:
                self._active_count -= 1
            self._condition.notify_all()
            logger.info(
                "NotebookLM queue released: active=%s queued=%s max=%s",
                self._active_count,
                len(self._waiters),
                self._max_concurrency,
                extra={
                    "active": self._active_count,
                    "queued": len(self._waiters),
                    "max_concurrency": self._max_concurrency,
                },
            )

    def _remove_waiter(self, waiter: object) -> None:
        try:
            self._waiters.remove(waiter)
        except ValueError:
            return


@dataclass(slots=True)
class GenerationResult:
    media_bytes: bytes
    mime_type: str
    extension: str
    duration_seconds: float | None = None
    metadata: dict[str, Any] | None = None


@dataclass(slots=True)
class NotebookSelection:
    notebook_id: str
    is_ephemeral: bool
    course_id: str | None = None


@dataclass(slots=True)
class RecoverySelection:
    artifact_id: str
    strategy: str
    selected_created_at: datetime | None
    candidate_count: int
    preferred_candidate_count: int
    recovery_reason: str
    request_started_at: datetime
    start_time_skew_seconds: float


@runtime_checkable
class MediaGenerator(Protocol):
    async def generate_audio(self, request: MediaGenerationRequest) -> GenerationResult:
        ...

    async def generate_video_overview(self, request: MediaGenerationRequest) -> GenerationResult:
        ...


class NotebookLMMediaGenerator(MediaGenerator):
    _RECOVERY_START_TIME_SKEW_SECONDS = 45.0

    def __init__(self, settings: Settings):
        self._settings = settings
        self._configure_auth_json()
        self._configure_notebooklm_home()
        self._course_notebooks: dict[str, str] = {}
        self._course_notebook_lock = asyncio.Lock()
        self._course_generation_locks: dict[str, asyncio.Lock] = {}
        self._course_generation_locks_lock = asyncio.Lock()
        self._global_queue = _GlobalGenerationQueue(
            max_concurrency=settings.notebooklm_global_generation_concurrency,
            wait_timeout_seconds=settings.notebooklm_queue_wait_timeout_seconds,
        )

    def _configure_auth_json(self) -> None:
        """Wire NOTEBOOKLM_AUTH_JSON for notebooklm-py JSON-first auth."""
        auth_json_value = (self._settings.notebooklm_auth_json or "").strip()
        if not auth_json_value:
            # Remove empty env var so notebooklm-py doesn't treat it as invalid
            os.environ.pop("NOTEBOOKLM_AUTH_JSON", None)
            return

        os.environ["NOTEBOOKLM_AUTH_JSON"] = auth_json_value

    @staticmethod
    def _has_auth_json_env() -> bool:
        return bool(os.environ.get("NOTEBOOKLM_AUTH_JSON", "").strip())

    def _configure_notebooklm_home(self) -> None:
        """Align notebooklm-py download auth path with configured storage file.

        notebooklm-py download helpers read cookies from:
        - NOTEBOOKLM_AUTH_JSON, or
        - $NOTEBOOKLM_HOME/storage_state.json

        When NOTEBOOKLM_AUTH_JSON is not configured, the bridge initializes the
        client from NOTEBOOKLM_STORAGE_PATH, so we also set NOTEBOOKLM_HOME from
        that path to keep artifact downloads in sync with file-based auth.
        """
        storage_path_value = self._settings.notebooklm_storage_path
        if not storage_path_value:
            return

        storage_dir = str(Path(storage_path_value).expanduser().parent)
        os.environ["NOTEBOOKLM_HOME"] = storage_dir
        logger.info(
            "Configured NOTEBOOKLM_HOME for notebooklm-py downloads",
            extra={
                "notebooklm_home": storage_dir,
                "storage_path": storage_path_value,
            },
        )

    async def generate_audio(self, request: MediaGenerationRequest) -> GenerationResult:
        return await self._generate("audio", request)

    async def generate_video_overview(self, request: MediaGenerationRequest) -> GenerationResult:
        return await self._generate("video", request)

    async def _generate(
        self,
        media_type: MediaType,
        request: MediaGenerationRequest,
    ) -> GenerationResult:
        if self._settings.notebooklm_generation_mode == "fallback":
            return self._fallback_result(media_type, request, "forced_fallback_mode")

        course_id = self._normalize_course_id(request.course_id)
        try:
            async with self._course_generation_slot(
                media_type=media_type,
                course_id=course_id,
            ):
                async with self._global_queue.slot(media_type):
                    return await self._generate_with_notebooklm(media_type, request)
        except MediaGenerationTimeoutError as error:
            if not self._settings.notebooklm_allow_fallback:
                raise
            logger.warning(
                "NotebookLM generation timed out; returning fallback artifact",
                extra={"media_type": media_type},
            )
            return self._fallback_result(media_type, request, type(error).__name__)
        except Exception as error:
            if not self._settings.notebooklm_allow_fallback:
                if isinstance(error, MediaGenerationError):
                    raise
                error_message = str(error).strip() or "NotebookLM generation failed"
                raise MediaGenerationError(error_message) from error

            logger.warning(
                "NotebookLM generation failed; returning fallback artifact",
                extra={"media_type": media_type, "error_type": type(error).__name__},
            )
            return self._fallback_result(media_type, request, type(error).__name__)

    async def _generate_with_notebooklm(
        self,
        media_type: MediaType,
        request: MediaGenerationRequest,
    ) -> GenerationResult:
        notebooklm_module = self._import_notebooklm_module()
        client = await self._create_client()
        loop = asyncio.get_running_loop()
        request_started_at = loop.time()
        request_started_at_utc = datetime.now(UTC)
        script_word_count = max(len(request.script.split()), 1)
        source_pairs = self._resolve_sources(request)
        source_char_count = sum(len(content) for _, content in source_pairs)
        source_titles = [title for title, _ in source_pairs]

        logger.info(
            "NotebookLM generation started: media=%s lesson=%s lang=%s sources=%s words=%s target=%s range=%s-%s",
            media_type,
            request.lesson_title,
            request.language,
            len(source_pairs),
            script_word_count,
            request.target_duration_minutes,
            request.duration_range_min_minutes,
            request.duration_range_max_minutes,
            extra={
                "media_type": media_type,
                "lesson_title": request.lesson_title,
                "language": request.language,
                "source_count": len(source_pairs),
                "source_titles": source_titles,
                "source_char_count": source_char_count,
                "script_word_count": script_word_count,
                "audio_format": request.audio_format,
                "audio_length": request.audio_length,
                "video_format": request.video_format,
                "video_style": request.video_style,
                "target_duration_minutes": request.target_duration_minutes,
                "duration_range_min_minutes": request.duration_range_min_minutes,
                "duration_range_max_minutes": request.duration_range_max_minutes,
            },
        )

        async with client:
            notebook = await self._resolve_notebook(
                client=client,
                request=request,
            )
            notebook_id = notebook.notebook_id

            try:
                source_ids: list[str] = []
                source_add_started_at = asyncio.get_running_loop().time()

                for index, (title, content) in enumerate(source_pairs, start=1):
                    source = await client.sources.add_text(
                        notebook_id=notebook_id,
                        title=title,
                        content=content,
                    )
                    source_ids.append(source.id)

                    logger.info(
                        "NotebookLM source added: media=%s notebook=%s idx=%s/%s source=%s chars=%s title=%s",
                        media_type,
                        notebook_id[:8],
                        index,
                        len(source_pairs),
                        source.id[:8],
                        len(content),
                        title,
                        extra={
                            "media_type": media_type,
                            "notebook_id_prefix": notebook_id[:8],
                            "source_index": index,
                            "source_count": len(source_pairs),
                            "source_id_prefix": source.id[:8],
                            "source_title": title,
                            "source_chars": len(content),
                        },
                    )

                source_upload_duration_ms = round(
                    (asyncio.get_running_loop().time() - source_add_started_at) * 1000, 2
                )
                logger.info(
                    "NotebookLM source upload finished: media=%s notebook=%s count=%s duration_ms=%s",
                    media_type,
                    notebook_id[:8],
                    len(source_ids),
                    source_upload_duration_ms,
                    extra={
                        "media_type": media_type,
                        "notebook_id_prefix": notebook_id[:8],
                        "source_count": len(source_ids),
                        "duration_ms": source_upload_duration_ms,
                    },
                )

                source_ready_started_at = asyncio.get_running_loop().time()
                await self._wait_for_sources_ready(
                    client=client,
                    notebook_id=notebook_id,
                    source_ids=source_ids,
                )
                source_ready_wait_ms = round(
                    (asyncio.get_running_loop().time() - source_ready_started_at) * 1000, 2
                )
                logger.info(
                    "NotebookLM sources ready: media=%s notebook=%s count=%s wait_ms=%s",
                    media_type,
                    notebook_id[:8],
                    len(source_ids),
                    source_ready_wait_ms,
                    extra={
                        "media_type": media_type,
                        "notebook_id_prefix": notebook_id[:8],
                        "source_count": len(source_ids),
                        "wait_ms": source_ready_wait_ms,
                    },
                )

                instructions = self._build_instructions(request, media_type)
                generation_started_at = asyncio.get_running_loop().time()
                if media_type == "audio":
                    audio_format = self._resolve_enum_option(
                        notebooklm_module,
                        enum_name="AudioFormat",
                        raw_value=request.audio_format,
                        field_name="audio_format",
                    )
                    audio_length = self._resolve_enum_option(
                        notebooklm_module,
                        enum_name="AudioLength",
                        raw_value=request.audio_length,
                        field_name="audio_length",
                    )
                    status = await client.artifacts.generate_audio(
                        notebook_id=notebook_id,
                        source_ids=source_ids or None,
                        language=request.language,
                        instructions=instructions,
                        audio_format=audio_format,
                        audio_length=audio_length,
                    )
                else:
                    video_format = self._resolve_enum_option(
                        notebooklm_module,
                        enum_name="VideoFormat",
                        raw_value=request.video_format,
                        field_name="video_format",
                    )
                    video_style = self._resolve_enum_option(
                        notebooklm_module,
                        enum_name="VideoStyle",
                        raw_value=request.video_style,
                        field_name="video_style",
                    )
                    status = await client.artifacts.generate_video(
                        notebook_id=notebook_id,
                        source_ids=source_ids or None,
                        language=request.language,
                        instructions=instructions,
                        video_format=video_format,
                        video_style=video_style,
                    )

                if status.is_failed:
                    raise MediaGenerationError(
                        status.error or f"NotebookLM rejected {media_type} generation"
                    )
                if not status.task_id:
                    raise MediaGenerationError(
                        f"NotebookLM did not return a task id for {media_type} generation"
                    )

                logger.info(
                    "NotebookLM generation accepted: media=%s notebook=%s task=%s status=%s",
                    media_type,
                    notebook_id[:8],
                    status.task_id,
                    status.status,
                    extra={
                        "media_type": media_type,
                        "notebook_id_prefix": notebook_id[:8],
                        "task_id": status.task_id,
                        "initial_status": status.status,
                    },
                )

                artifact_id = status.task_id
                final_status: Any | None = None
                recovery_selection: RecoverySelection | None = None
                pre_downloaded_media: tuple[bytes, str, str] | None = None

                try:
                    final_status = await self._wait_for_completion_with_progress(
                        client=client,
                        notebook_id=notebook_id,
                        task_id=status.task_id,
                        media_type=media_type,
                        request_started_at_utc=request_started_at_utc,
                    )

                    if final_status.is_failed:
                        raise MediaGenerationError(
                            final_status.error or f"NotebookLM failed generating {media_type}"
                        )
                except MediaGenerationProactiveRecovery as proactive_recovery:
                    recovery_selection = proactive_recovery.selection
                    artifact_id = recovery_selection.artifact_id
                    pre_downloaded_media = (
                        proactive_recovery.media_bytes,
                        proactive_recovery.mime_type,
                        proactive_recovery.extension,
                    )
                except (MediaGenerationTimeoutError, MediaGenerationPollError) as recovery_error:
                    recovery_selection = await self._recover_completed_artifact(
                        client=client,
                        notebook_id=notebook_id,
                        media_type=media_type,
                        task_id=status.task_id,
                        request_started_at=request_started_at_utc,
                        recovery_reason=type(recovery_error).__name__,
                    )
                    if recovery_selection is None:
                        raise
                    artifact_id = recovery_selection.artifact_id

                download_started_at = loop.time()
                try:
                    if pre_downloaded_media:
                        media_bytes, mime_type, extension = pre_downloaded_media
                    else:
                        media_bytes, mime_type, extension = await self._download_artifact_bytes(
                            client=client,
                            media_type=media_type,
                            notebook_id=notebook_id,
                            artifact_id=artifact_id,
                        )
                except Exception:
                    if recovery_selection is not None:
                        logger.warning(
                            "NotebookLM recovery failed: media=%s notebook=%s task=%s selected=%s strategy=%s",
                            media_type,
                            notebook_id[:8],
                            status.task_id,
                            artifact_id,
                            recovery_selection.strategy,
                            extra={
                                "media_type": media_type,
                                "notebook_id_prefix": notebook_id[:8],
                                "task_id": status.task_id,
                                "recovery_selected_artifact_id": artifact_id,
                                "recovery_strategy": recovery_selection.strategy,
                            },
                        )
                    raise

                if recovery_selection is not None:
                    logger.info(
                        "NotebookLM recovery succeeded: media=%s notebook=%s task=%s selected=%s strategy=%s size=%s",
                        media_type,
                        notebook_id[:8],
                        status.task_id,
                        artifact_id,
                        recovery_selection.strategy,
                        len(media_bytes),
                        extra={
                            "media_type": media_type,
                            "notebook_id_prefix": notebook_id[:8],
                            "task_id": status.task_id,
                            "recovery_selected_artifact_id": artifact_id,
                            "recovery_strategy": recovery_selection.strategy,
                            "artifact_size_bytes": len(media_bytes),
                        },
                    )

                total_duration_ms = round((loop.time() - request_started_at) * 1000, 2)
                metadata: dict[str, Any] = {
                    "provider": "notebooklm-py",
                    "mode": self._settings.notebooklm_generation_mode,
                    "notebook_id": notebook_id,
                    "course_id": notebook.course_id,
                    "notebook_reused": not notebook.is_ephemeral,
                    "source_ids": source_ids,
                    "source_count": len(source_ids),
                    "source_titles": source_titles,
                    "task_id": status.task_id,
                    "artifact_id": artifact_id,
                    "status": (
                        final_status.status
                        if final_status is not None
                        else "recovered_from_completed_artifact"
                    ),
                    "recovered_from_artifact": recovery_selection is not None,
                    "generation_wait_ms": round((loop.time() - generation_started_at) * 1000, 2),
                    "download_ms": round((loop.time() - download_started_at) * 1000, 2),
                    "total_duration_ms": total_duration_ms,
                    "script_word_count": script_word_count,
                    "source_char_count": source_char_count,
                    "language": request.language,
                    "voice": request.voice,
                    "audio_format": request.audio_format,
                    "audio_length": request.audio_length,
                    "video_format": request.video_format,
                    "video_style": request.video_style,
                }
                if recovery_selection is not None:
                    metadata.update(
                        {
                            "recovery_reason": recovery_selection.recovery_reason,
                            "recovery_strategy": recovery_selection.strategy,
                            "recovery_selected_artifact_id": recovery_selection.artifact_id,
                            "recovery_selected_created_at": (
                                recovery_selection.selected_created_at.isoformat()
                                if recovery_selection.selected_created_at
                                else None
                            ),
                            "recovery_candidate_count": recovery_selection.candidate_count,
                            "recovery_preferred_candidate_count": (
                                recovery_selection.preferred_candidate_count
                            ),
                            "recovery_request_started_at": (
                                recovery_selection.request_started_at.isoformat()
                            ),
                            "recovery_start_time_skew_seconds": (
                                recovery_selection.start_time_skew_seconds
                            ),
                        }
                    )

                result = GenerationResult(
                    media_bytes=media_bytes,
                    mime_type=mime_type,
                    extension=extension,
                    duration_seconds=self._estimate_duration_seconds(request.script, media_type),
                    metadata=metadata,
                )

                logger.info(
                    "NotebookLM generation completed: media=%s notebook=%s task=%s artifact=%s size=%s total_ms=%s",
                    media_type,
                    notebook_id[:8],
                    status.task_id,
                    artifact_id,
                    len(media_bytes),
                    total_duration_ms,
                    extra={
                        "media_type": media_type,
                        "notebook_id_prefix": notebook_id[:8],
                        "task_id": status.task_id,
                        "artifact_id": artifact_id,
                        "mime_type": mime_type,
                        "extension": extension,
                        "artifact_size_bytes": len(media_bytes),
                        "total_duration_ms": total_duration_ms,
                        "recovered_from_artifact": recovery_selection is not None,
                    },
                )

                return result
            finally:
                if notebook.is_ephemeral:
                    try:
                        await client.notebooks.delete(notebook_id)
                    except Exception:
                        logger.warning(
                            "NotebookLM cleanup failed for temporary notebook",
                            extra={"notebook_id_prefix": notebook_id[:8]},
                        )

    async def _create_client(self) -> Any:
        module = self._import_notebooklm_module()

        client_class = getattr(module, "NotebookLMClient", None)
        if client_class is None:
            raise MediaGenerationUnavailableError(
                "notebooklm-py does not expose NotebookLMClient"
            )

        from_storage = getattr(client_class, "from_storage", None)
        if callable(from_storage):
            kwargs: dict[str, Any] = {
                "timeout": self._settings.notebooklm_http_timeout_seconds
            }
            if (
                self._settings.notebooklm_storage_path
                and not self._has_auth_json_env()
            ):
                kwargs["path"] = self._settings.notebooklm_storage_path

            try:
                return await from_storage(**kwargs)
            except Exception as error:
                message = str(error).strip()
                if message:
                    detail = (
                        "Failed to initialize NotebookLM client from storage: "
                        f"{message}"
                    )
                else:
                    detail = "Failed to initialize NotebookLM client from storage"
                raise MediaGenerationUnavailableError(
                    detail
                ) from error

        raise MediaGenerationUnavailableError(
            "notebooklm-py client does not support from_storage initialization"
        )

    @staticmethod
    def _import_notebooklm_module() -> Any:
        for module_name in ("notebooklm", "notebooklm_py"):
            try:
                return importlib.import_module(module_name)
            except ModuleNotFoundError:
                continue

        raise MediaGenerationUnavailableError("notebooklm-py package is not installed")

    def _resolve_sources(self, request: MediaGenerationRequest) -> list[tuple[str, str]]:
        if request.sources:
            return [(source.title, source.content) for source in request.sources]

        return [(f"{request.lesson_title} Script", request.script)]

    @staticmethod
    def _course_notebook_title(course_id: str) -> str:
        return f"course:{course_id}"

    @staticmethod
    def _normalize_course_id(raw_course_id: str | None) -> str | None:
        course_id = (raw_course_id or "").strip()
        return course_id or None

    async def _get_or_create_course_generation_lock(
        self, course_id: str, media_type: MediaType,
    ) -> asyncio.Lock:
        # Key per (course, media_type) allows audio + video to run in parallel
        # while serializing same-type generations (e.g. two audios) for safety.
        lock_key = f"{course_id}:{media_type}"
        async with self._course_generation_locks_lock:
            lock = self._course_generation_locks.get(lock_key)
            if lock is None:
                lock = asyncio.Lock()
                self._course_generation_locks[lock_key] = lock
            return lock

    @asynccontextmanager
    async def _course_generation_slot(
        self,
        *,
        media_type: MediaType,
        course_id: str | None,
    ) -> AsyncIterator[None]:
        if not course_id:
            yield
            return

        lock = await self._get_or_create_course_generation_lock(course_id, media_type)
        loop = asyncio.get_running_loop()
        queued_at = loop.time()

        logger.info(
            "NotebookLM course lock enqueued: media=%s course=%s lock_waiters=%s",
            media_type,
            course_id,
            1 if lock.locked() else 0,
            extra={
                "media_type": media_type,
                "course_id": course_id,
                "lock_waiters_hint": 1 if lock.locked() else 0,
            },
        )

        async with lock:
            wait_ms = round((loop.time() - queued_at) * 1000, 2)
            logger.info(
                "NotebookLM course lock acquired: media=%s course=%s wait_ms=%s",
                media_type,
                course_id,
                wait_ms,
                extra={
                    "media_type": media_type,
                    "course_id": course_id,
                    "wait_ms": wait_ms,
                },
            )
            try:
                yield
            finally:
                logger.info(
                    "NotebookLM course lock released: media=%s course=%s",
                    media_type,
                    course_id,
                    extra={
                        "media_type": media_type,
                        "course_id": course_id,
                    },
                )

    async def _find_course_notebook_id(
        self,
        *,
        client: Any,
        course_id: str,
    ) -> str | None:
        target_title = self._course_notebook_title(course_id)
        try:
            notebooks = await client.notebooks.list()
        except Exception:
            logger.warning(
                "NotebookLM list notebooks failed during course notebook lookup",
                extra={"course_id": course_id},
            )
            return None

        for notebook in notebooks:
            notebook_title = getattr(notebook, "title", None)
            notebook_id = getattr(notebook, "id", None)
            if isinstance(notebook_title, str) and notebook_title == target_title and isinstance(
                notebook_id, str
            ):
                return notebook_id

        return None

    async def _resolve_notebook(
        self,
        *,
        client: Any,
        request: MediaGenerationRequest,
    ) -> NotebookSelection:
        course_id = self._normalize_course_id(request.course_id)
        if not course_id:
            notebook = await client.notebooks.create(request.lesson_title)
            return NotebookSelection(notebook_id=notebook.id, is_ephemeral=True, course_id=None)

        async with self._course_notebook_lock:
            existing_notebook_id = self._course_notebooks.get(course_id)
            if existing_notebook_id:
                logger.info(
                    "NotebookLM reusing course notebook: course=%s notebook=%s",
                    course_id,
                    existing_notebook_id[:8],
                    extra={
                        "course_id": course_id,
                        "notebook_id_prefix": existing_notebook_id[:8],
                    },
                )
                return NotebookSelection(
                    notebook_id=existing_notebook_id,
                    is_ephemeral=False,
                    course_id=course_id,
                )

            existing_by_title_id = await self._find_course_notebook_id(
                client=client,
                course_id=course_id,
            )
            if existing_by_title_id:
                self._course_notebooks[course_id] = existing_by_title_id
                logger.info(
                    "NotebookLM reusing existing course notebook from account list: course=%s notebook=%s",
                    course_id,
                    existing_by_title_id[:8],
                    extra={
                        "course_id": course_id,
                        "notebook_id_prefix": existing_by_title_id[:8],
                    },
                )
                return NotebookSelection(
                    notebook_id=existing_by_title_id,
                    is_ephemeral=False,
                    course_id=course_id,
                )

            notebook = await client.notebooks.create(self._course_notebook_title(course_id))
            self._course_notebooks[course_id] = notebook.id
            logger.info(
                "NotebookLM created course notebook: course=%s notebook=%s",
                course_id,
                notebook.id[:8],
                extra={
                    "course_id": course_id,
                    "notebook_id_prefix": notebook.id[:8],
                },
            )
            return NotebookSelection(
                notebook_id=notebook.id,
                is_ephemeral=False,
                course_id=course_id,
            )

    async def _wait_for_sources_ready(
        self, client: Any, notebook_id: str, source_ids: list[str]
    ) -> None:
        if not source_ids:
            return

        wait_for_sources = getattr(client.sources, "wait_for_sources", None)
        timeout = self._settings.notebooklm_generation_timeout_seconds
        initial_interval = self._settings.notebooklm_poll_interval_seconds

        if callable(wait_for_sources):
            await wait_for_sources(
                notebook_id,
                source_ids,
                timeout=timeout,
                initial_interval=initial_interval,
                max_interval=max(initial_interval * 4, 1.0),
            )
            return

        await asyncio.gather(
            *[
                client.sources.wait_until_ready(
                    notebook_id=notebook_id,
                    source_id=source_id,
                    timeout=timeout,
                    initial_interval=initial_interval,
                )
                for source_id in source_ids
            ]
        )

    async def _wait_for_completion_with_progress(
        self,
        *,
        client: Any,
        notebook_id: str,
        task_id: str,
        media_type: MediaType,
        request_started_at_utc: datetime,
    ) -> Any:
        timeout_seconds = self._settings.notebooklm_generation_timeout_seconds
        initial_interval = self._settings.notebooklm_poll_interval_seconds
        poll_request_timeout_seconds = self._settings.notebooklm_poll_http_timeout_seconds
        max_interval = max(initial_interval * 4, 1.0)
        
        proactive_start = self._settings.notebooklm_proactive_recovery_start_seconds
        proactive_interval = self._settings.notebooklm_proactive_recovery_interval_seconds

        loop = asyncio.get_running_loop()
        started_at = loop.time()
        current_interval = initial_interval
        poll_count = 0
        last_status: str | None = None
        transient_poll_errors = 0
        
        last_recovery_check_at: float = 0.0
        recovery_check_attempt = 0

        while True:
            poll_count += 1
            elapsed_seconds = loop.time() - started_at

            # Proactive Recovery Check
            if elapsed_seconds >= proactive_start and (loop.time() - last_recovery_check_at) >= proactive_interval:
                recovery_check_attempt += 1
                last_recovery_check_at = loop.time()
                logger.info(
                    "NotebookLM proactive recovery check: media=%s notebook=%s task=%s attempt=%s elapsed_s=%s",
                    media_type,
                    notebook_id[:8],
                    task_id,
                    recovery_check_attempt,
                    round(elapsed_seconds, 2),
                    extra={
                        "media_type": media_type,
                        "notebook_id_prefix": notebook_id[:8],
                        "task_id": task_id,
                        "recovery_check_attempt": recovery_check_attempt,
                        "elapsed_seconds": round(elapsed_seconds, 2),
                    }
                )
                try:
                    selection = await self._recover_completed_artifact(
                        client=client,
                        notebook_id=notebook_id,
                        media_type=media_type,
                        task_id=task_id,
                        request_started_at=request_started_at_utc,
                        recovery_reason=f"proactive_poll_{recovery_check_attempt}",
                    )
                    if selection:
                        # VERIFY DOWNLOADABILITY!
                        logger.info(
                            "NotebookLM proactive recovery candidate found; verifying downloadability: media=%s notebook=%s task=%s candidate=%s",
                            media_type,
                            notebook_id[:8],
                            task_id,
                            selection.artifact_id,
                        )
                        try:
                            media_bytes, mime_type, extension = await self._download_artifact_bytes(
                                client=client,
                                media_type=media_type,
                                notebook_id=notebook_id,
                                artifact_id=selection.artifact_id,
                            )
                            logger.info(
                                "NotebookLM proactive recovery verification successful: media=%s notebook=%s task=%s candidate=%s size=%s",
                                media_type,
                                notebook_id[:8],
                                task_id,
                                selection.artifact_id,
                                len(media_bytes),
                            )
                            raise MediaGenerationProactiveRecovery(
                                selection=selection,
                                media_bytes=media_bytes,
                                mime_type=mime_type,
                                extension=extension,
                            )
                        except MediaGenerationProactiveRecovery:
                            raise
                        except Exception as dl_error:
                            logger.warning(
                                "NotebookLM proactive recovery verification failed (download error); ignoring candidate and continuing poll: media=%s task=%s candidate=%s error=%s",
                                media_type,
                                task_id,
                                selection.artifact_id,
                                str(dl_error).strip() or type(dl_error).__name__,
                            )
                except MediaGenerationProactiveRecovery:
                    raise
                except Exception as list_error:
                    logger.warning(
                        "NotebookLM proactive recovery check failed (list error); continuing poll: media=%s task=%s error=%s",
                        media_type,
                        task_id,
                        str(list_error).strip() or type(list_error).__name__,
                    )

            try:
                status = await asyncio.wait_for(
                    client.artifacts.poll_status(notebook_id, task_id),
                    timeout=poll_request_timeout_seconds,
                )
                transient_poll_errors = 0
            except Exception as error:
                elapsed_seconds = loop.time() - started_at
                transient_poll_errors += 1
                logger.warning(
                    "NotebookLM task poll request failed: media=%s notebook=%s task=%s poll=%s error=%s retries=%s/%s elapsed_s=%s",
                    media_type,
                    notebook_id[:8],
                    task_id,
                    poll_count,
                    str(error).strip() or type(error).__name__,
                    transient_poll_errors,
                    self._settings.notebooklm_poll_error_retry_limit,
                    round(elapsed_seconds, 2),
                    extra={
                        "media_type": media_type,
                        "notebook_id_prefix": notebook_id[:8],
                        "task_id": task_id,
                        "poll_count": poll_count,
                        "error_type": type(error).__name__,
                        "error_message": str(error).strip(),
                        "poll_errors": transient_poll_errors,
                        "poll_error_limit": self._settings.notebooklm_poll_error_retry_limit,
                        "elapsed_seconds": round(elapsed_seconds, 2),
                    },
                )

                if elapsed_seconds > timeout_seconds:
                    raise MediaGenerationTimeoutError(
                        f"NotebookLM timed out generating {media_type} after {timeout_seconds}s "
                        f"(task_id={task_id}, last_status={last_status or 'unknown'})"
                    ) from error

                if (
                    transient_poll_errors
                    >= self._settings.notebooklm_poll_error_retry_limit
                ):
                    raise MediaGenerationPollError(
                        "NotebookLM task polling failed repeatedly "
                        f"({transient_poll_errors} errors, task_id={task_id})"
                    ) from error

                remaining_seconds = timeout_seconds - elapsed_seconds
                sleep_seconds = min(current_interval, max(remaining_seconds, 0.0))
                if sleep_seconds > 0:
                    await asyncio.sleep(sleep_seconds)
                current_interval = min(current_interval * 2, max_interval)
                continue

            elapsed_seconds = loop.time() - started_at

            should_log = (
                poll_count == 1
                or status.status != last_status
                or poll_count % 10 == 0
                or status.is_complete
                or status.is_failed
            )
            if should_log:
                logger.info(
                    "NotebookLM task poll: media=%s notebook=%s task=%s status=%s poll=%s elapsed_s=%s next_s=%s",
                    media_type,
                    notebook_id[:8],
                    task_id,
                    status.status,
                    poll_count,
                    round(elapsed_seconds, 2),
                    round(current_interval, 2),
                    extra={
                        "media_type": media_type,
                        "notebook_id_prefix": notebook_id[:8],
                        "task_id": task_id,
                        "status": status.status,
                        "error": status.error,
                        "error_code": status.error_code,
                        "poll_count": poll_count,
                        "elapsed_seconds": round(elapsed_seconds, 2),
                        "next_poll_seconds": round(current_interval, 2),
                    },
                )
                last_status = status.status

            if status.is_complete or status.is_failed:
                return status

            if elapsed_seconds > timeout_seconds:
                raise MediaGenerationTimeoutError(
                    f"NotebookLM timed out generating {media_type} after {timeout_seconds}s "
                    f"(task_id={task_id}, last_status={status.status})"
                )

            remaining_seconds = timeout_seconds - elapsed_seconds
            sleep_seconds = min(current_interval, max(remaining_seconds, 0.0))
            if sleep_seconds > 0:
                await asyncio.sleep(sleep_seconds)

            current_interval = min(current_interval * 2, max_interval)

    async def _recover_completed_artifact(
        self,
        *,
        client: Any,
        notebook_id: str,
        media_type: MediaType,
        task_id: str,
        request_started_at: datetime,
        recovery_reason: str,
    ) -> RecoverySelection | None:
        logger.warning(
            "NotebookLM recovery start: media=%s notebook=%s task=%s reason=%s request_started_at=%s",
            media_type,
            notebook_id[:8],
            task_id,
            recovery_reason,
            request_started_at.isoformat(),
            extra={
                "media_type": media_type,
                "notebook_id_prefix": notebook_id[:8],
                "task_id": task_id,
                "recovery_reason": recovery_reason,
                "request_started_at": request_started_at.isoformat(),
                "recovery_start_time_skew_seconds": self._RECOVERY_START_TIME_SKEW_SECONDS,
            },
        )

        try:
            artifacts = await self._list_completed_recovery_artifacts(
                client=client,
                notebook_id=notebook_id,
                media_type=media_type,
            )
        except Exception as error:
            logger.warning(
                "NotebookLM recovery failed while listing artifacts: media=%s notebook=%s task=%s reason=%s error=%s",
                media_type,
                notebook_id[:8],
                task_id,
                recovery_reason,
                str(error).strip() or type(error).__name__,
                extra={
                    "media_type": media_type,
                    "notebook_id_prefix": notebook_id[:8],
                    "task_id": task_id,
                    "recovery_reason": recovery_reason,
                    "error_type": type(error).__name__,
                    "error_message": str(error).strip(),
                },
            )
            return None

        if not artifacts:
            logger.warning(
                "NotebookLM recovery failed: no completed artifacts found for media type: media=%s notebook=%s task=%s",
                media_type,
                notebook_id[:8],
                task_id,
                extra={
                    "media_type": media_type,
                    "notebook_id_prefix": notebook_id[:8],
                    "task_id": task_id,
                    "recovery_reason": recovery_reason,
                },
            )
            return None

        selection = self._select_recovery_artifact(
            artifacts=artifacts,
            media_type=media_type,
            notebook_id=notebook_id,
            task_id=task_id,
            request_started_at=request_started_at,
            recovery_reason=recovery_reason,
        )
        if selection is None:
            logger.warning(
                "NotebookLM recovery failed: unable to select artifact candidate: media=%s notebook=%s task=%s",
                media_type,
                notebook_id[:8],
                task_id,
                extra={
                    "media_type": media_type,
                    "notebook_id_prefix": notebook_id[:8],
                    "task_id": task_id,
                    "recovery_reason": recovery_reason,
                },
            )
            return None

        return selection

    async def _list_completed_recovery_artifacts(
        self,
        *,
        client: Any,
        notebook_id: str,
        media_type: MediaType,
    ) -> list[Any]:
        method_name = "list_audio" if media_type == "audio" else "list_video"
        list_method = getattr(client.artifacts, method_name, None)

        if callable(list_method):
            artifacts = await list_method(notebook_id)
        else:
            fallback_list = getattr(client.artifacts, "list", None)
            if not callable(fallback_list):
                raise MediaGenerationError(
                    f"NotebookLM artifacts API does not expose {method_name} or list"
                )
            artifacts = await fallback_list(notebook_id)

        completed: list[Any] = []
        for artifact in artifacts or []:
            artifact_kind = self._artifact_kind(artifact)
            if artifact_kind and artifact_kind != media_type:
                continue
            if not self._is_completed_artifact(artifact):
                continue
            completed.append(artifact)

        return completed

    @staticmethod
    def _artifact_kind(artifact: Any) -> str | None:
        kind_value = getattr(artifact, "kind", None)
        if kind_value is None:
            return None
        normalized = getattr(kind_value, "value", kind_value)
        if isinstance(normalized, str):
            return normalized.strip().lower()
        return None

    @staticmethod
    def _is_completed_artifact(artifact: Any) -> bool:
        completed_value = getattr(artifact, "is_completed", None)
        if isinstance(completed_value, bool):
            return completed_value

        status_value = getattr(artifact, "status", None)
        if isinstance(status_value, str):
            return status_value.strip().lower() in {"complete", "completed", "done"}
        if isinstance(status_value, int):
            return status_value == 3
        return False

    @staticmethod
    def _artifact_created_at(artifact: Any) -> datetime | None:
        created_at = getattr(artifact, "created_at", None)
        if isinstance(created_at, datetime):
            return created_at
        if isinstance(created_at, (int, float)):
            try:
                return datetime.fromtimestamp(float(created_at), tz=UTC)
            except (TypeError, ValueError, OSError):
                return None
        if isinstance(created_at, str):
            try:
                return datetime.fromisoformat(created_at)
            except ValueError:
                return None
        return None

    @staticmethod
    def _artifact_created_at_timestamp(artifact: Any) -> float | None:
        created_at = NotebookLMMediaGenerator._artifact_created_at(artifact)
        if created_at is None:
            return None
        try:
            return created_at.timestamp()
        except (TypeError, OSError, OverflowError, ValueError):
            return None

    def _select_recovery_artifact(
        self,
        *,
        artifacts: list[Any],
        media_type: MediaType,
        notebook_id: str,
        task_id: str,
        request_started_at: datetime,
        recovery_reason: str,
    ) -> RecoverySelection | None:
        request_start_ts = request_started_at.timestamp()
        # Only accept artifacts created AFTER we started the request (no backward skew)
        selection_threshold_ts = request_start_ts
        candidates: list[dict[str, Any]] = []

        for artifact in artifacts:
            artifact_id = getattr(artifact, "id", None)
            if not isinstance(artifact_id, str) or not artifact_id:
                continue

            created_at = self._artifact_created_at(artifact)
            created_ts = self._artifact_created_at_timestamp(artifact)
            near_request_start = (
                created_ts is not None and created_ts >= selection_threshold_ts
            )
            matches_task_id = (artifact_id == task_id)

            logger.info(
                "NotebookLM recovery candidate: media=%s notebook=%s task=%s candidate=%s created_at=%s near_request_start=%s matches_task_id=%s",
                media_type,
                notebook_id[:8],
                task_id,
                artifact_id,
                created_at.isoformat() if created_at else None,
                near_request_start,
                matches_task_id,
                extra={
                    "media_type": media_type,
                    "notebook_id_prefix": notebook_id[:8],
                    "task_id": task_id,
                    "candidate_artifact_id": artifact_id,
                    "candidate_created_at": created_at.isoformat() if created_at else None,
                    "candidate_near_request_start": near_request_start,
                    "candidate_matches_task_id": matches_task_id,
                },
            )

            candidates.append(
                {
                    "artifact_id": artifact_id,
                    "created_at": created_at,
                    "created_ts": created_ts,
                    "near_request_start": near_request_start,
                    "matches_task_id": matches_task_id,
                }
            )

        if not candidates:
            return None

        sorted_candidates = sorted(
            candidates,
            key=lambda candidate: (
                candidate["created_ts"] if candidate["created_ts"] is not None else float("-inf")
            ),
            reverse=True,
        )
        task_id_matches = [
            candidate for candidate in sorted_candidates if candidate["matches_task_id"]
        ]
        time_window_matches = [
            candidate for candidate in sorted_candidates if candidate["near_request_start"]
        ]

        if task_id_matches:
            selected = task_id_matches[0]
            strategy = "matched_task_id"
        elif time_window_matches:
            selected = time_window_matches[0]
            strategy = "created_near_request_start"
        else:
            logger.warning(
                "NotebookLM recovery: no artifact matched task_id or time window, refusing fallback: media=%s notebook=%s task=%s candidates=%s",
                media_type,
                notebook_id[:8],
                task_id,
                len(sorted_candidates),
                extra={
                    "media_type": media_type,
                    "notebook_id_prefix": notebook_id[:8],
                    "task_id": task_id,
                    "recovery_reason": recovery_reason,
                    "candidate_count": len(sorted_candidates),
                },
            )
            return None

        logger.info(
            "NotebookLM recovery selected candidate: media=%s notebook=%s task=%s selected=%s strategy=%s candidates=%s time_window_matches=%s task_id_matches=%s",
            media_type,
            notebook_id[:8],
            task_id,
            selected["artifact_id"],
            strategy,
            len(sorted_candidates),
            len(time_window_matches),
            len(task_id_matches),
            extra={
                "media_type": media_type,
                "notebook_id_prefix": notebook_id[:8],
                "task_id": task_id,
                "recovery_reason": recovery_reason,
                "recovery_selected_artifact_id": selected["artifact_id"],
                "recovery_selected_created_at": (
                    selected["created_at"].isoformat() if selected["created_at"] else None
                ),
                "recovery_strategy": strategy,
                "recovery_candidate_count": len(sorted_candidates),
                "recovery_time_window_match_count": len(time_window_matches),
                "recovery_task_id_match_count": len(task_id_matches),
            },
        )

        return RecoverySelection(
            artifact_id=selected["artifact_id"],
            strategy=strategy,
            selected_created_at=selected["created_at"],
            candidate_count=len(sorted_candidates),
            preferred_candidate_count=len(time_window_matches) + len(task_id_matches),
            recovery_reason=recovery_reason,
            request_started_at=request_started_at,
            start_time_skew_seconds=self._RECOVERY_START_TIME_SKEW_SECONDS,
        )

    @staticmethod
    def _resolve_enum_option(
        module: Any,
        *,
        enum_name: str,
        raw_value: str | None,
        field_name: str,
    ) -> Any | None:
        if raw_value is None:
            return None

        enum_class = getattr(module, enum_name, None)
        if enum_class is None:
            raise MediaGenerationUnavailableError(
                f"notebooklm-py does not expose enum {enum_name}"
            )

        normalized = raw_value.strip().upper().replace("-", "_")
        enum_value = enum_class.__members__.get(normalized)
        if enum_value is not None:
            return enum_value

        valid_values = ", ".join(name.lower() for name in enum_class.__members__)
        raise MediaGenerationError(
            f"Unsupported {field_name}: {raw_value!r}. Allowed values: {valid_values}"
        )

    @staticmethod
    def _build_instructions(
        request: MediaGenerationRequest,
        media_type: MediaType,
    ) -> str:
        lines: list[str] = [
            "You are generating an in-course lesson asset, not a standalone course.",
            "Hard constraints:",
            "- Do not say this is the beginning of a course or that learners are just starting a course.",
            "- Do not use intro phrases like 'in this course', 'today we begin', or 'welcome to this course'.",
            "- Assume the learner is already inside the course and this asset belongs to the current lesson.",
            "- Start directly with the lesson topic and key concepts.",
            "Content constraints:",
            "- Use only the provided notebook sources and stay factually aligned with them.",
            "- Keep terminology and examples consistent with the lesson materials.",
            f"- Output language must be: {request.language}.",
        ]

        if request.target_duration_minutes is not None:
            lines.append(
                f"- Preferred target duration is about {request.target_duration_minutes} minutes."
            )
        if (
            request.duration_range_min_minutes is not None
            and request.duration_range_max_minutes is not None
        ):
            lines.append(
                "- Acceptable duration range is "
                f"{request.duration_range_min_minutes}-{request.duration_range_max_minutes} minutes."
            )
            lines.append(
                "- This range is a soft target: end naturally and coherently; do not abruptly cut off content to match time."
            )

        if media_type == "audio":
            lines.extend(
                [
                    "Audio style constraints:",
                    "- Keep narration concise and educational, without podcast-show banter.",
                ]
            )
        else:
            lines.extend(
                [
                    "Video style constraints:",
                    "- Keep narration in explainer style and avoid meta-introductions.",
                ]
            )

        if request.voice:
            lines.append(f"- Preferred narration voice/style tag: {request.voice}.")

        return "\n".join(lines)

    async def _download_artifact_bytes(
        self,
        client: Any,
        media_type: MediaType,
        notebook_id: str,
        artifact_id: str,
    ) -> tuple[bytes, str, str]:
        if media_type == "audio":
            extension = "mp3"
            mime_type = "audio/mpeg"
            downloader = client.artifacts.download_audio
        else:
            extension = "mp4"
            mime_type = "video/mp4"
            downloader = client.artifacts.download_video

        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{extension}") as tmp_file:
            tmp_path = Path(tmp_file.name)

        try:
            await downloader(
                notebook_id=notebook_id,
                output_path=str(tmp_path),
                artifact_id=artifact_id,
            )
            media_bytes = tmp_path.read_bytes()
        finally:
            tmp_path.unlink(missing_ok=True)

        if not media_bytes:
            raise MediaGenerationError(
                f"NotebookLM returned empty {media_type} artifact payload"
            )

        return media_bytes, mime_type, extension

    def _fallback_result(
        self,
        media_type: MediaType,
        request: MediaGenerationRequest,
        reason: str,
    ) -> GenerationResult:
        if media_type == "audio":
            media_bytes = self._build_fallback_audio_bytes()
            mime_type = "audio/wav"
            extension = "wav"
        else:
            media_bytes = request.script.encode("utf-8")
            mime_type = "text/plain; charset=utf-8"
            extension = "txt"

        metadata = {
            "provider": "fallback",
            "mode": self._settings.notebooklm_generation_mode,
            "reason": reason,
            "generated_at": datetime.now(UTC).isoformat(),
            "placeholder": True,
            "voice": request.voice,
            "language": request.language,
            "source_count": len(request.sources) if request.sources else 1,
            "audio_format": request.audio_format,
            "audio_length": request.audio_length,
            "video_format": request.video_format,
            "video_style": request.video_style,
        }

        return GenerationResult(
            media_bytes=media_bytes,
            mime_type=mime_type,
            extension=extension,
            duration_seconds=self._estimate_duration_seconds(request.script, media_type),
            metadata=metadata,
        )

    @staticmethod
    def _estimate_duration_seconds(script: str, media_type: MediaType) -> float:
        words = max(len(script.split()), 1)
        words_per_minute = 150 if media_type == "audio" else 120
        seconds = (words / words_per_minute) * 60
        return round(max(seconds, 1.0), 2)

    @staticmethod
    def _build_fallback_audio_bytes() -> bytes:
        sample_rate = 22050
        duration_seconds = 1.0
        total_frames = int(sample_rate * duration_seconds)
        frequency_hz = 440.0

        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)

            for index in range(total_frames):
                sample = int(
                    32767
                    * 0.25
                    * math.sin(2 * math.pi * frequency_hz * index / sample_rate)
                )
                wav_file.writeframesraw(
                    sample.to_bytes(2, byteorder="little", signed=True)
                )

        return buffer.getvalue()
