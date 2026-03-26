"""
Step 3 — Inject gift Pokémon, in-game trades, static encounters, and starters.

Sources:
  - Bulbapedia Gift Pokémon page
  - Bulbapedia In-game Trades page
  - Walkthrough text patterns for static encounters (already in scraped YAML)
  - Starters injected into the first checkpoint

Matches each special encounter to the nearest checkpoint by location-name
fuzzy matching, then injects it as a location entry.

Output: data-pipeline/output/{game_id}_enriched.yaml (updated in-place)
"""

import logging
import re
import sys
from pathlib import Path
from typing import Any

import yaml
from bs4 import BeautifulSoup, Tag
from rapidfuzz import fuzz, process

from games_config import GAMES, ALL_GAME_IDS, BULBAPEDIA_BASE
from utils import fetch_html, slugify, build_location_id, fuzzy_match_slug, normalize_pokemon_name, setup_logging

logger = logging.getLogger(__name__)
OUTPUT_DIR = Path(__file__).parent / "output"

GIFT_PAGE = f"{BULBAPEDIA_BASE}/wiki/Gift_Pok%C3%A9mon"
TRADE_PAGE = f"{BULBAPEDIA_BASE}/wiki/In-game_trade"

# ── Gift Pokémon scraping ──────────────────────────────────────────────────

def scrape_gifts(game: dict) -> list[dict]:
    """
    Scrape the Bulbapedia Gift Pokémon page and extract entries for this game.
    Returns a list of dicts: {pokemon, location, notes, method='gift'|'egg'}
    """
    html = fetch_html(GIFT_PAGE)
    soup = BeautifulSoup(html, "lxml")
    content = soup.find("div", class_="mw-parser-output")
    if not content:
        return []

    version = game["pokeapi_version"].replace("-", " ").title()
    game_name = game["name"]
    gen = game["gen"]

    # Bulbapedia gift page is structured with h2 per generation, tables per game
    results: list[dict] = []
    current_gen = 0

    for el in content.find_all(["h2", "h3", "table"]):
        if el.name == "h2":
            text = el.get_text(strip=True)
            m = re.search(r"Generation (\w+)", text, re.I)
            if m:
                gen_map = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5}
                current_gen = gen_map.get(m.group(1).upper(), 0)
            continue

        if el.name == "h3":
            # Section headers like "Kanto", "Johto", game names
            continue

        if el.name == "table" and current_gen == gen:
            # Parse table rows looking for this game's entries
            rows = el.find_all("tr")
            headers = []
            for th in (rows[0].find_all("th") if rows else []):
                headers.append(th.get_text(strip=True).lower())

            for row in rows[1:]:
                cells = row.find_all(["td", "th"])
                if not cells:
                    continue
                row_data = [c.get_text(" ", strip=True) for c in cells]

                if len(row_data) < 3:
                    continue

                # Heuristic: check if this row mentions the game
                row_text = " ".join(row_data).lower()
                version_slug = game["pokeapi_version"].lower()
                game_name_l = game["name"].lower().replace("pokémon ", "")

                if version_slug not in row_text and game_name_l not in row_text:
                    # Also try alternate names (HeartGold, SoulSilver → HG, SS)
                    abbrevs = {
                        "heartgold": ["hg", "hgss", "heart gold"],
                        "soulsilver": ["ss", "hgss", "soul silver"],
                        "firered": ["fr", "frlg", "fire red"],
                        "leafgreen": ["lg", "frlg", "leaf green"],
                        "black2": ["b2", "b2w2", "black 2"],
                        "white2": ["w2", "b2w2", "white 2"],
                        "diamond": ["d", "dp", "dppt"],
                        "pearl": ["p", "dp", "dppt"],
                        "platinum": ["pt", "dppt"],
                    }
                    alt = abbrevs.get(version_slug, [])
                    if not any(a in row_text for a in alt):
                        continue

                # Extract Pokémon name (usually first or second column)
                pokemon = ""
                location = ""
                notes = ""
                method = "gift"

                for i, val in enumerate(row_data):
                    if i == 0 or headers and headers[i] in ("pokémon", "pokemon", "species"):
                        pokemon = normalize_pokemon_name(val.split()[0]) if val else ""
                    elif headers and headers[i] in ("location", "area", "place"):
                        location = val
                    elif headers and headers[i] in ("notes", "remarks", "conditions", "note"):
                        notes = val

                if not pokemon:
                    continue

                # Check if egg
                if "egg" in row_text:
                    method = "egg"

                results.append({
                    "pokemon": pokemon,
                    "location": location,
                    "notes": notes,
                    "method": method,
                })
                logger.debug(f"  Gift: {pokemon} @ {location!r} ({method})")

    logger.info(f"  Found {len(results)} gift Pokémon for {game['name']}")
    return results


