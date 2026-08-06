"""Build-time proof that this image carries the advanced model set.

A missing enrichment model is not a soft failure that shows up as slightly
worse output. MEASURED on the baseline image (docling-serve 1.29.0,
docling-slim 2.118.0) on 2026-08-06: requesting `do_code_enrichment`,
`do_chart_extraction` or `do_picture_description` there returns

    HTTP 404 {"detail": "Task result not found. Please wait for a completion
    status."}

in about two seconds, while the actual cause — ``Model
'docling-project/CodeFormulaV2' not found in artifacts_path`` — appears only in
the container log. A caller cannot tell that apart from a transient scheduling
problem, so an image whose model set silently disagrees with its name would
produce exactly the confusing failure this profile exists to avoid.

These assertions are cheap and run before the image is tagged.
"""

import os
import unittest
from pathlib import Path

ARTIFACTS = Path(
    os.environ.get(
        "DOCLING_SERVE_ARTIFACTS_PATH", "/opt/app-root/src/.cache/docling/models"
    )
)

# Folder names come from each model class's `_model_repo_folder`, read off the
# pinned docling build rather than guessed from the repo id.
ADVANCED_MODELS = {
    "code_formula": "docling-project--CodeFormulaV2",
    "picture_description": "HuggingFaceTB--SmolVLM-256M-Instruct",
    # The V4 checkpoint this Serve build hardcodes for `do_chart_extraction`.
    # Shipping only the smaller 3.3-2b chart2csv model looked complete and then
    # made the service try to download V4 during a request.
    "chart_extraction": "ibm-granite--granite-vision-4.1-4b",
}

# Inherited from the baseline image; the advanced build must not lose them.
BASELINE_MODELS = {
    "layout": "docling-project--docling-layout-heron",
    "tableformer": "docling-project--docling-models",
    "picture_classifier": "docling-project--DocumentFigureClassifier-v2.5",
    "easyocr": "EasyOcr",
    "rapidocr": "RapidOcr",
}


def _weight_bytes(directory: Path) -> int:
    return sum(
        path.stat().st_size
        for path in directory.rglob("*")
        if path.is_file() and path.suffix in {".safetensors", ".bin", ".onnx", ".pth"}
    )


class AdvancedModelSet(unittest.TestCase):
    def test_advanced_models_are_present(self) -> None:
        for name, folder in ADVANCED_MODELS.items():
            with self.subTest(model=name):
                self.assertTrue(
                    (ARTIFACTS / folder).is_dir(),
                    f"{name} missing: {ARTIFACTS / folder} was not downloaded",
                )

    def test_baseline_models_survived_the_layer(self) -> None:
        for name, folder in BASELINE_MODELS.items():
            with self.subTest(model=name):
                self.assertTrue(
                    (ARTIFACTS / folder).is_dir(),
                    f"{name} disappeared from the baseline artifacts path",
                )

    def test_each_advanced_model_has_real_weights(self) -> None:
        # An interrupted download leaves the directory and the config behind,
        # which would satisfy a directory-exists check while still failing at
        # request time.
        for name, folder in ADVANCED_MODELS.items():
            with self.subTest(model=name):
                self.assertGreater(
                    _weight_bytes(ARTIFACTS / folder),
                    10 * 1024 * 1024,
                    f"{name} has no weight files worth the name",
                )


if __name__ == "__main__":
    unittest.main()
