from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.config import Settings
from app.generator import (
    GenerationResult,
    MediaType,
    MediaGenerationTimeoutError,
    NotebookLMMediaGenerator,
)
from app.models import MediaGenerationRequest


def _build_request() -> MediaGenerationRequest:
    return MediaGenerationRequest(
        lesson_title="Queue Test Lesson",
        script="Queue test script",
        language="en",
    )


def _build_course_request(course_id: str) -> MediaGenerationRequest:
    return MediaGenerationRequest(
        lesson_title="Queue Test Lesson",
        script="Queue test script",
        language="en",
        course_id=course_id,
    )


class BlockingNotebookGenerator(NotebookLMMediaGenerator):
    def __init__(
        self,
        settings: Settings,
        *,
        release_event: asyncio.Event,
        first_start_event: asyncio.Event,
    ) -> None:
        super().__init__(settings)
        self._release_event = release_event
        self._first_start_event = first_start_event
        self.started_media_types: list[str] = []
        self.max_parallel_generations = 0
        self._active_generations = 0

    async def _generate_with_notebooklm(
        self,
        media_type: MediaType,
        request: MediaGenerationRequest,
    ) -> GenerationResult:
        self.started_media_types.append(media_type)
        self._active_generations += 1
        self.max_parallel_generations = max(
            self.max_parallel_generations,
            self._active_generations,
        )
        self._first_start_event.set()

        try:
            await self._release_event.wait()
        finally:
            self._active_generations -= 1

        return GenerationResult(
            media_bytes=media_type.encode("utf-8"),
            mime_type="application/octet-stream",
            extension="bin",
        )


def test_global_queue_caps_shared_audio_video_concurrency() -> None:
    async def run_scenario() -> None:
        release_event = asyncio.Event()
        first_start_event = asyncio.Event()
        generator = BlockingNotebookGenerator(
            Settings(
                notebooklm_bridge_token="test-token",
                notebooklm_generation_mode="notebooklm",
                notebooklm_allow_fallback=False,
                notebooklm_global_generation_concurrency=1,
                notebooklm_queue_wait_timeout_seconds=1.0,
            ),
            release_event=release_event,
            first_start_event=first_start_event,
        )
        request = _build_request()

        audio_task = asyncio.create_task(generator.generate_audio(request))
        await asyncio.wait_for(first_start_event.wait(), timeout=0.2)

        video_task = asyncio.create_task(generator.generate_video_overview(request))
        await asyncio.sleep(0.05)

        assert generator.started_media_types == ["audio"]
        assert generator.max_parallel_generations == 1

        release_event.set()
        await asyncio.wait_for(asyncio.gather(audio_task, video_task), timeout=0.5)

        assert generator.started_media_types == ["audio", "video"]
        assert generator.max_parallel_generations == 1

    asyncio.run(run_scenario())


def test_global_queue_wait_timeout_raises_media_timeout_error() -> None:
    async def run_scenario() -> None:
        release_event = asyncio.Event()
        first_start_event = asyncio.Event()
        generator = BlockingNotebookGenerator(
            Settings(
                notebooklm_bridge_token="test-token",
                notebooklm_generation_mode="notebooklm",
                notebooklm_allow_fallback=False,
                notebooklm_global_generation_concurrency=1,
                notebooklm_queue_wait_timeout_seconds=0.05,
            ),
            release_event=release_event,
            first_start_event=first_start_event,
        )
        request = _build_request()

        first_task = asyncio.create_task(generator.generate_audio(request))
        await asyncio.wait_for(first_start_event.wait(), timeout=0.2)

        with pytest.raises(
            MediaGenerationTimeoutError,
            match="Timed out waiting for NotebookLM generation queue slot",
        ) as raised_error:
            await asyncio.wait_for(
                generator.generate_video_overview(request),
                timeout=0.2,
            )
        assert "media_type=video" in str(raised_error.value)
        assert "max_concurrency=1" in str(raised_error.value)

        release_event.set()
        await asyncio.wait_for(first_task, timeout=0.5)

    asyncio.run(run_scenario())