# ── In-game trade scraping ─────────────────────────────────────────────────

def scrape_trades(game: dict) -> list[dict]:
    """
    Scrape the Bulbapedia In-game Trade page.
    Returns list of {give, receive, location, notes}.
    """
    html = fetch_html(TRADE_PAGE)
    soup = BeautifulSoup(html, "lxml")
    content = soup.find("div", class_="mw-parser-output")
    if not content:
        return []

    gen = game["gen"]
    version_slug = game["pokeapi_version"].lower()
    results = []
    current_gen = 0

    for el in content.find_all(["h2", "table"]):
        if el.name == "h2":
            text = el.get_text(strip=True)
            m = re.search(r"Generation (\w+)", text, re.I)
            if m:
                gen_map = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5}
                current_gen = gen_map.get(m.group(1).upper(), 0)
            continue

        if el.name == "table" and current_gen == gen:
            rows = el.find_all("tr")
            if not rows:
                continue
            headers = [th.get_text(strip=True).lower() for th in rows[0].find_all("th")]

            for row in rows[1:]:
                cells = row.find_all(["td", "th"])
                row_data = [c.get_text(" ", strip=True) for c in cells]
                row_text = " ".join(row_data).lower()

                if version_slug not in row_text:
                    continue

                give = receive = location = notes = ""
                for i, val in enumerate(row_data):
                    h = headers[i] if i < len(headers) else ""
                    if "give" in h or "offer" in h or "trade away" in h:
                        give = normalize_pokemon_name(val.split()[0]) if val else ""
                    elif "receive" in h or "get" in h or "obtain" in h:
                        receive = normalize_pokemon_name(val.split()[0]) if val else ""
                    elif "location" in h or "area" in h:
                        location = val
                    elif "note" in h or "condition" in h:
                        notes = val

                if receive:
                    results.append({
                        "give": give,
                        "receive": receive,
                        "location": location,
                        "notes": notes,
                        "method": "trade",
                    })

    logger.info(f"  Found {len(results)} in-game trades for {game['name']}")
    return results


# ── Inject starters ────────────────────────────────────────────────────────

def make_starter_location(game: dict) -> dict:
    """Build the starter Pokémon location entry."""
    return {
        "id": "starter",
        "name": "Starter Pokémon",
        "type": "starter",
        "access_notes": None,
        "pokeapi_location_area": None,
        "encounters": [
            {"pokemon": s, "method": "starter", "is_choice": True}
            for s in game["starters"]
        ],
    }


# ── Checkpoint matching ────────────────────────────────────────────────────

def _all_location_names(checkpoints: list[dict]) -> list[tuple[int, int, str]]:
    """
    Return (cp_index, loc_index, name) for every location across all checkpoints.
    Used for fuzzy matching injection targets.
    """
    result = []
    for ci, cp in enumerate(checkpoints):
        for li, loc in enumerate(cp.get("locations", [])):
            result.append((ci, li, loc.get("name", "")))
    return result


def find_best_checkpoint(location_hint: str, checkpoints: list[dict]) -> int | None:
    """
    Given a location hint string (e.g. "Celadon City"), find the index of the
    checkpoint that most likely contains (or is closest to) that location.
    Returns the checkpoint index or None.
    """
    if not location_hint or not checkpoints:
        return None

    # Collect all location names with their checkpoint indices
    all_locs = _all_location_names(checkpoints)
    if not all_locs:
        return None

    names = [name for _, _, name in all_locs]
    target = location_hint.strip()

    # Try exact (case-insensitive)
    for ci, li, name in all_locs:
        if name.lower() == target.lower():
            return ci

    # Fuzzy
    result = process.extractOne(target, names, scorer=fuzz.token_sort_ratio)
    if result and result[1] >= 65:
        idx = names.index(result[0])
        return all_locs[idx][0]

    # Fallback: match against checkpoint names
    cp_names = [cp.get("name", "") for cp in checkpoints]
    result2 = process.extractOne(target, cp_names, scorer=fuzz.token_sort_ratio)
    if result2 and result2[1] >= 65:
        return cp_names.index(result2[0])

    return None


