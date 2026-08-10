import unittest

from outlined_pdf_tiled_easyocr import build_top_down_tiles


class BuildTopDownTilesTest(unittest.TestCase):
    def test_builds_overlapping_tiles_without_gaps_or_page_overflow(self) -> None:
        tiles = build_top_down_tiles(4296.0, 768.0, 0.2)

        self.assertEqual(tiles[0], (0.0, 768.0))
        self.assertEqual(tiles[-1][1], 4296.0)
        self.assertTrue(all(0.0 <= top < bottom <= 4296.0 for top, bottom in tiles))
        self.assertTrue(
            all(next_top < bottom for (_, bottom), (next_top, _) in zip(tiles, tiles[1:]))
        )

    def test_rejects_invalid_geometry(self) -> None:
        for page_height, tile_height, overlap in (
            (0.0, 768.0, 0.2),
            (4296.0, 0.0, 0.2),
            (4296.0, 768.0, -0.1),
            (4296.0, 768.0, 1.0),
        ):
            with self.subTest(
                page_height=page_height,
                tile_height=tile_height,
                overlap=overlap,
            ):
                with self.assertRaises(ValueError):
                    build_top_down_tiles(page_height, tile_height, overlap)


if __name__ == "__main__":
    unittest.main()
