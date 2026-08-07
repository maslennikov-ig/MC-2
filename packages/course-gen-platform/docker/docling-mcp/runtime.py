"""Runtime glue for declared Docling MCP 3 service-client settings.

Docling MCP 3.0.0 declares ``service_timeout`` and ``service_max_retries`` but
does not pass them to ``DoclingServiceClient``. Keep the upstream package
unmodified and remove this wrapper after an upstream release wires both fields.

It also narrows one cache-correctness gap. MEASURED 2026-08-05:
``docling_mcp.docling_cache.get_cache_key`` hashes only the source string and
the OCR flags, so two conversions of the same source with different pipeline
options — heading-hierarchy inference, table mode, image scale — share a cache
entry and the second silently returns the first one's artifact. The wrapper
folds the behaviour-affecting conversion profile into the key. Delete it once
upstream keys the cache on the options it actually converted with.
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


def _flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    value = raw.strip().lower()
    if value in {"true", "1", "yes", "on"}:
        return True
    if value in {"false", "0", "no", "off", ""}:
        return False
    raise ValueError(f"{name} must be a boolean value, got {raw!r}")


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
    # Feature-flagged PDF section-header level inference. Off by default, so the
    # production conversion profile is unchanged until the flag is set. Serve
    # honours the request field natively since jobkit 3.3.0; the wrapper that
    # used to be needed on that side is gone.
    pdf_heading_hierarchy = _flag("DOCLING_MCP_PDF_HEADING_HIERARCHY", False)

    @wraps(original_init)
    def configured_init(self, *args, **kwargs):
        kwargs.setdefault("job_timeout", timeout)
        kwargs.setdefault("http_retries", retries)
        original_init(self, *args, **kwargs)

    @wraps(original_options_init)
    def configured_options_init(self, *args, **kwargs):
        kwargs.setdefault("ocr_preset", ocr_preset)
        kwargs.setdefault("ocr_lang", ocr_languages)
        kwargs.setdefault("do_pdf_heading_hierarchy", pdf_heading_hierarchy)
        original_options_init(self, *args, **kwargs)

    DoclingServiceClient.__init__ = configured_init
    ConvertDocumentsOptions.__init__ = configured_options_init


def conversion_profile_fingerprint() -> str:
    """Every environment setting that changes what a conversion produces."""
    parts = [
        f"ocr={os.environ.get('DOCLING_MCP_DO_OCR', 'true')}",
        f"preset={os.environ.get('DOCLING_MCP_OCR_PRESET', 'easyocr')}",
        f"lang={os.environ.get('DOCLING_MCP_OCR_LANG', 'ru,en')}",
        f"tables={os.environ.get('DOCLING_MCP_DO_TABLE_STRUCTURE', 'true')}",
        f"scale={os.environ.get('DOCLING_MCP_IMAGES_SCALE', '2.0')}",
        f"images={os.environ.get('DOCLING_MCP_KEEP_IMAGES', 'false')}",
        f"headings={os.environ.get('DOCLING_MCP_PDF_HEADING_HIERARCHY', 'false')}",
    ]
    return ";".join(parts)


def apply_cache_key_settings() -> None:
    """Include the conversion profile in the document cache key."""
    from docling_mcp import docling_cache

    original = docling_cache.get_cache_key
    profile = conversion_profile_fingerprint()

    @wraps(original)
    def keyed_by_profile(source, enable_ocr=False, ocr_language=None):
        return original(f"{source}\nprofile:{profile}", enable_ocr, ocr_language)

    docling_cache.get_cache_key = keyed_by_profile


if __name__ == "__main__":
    apply_service_client_settings()
    # Patch the cache before the converters import the symbol by value.
    apply_cache_key_settings()
    from docling_mcp.servers.mcp_server import app

    app()
