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
    """Who covers what in the cache key, asserted against the real package.

    Upstream 3.1.0 keys a local file by its content digest, folds every setting
    in its own model into the key except an explicit not-output-relevant list,
    and stamps the installed package versions. That replaced most of what
    ``runtime.py`` used to do by hand. What it cannot cover is the three options
    ``runtime.py`` forces onto ``ConvertDocumentsOptions``, because they are not
    docling-mcp settings and nothing upstream knows a conversion used them.

    Every assertion is against the installed package, because this question was
    once answered from a comment and the comment was nine months stale.
    """

    def setUp(self) -> None:
        from docling_mcp import docling_cache

        self.docling_cache = docling_cache
        self._original = docling_cache.get_cache_key
        self.addCleanup(setattr, docling_cache, "get_cache_key", self._original)

    def test_upstream_keys_on_its_own_conversion_settings(self) -> None:
        """The gap the old wrapper existed for: closed upstream."""
        baseline = self._original("/app/uploads/a.pdf", {"mode": "remote", "opt": 1})
        changed = self._original("/app/uploads/a.pdf", {"mode": "remote", "opt": 2})

        self.assertNotEqual(baseline, changed)
        self.assertEqual(len(baseline), 32)

    def test_upstream_covers_the_output_relevant_settings_it_owns(self) -> None:
        from docling_mcp.docling_cache import remote_conversion_context

        options = remote_conversion_context()["options"]

        for setting in ("do_ocr", "do_table_structure", "images_scale", "keep_images"):
            self.assertIn(setting, options, f"{setting} left the cache key")
        # Transport settings must NOT be in it: a different timeout does not
        # produce a different document, and keying on one would invalidate every
        # cached conversion whenever the timeout is tuned.
        for setting in ("service_timeout", "service_max_retries"):
            self.assertNotIn(setting, options)

    def test_upstream_cannot_see_the_options_this_file_injects(self) -> None:
        """Why the wrapper still exists, stated as a measurement."""
        from docling_mcp.docling_cache import remote_conversion_context

        options = remote_conversion_context()["options"]

        for setting in ("ocr_preset", "ocr_lang", "do_pdf_heading_hierarchy"):
            self.assertNotIn(setting, options)

    def test_an_injected_option_changes_the_key(self) -> None:
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

    def test_a_converter_supplied_context_is_preserved_not_replaced(self) -> None:
        """A fallback conversion stays keyed by the converter that actually ran."""
        runtime.apply_cache_key_settings()

        remote = self.docling_cache.get_cache_key("/app/uploads/a.pdf", {"mode": "remote"})
        local = self.docling_cache.get_cache_key("/app/uploads/a.pdf", {"mode": "local"})

        self.assertNotEqual(remote, local)

    def test_same_source_and_profile_stay_stable(self) -> None:
        runtime.apply_cache_key_settings()

        first = self.docling_cache.get_cache_key("/app/uploads/a.pdf")
        second = self.docling_cache.get_cache_key("/app/uploads/a.pdf")

        self.assertEqual(first, second)
        self.assertNotEqual(first, self.docling_cache.get_cache_key("/app/uploads/b.pdf"))


if __name__ == "__main__":
    unittest.main()
