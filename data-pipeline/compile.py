"""
Step 5 — Compile all per-game enriched YAMLs into a single encounters.json.

Also strips internal pipeline fields (_scrape_confidence, _enrich_error, etc.)
from the final output unless --keep-debug is passed.
"""

import json
import logging
import sys
from pathlib import Path

import yaml

from games_config import GAMES, ALL_GAME_IDS
from utils import setup_logging

logger = logging.getLogger(__name__)
OUTPUT_DIR = Path(__file__).parent / "output"

# Fields prefixed with _ are pipeline-internal; strip from final output by default
DEBUG_FIELDS = {
    "_scrape_confidence", "_scrape_stats", "_enrich_stats", "_enrich_error",
    "_enrich_note", "_source_url", "_injected_by", "_unmatched_specials",
}


def strip_debug(obj: any) -> any:
    """Recursively remove debug fields from dicts/lists."""
    if isinstance(obj, dict):
        return {
            k: strip_debug(v)
            for k, v in obj.items()
            if k not in DEBUG_FIELDS
        }
    if isinstance(obj, list):
        return [strip_debug(item) for item in obj]
    return obj


def compile_all(game_ids: list[str] = None, keep_debug: bool = False) -> dict:
    """
    Load all enriched YAMLs and merge into one dict.
    Returns the merged structure and writes encounters.json.
    """
    if game_ids is None:
        game_ids = ALL_GAME_IDS

    merged: dict[str, dict] = {}
    missing: list[str] = []

    for gid in game_ids:
        enriched_path = OUTPUT_DIR / f"{gid}_enriched.yaml"
        if not enriched_path.exists():
            logger.warning(f"Missing enriched file for {gid}, skipping")
            missing.append(gid)
            continue

        with open(enriched_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)

        if not keep_debug:
            data = strip_debug(data)

        merged[gid] = data
        logger.info(f"  Compiled {gid}: {len(data.get('checkpoints', []))} checkpoints")

    out_path = OUTPUT_DIR / "encounters.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    logger.info(
        f"Wrote {out_path}: {len(merged)} games"
        + (f" ({len(missing)} skipped: {missing})" if missing else "")
    )
    return merged


# ── CLI ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Compile per-game YAMLs to encounters.json")
    parser.add_argument("games", nargs="*", default=ALL_GAME_IDS)
    parser.add_argument("-v", "--verbose", action="store_true")
    parser.add_argument(
        "--keep-debug", action="store_true",
        help="Keep _prefixed debug fields in output (useful for review)"
    )
    args = parser.parse_args()

    setup_logging(args.verbose)
    compile_all(args.games, keep_debug=args.keep_debug)
