#!/usr/bin/env python3
"""Score Docling-native RapidOCR on the oversized outlined-PDF corpus.

Run this inside the pinned Docling Serve image after downloading the Cyrillic
RapidOCR model. Keep the PDF, ground truth, model cache and raw JSON output out
of git. Apply CPU, memory, swap, network and timeout bounds outside the runner.
"""

import argparse
import importlib.metadata
import json
import os
import resource
import time
from pathlib import Path

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import OcrMode, PdfPipelineOptions, RapidOcrOptions
from docling.document_converter import DocumentConverter, PdfFormatOption

from outlined_pdf_ocr_ab import best_window


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("ground_truth", type=Path)
    parser.add_argument("--scale", type=float, default=3.0)
    parser.add_argument(
        "--artifacts-path",
        type=Path,
        default=Path(
            os.environ.get(
                "DOCLING_SERVE_ARTIFACTS_PATH",
                "/opt/app-root/src/.cache/docling/models",
            )
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Write raw per-label JSON here and print only the aggregate result",
    )
    return parser.parse_args()


def cgroup_memory_peak_bytes() -> int | None:
    path = Path("/sys/fs/cgroup/memory.peak")
    if not path.exists():
        return None
    value = path.read_text(encoding="ascii").strip()
    return int(value) if value.isdigit() else None


def main() -> None:
    args = parse_args()
    labels = json.loads(args.ground_truth.read_text(encoding="utf-8"))
    if not 30 <= len(labels) <= 50:
        raise ValueError("ground truth must contain 30-50 labels")

    pipeline_options = PdfPipelineOptions(
        artifacts_path=args.artifacts_path,
        do_ocr=True,
        do_table_structure=False,
        ocr_options=RapidOcrOptions(
            mode=OcrMode.FULL_PAGE,
            lang=["cyrillic"],
            scale=args.scale,
            backend="onnxruntime",
        ),
    )
    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )

    started = time.monotonic()
    result = converter.convert(args.pdf)
    markdown = result.document.export_to_markdown()
    finished = time.monotonic()

    records = []
    for label in labels:
        recovered, score = best_window(markdown, label["phrase"])
        records.append(
            {
                **label,
                "recovered": recovered,
                "similarity": round(score, 4),
                "detected": score >= 0.8,
            }
        )
    small = [entry for entry in records if entry["class"] == "small-body"]
    payload = {
        "mode": "full_page",
        "engine": {
            "docling_slim": importlib.metadata.version("docling-slim"),
            "docling_core": importlib.metadata.version("docling-core"),
            "rapidocr": importlib.metadata.version("rapidocr"),
            "backend": "onnxruntime",
            "recognition_model": "cyrillic_PP-OCRv5_rec_mobile",
        },
        "scale": args.scale,
        "labels": len(records),
        "output_chars": len(markdown),
        "output_cyrillic_chars": sum("\u0400" <= char <= "\u04ff" for char in markdown),
        "label_recall_at_0_8": round(
            sum(record["detected"] for record in records) / len(records), 4
        ),
        "mean_character_similarity": round(
            sum(record["similarity"] for record in records) / len(records), 4
        ),
        "small_labels_detected": sum(record["detected"] for record in small),
        "small_labels": len(small),
        "small_label_recall_at_0_8": round(
            sum(record["detected"] for record in small) / len(small), 4
        ),
        "wall_seconds": round(finished - started, 3),
        "max_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "cgroup_memory_peak_bytes": cgroup_memory_peak_bytes(),
        "records": records,
    }
    if args.output is not None:
        args.output.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        aggregate = {key: value for key, value in payload.items() if key != "records"}
        print(json.dumps(aggregate, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
