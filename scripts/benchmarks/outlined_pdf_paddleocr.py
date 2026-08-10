#!/usr/bin/env python3
"""Score PP-OCRv5 Russian/Cyrillic OCR on the outlined-PDF corpus.

Run model download separately, then run this script with network disabled. The
PDF, ground truth, model cache and raw output must stay outside git.
"""

import argparse
import json
import resource
import time
from pathlib import Path

import numpy as np
import pypdfium2 as pdfium
from paddleocr import PaddleOCR

from outlined_pdf_ocr_ab import best_window


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("ground_truth", type=Path)
    parser.add_argument("--render-scale", type=float, default=3.0)
    parser.add_argument("--cpu-threads", type=int, default=4)
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
    ocr = PaddleOCR(
        lang="ru",
        ocr_version="PP-OCRv5",
        text_detection_model_name="PP-OCRv5_mobile_det",
        text_recognition_model_name="cyrillic_PP-OCRv5_mobile_rec",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        device="cpu",
        cpu_threads=args.cpu_threads,
        enable_mkldnn=False,
        text_recognition_batch_size=1,
    )
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
        predictions = list(
            ocr.predict(
                np.asarray(image),
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
            )
        )
        ocr_finished = time.monotonic()
        output = " ".join(
            text
            for prediction in predictions
            for text in prediction.get("rec_texts", [])
        )
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
            "paddleocr": "3.7.0",
            "paddlepaddle": "3.3.0",
            "detection_model": "PP-OCRv5_mobile_det",
            "recognition_model": "cyrillic_PP-OCRv5_mobile_rec",
            "pypdfium2": "5.12.1",
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
