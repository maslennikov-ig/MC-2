"""Runtime glue for declared Docling MCP service-client settings.

Docling MCP declares ``service_timeout`` and ``service_max_retries`` and does
not pass them to ``DoclingServiceClient``. Verified still true in 3.1.0, whose
remote converter constructs the client with ``url`` and ``api_key`` alone. Keep
the upstream package unmodified and remove this wrapper after a release wires
both fields (mc2-vlskb).

**Most of the cache-key half is gone, because upstream fixed it** (mc2-ibzcc).
Until 3.1.0, ``docling_mcp.docling_cache.get_cache_key`` hashed only the source
string and the OCR flags, so two conversions of one source under different
pipeline options shared an entry and the second silently returned the first
one's artifact; this file folded a fingerprint of seven environment variables
into the key. 3.1.0 does more than that fingerprint did — a local file is keyed
by its content digest rather than its path, every setting in the model enters
the key except an explicit not-output-relevant list, and the installed package
versions are stamped in — and it changed the signature to
``get_cache_key(source, conversion=None)``.

What upstream cannot see is what THIS file injects. MEASURED at build time
against 3.1.0: ``remote_conversion_context()["options"]`` is exactly
``service_url``, ``keep_images``, ``images_scale``, ``do_ocr`` and
``do_table_structure``. ``ocr_preset``, ``ocr_lang`` and
``do_pdf_heading_hierarchy`` are absent from it because they are not docling-mcp
settings at all — they are forced onto ``ConvertDocumentsOptions`` above, so
docling-mcp has no way of knowing a conversion used them. Flipping
``DOCLING_MCP_PDF_HEADING_HIERARCHY`` would leave the key unchanged and serve
the artifact produced without it, which is the original defect in miniature.

So the wrapper keeps exactly the three options it is responsible for and hands
everything else to upstream. It shrinks when the wrapper above shrinks, and it
disappears with it. The build-time test asserts both halves, and it is what
caught this: the first attempt at this commit deleted the whole thing.
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


def injected_conversion_options() -> dict[str, object]:
    """The options this file forces on, which docling-mcp cannot see."""
    return {
        "ocr_preset": os.environ.get("DOCLING_MCP_OCR_PRESET", "easyocr"),
        "ocr_lang": os.environ.get("DOCLING_MCP_OCR_LANG", "ru,en"),
        "pdf_heading_hierarchy": os.environ.get(
            "DOCLING_MCP_PDF_HEADING_HIERARCHY", "false"
        ),
    }


def apply_cache_key_settings() -> None:
    """Add the injected options to upstream's conversion context."""
    from docling_mcp import docling_cache

    original = docling_cache.get_cache_key
    injected = injected_conversion_options()

    @wraps(original)
    def keyed_with_injected_options(source, conversion=None):
        # A converter that passes its own context is keyed by the converter that
        # actually ran, and that has to be preserved rather than replaced.
        context = (
            dict(conversion)
            if conversion is not None
            else docling_cache._default_conversion_context()
        )
        context["mc2_injected_options"] = injected
        return original(source, context)

    docling_cache.get_cache_key = keyed_with_injected_options


if __name__ == "__main__":
    apply_service_client_settings()
    # Patch the cache before the converters import the symbol by value.
    apply_cache_key_settings()
    from docling_mcp.servers.mcp_server import app

    app()
