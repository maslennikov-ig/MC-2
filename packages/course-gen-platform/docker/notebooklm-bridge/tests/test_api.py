import asyncio
import base64
import json
import pathlib
import socket
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
    payload = response.json()
    assert payload["service"] == "notebooklm-bridge"
    # `status` is "degraded" here on purpose: the test app configures no proxy
    # and no auth. This assertion used to read `== "ok"` and had been failing
    # since the proxy check was added — unnoticed, because no CI job runs this
    # suite.
    assert payload["status"] == "degraded"
    assert {check["name"] for check in payload["checks"]} >= {"proxy", "auth_expiry"}


def test_health_reports_an_unreachable_proxy_as_failing(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A name is not a route.

    On 2026-08-22 the geo-bypass tunnel was down — nothing listening on the
    forwarded port — and both bridges reported the proxy check as passing,
    because the check only asked whether the variable was set. NotebookLM was
    unreachable the whole time and the container said healthy.
    """
    # Port 1 on the loopback: nothing listens there, and it refuses instantly.
    monkeypatch.setenv("HTTPS_PROXY", "socks5h://127.0.0.1:1")

    payload = client.get("/health").json()
    proxy = next(check for check in payload["checks"] if check["name"] == "proxy")

    assert proxy["passed"] is False
    assert "unreachable" in proxy["message"]
    # The port is named so an operator can see which hop died; no credentials.
    assert "127.0.0.1:1" in proxy["message"]
    assert payload["status"] == "degraded"


def test_health_proxy_check_passes_when_something_is_listening(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen(1)
        monkeypatch.setenv("HTTPS_PROXY", f"socks5h://127.0.0.1:{listener.getsockname()[1]}")

        payload = client.get("/health").json()

    proxy = next(check for check in payload["checks"] if check["name"] == "proxy")
    assert proxy["passed"] is True
    assert "reachable" in proxy["message"]


def test_health_reports_cookie_expiry_without_naming_a_cookie(
    client: TestClient, tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    expired_at = time.time() - 86_400
    state = tmp_path / "storage_state.json"
    state.write_text(
        json.dumps(
            {
                "cookies": [
                    {"name": "SID", "value": "secret-value", "expires": expired_at},
                    {"name": "HSID", "value": "another-secret", "expires": time.time() + 86_400},
                ]
            }
        ),
        encoding="utf-8",
    )

    app = create_app(
        settings=Settings(
            notebooklm_bridge_token="test-token",
            notebooklm_generation_mode="fallback",
            notebooklm_allow_fallback=True,
            notebooklm_storage_path=str(state),
        )
    )
    monkeypatch.delenv("HTTPS_PROXY", raising=False)
    monkeypatch.delenv("HTTP_PROXY", raising=False)

    with TestClient(app) as probe:
        payload = probe.get("/health").json()

    expiry = next(check for check in payload["checks"] if check["name"] == "auth_expiry")
    assert expiry["passed"] is False
    assert "secret-value" not in expiry["message"]
    assert "SID" not in expiry["message"]


def _health_with_cookies(
    cookies: list[dict[str, object]],
    tmp_path: pathlib.Path,
    monkeypatch: pytest.MonkeyPatch,
) -> dict[str, object]:
    state = tmp_path / "storage_state.json"
    state.write_text(json.dumps({"cookies": cookies}), encoding="utf-8")
    app = create_app(
        settings=Settings(
            notebooklm_bridge_token="test-token",
            notebooklm_generation_mode="fallback",
            notebooklm_allow_fallback=True,
            notebooklm_storage_path=str(state),
        )
    )
    monkeypatch.delenv("HTTPS_PROXY", raising=False)
    monkeypatch.delenv("HTTP_PROXY", raising=False)
    with TestClient(app) as probe:
        payload = probe.get("/health").json()
    return next(c for c in payload["checks"] if c["name"] == "auth_expiry")


def test_short_lived_helper_cookie_does_not_condemn_a_live_session(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A fresh login must not read as expired.

    Google ships helpers next to the session. The login captured 2026-08-24
    carried CONSISTENCY expiring the same day while SID and its siblings were
    good for 399 — and the old min()-over-everything check called that file
    expired hours after it was minted. An alarm that fires on day one is how a
    real expiry goes unnoticed for four months.
    """
    expiry = _health_with_cookies(
        [
            {"name": "CONSISTENCY", "value": "x", "expires": time.time() + 60},
            {"name": "SID", "value": "x", "expires": time.time() + 399 * 86_400},
            {"name": "__Secure-1PSID", "value": "x", "expires": time.time() + 399 * 86_400},
        ],
        tmp_path,
        monkeypatch,
    )

    assert expiry["passed"] is True
    assert "renew soon" not in expiry["message"]


def test_a_file_without_a_session_cookie_is_not_healthy(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No session cookie is a dead file, not an unexpiring one.

    The old branch answered "No expiring cookies stored" and passed, so a
    storage_state holding nothing that can authenticate reported healthy.
    """
    expiry = _health_with_cookies(
        [{"name": "NID", "value": "x", "expires": time.time() + 180 * 86_400}],
        tmp_path,
        monkeypatch,
    )

    assert expiry["passed"] is False
    assert "session cookie" in expiry["message"]


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


# ── Slide deck, report and data table (mc2-6ye5z.4/.5/.8) ──────────────────
#
# Their `enrichment_type` enum values were applied to the database on
# 2026-08-22 and nothing could produce one: the bridge had no endpoint. These
# cover the half that makes them real. Live proof still waits on the NotebookLM
# cookies (mc2-3lo22); what is provable without them is the contract.


class ArtifactMockGenerator(MockGenerator):
    """Answers the three new artifact types with recognisable bytes."""

    async def generate_slide_deck(self, request):
        captured_requests.append(("slide_deck", request))
        return GenerationResult(
            media_bytes=b"%PDF-mock-deck",
            mime_type="application/pdf",
            extension="pdf",
            duration_seconds=None,
            metadata={"slide_deck_output_format": "pdf"},
        )

    async def generate_report(self, request):
        captured_requests.append(("report", request))
        return GenerationResult(
            media_bytes=b"# mock briefing",
            mime_type="text/markdown",
            extension="md",
            duration_seconds=None,
            metadata={"report_format": "briefing_doc"},
        )

    async def generate_data_table(self, request):
        captured_requests.append(("data_table", request))
        return GenerationResult(
            media_bytes=b"term,definition\nmock,value\n",
            mime_type="text/csv",
            extension="csv",
            duration_seconds=None,
            metadata={},
        )


@pytest.fixture
def artifact_client() -> Generator[TestClient, None, None]:
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
    app.dependency_overrides[get_media_generator] = lambda: ArtifactMockGenerator()

    with TestClient(app) as test_client:
        yield test_client


def test_slide_deck_lifecycle_returns_binary_artifact(artifact_client: TestClient) -> None:
    start_response = artifact_client.post(
        "/artifacts/slide-deck/start",
        headers={"Authorization": "Bearer test-token"},
        json={
            "lesson_title": "Lesson 3",
            "script": "deck script",
            "language": "ru",
            "course_id": "course-deck",
            "slide_deck_format": "presenter_slides",
            "slide_deck_length": "short",
            "slide_deck_output_format": "pdf",
        },
    )
    assert start_response.status_code == 202
    task_id = start_response.json()["task_id"]

    terminal = _wait_for_terminal_status(
        artifact_client, f"/artifacts/slide-deck/{task_id}/status"
    )
    assert terminal["status"] == "completed"
    assert terminal["media_type"] == "slide_deck"

    result = artifact_client.get(
        f"/artifacts/slide-deck/{task_id}/result",
        headers={"Authorization": "Bearer test-token"},
    )
    assert result.status_code == 200
    payload = result.json()
    # Not `image_base64`: this endpoint returns PDF or PPTX, so the field is
    # named for what it is and the mime type travels with it.
    assert payload["artifact"]["artifact_base64"] == base64.b64encode(b"%PDF-mock-deck").decode(
        "ascii"
    )
    assert payload["artifact"]["mime_type"] == "application/pdf"
    assert payload["artifact"]["extension"] == "pdf"

    media_type, request = captured_requests[-1]
    assert media_type == "slide_deck"
    assert request.slide_deck_format == "presenter_slides"
    assert request.slide_deck_length == "short"


def test_report_lifecycle_returns_markdown(artifact_client: TestClient) -> None:
    start_response = artifact_client.post(
        "/artifacts/report/start",
        headers={"Authorization": "Bearer test-token"},
        json={
            "lesson_title": "Lesson 4",
            "script": "report script",
            "language": "en",
            "course_id": "course-report",
            "report_format": "briefing_doc",
        },
    )
    assert start_response.status_code == 202
    task_id = start_response.json()["task_id"]

    terminal = _wait_for_terminal_status(artifact_client, f"/artifacts/report/{task_id}/status")
    assert terminal["status"] == "completed"

    result = artifact_client.get(
        f"/artifacts/report/{task_id}/result",
        headers={"Authorization": "Bearer test-token"},
    )
    assert result.status_code == 200
    payload = result.json()
    assert payload["media_type"] == "report"
    assert payload["artifact"]["content"] == "# mock briefing"
    assert payload["artifact"]["content_type"] == "text/markdown"


def test_data_table_lifecycle_returns_csv(artifact_client: TestClient) -> None:
    start_response = artifact_client.post(
        "/artifacts/data-table/start",
        headers={"Authorization": "Bearer test-token"},
        json={
            "lesson_title": "Lesson 5",
            "script": "table script",
            "language": "en",
            "course_id": "course-table",
            "artifact_instructions": "one row per key term",
        },
    )
    assert start_response.status_code == 202
    task_id = start_response.json()["task_id"]

    terminal = _wait_for_terminal_status(artifact_client, f"/artifacts/data-table/{task_id}/status")
    assert terminal["status"] == "completed"

    result = artifact_client.get(
        f"/artifacts/data-table/{task_id}/result",
        headers={"Authorization": "Bearer test-token"},
    )
    assert result.status_code == 200
    payload = result.json()
    assert payload["media_type"] == "data_table"
    # CSV, not markdown: a consumer that parses this must not be handed prose.
    assert payload["artifact"]["content_type"] == "text/csv"
    assert payload["artifact"]["content"].startswith("term,definition")

    _, request = captured_requests[-1]
    assert request.artifact_instructions == "one row per key term"


def test_new_artifact_endpoints_require_the_bearer_token(
    artifact_client: TestClient,
) -> None:
    for path in (
        "/artifacts/slide-deck/start",
        "/artifacts/report/start",
        "/artifacts/data-table/start",
    ):
        response = artifact_client.post(
            path,
            json={"lesson_title": "L", "script": "s", "language": "en"},
        )
        assert response.status_code == 401, path
