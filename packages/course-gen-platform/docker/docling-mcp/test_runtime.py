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
        client.close()


if __name__ == "__main__":
    unittest.main()
