#!/usr/bin/env python3
"""Measure sequential direct-clip EasyOCR on an oversized outlined PDF.

Run inside the pinned Docling Serve image. The PDF, ground truth, model cache
and raw output stay outside git. Apply CPU, memory, swap, network and wall-time
bounds to the container that runs this script.
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import importlib.metadata
import json
import resource
import sys
import time
from pathlib import Path


def build_top_down_tiles(
    page_height: float, tile_height: float, overlap_fraction: float
) -> list[tuple[float, float]]:
    """Return overlapping ``(top, bottom)`` clips in PDF canvas units."""
    if page_height <= 0 or tile_height <= 0:
        raise ValueError("page and tile heights must be positive")
    if not 0 <= overlap_fraction < 1:
        raise ValueError("overlap fraction must be in [0, 1)")

    tile_height = min(tile_height, page_height)
    step = tile_height * (1 - overlap_fraction)
    tiles: list[tuple[float, float]] = []
    top = 0.0
    while True:
        bottom = min(page_height, top + tile_height)
        tiles.append((top, bottom))
        if bottom >= page_height:
            break
        top += step
    return tiles


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def cgroup_memory_peak_bytes() -> int | None:
    path = Path("/sys/fs/cgroup/memory.peak")
    if not path.exists():
        return None
    value = path.read_text(encoding="ascii").strip()
    return int(value) if value.isdigit() else None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("ground_truth", type=Path)
    parser.add_argument("--tile-height", type=float, default=768.0)
    parser.add_argument("--overlap", type=float, default=0.2)
    parser.add_argument("--render-scale", type=float, default=3.0)
    parser.add_argument("--canvas-size", type=int, default=4096)
    parser.add_argument("--text-threshold", type=float, default=0.7)
    parser.add_argument("--low-text", type=float, default=0.4)
    parser.add_argument("--link-threshold", type=float, default=0.4)
    parser.add_argument(
        "--model-storage-directory",
        default="/opt/app-root/src/.cache/docling/models/EasyOcr",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Write raw per-tile/per-label JSON here and print only aggregates",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    import easyocr
    import numpy as np
    import pypdfium2 as pdfium

    from outlined_pdf_ocr_ab import best_window

    labels = json.loads(args.ground_truth.read_text(encoding="utf-8"))
    if not 30 <= len(labels) <= 50:
        raise ValueError("ground truth must contain 30-50 labels")

    started = time.monotonic()
    document = pdfium.PdfDocument(str(args.pdf))
    page = document[0]
    page_width = page.get_width()
    page_height = page.get_height()
    tiles = build_top_down_tiles(page_height, args.tile_height, args.overlap)

    reader = easyocr.Reader(
        ["ru", "en"],
        gpu=False,
        model_storage_directory=args.model_storage_directory,
        download_enabled=False,
        verbose=False,
    )
    loaded = time.monotonic()
    tile_records = []
    outputs: list[str] = []

    for index, (top, bottom) in enumerate(tiles, 1):
        tile_started = time.monotonic()
        crop = (0.0, page_height - bottom, 0.0, top)
        bitmap = page.render(
            scale=args.render_scale,
            crop=crop,
            limit_image_cache=True,
        )
        image = bitmap.to_pil().copy()
        bitmap.close()
        pixels = np.asarray(image)
        detections = reader.readtext(
            pixels,
            detail=1,
            decoder="greedy",
            canvas_size=args.canvas_size,
            mag_ratio=1.0,
            text_threshold=args.text_threshold,
            low_text=args.low_text,
            link_threshold=args.link_threshold,
        )
        output = " ".join(text for _, text, _ in detections)
        outputs.append(output)
        tile_records.append(
            {
                "index": index,
                "top": round(top, 4),
                "bottom": round(bottom, 4),
                "image_size": list(image.size),
                "detections": len(detections),
                "output": output,
                "seconds": round(time.monotonic() - tile_started, 3),
            }
        )
        print(
            f"tile {index}/{len(tiles)}: {len(detections)} detections",
            file=sys.stderr,
            flush=True,
        )
        del detections, pixels
        image.close()
        del image
        gc.collect()

    combined_output = "\n".join(outputs)
    records = []
    for label in labels:
        recovered, score = best_window(combined_output, label["phrase"])
        records.append(
            {
                **label,
                "recovered": recovered,
                "similarity": round(score, 4),
                "detected": score >= 0.8,
            }
        )
    finished = time.monotonic()
    small = [entry for entry in records if entry["class"] == "small-body"]
    page.close()
    document.close()

    payload = {
        "mode": "sequential_direct_clip_tiles",
        "engine": {
            "easyocr": importlib.metadata.version("easyocr"),
            "pypdfium2": importlib.metadata.version("pypdfium2"),
        },
        "corpus": {
            "pdf_sha256": sha256(args.pdf),
            "ground_truth_sha256": sha256(args.ground_truth),
        },
        "page_size": [page_width, page_height],
        "render_scale": args.render_scale,
        "canvas_size": args.canvas_size,
        "tile_height": args.tile_height,
        "overlap_fraction": args.overlap,
        "tiles": len(tiles),
        "labels": len(records),
        "output_chars": len(combined_output),
        "output_cyrillic_chars": sum(
            "\u0400" <= character <= "\u04ff" for character in combined_output
        ),
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
        "model_load_seconds": round(loaded - started, 3),
        "wall_seconds": round(finished - started, 3),
        "max_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "cgroup_memory_peak_bytes": cgroup_memory_peak_bytes(),
        "tile_records": tile_records,
        "records": records,
    }
    if args.output is not None:
        args.output.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        aggregate = {
            key: value
            for key, value in payload.items()
            if key not in {"tile_records", "records"}
        }
        print(json.dumps(aggregate, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
