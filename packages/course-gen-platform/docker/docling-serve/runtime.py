"""Runtime glue for the declared but unwired PDF heading-hierarchy option.

MEASURED on this exact stack (docling-serve 1.29.0, docling-slim 2.118.0,
docling-core 2.90.0) on 2026-08-05:

* ``ConvertDocumentsOptions`` declares ``do_pdf_heading_hierarchy`` and
  ``pdf_heading_hierarchy_options`` and the API accepts them;
* ``DoclingConverterManager._parse_standard_pdf_opts`` in ``docling_jobkit``
  builds ``PdfPipelineOptions`` field by field and never assigns
  ``heading_hierarchy_options``, so both request fields are silently dropped;
* sending ``do_pdf_heading_hierarchy: true`` therefore returns byte-identical
  output, while calling the library directly with
  ``heading_hierarchy_options.enabled = True`` promotes numbered subsections
  (``3.1``, ``3.2``) from level 1 to level 2 on the same document.

This wrapper closes only that gap. Upstream packages stay unmodified; delete
this file once a released ``docling_jobkit`` passes the field through.

Same pattern, and same removal rule, as ``docker/docling-mcp/runtime.py``.
"""

import os
from functools import wraps


def _flag(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    value = raw.strip().lower()
    if value in {"true", "1", "yes", "on"}:
        return True
    if value in {"false", "0", "no", "off", ""}:
        return False
    raise ValueError(f"{name} must be a boolean value, got {raw!r}")


def apply_heading_hierarchy_settings() -> None:
    """Pass the request's heading-hierarchy intent into the pipeline options."""
    from docling_jobkit.convert.manager import DoclingConverterManager

    original = DoclingConverterManager._parse_standard_pdf_opts
    default_enabled = _flag("DOCLING_SERVE_PDF_HEADING_HIERARCHY", False)

    @wraps(original)
    def parse_with_heading_hierarchy(self, request, artifacts_path):
        options = original(self, request, artifacts_path)
        enabled = bool(getattr(request, "do_pdf_heading_hierarchy", False)) or default_enabled
        requested = getattr(request, "pdf_heading_hierarchy_options", None)
        if requested is not None:
            options.heading_hierarchy_options = requested.model_copy(
                update={"enabled": enabled}
            )
        else:
            options.heading_hierarchy_options.enabled = enabled
        return options

    DoclingConverterManager._parse_standard_pdf_opts = parse_with_heading_hierarchy


if __name__ == "__main__":
    apply_heading_hierarchy_settings()
    from docling_serve.__main__ import main

    raise SystemExit(main())
