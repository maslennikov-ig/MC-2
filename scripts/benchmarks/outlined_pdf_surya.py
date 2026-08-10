#!/usr/bin/env python3
"""Score classic Surya OCR on the outlined-PDF corpus.

This runner targets Surya OCR 0.17.0, before the Surya-2 GGUF/VLM rewrite.
Download weights separately, then rerun with network disabled. Inputs, cache and
raw output remain outside git.
"""

import argparse
import json
import resource
import time
from pathlib import Path

import pypdfium2 as pdfium
from surya.detection import DetectionPredictor
from surya.foundation import FoundationPredictor
from surya.recognition import RecognitionPredictor

from outlined_pdf_ocr_ab import best_window


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("ground_truth", type=Path)
    parser.add_argument("--render-scale", type=float, default=3.0)
    parser.add_argument("--limit-labels", type=int)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    labels = json.loads(args.ground_truth.read_text(encoding="utf-8"))
    if not 30 <= len(labels) <= 50:
        raise ValueError("ground truth must contain 30-50 labels")
    if args.limit_labels is not None:
        labels = labels[: args.limit_labels]

    started = time.monotonic()
    foundation = FoundationPredictor(device="cpu")
    recognition = RecognitionPredictor(foundation)
    detection = DetectionPredictor(device="cpu")
    loaded = time.monotonic()

    document = pdfium.PdfDocument(str(args.pdf))
    page = document[0]
    page_width = page.get_width()
    page_height = page.get_height()
    records = []

    for label in labels:
        left, top, width, height = label["bbox"]
        right = min(page_width, left + width)
        bottom = min(page_height, top + height)
        crop = (left, page_height - bottom, page_width - right, top)
        bitmap = page.render(scale=args.render_scale, crop=crop)
        image = bitmap.to_pil().convert("RGB")

        ocr_started = time.monotonic()
        prediction = recognition(
            [image],
            det_predictor=detection,
            detection_batch_size=1,
            recognition_batch_size=1,
            sort_lines=True,
            math_mode=False,
        )[0]
        ocr_finished = time.monotonic()
        output = " ".join(line.text for line in prediction.text_lines)
        recovered, score = best_window(output, label["phrase"])
        records.append(
            {
                **label,
                "image_size": list(image.size),
                "ocr_seconds": ocr_finished - ocr_started,
                "output": output,
                "recovered": recovered,
                "similarity": round(score, 4),
                "detected": score >= 0.8,
            }
        )
        bitmap.close()

    finished = time.monotonic()
    page.close()
    document.close()
    small = [entry for entry in records if entry["class"] == "small-body"]
    result = {
        "mode": "full",
        "engine": {
            "surya_ocr": "0.17.0",
            "recognition_checkpoint": "text_recognition/2025_09_23",
            "detection_checkpoint": "text_detection/2025_05_07",
            "pypdfium2": "4.30.0",
        },
        "render_scale": args.render_scale,
        "labels": len(records),
        "label_recall_at_0_8": round(
            sum(record["detected"] for record in records) / len(records), 4
        ),
        "mean_character_similarity": round(
            sum(record["similarity"] for record in records) / len(records), 4
        ),
        "small_label_recall_at_0_8": round(
            sum(record["detected"] for record in small) / len(small), 4
        ) if small else None,
        "model_load_seconds": loaded - started,
        "wall_seconds": finished - started,
        "max_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "records": records,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
