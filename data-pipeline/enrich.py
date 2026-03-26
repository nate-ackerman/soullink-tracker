"""
Step 2 — Enrich locations with PokeAPI encounter data.

For each location in the scraped YAML, resolves the PokeAPI location-area slug
(using fuzzy matching against the full region area list) and fetches encounter
tables, filtering to the correct game version.

Output: data-pipeline/output/{game_id}_enriched.yaml
"""

import logging
import sys
from pathlib import Path
from typing import Any

import yaml
from rapidfuzz import fuzz, process

from games_config import GAMES, ALL_GAME_IDS, POKEAPI_BASE
from utils import fetch_json, slugify, location_to_area_slug, fuzzy_match_slug, normalize_pokemon_name, setup_logging

logger = logging.getLogger(__name__)
OUTPUT_DIR = Path(__file__).parent / "output"

# Location types that need PokeAPI enrichment (vs. gifts/statics handled by specials.py)
WILD_TYPES = {"grass", "surf", "old_rod", "good_rod", "super_rod", "headbutt", "rock_smash"}

# PokeAPI method name → our method label
METHOD_MAP = {
    "walk": "walk",
    "old-rod": "old_rod",
    "good-rod": "good_rod",
    "super-rod": "super_rod",
    "surf": "surf",
    "headbutt": "headbutt",
    "rock-smash": "rock_smash",
    "gift": "gift",
    "roaming": "walk",      # treat roamers as walk encounters
}

# ── Region area index ──────────────────────────────────────────────────────

_region_areas: dict[str, list[str]] = {}  # region → [area_slug, ...]


def get_region_areas(region: str) -> list[str]:
    """
    Fetch all location-area slugs for a region (cached in memory per region).
    """
    if region in _region_areas:
        return _region_areas[region]

    url = f"{POKEAPI_BASE}/region/{region}/"
    data = fetch_json(url)
    if not data:
        logger.warning(f"Region not found: {region}")
        _region_areas[region] = []
        return []

    # Collect location names, then fetch each location for its areas
    areas: list[str] = []
    for loc_ref in data.get("locations", []):
        loc_url = loc_ref["url"]
        loc_data = fetch_json(loc_url)
        if loc_data:
            for area_ref in loc_data.get("areas", []):
                areas.append(area_ref["name"])

    logger.info(f"Region {region}: {len(areas)} location areas indexed")
    _region_areas[region] = areas
    return areas


# ── Slug resolution ────────────────────────────────────────────────────────

def resolve_area_slug(location_name: str, region: str, game_id: str) -> tuple[str | None, str]:
    """
    Try to find the PokeAPI location-area slug for a location name.
    Returns (slug_or_None, resolution_method).
    resolution_method: 'exact' | 'fuzzy' | 'failed'
    """
    region_areas = get_region_areas(region)
    candidates = location_to_area_slug(location_name)

    # 1. Exact match against any candidate
    for c in candidates:
        if c in region_areas:
            return c, "exact"

    # 2. Try with region prefix (e.g. "sinnoh-route-201-area")
    base_slug = slugify(location_name)
    prefixed = f"{region}-{base_slug}-area"
    if prefixed in region_areas:
        return prefixed, "exact"
    prefixed2 = f"{region}-{base_slug}"
    if prefixed2 in region_areas:
        return prefixed2, "exact"

    # 3. Fuzzy match against all region areas
    target = f"{base_slug}-area"
    match = fuzzy_match_slug(target, region_areas, threshold=75)
    if match:
        return match, "fuzzy"

    # Also try without "-area" suffix
    match2 = fuzzy_match_slug(base_slug, region_areas, threshold=75)
    if match2:
        return match2, "fuzzy"

    return None, "failed"


# ── Encounter fetching ─────────────────────────────────────────────────────

