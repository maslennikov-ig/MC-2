import asyncio
import base64
import time
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.generator import GenerationResult, MediaGenerationError
from app.main import create_app, get_media_generator


captured_requests: list[tuple[str, object]] = []


class MockGenerator:
    async def generate_audio(self, request):
        captured_requests.append(("audio", request))
        return GenerationResult(
            media_bytes=b"mock-audio",
            mime_type="audio/mpeg",
            extension="mp3",
            duration_seconds=12.5,
            metadata={"provider": "mock"},
        )

    async def generate_video_overview(self, request):
        captured_requests.append(("video", request))
        return GenerationResult(
            media_bytes=b"mock-video",
            mime_type="video/mp4",
            extension="mp4",
            duration_seconds=42.0,
            metadata={"provider": "mock"},
        )


class FailingAudioGenerator:
    async def generate_audio(self, request):
        raise MediaGenerationError("Missing required NotebookLM cookie SID")

    async def generate_video_overview(self, request):
        raise MediaGenerationError("Video generation should not be called")


class SlowMockGenerator(MockGenerator):
    async def generate_audio(self, request):
        await asyncio.sleep(0.05)
        return await super().generate_audio(request)

    async def generate_video_overview(self, request):
        await asyncio.sleep(0.05)
        return await super().generate_video_overview(request)


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    captured_requests.clear()
    app = create_app(
        settings=Settings(
            notebooklm_bridge_token="test-token",
            notebooklm_generation_mode="fallback",
            notebooklm_generation_timeout_seconds=30,
            notebooklm_poll_interval_seconds=0.01,
            notebooklm_allow_fallback=True,
        )
    )
    app.dependency_overrides[get_media_generator] = lambda: MockGenerator()

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def async_client() -> Generator[TestClient, None, None]:
    captured_requests.clear()
    app = create_app(
        settings=Settings(
            notebooklm_bridge_token="test-token",
            notebooklm_generation_mode="fallback",
            notebooklm_generation_timeout_seconds=30,
            notebooklm_poll_interval_seconds=0.01,
            notebooklm_allow_fallback=True,
        )
    )
    app.dependency_overrides[get_media_generator] = lambda: SlowMockGenerator()

    with TestClient(app) as test_client:
        yield test_client


def _wait_for_terminal_status(
    client: TestClient, status_path: str, *, timeout_seconds: float = 2.0
) -> dict[str, object]:
    started_at = time.time()
    while time.time() - started_at < timeout_seconds:
        status_response = client.get(
            status_path,
            headers={"Authorization": "Bearer test-token"},
        )
        assert status_response.status_code == 200
        payload = status_response.json()
        if payload["status"] in {"completed", "failed"}:
            return payload
        time.sleep(0.02)

    pytest.fail(f"Timed out waiting for task completion via {status_path}")


