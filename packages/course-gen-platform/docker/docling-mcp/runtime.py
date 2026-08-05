"""Runtime glue for declared Docling MCP 3 service-client settings.

Docling MCP 3.0.0 declares ``service_timeout`` and ``service_max_retries`` but
does not pass them to ``DoclingServiceClient``. Keep the upstream package
unmodified and remove this wrapper after an upstream release wires both fields.
"""

import os
from functools import wraps

from docling.datamodel.service.options import ConvertDocumentsOptions
from docling.service_client import DoclingServiceClient


def _positive_float(name: str, default: float) -> float:
    value = float(os.environ.get(name, default))
    if value <= 0:
        raise ValueError(f"{name} must be positive")
    return value


def _non_negative_int(name: str, default: int) -> int:
    value = int(os.environ.get(name, default))
    if value < 0:
        raise ValueError(f"{name} must be non-negative")
    return value


def _csv(name: str, default: str) -> list[str]:
    values = [item.strip() for item in os.environ.get(name, default).split(",")]
    values = [item for item in values if item]
    if not values:
        raise ValueError(f"{name} must contain at least one value")
    return values


def apply_service_client_settings() -> None:
    original_init = DoclingServiceClient.__init__
    original_options_init = ConvertDocumentsOptions.__init__
    timeout = _positive_float("DOCLING_MCP_SERVICE_TIMEOUT", 300.0)
    retries = _non_negative_int("DOCLING_MCP_SERVICE_MAX_RETRIES", 3)
    ocr_preset = os.environ.get("DOCLING_MCP_OCR_PRESET", "easyocr").strip()
    if not ocr_preset:
        raise ValueError("DOCLING_MCP_OCR_PRESET must not be empty")
    ocr_languages = _csv("DOCLING_MCP_OCR_LANG", "ru,en")

    @wraps(original_init)
    def configured_init(self, *args, **kwargs):
        kwargs.setdefault("job_timeout", timeout)
        kwargs.setdefault("http_retries", retries)
        original_init(self, *args, **kwargs)

    @wraps(original_options_init)
    def configured_options_init(self, *args, **kwargs):
        kwargs.setdefault("ocr_preset", ocr_preset)
        kwargs.setdefault("ocr_lang", ocr_languages)
        original_options_init(self, *args, **kwargs)

    DoclingServiceClient.__init__ = configured_init
    ConvertDocumentsOptions.__init__ = configured_options_init


if __name__ == "__main__":
    apply_service_client_settings()
    from docling_mcp.servers.mcp_server import app

    app()
