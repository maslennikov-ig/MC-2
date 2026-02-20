import base64
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.generator import GenerationResult
from app.main import create_app, get_media_generator


class MockGenerator:
    async def generate_audio(self, request):
        return GenerationResult(
            media_bytes=b"mock-audio",
            mime_type="audio/mpeg",
            extension="mp3",
            duration_seconds=12.5,
            metadata={"provider": "mock"},
        )

    async def generate_video_overview(self, request):
        return GenerationResult(
            media_bytes=b"mock-video",
            mime_type="video/mp4",
            extension="mp4",
            duration_seconds=42.0,
            metadata={"provider": "mock"},
        )


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
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