def fetch_encounters(area_slug: str, version: str) -> list[dict]:
    """
    Fetch encounter data for an area and filter to the specified game version.
    Returns a list of encounter dicts compatible with the output schema.
    """
    url = f"{POKEAPI_BASE}/location-area/{area_slug}/"
    data = fetch_json(url)
    if not data:
        return []

    encounters = []
    for pe in data.get("pokemon_encounters", []):
        pokemon_name = normalize_pokemon_name(pe["pokemon"]["name"].replace("-", " "))

        for ver_detail in pe.get("version_details", []):
            if ver_detail["version"]["name"] != version:
                continue

            for enc in ver_detail.get("encounter_details", []):
                method_raw = enc.get("method", {}).get("name", "walk")
                method = METHOD_MAP.get(method_raw, method_raw)
                min_level = enc.get("min_level", 0)
                max_level = enc.get("max_level", 0)
                chance = enc.get("chance", 0)

                # Conditions (e.g. "time-of-day")
                conditions = [c["name"] for c in enc.get("condition_values", [])]

                entry = {
                    "pokemon": pokemon_name,
                    "level": min_level,
                    "method": method,
                    "chance": chance,
                }
                if max_level and max_level != min_level:
                    entry["level_max"] = max_level
                if conditions:
                    entry["conditions"] = conditions

                encounters.append(entry)

    # Deduplicate: same pokemon + method + level → sum chances
    deduped: dict[tuple, dict] = {}
    for e in encounters:
        key = (e["pokemon"], e["method"], e["level"], e.get("level_max"))
        if key in deduped:
            deduped[key]["chance"] = min(100, deduped[key]["chance"] + e["chance"])
        else:
            deduped[key] = e

    return sorted(deduped.values(), key=lambda x: -x["chance"])


# ── Per-game enrichment ────────────────────────────────────────────────────

def enrich_location(loc: dict, region: str, version: str) -> dict:
    """Enrich a single location dict in-place. Returns the modified dict."""
    loc_type = loc.get("type", "grass")

    # Non-wild locations (gift, static, egg, starter, trade) — skip PokeAPI
    if loc_type not in WILD_TYPES:
        return loc

    # Already has encounters (e.g. injected by specials.py earlier)
    if loc.get("encounters"):
        return loc

    # Already marked as failed
    if loc.get("_enrich_error"):
        return loc

    name = loc.get("name", "")
    slug, method = resolve_area_slug(name, region, version)

    if not slug:
        loc["_enrich_error"] = "no_area_found"
        logger.warning(f"  No PokeAPI area for: {name!r}")
        return loc

    loc["pokeapi_location_area"] = slug
    if method == "fuzzy":
        loc["_enrich_note"] = f"fuzzy-matched to {slug}"

    encounters = fetch_encounters(slug, version)
    if not encounters:
        loc["_enrich_error"] = "no_encounters_for_version"
        logger.debug(f"  No encounters in {slug} for version {version}")
    else:
        loc["encounters"] = encounters
        logger.debug(f"  {name!r} → {slug}: {len(encounters)} encounter entries")

    return loc


def enrich_game(game_id: str) -> dict:
    """
    Load the scraped YAML for a game, enrich all locations, and write
    {game_id}_enriched.yaml.
    """
    game = GAMES[game_id]
    scraped_path = OUTPUT_DIR / f"{game_id}_scraped.yaml"
    if not scraped_path.exists():
        logger.error(f"Scraped file not found: {scraped_path}. Run scrape first.")
        return {}

    with open(scraped_path, encoding="utf-8") as f:
        data = yaml.safe_load(f)

    logger.info(f"=== Enriching {game['name']} ===")

    region = game["pokeapi_region"]
    version = game["pokeapi_version"]

    # Pre-fetch full region area index (cached to disk via fetch_json)
    logger.info(f"  Loading region area index for: {region}")
    get_region_areas(region)

    errors = 0
    enriched = 0

    for cp in data.get("checkpoints", []):
        for loc in cp.get("locations", []):
            if loc.get("type") in WILD_TYPES:
                before = bool(loc.get("_enrich_error"))
                enrich_location(loc, region, version)
                if loc.get("_enrich_error"):
                    errors += 1
                else:
                    enriched += 1

    data["_enrich_stats"] = {
        "enriched": enriched,
        "errors": errors,
    }

    out_path = OUTPUT_DIR / f"{game_id}_enriched.yaml"
    with open(out_path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, allow_unicode=True, sort_keys=False, default_flow_style=False)

    logger.info(f"  Wrote {out_path.name}: {enriched} enriched, {errors} errors")
    return data


# ── CLI ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Enrich locations with PokeAPI data")
    parser.add_argument("games", nargs="*", default=ALL_GAME_IDS)
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    setup_logging(args.verbose)

    for gid in args.games:
        if gid not in GAMES:
            logger.error(f"Unknown game: {gid}")
            sys.exit(1)
        enrich_game(gid)
