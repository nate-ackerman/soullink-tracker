"""
Step 4 — Validate enriched YAML files.

Checks:
  - Duplicate location IDs within a game
  - Wild locations with no encounters and no _enrich_error explanation
  - Gym checkpoints missing gym_leader
  - Locations with _enrich_error flags (logged, not fatal)
  - Low-confidence scrape items
  - Invalid type values

Exits with code 1 if any fatal errors are found.
"""

import logging
import sys
from pathlib import Path

import yaml

from games_config import GAMES, ALL_GAME_IDS
from utils import setup_logging

logger = logging.getLogger(__name__)
OUTPUT_DIR = Path(__file__).parent / "output"

VALID_CHECKPOINT_TYPES = {"rival", "gym", "elite4", "champion", "boss", "postgame"}
VALID_LOCATION_TYPES = {
    "grass", "surf", "old_rod", "good_rod", "super_rod",
    "gift", "egg", "starter", "static", "trade", "headbutt", "rock_smash",
}
WILD_TYPES = {"grass", "surf", "old_rod", "good_rod", "super_rod", "headbutt", "rock_smash"}


def validate_game(game_id: str) -> bool:
    """
    Validate the enriched YAML for one game.
    Returns True if no fatal errors found.
    """
    game = GAMES[game_id]
    enriched_path = OUTPUT_DIR / f"{game_id}_enriched.yaml"
    if not enriched_path.exists():
        logger.error(f"[{game_id}] Enriched file not found: {enriched_path}")
        return False

    with open(enriched_path, encoding="utf-8") as f:
        data = yaml.safe_load(f)

    errors: list[str] = []
    warnings: list[str] = []

    checkpoints = data.get("checkpoints", [])
    if not checkpoints:
        errors.append("No checkpoints found")

    seen_loc_ids: dict[str, str] = {}   # id → checkpoint name

    for cp_idx, cp in enumerate(checkpoints):
        cp_name = cp.get("name", f"checkpoint_{cp_idx}")
        cp_id = cp.get("id", f"<no id @ {cp_idx}>")
        cp_type = cp.get("type", "")

        # Checkpoint type valid?
        if cp_type not in VALID_CHECKPOINT_TYPES:
            errors.append(f"[{cp_id}] Unknown checkpoint type: {cp_type!r}")

        # Gym checkpoints should have a gym_leader
        if cp_type == "gym" and not cp.get("gym_leader"):
            warnings.append(f"[{cp_id}] Gym checkpoint missing gym_leader")

        # Low confidence checkpoints
        if cp.get("_scrape_confidence") == "low":
            warnings.append(f"[{cp_id}] Low scrape confidence on checkpoint: {cp_name!r}")

        for loc in cp.get("locations", []):
            loc_id = loc.get("id", "<no id>")
            loc_name = loc.get("name", "<unnamed>")
            loc_type = loc.get("type", "")

            # Duplicate IDs
            if loc_id in seen_loc_ids:
                errors.append(
                    f"[{cp_id}] Duplicate location ID {loc_id!r} "
                    f"(also in {seen_loc_ids[loc_id]!r})"
                )
            else:
                seen_loc_ids[loc_id] = cp_name

            # Valid type
            if loc_type and loc_type not in VALID_LOCATION_TYPES:
                warnings.append(f"[{cp_id}/{loc_id}] Unknown location type: {loc_type!r}")

            # Wild locations should have encounters or an error flag
            if loc_type in WILD_TYPES:
                encs = loc.get("encounters", [])
                err = loc.get("_enrich_error")
                if not encs and not err:
                    errors.append(
                        f"[{cp_id}/{loc_id}] Wild location {loc_name!r} "
                        f"has no encounters and no _enrich_error"
                    )
                elif err:
                    warnings.append(f"[{cp_id}/{loc_id}] Enrich error on {loc_name!r}: {err}")

            # Low confidence locations
            if loc.get("_scrape_confidence") == "low":
                warnings.append(f"[{cp_id}/{loc_id}] Low scrape confidence: {loc_name!r}")

    # Unmatched specials
    unmatched = data.get("_unmatched_specials", [])
    for u in unmatched:
        warnings.append(f"Unmatched special (needs manual placement): {u}")

    # Report
    if errors:
        logger.error(f"[{game_id}] VALIDATION FAILED — {len(errors)} error(s), {len(warnings)} warning(s)")
        for e in errors:
            logger.error(f"  ERROR: {e}")
        for w in warnings:
            logger.warning(f"  WARN:  {w}")
        return False
    else:
        logger.info(f"[{game_id}] OK — {len(warnings)} warning(s)")
        for w in warnings:
            logger.warning(f"  WARN: {w}")
        return True


def validate_all(game_ids: list[str]) -> bool:
    all_ok = True
    for gid in game_ids:
        ok = validate_game(gid)
        if not ok:
            all_ok = False
    return all_ok


# ── CLI ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Validate enriched YAML files")
    parser.add_argument("games", nargs="*", default=ALL_GAME_IDS)
    parser.add_argument("-v", "--verbose", action="store_true")
    parser.add_argument(
        "--warn-only", action="store_true",
        help="Exit 0 even if errors found (treat errors as warnings)"
    )
    args = parser.parse_args()

    setup_logging(args.verbose)

    ok = validate_all(args.games)
    if not ok and not args.warn_only:
        sys.exit(1)
