"""Focused tests for the Docling MCP runtime compatibility glue."""

import os
import unittest
import warnings
from unittest.mock import patch

from docling.datamodel.service.options import ConvertDocumentsOptions
from docling.service_client import DoclingServiceClient

import runtime


class RuntimeSettingsTest(unittest.TestCase):
    def test_applies_transport_and_ocr_settings_to_real_upstream_options(self) -> None:
        with patch.dict(
            os.environ,
            {
                "DOCLING_MCP_SERVICE_TIMEOUT": "1200",
                "DOCLING_MCP_SERVICE_MAX_RETRIES": "2",
                "DOCLING_MCP_OCR_PRESET": "easyocr",
                "DOCLING_MCP_OCR_LANG": "ru,en",
            },
            clear=False,
        ):
            runtime.apply_service_client_settings()

            with warnings.catch_warnings():
                warnings.simplefilter("ignore", DeprecationWarning)
                client = DoclingServiceClient(url="http://docling-serve:5001")
                options = ConvertDocumentsOptions(do_ocr=True)

        self.assertEqual(client._job_timeout, 1200.0)
        self.assertEqual(client._http_retries, 2)
        self.assertEqual(options.ocr_preset, "easyocr")
        self.assertEqual(options.ocr_lang, ["ru", "en"])
        self.assertFalse(options.force_ocr)
        self.assertFalse(options.do_pdf_heading_hierarchy)
        client.close()

    def test_pdf_heading_hierarchy_is_opt_in(self) -> None:
        with patch.dict(
            os.environ, {"DOCLING_MCP_PDF_HEADING_HIERARCHY": "true"}, clear=False
        ):
            runtime.apply_service_client_settings()
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", DeprecationWarning)
                options = ConvertDocumentsOptions(do_ocr=True)

        self.assertTrue(options.do_pdf_heading_hierarchy)

    def test_rejects_a_non_boolean_heading_hierarchy_flag(self) -> None:
        with patch.dict(
            os.environ, {"DOCLING_MCP_PDF_HEADING_HIERARCHY": "maybe"}, clear=False
        ):
            with self.assertRaises(ValueError):
                runtime.apply_service_client_settings()


class CacheKeyTest(unittest.TestCase):
    def setUp(self) -> None:
        from docling_mcp import docling_cache

        self.docling_cache = docling_cache
        self._original = docling_cache.get_cache_key
        self.addCleanup(setattr, docling_cache, "get_cache_key", self._original)

    def test_upstream_key_ignores_the_conversion_profile(self) -> None:
        """The gap this wrapper narrows, asserted against the real upstream."""
        self.assertEqual(
            self._original("/app/uploads/a.pdf"), self._original("/app/uploads/a.pdf")
        )

    def test_profile_change_produces_a_different_key(self) -> None:
        with patch.dict(
            os.environ, {"DOCLING_MCP_PDF_HEADING_HIERARCHY": "false"}, clear=False
        ):
            runtime.apply_cache_key_settings()
            without = self.docling_cache.get_cache_key("/app/uploads/a.pdf")

        setattr(self.docling_cache, "get_cache_key", self._original)
        with patch.dict(
            os.environ, {"DOCLING_MCP_PDF_HEADING_HIERARCHY": "true"}, clear=False
        ):
            runtime.apply_cache_key_settings()
            with_inference = self.docling_cache.get_cache_key("/app/uploads/a.pdf")

        self.assertNotEqual(without, with_inference)
        self.assertEqual(len(with_inference), 32)

    def test_same_profile_and_source_stay_stable(self) -> None:
        runtime.apply_cache_key_settings()
        first = self.docling_cache.get_cache_key("/app/uploads/a.pdf")
        second = self.docling_cache.get_cache_key("/app/uploads/a.pdf")
        self.assertEqual(first, second)
        self.assertNotEqual(first, self.docling_cache.get_cache_key("/app/uploads/b.pdf"))


if __name__ == "__main__":
    unittest.main()