def test_health_endpoint_returns_status(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_auth_required_for_audio_generation(client: TestClient) -> None:
    response = client.post(
        "/artifacts/generate-audio",
        json={
            "lesson_title": "Lesson 1",
            "script": "hello",
            "language": "en",
        },
    )

    assert response.status_code == 401


def test_validation_error_for_empty_script(client: TestClient) -> None:
    response = client.post(
        "/video/generate-overview",
        headers={"Authorization": "Bearer test-token"},
        json={
            "lesson_title": "Lesson 1",
            "script": "   ",
            "language": "en",
        },
    )

    assert response.status_code == 422


def test_success_audio_generation_returns_contract_shape(client: TestClient) -> None:
    response = client.post(
        "/artifacts/generate-audio",
        headers={"Authorization": "Bearer test-token"},
        json={
            "lesson_title": "Lesson 1",
            "script": "audio script",
            "language": "en",
            "voice": "alloy",
        },
    )

    assert response.status_code == 200

    payload = response.json()
    assert payload["audio_base64"] == base64.b64encode(b"mock-audio").decode("ascii")
    assert payload["mime_type"] == "audio/mpeg"
    assert payload["extension"] == "mp3"
    assert payload["duration_seconds"] == 12.5
    assert payload["metadata"]["provider"] == "mock"


def test_audio_generation_accepts_sources_and_presets(client: TestClient) -> None:
    response = client.post(
        "/artifacts/generate-audio",
        headers={"Authorization": "Bearer test-token"},
        json={
            "lesson_title": "Lesson 1",
            "script": "audio script",
            "language": "en",
            "voice": "alloy",
            "sources": [
                {"title": "Script", "content": "audio script"},
                {"title": "Raw Lesson", "content": "# Raw markdown"},
            ],
            "audio_format": "deep_dive",
            "audio_length": "default",
            "target_duration_minutes": 5,
            "duration_range_min_minutes": 4,
            "duration_range_max_minutes": 7,
        },
    )

    assert response.status_code == 200
    assert captured_requests, "Expected generator to receive request"

    req_type, request = captured_requests[-1]
    assert req_type == "audio"
    assert request.audio_format == "deep_dive"
    assert request.audio_length == "default"
    assert request.target_duration_minutes == 5
    assert request.duration_range_min_minutes == 4
    assert request.duration_range_max_minutes == 7
    assert request.sources is not None
    assert len(request.sources) == 2
    assert request.sources[0].title == "Script"
    assert request.sources[1].content == "# Raw markdown"


def test_success_video_generation_returns_contract_shape(client: TestClient) -> None:
    response = client.post(
        "/video/generate-overview",
        headers={"Authorization": "Bearer test-token"},
        json={
            "lesson_title": "Lesson 1",
            "script": "video script",
            "language": "en",
        },
    )

    assert response.status_code == 200

    payload = response.json()
    assert payload["video_base64"] == base64.b64encode(b"mock-video").decode("ascii")
    assert payload["mime_type"] == "video/mp4"
    assert payload["extension"] == "mp4"
    assert payload["duration_seconds"] == 42.0
    assert payload["metadata"]["provider"] == "mock"


def test_video_generation_accepts_sources_and_presets(client: TestClient) -> None:
    response = client.post(
        "/video/generate-overview",
        headers={"Authorization": "Bearer test-token"},
        json={
            "lesson_title": "Lesson 1",
            "script": "video script",
            "language": "en",
            "sources": [
                {"title": "Draft Script", "content": "video script"},
                {"title": "Objectives", "content": "- Objective A"},
            ],
            "video_format": "explainer",
            "video_style": "auto_select",
            "target_duration_minutes": 5,
            "duration_range_min_minutes": 4,
            "duration_range_max_minutes": 7,
        },
    )

    assert response.status_code == 200
    assert captured_requests, "Expected generator to receive request"

    req_type, request = captured_requests[-1]
    assert req_type == "video"
    assert request.video_format == "explainer"
    assert request.video_style == "auto_select"
    assert request.target_duration_minutes == 5
    assert request.duration_range_min_minutes == 4
    assert request.duration_range_max_minutes == 7
    assert request.sources is not None
    assert len(request.sources) == 2
    assert request.sources[0].title == "Draft Script"
    assert request.sources[1].content == "- Objective A"


def test_extra_fields_rejected_by_model(client: TestClient) -> None:
    """Ensure extra fields are rejected (extra='forbid').

    This guards against contract mismatches where the TS client sends
    fields that the Python model does not expect.
    """
    response = client.post(
        "/artifacts/generate-audio",
        headers={"Authorization": "Bearer test-token"},
        json={
            "lesson_title": "Lesson 1",
            "script": "hello",
            "language": "en",
            "unexpected_field": "should fail",
        },
    )

    assert response.status_code == 422


def test_audio_generation_returns_detailed_bridge_error() -> None:
    app = create_app(
        settings=Settings(
            notebooklm_bridge_token="test-token",
            notebooklm_generation_mode="notebooklm",
            notebooklm_generation_timeout_seconds=30,
            notebooklm_poll_interval_seconds=0.01,
            notebooklm_allow_fallback=False,
        )
    )
    app.dependency_overrides[get_media_generator] = lambda: FailingAudioGenerator()

    with TestClient(app) as test_client:
        response = test_client.post(
            "/artifacts/generate-audio",
            headers={"Authorization": "Bearer test-token"},
            json={
                "lesson_title": "Lesson 1",
                "script": "audio script",
                "language": "en",
            },
        )

    assert response.status_code == 502
    assert "Missing required NotebookLM cookie SID" in response.json()["detail"]


def test_audio_async_lifecycle_start_status_result(async_client: TestClient) -> None:
    start_response = async_client.post(
        "/artifacts/generate-audio/start",
        headers={"Authorization": "Bearer test-token"},
        json={
            "lesson_title": "Lesson 1",
            "script": "audio script",
            "language": "en",
            "course_id": "course-abc",
        },
    )

    assert start_response.status_code == 202
    start_payload = start_response.json()
    assert start_payload["status"] == "queued"
    task_id = start_payload["task_id"]
    assert isinstance(task_id, str) and task_id

    first_result = async_client.get(
        f"/artifacts/generate-audio/{task_id}/result",
        headers={"Authorization": "Bearer test-token"},
    )
    assert first_result.status_code == 200
    first_result_payload = first_result.json()
    assert first_result_payload["task_id"] == task_id
    assert first_result_payload["artifact"] is None

    terminal_status = _wait_for_terminal_status(
        async_client,
        f"/artifacts/generate-audio/{task_id}/status",
    )
    assert terminal_status["task_id"] == task_id
    assert terminal_status["status"] == "completed"

    final_result = async_client.get(
        f"/artifacts/generate-audio/{task_id}/result",
        headers={"Authorization": "Bearer test-token"},
    )
    assert final_result.status_code == 200
    payload = final_result.json()
    assert payload["status"] == "completed"
    assert payload["artifact"]["audio_base64"] == base64.b64encode(b"mock-audio").decode("ascii")
    assert payload["artifact"]["mime_type"] == "audio/mpeg"
    assert payload["artifact"]["extension"] == "mp3"


def test_video_async_lifecycle_start_status_result(async_client: TestClient) -> None:
    start_response = async_client.post(
        "/video/generate-overview/start",
        headers={"Authorization": "Bearer test-token"},
        json={
            "lesson_title": "Lesson 2",
            "script": "video script",
            "language": "en",
            "course_id": "course-xyz",
        },
    )

    assert start_response.status_code == 202
    start_payload = start_response.json()
    assert start_payload["status"] == "queued"
    task_id = start_payload["task_id"]
    assert isinstance(task_id, str) and task_id

    terminal_status = _wait_for_terminal_status(
        async_client,
        f"/video/generate-overview/{task_id}/status",
    )
    assert terminal_status["status"] == "completed"

    final_result = async_client.get(
        f"/video/generate-overview/{task_id}/result",
        headers={"Authorization": "Bearer test-token"},
    )
    assert final_result.status_code == 200
    payload = final_result.json()
    assert payload["status"] == "completed"
    assert payload["artifact"]["video_base64"] == base64.b64encode(b"mock-video").decode("ascii")
    assert payload["artifact"]["mime_type"] == "video/mp4"
    assert payload["artifact"]["extension"] == "mp4"