def _build_location_entry(entry: dict, loc_type: str) -> dict:
    """Build a location dict for a gift/trade/static entry."""
    name = entry.get("location") or entry.get("notes") or entry.get("pokemon", "Unknown")
    method = entry.get("method", "gift")
    pokemon = entry.get("pokemon") or entry.get("receive", "")

    enc: dict = {"pokemon": pokemon, "method": method}
    if entry.get("notes"):
        enc["notes"] = entry["notes"]
    if entry.get("give"):
        enc["give"] = entry["give"]  # for trades
    if method == "starter":
        enc["is_choice"] = True

    return {
        "id": build_location_id(f"{method}_{pokemon}"),
        "name": f"{pokemon} ({method.replace('_', ' ').title()})"
               + (f" — {name}" if name != pokemon else ""),
        "type": loc_type,
        "access_notes": entry.get("notes") or None,
        "pokeapi_location_area": None,
        "encounters": [enc],
        "_injected_by": "specials",
    }


def inject_specials(data: dict, game: dict) -> dict:
    """
    Inject starters, gifts, and trades into the checkpoint structure.
    Modifies data in-place and returns it.
    """
    checkpoints = data.get("checkpoints", [])
    unmatched_log: list[str] = []

    # 1. Starters — always go into the FIRST checkpoint's locations (at position 0)
    starter_loc = make_starter_location(game)
    if checkpoints:
        existing_ids = {loc["id"] for loc in checkpoints[0].get("locations", [])}
        if starter_loc["id"] not in existing_ids:
            checkpoints[0].setdefault("locations", []).insert(0, starter_loc)
            logger.debug("  Injected starters into first checkpoint")

    # 2. Gifts
    gifts = scrape_gifts(game)
    for gift in gifts:
        ci = find_best_checkpoint(gift.get("location", ""), checkpoints)
        if ci is not None:
            loc = _build_location_entry(gift, "egg" if gift["method"] == "egg" else "gift")
            checkpoints[ci].setdefault("locations", []).append(loc)
        else:
            unmatched_log.append(f"gift: {gift['pokemon']} @ {gift.get('location')!r}")

    # 3. Trades
    trades = scrape_trades(game)
    for trade in trades:
        ci = find_best_checkpoint(trade.get("location", ""), checkpoints)
        if ci is not None:
            loc = _build_location_entry(trade, "trade")
            checkpoints[ci].setdefault("locations", []).append(loc)
        else:
            unmatched_log.append(f"trade: {trade['receive']} @ {trade.get('location')!r}")

    if unmatched_log:
        data.setdefault("_unmatched_specials", []).extend(unmatched_log)
        for s in unmatched_log:
            logger.warning(f"  Unmatched special: {s}")

    return data


# ── Main ───────────────────────────────────────────────────────────────────

def process_specials(game_id: str) -> dict:
    """
    Load enriched YAML, inject specials, write updated file.
    """
    game = GAMES[game_id]
    enriched_path = OUTPUT_DIR / f"{game_id}_enriched.yaml"
    if not enriched_path.exists():
        logger.error(f"Enriched file not found: {enriched_path}. Run enrich first.")
        return {}

    with open(enriched_path, encoding="utf-8") as f:
        data = yaml.safe_load(f)

    logger.info(f"=== Injecting specials for {game['name']} ===")
    data = inject_specials(data, game)

    with open(enriched_path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, allow_unicode=True, sort_keys=False, default_flow_style=False)

    logger.info(f"  Updated {enriched_path.name}")
    return data


# ── CLI ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Inject gift/trade/static encounters")
    parser.add_argument("games", nargs="*", default=ALL_GAME_IDS)
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    setup_logging(args.verbose)

    for gid in args.games:
        if gid not in GAMES:
            logger.error(f"Unknown game: {gid}")
            sys.exit(1)
        process_specials(gid)
