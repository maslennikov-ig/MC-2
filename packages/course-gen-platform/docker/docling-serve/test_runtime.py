"""Focused tests for the Docling Serve runtime compatibility glue."""

import os
import unittest
from unittest.mock import patch

from docling.datamodel.service.options import ConvertDocumentsOptions
from docling_jobkit.convert.manager import (
    DoclingConverterManager,
    DoclingConverterManagerConfig,
)

import runtime


class HeadingHierarchySettingsTest(unittest.TestCase):
    def setUp(self) -> None:
        self._original = DoclingConverterManager._parse_standard_pdf_opts
        self.addCleanup(
            setattr, DoclingConverterManager, "_parse_standard_pdf_opts", self._original
        )
        self.manager = DoclingConverterManager(DoclingConverterManagerConfig())

    def _parse(self, request: ConvertDocumentsOptions):
        runtime.apply_heading_hierarchy_settings()
        return DoclingConverterManager._parse_standard_pdf_opts(self.manager, request, None)

    def test_upstream_drops_the_declared_request_field(self) -> None:
        """The gap this wrapper exists for, asserted against the real upstream."""
        request = ConvertDocumentsOptions(do_pdf_heading_hierarchy=True)
        options = self._original(self.manager, request, None)
        self.assertFalse(options.heading_hierarchy_options.enabled)

    def test_enables_inference_when_the_request_asks_for_it(self) -> None:
        options = self._parse(ConvertDocumentsOptions(do_pdf_heading_hierarchy=True))
        self.assertTrue(options.heading_hierarchy_options.enabled)

    def test_stays_disabled_by_default(self) -> None:
        options = self._parse(ConvertDocumentsOptions())
        self.assertFalse(options.heading_hierarchy_options.enabled)

    def test_keeps_the_requested_fine_tuning(self) -> None:
        request = ConvertDocumentsOptions(
            do_pdf_heading_hierarchy=True,
            pdf_heading_hierarchy_options={"use_bookmarks": False, "max_level": 4},
        )
        options = self._parse(request)
        self.assertTrue(options.heading_hierarchy_options.enabled)
        self.assertFalse(options.heading_hierarchy_options.use_bookmarks)
        self.assertEqual(options.heading_hierarchy_options.max_level, 4)

    def test_service_wide_default_can_enable_it(self) -> None:
        with patch.dict(
            os.environ, {"DOCLING_SERVE_PDF_HEADING_HIERARCHY": "true"}, clear=False
        ):
            options = self._parse(ConvertDocumentsOptions())
        self.assertTrue(options.heading_hierarchy_options.enabled)

    def test_rejects_a_non_boolean_default(self) -> None:
        with patch.dict(
            os.environ, {"DOCLING_SERVE_PDF_HEADING_HIERARCHY": "maybe"}, clear=False
        ):
            with self.assertRaises(ValueError):
                runtime.apply_heading_hierarchy_settings()


if __name__ == "__main__":
    unittest.main()