def test_course_lock_serializes_same_course_generation() -> None:
    async def run_scenario() -> None:
        release_event = asyncio.Event()
        first_start_event = asyncio.Event()
        generator = BlockingNotebookGenerator(
            Settings(
                notebooklm_bridge_token="test-token",
                notebooklm_generation_mode="notebooklm",
                notebooklm_allow_fallback=False,
                notebooklm_global_generation_concurrency=2,
                notebooklm_queue_wait_timeout_seconds=1.0,
            ),
            release_event=release_event,
            first_start_event=first_start_event,
        )
        request = _build_course_request("course-serialized")

        audio_task = asyncio.create_task(generator.generate_audio(request))
        await asyncio.wait_for(first_start_event.wait(), timeout=0.2)

        video_task = asyncio.create_task(generator.generate_video_overview(request))
        await asyncio.sleep(0.05)

        assert generator.started_media_types == ["audio"]
        assert generator.max_parallel_generations == 1

        release_event.set()
        await asyncio.wait_for(asyncio.gather(audio_task, video_task), timeout=0.5)

        assert generator.started_media_types == ["audio", "video"]
        assert generator.max_parallel_generations == 1

    asyncio.run(run_scenario())


def test_storage_path_configures_notebooklm_home(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("NOTEBOOKLM_HOME", raising=False)

    NotebookLMMediaGenerator(
        Settings(
            notebooklm_bridge_token="test-token",
            notebooklm_generation_mode="notebooklm",
            notebooklm_allow_fallback=False,
            notebooklm_storage_path="/app/secrets/notebooklm/storage_state.json",
        )
    )

    assert os.environ["NOTEBOOKLM_HOME"] == "/app/secrets/notebooklm"


def test_auth_json_precedence_skips_storage_path_client_argument(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeNotebookLMClient:
        call_kwargs: list[dict[str, object]] = []

        @classmethod
        async def from_storage(cls, **kwargs: object) -> object:
            cls.call_kwargs.append(kwargs)
            return object()

    monkeypatch.delenv("NOTEBOOKLM_AUTH_JSON", raising=False)
    generator = NotebookLMMediaGenerator(
        Settings(
            notebooklm_bridge_token="test-token",
            notebooklm_generation_mode="notebooklm",
            notebooklm_allow_fallback=False,
            notebooklm_auth_json='{"cookies": []}',
            notebooklm_storage_path="/app/secrets/notebooklm/storage_state.json",
        )
    )
    monkeypatch.setattr(
        generator,
        "_import_notebooklm_module",
        lambda: SimpleNamespace(NotebookLMClient=FakeNotebookLMClient),
    )

    asyncio.run(generator._create_client())

    assert os.environ["NOTEBOOKLM_AUTH_JSON"] == '{"cookies": []}'
    assert FakeNotebookLMClient.call_kwargs
    kwargs = FakeNotebookLMClient.call_kwargs[-1]
    assert "path" not in kwargs
    assert kwargs["timeout"] == pytest.approx(
        generator._settings.notebooklm_http_timeout_seconds
    )


def test_env_auth_json_precedence_skips_storage_path_client_argument(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeNotebookLMClient:
        call_kwargs: list[dict[str, object]] = []

        @classmethod
        async def from_storage(cls, **kwargs: object) -> object:
            cls.call_kwargs.append(kwargs)
            return object()

    monkeypatch.setenv("NOTEBOOKLM_AUTH_JSON", '{"cookies": []}')
    generator = NotebookLMMediaGenerator(
        Settings(
            notebooklm_bridge_token="test-token",
            notebooklm_generation_mode="notebooklm",
            notebooklm_allow_fallback=False,
            notebooklm_storage_path="/app/secrets/notebooklm/storage_state.json",
        )
    )
    monkeypatch.setattr(
        generator,
        "_import_notebooklm_module",
        lambda: SimpleNamespace(NotebookLMClient=FakeNotebookLMClient),
    )

    asyncio.run(generator._create_client())

    assert FakeNotebookLMClient.call_kwargs
    kwargs = FakeNotebookLMClient.call_kwargs[-1]
    assert "path" not in kwargs


def test_storage_path_used_when_auth_json_not_provided(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeNotebookLMClient:
        call_kwargs: list[dict[str, object]] = []

        @classmethod
        async def from_storage(cls, **kwargs: object) -> object:
            cls.call_kwargs.append(kwargs)
            return object()

    monkeypatch.delenv("NOTEBOOKLM_AUTH_JSON", raising=False)
    generator = NotebookLMMediaGenerator(
        Settings(
            notebooklm_bridge_token="test-token",
            notebooklm_generation_mode="notebooklm",
            notebooklm_allow_fallback=False,
            notebooklm_storage_path="/app/secrets/notebooklm/storage_state.json",
        )
    )
    monkeypatch.setattr(
        generator,
        "_import_notebooklm_module",
        lambda: SimpleNamespace(NotebookLMClient=FakeNotebookLMClient),
    )

    asyncio.run(generator._create_client())

    assert FakeNotebookLMClient.call_kwargs
    kwargs = FakeNotebookLMClient.call_kwargs[-1]
    assert kwargs["path"] == "/app/secrets/notebooklm/storage_state.json"
    assert kwargs["timeout"] == pytest.approx(
        generator._settings.notebooklm_http_timeout_seconds
    )


def test_empty_auth_json_value_falls_back_to_storage_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeNotebookLMClient:
        call_kwargs: list[dict[str, object]] = []

        @classmethod
        async def from_storage(cls, **kwargs: object) -> object:
            cls.call_kwargs.append(kwargs)
            return object()

    monkeypatch.setenv("NOTEBOOKLM_AUTH_JSON", "")
    generator = NotebookLMMediaGenerator(
        Settings(
            notebooklm_bridge_token="test-token",
            notebooklm_generation_mode="notebooklm",
            notebooklm_allow_fallback=False,
            notebooklm_storage_path="/app/secrets/notebooklm/storage_state.json",
        )
    )
    monkeypatch.setattr(
        generator,
        "_import_notebooklm_module",
        lambda: SimpleNamespace(NotebookLMClient=FakeNotebookLMClient),
    )

    asyncio.run(generator._create_client())

    assert FakeNotebookLMClient.call_kwargs
    kwargs = FakeNotebookLMClient.call_kwargs[-1]
    assert kwargs["path"] == "/app/secrets/notebooklm/storage_state.json"


def test_build_instructions_enforces_in_course_framing_for_audio() -> None:
    request = MediaGenerationRequest(
        lesson_title="Lesson 1",
        script="Script text",
        language="ru",
        voice="alloy",
        target_duration_minutes=5,
        duration_range_min_minutes=4,
        duration_range_max_minutes=7,
    )

    instructions = NotebookLMMediaGenerator._build_instructions(request, "audio")

    assert "not a standalone course" in instructions
    assert "Do not use intro phrases" in instructions
    assert "Output language must be: ru." in instructions
    assert "Preferred target duration is about 5 minutes." in instructions
    assert "Acceptable duration range is 4-7 minutes." in instructions
    assert "do not abruptly cut off content" in instructions
    assert "Audio style constraints:" in instructions
    assert "Preferred narration voice/style tag: alloy." in instructions


def test_build_instructions_enforces_explainer_style_for_video() -> None:
    request = MediaGenerationRequest(
        lesson_title="Lesson 1",
        script="Script text",
        language="en",
        target_duration_minutes=6,
        duration_range_min_minutes=4,
        duration_range_max_minutes=7,
    )

    instructions = NotebookLMMediaGenerator._build_instructions(request, "video")

    assert "not a standalone course" in instructions
    assert "Output language must be: en." in instructions
    assert "Preferred target duration is about 6 minutes." in instructions
    assert "Video style constraints:" in instructions
    assert "explainer style" in instructions


@dataclass(slots=True)
class FakeNotebook:
    id: str
    title: str


@dataclass(slots=True)
class FakeSource:
    id: str


@dataclass(slots=True)
class FakeArtifact:
    id: str
    kind: str
    created_at: datetime | None
    status: int = 3

    @property
    def is_completed(self) -> bool:
        return self.status == 3


class FakeGenerationStatus:
    def __init__(self, status: str, task_id: str, error: str | None = None) -> None:
        self.status = status
        self.task_id = task_id
        self.error = error
        self.error_code = None

    @property
    def is_failed(self) -> bool:
        return self.status in {"failed", "error"}

    @property
    def is_complete(self) -> bool:
        return self.status in {"complete", "completed", "done"}


class FakeNotebooksAPI:
    def __init__(self) -> None:
        self.created_titles: list[str] = []
        self.deleted_ids: list[str] = []
        self.created_notebooks: list[FakeNotebook] = []
        self.listed_notebooks: list[FakeNotebook] = []

    async def create(self, title: str) -> FakeNotebook:
        notebook_id = f"nb-{len(self.created_titles) + 1}"
        self.created_titles.append(title)
        notebook = FakeNotebook(id=notebook_id, title=title)
        self.created_notebooks.append(notebook)
        return notebook

    async def list(self) -> list[FakeNotebook]:
        return [*self.listed_notebooks, *self.created_notebooks]

    async def delete(self, notebook_id: str) -> None:
        self.deleted_ids.append(notebook_id)


class FakeSourcesAPI:
    def __init__(self) -> None:
        self.counter = 0

    async def add_text(self, notebook_id: str, title: str, content: str) -> FakeSource:
        self.counter += 1
        return FakeSource(id=f"src-{self.counter}")

    async def wait_for_sources(
        self,
        notebook_id: str,
        source_ids: list[str],
        timeout: float,
        initial_interval: float,
        max_interval: float,
    ) -> None:
        return None


class FakeArtifactsAPI:
    def __init__(self) -> None:
        self.poll_calls = 0
        self.generated_task_ids: list[str] = []
        self._next_id = 1
        self.poll_error: Exception | None = None
        self.audio_artifacts: list[FakeArtifact] = []
        self.video_artifacts: list[FakeArtifact] = []
        self.all_artifacts: list[FakeArtifact] = []
        self.downloaded_audio_ids: list[str] = []
        self.downloaded_video_ids: list[str] = []

    async def generate_audio(self, **kwargs: object) -> FakeGenerationStatus:
        task_id = f"task-{self._next_id}"
        self._next_id += 1
        self.generated_task_ids.append(task_id)
        return FakeGenerationStatus(status="queued", task_id=task_id)

    async def generate_video(self, **kwargs: object) -> FakeGenerationStatus:
        task_id = f"task-{self._next_id}"
        self._next_id += 1
        self.generated_task_ids.append(task_id)
        return FakeGenerationStatus(status="queued", task_id=task_id)

    async def poll_status(self, notebook_id: str, task_id: str) -> FakeGenerationStatus:
        self.poll_calls += 1
        if self.poll_error is not None:
            raise self.poll_error
        return FakeGenerationStatus(status="complete", task_id=task_id)

    async def list_audio(self, notebook_id: str) -> list[FakeArtifact]:
        return self.audio_artifacts

    async def list_video(self, notebook_id: str) -> list[FakeArtifact]:
        return self.video_artifacts

    async def list(self, notebook_id: str) -> list[FakeArtifact]:
        return self.all_artifacts

    async def download_audio(
        self, notebook_id: str, output_path: str, artifact_id: str
    ) -> None:
        self.downloaded_audio_ids.append(artifact_id)
        with open(output_path, "wb") as file_handle:
            file_handle.write(f"audio:{artifact_id}".encode("utf-8"))

    async def download_video(
        self, notebook_id: str, output_path: str, artifact_id: str
    ) -> None:
        self.downloaded_video_ids.append(artifact_id)
        with open(output_path, "wb") as file_handle:
            file_handle.write(f"video:{artifact_id}".encode("utf-8"))


class FakeNotebookLMClient:
    def __init__(self) -> None:
        self.notebooks = FakeNotebooksAPI()
        self.sources = FakeSourcesAPI()
        self.artifacts = FakeArtifactsAPI()

    async def __aenter__(self) -> "FakeNotebookLMClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


def test_course_scoped_notebook_reuse_for_same_course(monkeypatch: pytest.MonkeyPatch) -> None:
    async def run_scenario() -> None:
        fake_client = FakeNotebookLMClient()
        generator = NotebookLMMediaGenerator(
            Settings(
                notebooklm_bridge_token="test-token",
                notebooklm_generation_mode="notebooklm",
                notebooklm_allow_fallback=False,
                notebooklm_poll_interval_seconds=0.01,
                notebooklm_generation_timeout_seconds=2.0,
            )
        )

        async def create_client() -> FakeNotebookLMClient:
            return fake_client

        monkeypatch.setattr(generator, "_create_client", create_client)
        monkeypatch.setattr(generator, "_import_notebooklm_module", lambda: SimpleNamespace())

        request = MediaGenerationRequest(
            lesson_title="Lesson 1",
            script="Script text",
            language="en",
            course_id="course-123",
        )

        await generator.generate_audio(request)
        await generator.generate_audio(request)

        assert fake_client.notebooks.created_titles == ["course:course-123"]
        assert fake_client.notebooks.deleted_ids == []

    asyncio.run(run_scenario())


def test_missing_course_id_keeps_ephemeral_notebook_behavior(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def run_scenario() -> None:
        fake_client = FakeNotebookLMClient()
        generator = NotebookLMMediaGenerator(
            Settings(
                notebooklm_bridge_token="test-token",
                notebooklm_generation_mode="notebooklm",
                notebooklm_allow_fallback=False,
                notebooklm_poll_interval_seconds=0.01,
                notebooklm_generation_timeout_seconds=2.0,
            )
        )

        async def create_client() -> FakeNotebookLMClient:
            return fake_client

        monkeypatch.setattr(generator, "_create_client", create_client)
        monkeypatch.setattr(generator, "_import_notebooklm_module", lambda: SimpleNamespace())

        request = MediaGenerationRequest(
            lesson_title="Lesson 1",
            script="Script text",
            language="en",
        )

        await generator.generate_audio(request)
        await generator.generate_audio(request)

        assert fake_client.notebooks.created_titles == ["Lesson 1", "Lesson 1"]
        assert fake_client.notebooks.deleted_ids == ["nb-1", "nb-2"]

    asyncio.run(run_scenario())


def test_reuses_existing_course_notebook_from_account_listing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def run_scenario() -> None:
        fake_client = FakeNotebookLMClient()
        fake_client.notebooks.listed_notebooks = [
            FakeNotebook(id="nb-existing-course", title="course:course-123")
        ]

        generator = NotebookLMMediaGenerator(
            Settings(
                notebooklm_bridge_token="test-token",
                notebooklm_generation_mode="notebooklm",
                notebooklm_allow_fallback=False,
                notebooklm_poll_interval_seconds=0.01,
                notebooklm_generation_timeout_seconds=2.0,
            )
        )

        async def create_client() -> FakeNotebookLMClient:
            return fake_client

        monkeypatch.setattr(generator, "_create_client", create_client)
        monkeypatch.setattr(generator, "_import_notebooklm_module", lambda: SimpleNamespace())

        request = MediaGenerationRequest(
            lesson_title="Lesson 1",
            script="Script text",
            language="en",
            course_id="course-123",
        )

        await generator.generate_audio(request)

        assert fake_client.notebooks.created_titles == []
        assert fake_client.notebooks.deleted_ids == []

    asyncio.run(run_scenario())


def test_poll_status_short_timeout_retries_transient_errors() -> None:
    class FlakyArtifacts:
        def __init__(self) -> None:
            self.calls = 0

        async def poll_status(self, notebook_id: str, task_id: str) -> FakeGenerationStatus:
            self.calls += 1
            if self.calls == 1:
                await asyncio.sleep(0.1)
            return FakeGenerationStatus(status="complete", task_id=task_id)

    class FakeClient:
        def __init__(self) -> None:
            self.artifacts = FlakyArtifacts()

    async def run_scenario() -> None:
        generator = NotebookLMMediaGenerator(
            Settings(
                notebooklm_bridge_token="test-token",
                notebooklm_generation_mode="notebooklm",
                notebooklm_allow_fallback=False,
                notebooklm_generation_timeout_seconds=1.0,
                notebooklm_poll_interval_seconds=0.01,
                notebooklm_poll_http_timeout_seconds=0.02,
                notebooklm_poll_error_retry_limit=3,
            )
        )
        client = FakeClient()

        status = await generator._wait_for_completion_with_progress(
            client=client,
            notebook_id="nb-1",
            task_id="task-1",
            media_type="audio",
            request_started_at_utc=datetime.now(UTC),
        )

        assert status.status == "complete"
        assert client.artifacts.calls >= 2

    asyncio.run(run_scenario())


def test_recovery_prefers_completed_audio_artifact_near_request_start(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def run_scenario() -> None:
        fake_client = FakeNotebookLMClient()
        fake_client.artifacts.poll_error = RuntimeError("poll transport failure")
        now = datetime.now(UTC)
        fake_client.artifacts.audio_artifacts = [
            FakeArtifact(
                id="art-old",
                kind="audio",
                created_at=now - timedelta(hours=3),
            ),
            FakeArtifact(
                id="art-preferred",
                kind="audio",
                created_at=now + timedelta(seconds=30),
            ),
        ]

        generator = NotebookLMMediaGenerator(
            Settings(
                notebooklm_bridge_token="test-token",
                notebooklm_generation_mode="notebooklm",
                notebooklm_allow_fallback=False,
                notebooklm_poll_interval_seconds=0.01,
                notebooklm_generation_timeout_seconds=1.0,
                notebooklm_poll_error_retry_limit=1,
            )
        )

        async def create_client() -> FakeNotebookLMClient:
            return fake_client

        monkeypatch.setattr(generator, "_create_client", create_client)
        monkeypatch.setattr(generator, "_import_notebooklm_module", lambda: SimpleNamespace())

        request = MediaGenerationRequest(
            lesson_title="Lesson 1",
            script="Script text",
            language="en",
            course_id="course-123",
        )
        result = await generator.generate_audio(request)

        assert result.media_bytes == b"audio:art-preferred"
        assert result.metadata is not None
        assert result.metadata["recovered_from_artifact"] is True
        assert result.metadata["recovery_selected_artifact_id"] == "art-preferred"
        assert result.metadata["recovery_strategy"] == "created_near_request_start"
        assert fake_client.artifacts.downloaded_audio_ids == ["art-preferred"]

    asyncio.run(run_scenario())


def test_recovery_falls_back_to_latest_completed_video_artifact_when_no_nearby_candidate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def run_scenario() -> None:
        fake_client = FakeNotebookLMClient()
        fake_client.artifacts.poll_error = RuntimeError("poll transport failure")
        now = datetime.now(UTC)
        fake_client.artifacts.video_artifacts = [
            FakeArtifact(
                id="vid-oldest",
                kind="video",
                created_at=now - timedelta(days=5),
            ),
            FakeArtifact(
                id="vid-latest",
                kind="video",
                created_at=now - timedelta(days=1),
            ),
        ]

        generator = NotebookLMMediaGenerator(
            Settings(
                notebooklm_bridge_token="test-token",
                notebooklm_generation_mode="notebooklm",
                notebooklm_allow_fallback=False,
                notebooklm_poll_interval_seconds=0.01,
                notebooklm_generation_timeout_seconds=1.0,
                notebooklm_poll_error_retry_limit=1,
            )
        )

        async def create_client() -> FakeNotebookLMClient:
            return fake_client

        monkeypatch.setattr(generator, "_create_client", create_client)
        monkeypatch.setattr(generator, "_import_notebooklm_module", lambda: SimpleNamespace())

        request = MediaGenerationRequest(
            lesson_title="Lesson 1",
            script="Script text",
            language="en",
            course_id="course-123",
        )
        result = await generator.generate_video_overview(request)

        assert result.media_bytes == b"video:vid-latest"
        assert result.metadata is not None
        assert result.metadata["recovered_from_artifact"] is True
        assert result.metadata["recovery_selected_artifact_id"] == "vid-latest"
        assert result.metadata["recovery_strategy"] == "latest_same_type"
        assert fake_client.artifacts.downloaded_video_ids == ["vid-latest"]

    asyncio.run(run_scenario())


def test_timeout_recovery_video_download_success(monkeypatch: pytest.MonkeyPatch) -> None:
    async def run_scenario() -> None:
        fake_client = FakeNotebookLMClient()
        now = datetime.now(UTC)
        fake_client.artifacts.video_artifacts = [
            FakeArtifact(
                id="vid-timeout-recovered",
                kind="video",
                created_at=now + timedelta(seconds=5),
            )
        ]

        generator = NotebookLMMediaGenerator(
            Settings(
                notebooklm_bridge_token="test-token",
                notebooklm_generation_mode="notebooklm",
                notebooklm_allow_fallback=False,
                notebooklm_poll_interval_seconds=0.01,
                notebooklm_generation_timeout_seconds=1.0,
            )
        )

        async def create_client() -> FakeNotebookLMClient:
            return fake_client

        async def force_timeout(**kwargs: object) -> FakeGenerationStatus:
            raise MediaGenerationTimeoutError("forced timeout for test")

        monkeypatch.setattr(generator, "_create_client", create_client)
        monkeypatch.setattr(generator, "_import_notebooklm_module", lambda: SimpleNamespace())
        monkeypatch.setattr(generator, "_wait_for_completion_with_progress", force_timeout)

        result = await generator.generate_video_overview(_build_course_request("course-timeout-video"))

        assert result.media_bytes == b"video:vid-timeout-recovered"
        assert result.metadata is not None
        assert result.metadata["recovered_from_artifact"] is True
        assert result.metadata["recovery_reason"] == "MediaGenerationTimeoutError"
        assert result.metadata["recovery_selected_artifact_id"] == "vid-timeout-recovered"
        assert result.metadata["artifact_id"] == "vid-timeout-recovered"
        assert result.metadata["task_id"] == "task-1"
        assert result.metadata["status"] == "recovered_from_completed_artifact"
        assert fake_client.artifacts.downloaded_video_ids == ["vid-timeout-recovered"]

    asyncio.run(run_scenario())


def test_timeout_recovery_audio_download_success(monkeypatch: pytest.MonkeyPatch) -> None:
    async def run_scenario() -> None:
        fake_client = FakeNotebookLMClient()
        now = datetime.now(UTC)
        fake_client.artifacts.audio_artifacts = [
            FakeArtifact(
                id="aud-timeout-recovered",
                kind="audio",
                created_at=now + timedelta(seconds=5),
            )
        ]

        generator = NotebookLMMediaGenerator(
            Settings(
                notebooklm_bridge_token="test-token",
                notebooklm_generation_mode="notebooklm",
                notebooklm_allow_fallback=False,
                notebooklm_poll_interval_seconds=0.01,
                notebooklm_generation_timeout_seconds=1.0,
            )
        )

        async def create_client() -> FakeNotebookLMClient:
            return fake_client

        async def force_timeout(**kwargs: object) -> FakeGenerationStatus:
            raise MediaGenerationTimeoutError("forced timeout for test")

        monkeypatch.setattr(generator, "_create_client", create_client)
        monkeypatch.setattr(generator, "_import_notebooklm_module", lambda: SimpleNamespace())
        monkeypatch.setattr(generator, "_wait_for_completion_with_progress", force_timeout)

        result = await generator.generate_audio(_build_course_request("course-timeout-audio"))

        assert result.media_bytes == b"audio:aud-timeout-recovered"
        assert result.metadata is not None
        assert result.metadata["recovered_from_artifact"] is True
        assert result.metadata["recovery_reason"] == "MediaGenerationTimeoutError"
        assert result.metadata["recovery_selected_artifact_id"] == "aud-timeout-recovered"
        assert result.metadata["artifact_id"] == "aud-timeout-recovered"
        assert result.metadata["task_id"] == "task-1"
        assert result.metadata["status"] == "recovered_from_completed_artifact"
        assert fake_client.artifacts.downloaded_audio_ids == ["aud-timeout-recovered"]

    asyncio.run(run_scenario())


def test_no_candidate_failure_preserves_timeout_error(monkeypatch: pytest.MonkeyPatch) -> None:
    async def run_scenario() -> None:
        fake_client = FakeNotebookLMClient()

        generator = NotebookLMMediaGenerator(
            Settings(
                notebooklm_bridge_token="test-token",
                notebooklm_generation_mode="notebooklm",
                notebooklm_allow_fallback=False,
                notebooklm_poll_interval_seconds=0.01,
                notebooklm_generation_timeout_seconds=1.0,
            )
        )

        async def create_client() -> FakeNotebookLMClient:
            return fake_client

        async def force_timeout(**kwargs: object) -> FakeGenerationStatus:
            raise MediaGenerationTimeoutError("forced timeout for test")

        monkeypatch.setattr(generator, "_create_client", create_client)
        monkeypatch.setattr(generator, "_import_notebooklm_module", lambda: SimpleNamespace())
        monkeypatch.setattr(generator, "_wait_for_completion_with_progress", force_timeout)

        with pytest.raises(MediaGenerationTimeoutError, match="forced timeout for test"):
            await generator.generate_audio(_build_course_request("course-no-candidates"))

        assert fake_client.artifacts.downloaded_audio_ids == []
        assert fake_client.artifacts.downloaded_video_ids == []

    asyncio.run(run_scenario())


def test_recovery_media_type_isolation_ignores_cross_type_candidates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def run_scenario() -> None:
        fake_client = FakeNotebookLMClient()
        now = datetime.now(UTC)
        fake_client.artifacts.all_artifacts = [
            FakeArtifact(
                id="vid-newer",
                kind="video",
                created_at=now + timedelta(minutes=1),
            ),
            FakeArtifact(
                id="aud-candidate",
                kind="audio",
                created_at=now + timedelta(seconds=5),
            ),
        ]
        fake_client.artifacts.list_audio = None  # force fallback list() path

        generator = NotebookLMMediaGenerator(
            Settings(
                notebooklm_bridge_token="test-token",
                notebooklm_generation_mode="notebooklm",
                notebooklm_allow_fallback=False,
                notebooklm_poll_interval_seconds=0.01,
                notebooklm_generation_timeout_seconds=1.0,
            )
        )

        async def create_client() -> FakeNotebookLMClient:
            return fake_client

        async def force_timeout(**kwargs: object) -> FakeGenerationStatus:
            raise MediaGenerationTimeoutError("forced timeout for test")

        monkeypatch.setattr(generator, "_create_client", create_client)
        monkeypatch.setattr(generator, "_import_notebooklm_module", lambda: SimpleNamespace())
        monkeypatch.setattr(generator, "_wait_for_completion_with_progress", force_timeout)

        result = await generator.generate_audio(_build_course_request("course-mixed-artifacts"))

        assert result.media_bytes == b"audio:aud-candidate"
        assert result.metadata is not None
        assert result.metadata["recovery_selected_artifact_id"] == "aud-candidate"
        assert result.metadata["recovery_candidate_count"] == 1
        assert result.metadata["recovery_preferred_candidate_count"] == 1
        assert fake_client.artifacts.downloaded_audio_ids == ["aud-candidate"]
        assert fake_client.artifacts.downloaded_video_ids == []

    asyncio.run(run_scenario())


def test_proactive_recovery_triggers_and_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    async def run_scenario() -> None:
        fake_client = FakeNotebookLMClient()
        now = datetime.now(UTC)
        fake_client.artifacts.audio_artifacts = [
            FakeArtifact(
                id="aud-proactive-recovered",
                kind="audio",
                created_at=now + timedelta(seconds=5),
            )
        ]

        generator = NotebookLMMediaGenerator(
            Settings(
                notebooklm_bridge_token="test-token",
                notebooklm_generation_mode="notebooklm",
                notebooklm_allow_fallback=False,
                notebooklm_poll_interval_seconds=0.01,
                notebooklm_generation_timeout_seconds=5.0,
                notebooklm_proactive_recovery_start_seconds=0.05,
                notebooklm_proactive_recovery_interval_seconds=0.05,
            )
        )

        async def create_client() -> FakeNotebookLMClient:
            return fake_client

        async def stuck_poll_status(notebook_id: str, task_id: str) -> FakeGenerationStatus:
            await asyncio.sleep(0.02)
            return FakeGenerationStatus(status="in_progress", task_id=task_id)

        monkeypatch.setattr(generator, "_create_client", create_client)
        monkeypatch.setattr(generator, "_import_notebooklm_module", lambda: SimpleNamespace())
        monkeypatch.setattr(fake_client.artifacts, "poll_status", stuck_poll_status)

        result = await generator.generate_audio(_build_course_request("course-proactive-audio"))

        assert result.media_bytes == b"audio:aud-proactive-recovered"
        assert result.metadata is not None
        assert result.metadata["recovered_from_artifact"] is True
        assert result.metadata["recovery_reason"].startswith("proactive_poll_")
        assert result.metadata["recovery_selected_artifact_id"] == "aud-proactive-recovered"
        assert fake_client.artifacts.downloaded_audio_ids == ["aud-proactive-recovered"]

    asyncio.run(run_scenario())


def test_recovery_prefers_matched_task_id(monkeypatch: pytest.MonkeyPatch) -> None:
    async def run_scenario() -> None:
        fake_client = FakeNotebookLMClient()
        fake_client.artifacts.poll_error = RuntimeError("poll transport failure")
        now = datetime.now(UTC)
        fake_client.artifacts.audio_artifacts = [
            FakeArtifact(
                id="art-wrong-task-id-but-perfect-time",
                kind="audio",
                created_at=now,
            ),
            FakeArtifact(
                id="task-1",
                kind="audio",
                created_at=now - timedelta(hours=3), # Far outside time window, but exact task match
            ),
        ]

        generator = NotebookLMMediaGenerator(
            Settings(
                notebooklm_bridge_token="test-token",
                notebooklm_generation_mode="notebooklm",
                notebooklm_allow_fallback=False,
                notebooklm_poll_interval_seconds=0.01,
                notebooklm_generation_timeout_seconds=1.0,
                notebooklm_poll_error_retry_limit=1,
            )
        )

        async def create_client() -> FakeNotebookLMClient:
            return fake_client

        monkeypatch.setattr(generator, "_create_client", create_client)
        monkeypatch.setattr(generator, "_import_notebooklm_module", lambda: SimpleNamespace())

        request = MediaGenerationRequest(
            lesson_title="Lesson 1",
            script="Script text",
            language="en",
            course_id="course-123",
        )
        result = await generator.generate_audio(request)

        assert result.metadata["recovery_selected_artifact_id"] == "task-1"
        assert result.metadata["recovery_strategy"] == "matched_task_id"
        assert fake_client.artifacts.downloaded_audio_ids == ["task-1"]

    asyncio.run(run_scenario())
