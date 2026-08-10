#!/usr/bin/env python3
"""Measure direct PDF crops against an equivalent EasyOCR downscale.

Run this inside the pinned Docling Serve image. The source PDF, ground-truth
JSON and generated output must stay outside git when they contain user data.
"""

import argparse
import json
import resource
import time
from pathlib import Path

import numpy as np
import pypdfium2 as pdfium
from PIL import Image, ImageOps


def normalize(value: str) -> str:
    return " ".join(value.upper().split())


def edit_distance(left: str, right: str) -> int:
    previous = list(range(len(right) + 1))
    for index, left_character in enumerate(left, 1):
        current = [index]
        for candidate_index, right_character in enumerate(right, 1):
            current.append(
                min(
                    previous[candidate_index] + 1,
                    current[candidate_index - 1] + 1,
                    previous[candidate_index - 1]
                    + (left_character != right_character),
                )
            )
        previous = current
    return previous[-1]


def similarity(expected: str, candidate: str) -> float:
    if not expected:
        return 1.0 if not candidate else 0.0
    return max(0.0, 1.0 - edit_distance(expected, candidate) / len(expected))


def best_window(output: str, phrase: str) -> tuple[str, float]:
    haystack = normalize(output)
    needle = normalize(phrase)
    if not haystack or not needle:
        return "", 0.0
    if needle in haystack:
        return needle, 1.0

    slack = max(2, round(len(needle) * 0.2))
    best_text = ""
    best_score = -1.0
    for start in range(len(haystack)):
        for width in (len(needle) - slack, len(needle), len(needle) + slack):
            if width <= 0 or start + width > len(haystack):
                continue
            candidate = haystack[start : start + width]
            score = similarity(needle, candidate)
            if score > best_score or (
                score == best_score
                and abs(len(candidate) - len(needle))
                < abs(len(best_text) - len(needle))
            ):
                best_text = candidate
                best_score = score
    return best_text, max(0.0, best_score)


def otsu_threshold(image: Image.Image) -> Image.Image:
    grayscale = image.convert("L")
    histogram = grayscale.histogram()
    total = sum(histogram)
    weighted_total = sum(index * count for index, count in enumerate(histogram))
    background_count = 0
    background_weight = 0
    best_variance = -1.0
    threshold = 127

    for index, count in enumerate(histogram):
        background_count += count
        if background_count == 0:
            continue
        foreground_count = total - background_count
        if foreground_count == 0:
            break
        background_weight += index * count
        background_mean = background_weight / background_count
        foreground_mean = (
            weighted_total - background_weight
        ) / foreground_count
        variance = (
            background_count
            * foreground_count
            * (background_mean - foreground_mean) ** 2
        )
        if variance > best_variance:
            best_variance = variance
            threshold = index

    return grayscale.point(lambda value: 255 if value > threshold else 0)


def preprocess_image(image: Image.Image, mode: str) -> Image.Image:
    if mode == "rgb":
        return image
    if mode == "autocontrast":
        return ImageOps.autocontrast(image.convert("L"))
    if mode == "otsu":
        return otsu_threshold(image)
    raise ValueError(f"unsupported preprocessing mode: {mode}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument(
        "ground_truth",
        type=Path,
        help=(
            "JSON array of {id, class, bbox:[left,top,width,height], phrase}; "
            "PDF coordinates use a top-left origin"
        ),
    )
    parser.add_argument(
        "--mode", choices=("full", "downscaled"), required=True
    )
    parser.add_argument("--render-scale", type=float, default=3.0)
    parser.add_argument("--linear-downscale", type=float, default=0.1986)
    parser.add_argument("--canvas-size", type=int, default=2560)
    parser.add_argument(
        "--preprocess",
        choices=("rgb", "autocontrast", "otsu"),
        default="rgb",
    )
    parser.add_argument(
        "--decoder", choices=("greedy", "beamsearch", "wordbeamsearch"), default="greedy"
    )
    parser.add_argument("--text-threshold", type=float, default=0.7)
    parser.add_argument("--low-text", type=float, default=0.4)
    parser.add_argument("--link-threshold", type=float, default=0.4)
    parser.add_argument("--contrast-ths", type=float, default=0.1)
    parser.add_argument("--adjust-contrast", type=float, default=0.5)
    parser.add_argument(
        "--model-storage-directory",
        default="/opt/app-root/src/.cache/docling/models/EasyOcr",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    import easyocr

    labels = json.loads(args.ground_truth.read_text(encoding="utf-8"))
    if not 30 <= len(labels) <= 50:
        raise ValueError("ground truth must contain 30-50 labels")

    started = time.monotonic()
    document = pdfium.PdfDocument(str(args.pdf))
    page = document[0]
    page_width = page.get_width()
    page_height = page.get_height()

    reader = easyocr.Reader(
        ["ru", "en"],
        gpu=False,
        model_storage_directory=args.model_storage_directory,
        download_enabled=False,
        verbose=False,
    )
    loaded = time.monotonic()
    records = []

    for label in labels:
        left, top, width, height = label["bbox"]
        right = min(page_width, left + width)
        bottom = min(page_height, top + height)
        crop = (left, page_height - bottom, page_width - right, top)
        bitmap = page.render(scale=args.render_scale, crop=crop)
        image = bitmap.to_pil().convert("RGB")
        if args.mode == "downscaled":
            image = image.resize(
                (
                    max(1, round(image.width * args.linear_downscale)),
                    max(1, round(image.height * args.linear_downscale)),
                ),
                Image.Resampling.LANCZOS,
            )
        image = preprocess_image(image, args.preprocess)

        ocr_started = time.monotonic()
        detections = reader.readtext(
            np.asarray(image),
            detail=1,
            decoder=args.decoder,
            canvas_size=args.canvas_size,
            mag_ratio=1.0,
            text_threshold=args.text_threshold,
            low_text=args.low_text,
            link_threshold=args.link_threshold,
            contrast_ths=args.contrast_ths,
            adjust_contrast=args.adjust_contrast,
        )
        ocr_finished = time.monotonic()
        output = " ".join(text for _, text, _ in detections)
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
        "mode": args.mode,
        "engine": {"easyocr": "1.7.2", "pypdfium2": "5.12.1"},
        "render_scale": args.render_scale,
        "preprocess": args.preprocess,
        "decoder": args.decoder,
        "detector_thresholds": {
            "text_threshold": args.text_threshold,
            "low_text": args.low_text,
            "link_threshold": args.link_threshold,
            "contrast_ths": args.contrast_ths,
            "adjust_contrast": args.adjust_contrast,
        },
        "linear_downscale": (
            args.linear_downscale if args.mode == "downscaled" else 1.0
        ),
        "labels": len(records),
        "label_recall_at_0_8": round(
            sum(record["detected"] for record in records) / len(records), 4
        ),
        "mean_character_similarity": round(
            sum(record["similarity"] for record in records) / len(records), 4
        ),
        "small_label_recall_at_0_8": round(
            sum(record["detected"] for record in small) / len(small), 4
        ),
        "model_load_seconds": loaded - started,
        "wall_seconds": finished - started,
        "max_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "records": records,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
