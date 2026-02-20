from __future__ import annotations

import importlib
import io
import logging
import math
import tempfile
import wave
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


class MediaGenerationUnavailableError(MediaGenerationError):
    """Raised when notebooklm-py cannot be used."""


@dataclass(slots=True)
class GenerationResult:
    media_bytes: bytes
    mime_type: str
    extension: str
    duration_seconds: float | None = None
    metadata: dict[str, Any] | None = None


@runtime_checkable
class MediaGenerator(Protocol):
    async def generate_audio(self, request: MediaGenerationRequest) -> GenerationResult:
        ...

    async def generate_video_overview(self, request: MediaGenerationRequest) -> GenerationResult:
        ...


class NotebookLMMediaGenerator(MediaGenerator):
    def __init__(self, settings: Settings):
        self._settings = settings

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

        try:
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
                raise MediaGenerationError("NotebookLM generation failed") from error

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

        async with client:
            notebook = await client.notebooks.create(request.lesson_title)
            notebook_id = notebook.id

            try:
                source_pairs = self._resolve_sources(request)
                source_ids: list[str] = []
                source_titles: list[str] = []

                for title, content in source_pairs:
                    source = await client.sources.add_text(
                        notebook_id=notebook_id,
                        title=title,
                        content=content,
                    )
                    source_ids.append(source.id)
                    source_titles.append(title)

                await self._wait_for_sources_ready(
                    client=client,
                    notebook_id=notebook_id,
                    source_ids=source_ids,
                )

                instructions = self._build_instructions(request)
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

                try:
                    final_status = await client.artifacts.wait_for_completion(
                        notebook_id=notebook_id,
                        task_id=status.task_id,
                        initial_interval=self._settings.notebooklm_poll_interval_seconds,
                        max_interval=max(self._settings.notebooklm_poll_interval_seconds * 4, 1.0),
                        timeout=self._settings.notebooklm_generation_timeout_seconds,
                    )
                except TimeoutError as error:
                    raise MediaGenerationTimeoutError(
                        f"NotebookLM timed out generating {media_type}"
                    ) from error

                if final_status.is_failed:
                    raise MediaGenerationError(
                        final_status.error or f"NotebookLM failed generating {media_type}"
                    )

                media_bytes, mime_type, extension = await self._download_artifact_bytes(
                    client=client,
                    media_type=media_type,
                    notebook_id=notebook_id,
                    artifact_id=status.task_id,
                )

                return GenerationResult(
                    media_bytes=media_bytes,
                    mime_type=mime_type,
                    extension=extension,
                    duration_seconds=self._estimate_duration_seconds(request.script, media_type),
                    metadata={
                        "provider": "notebooklm-py",
                        "mode": self._settings.notebooklm_generation_mode,
                        "notebook_id": notebook_id,
                        "source_ids": source_ids,
                        "source_count": len(source_ids),
                        "source_titles": source_titles,
                        "task_id": status.task_id,
                        "status": final_status.status,
                        "language": request.language,
                        "voice": request.voice,
                        "audio_format": request.audio_format,
                        "audio_length": request.audio_length,
                        "video_format": request.video_format,
                        "video_style": request.video_style,
                    },
                )
            finally:
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
                "timeout": self._settings.notebooklm_generation_timeout_seconds
            }
            if self._settings.notebooklm_storage_path:
                kwargs["path"] = self._settings.notebooklm_storage_path

            try:
                return await from_storage(**kwargs)
            except Exception as error:
                raise MediaGenerationUnavailableError(
                    "Failed to initialize NotebookLM client from storage"
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
            resolved = [(source.title, source.content) for source in request.sources]
            if resolved:
                return resolved

        return [(f"{request.lesson_title} Script", request.script)]

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
    def _build_instructions(request: MediaGenerationRequest) -> str:
        base = (
            "Use all notebook sources to create a clear educational overview. "
            "Preserve factual alignment with provided materials."
        )
        if request.voice:
            return f"{base} Voice preference: {request.voice}."
        return base

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
            mime_type = "application/octet-stream"
            extension = "bin"

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
