"""
Step 1 — Scrape Bulbapedia walkthrough pages.

For each game, fetches the walkthrough index and all section sub-pages,
walks headings in document order, classifies each as 'checkpoint' or 'location',
and accumulates locations under the checkpoint they precede.

Output: data-pipeline/output/{game_id}_scraped.yaml
"""

import logging
import re
import sys
from pathlib import Path
from typing import Any

import yaml
from bs4 import BeautifulSoup, Tag

from games_config import GAMES, ALL_GAME_IDS, BULBAPEDIA_BASE, LOCATION_KEYWORDS, CHECKPOINT_KEYWORDS
from utils import fetch_html, slugify, build_checkpoint_id, build_location_id, detect_access_notes

logger = logging.getLogger(__name__)
OUTPUT_DIR = Path(__file__).parent / "output"

# ── Heading classification ──────────────────────────────────────────────────

def _all_checkpoint_names(game: dict) -> list[str]:
    """Collect all known person/entity names that signal a checkpoint."""
    names = []
    for key in ("gym_leaders", "rivals", "elite4", "champion", "bosses"):
        names.extend(game.get(key, []))
    return [n.lower() for n in names]


def classify_heading(text: str, game: dict, level: int) -> tuple[str, str]:
    """
    Classify a heading as 'checkpoint' or 'location'.
    Returns (type, confidence) where confidence is 'high' | 'medium' | 'low'.
    """
    t = text.lower()

    # ── Explicit checkpoint keywords (high confidence) ──────────────────────
    for kw in CHECKPOINT_KEYWORDS:
        if kw in t:
            return "checkpoint", "high"

    # Gym: "Gym N" or "Gym Leader" or heading ends with "Gym" (e.g. "Pewter City Gym")
    if re.search(r"\bgym\b", t):
        # But "Gym" alone in a location heading like "Pewter Gym" IS a checkpoint
        # whereas "Gym Notes" or "Optional: Gym" could be noise — treat all as checkpoint
        return "checkpoint", "high"

    # Known trainer names from game config
    checkpoint_names = _all_checkpoint_names(game)
    for name in checkpoint_names:
        if name in t:
            # Additional context check: rival names can appear in location descriptions too
            if name in (n.lower() for n in game.get("rivals", [])):
                # Only a checkpoint if the heading also contains fight-related words
                if any(w in t for w in ["battle", "fight", "vs.", "vs ", "rival", "encounter"]):
                    return "checkpoint", "high"
                # OR if heading is short (just the rival name + route)
                if len(t.split()) <= 5:
                    return "checkpoint", "medium"
            else:
                return "checkpoint", "high"

    # ── Location keywords (high confidence) ──────────────────────────────────
    for kw in LOCATION_KEYWORDS:
        if re.search(rf"\b{re.escape(kw)}\b", t):
            # "victory road" is actually a location encountered before the checkpoint
            return "location", "high"

    # h3/h4 sub-headings: common sub-content labels to skip entirely
    if level >= 3:
        skip_words = [
            "pokémon", "pokemon", "trainers", "items", "optional",
            "note", "tips", "events", "first visit", "second visit",
            "after", "before", "return", "revisit", "overview",
        ]
        if any(w in t for w in skip_words):
            return "skip", "high"

    # Default: treat as location with low confidence if level 2, skip if deeper
    if level == 2:
        return "location", "low"
    return "skip", "low"


# ── Walkthrough index parsing ───────────────────────────────────────────────

def get_section_urls(game: dict) -> list[str]:
    """
    Fetch the walkthrough index page and return section subpage URLs in order.
    """
    slug = game["walkthrough_slug"]
    index_url = f"{BULBAPEDIA_BASE}/wiki/Appendix:{slug}"
    html = fetch_html(index_url)
    soup = BeautifulSoup(html, "lxml")

    # Find links to sub-pages (Section_N or Part_N pattern)
    content = soup.find("div", class_="mw-parser-output")
    if not content:
        logger.warning(f"No mw-parser-output in {index_url}")
        return []

    section_urls = []
    seen = set()
    base_path = f"/wiki/Appendix:{slug}/"
    for a in content.find_all("a", href=True):
        href = a["href"]
        if base_path.lower() in href.lower():
            full = BULBAPEDIA_BASE + href if href.startswith("/") else href
            # Remove anchors
            full = full.split("#")[0]
            if full not in seen:
                seen.add(full)
                section_urls.append(full)

    # Fallback: look for links with "Section" or "Part" in the path
    if not section_urls:
        for a in content.find_all("a", href=True):
            href = a["href"]
            if re.search(r"/Section_\d+|/Part_\d+", href, re.I):
                full = BULBAPEDIA_BASE + href if href.startswith("/") else href
                full = full.split("#")[0]
                if full not in seen:
                    seen.add(full)
                    section_urls.append(full)

    logger.info(f"Found {len(section_urls)} sections for {game['id']}")
    return section_urls


# ── Section page parsing ────────────────────────────────────────────────────

_ROUTE_HALF_RE = re.compile(
    r"\b(north|south|east|west|upper|lower|1f|2f|b1f|b2f|part [12]|half)\b", re.I
)
_ROD_RECEIVE_RE = re.compile(
    r"\b(received?|got|obtain|given)\b.*?\b(old rod|good rod|super rod)\b", re.I
)
_ROD_USE_RE = re.compile(r"\b(old rod|good rod|super rod)\b", re.I)
_STATIC_RE = re.compile(
    r"\b(a wild|interact|approach|examine|battle with|will appear|is standing)\b", re.I
)


def _heading_text(tag: Tag) -> str:
    """Extract clean text from a heading tag, stripping edit links."""
    for span in tag.find_all("span", class_="mw-editsection"):
        span.decompose()
    return tag.get_text(separator=" ", strip=True)


def _heading_level(tag: Tag) -> int:
    return int(tag.name[1])  # h2→2, h3→3, h4→4


def parse_section(html: str, game: dict, section_url: str) -> list[dict]:
    """
    Parse one walkthrough section page into a flat list of items:
      {"kind": "checkpoint"|"location"|"rod_event", "text": ..., "confidence": ..., ...}

    Rods received are emitted as special events so enrich.py can gate fishing.
    """
    soup = BeautifulSoup(html, "lxml")
    content = soup.find("div", class_="mw-parser-output")
    if not content:
        logger.warning(f"No content div in {section_url}")
        return []

    items = []
    current_heading_tag = None
    current_heading_text = ""
    current_section_paragraphs = []

    def flush_section_text():
        """Emit any rod-receive events found in accumulated paragraphs."""
        full_text = " ".join(current_section_paragraphs)
        for m in _ROD_RECEIVE_RE.finditer(full_text):
            rod_name = m.group(2).lower().replace(" ", "_")
            items.append({"kind": "rod_event", "rod": rod_name, "text": m.group(0)})
            logger.debug(f"  Rod event: {m.group(0)}")

    for el in content.children:
        if not isinstance(el, Tag):
            continue

        # Collect paragraph text for rod/HM detection
        if el.name in ("p", "li"):
            current_section_paragraphs.append(el.get_text(" ", strip=True))
            continue

        if el.name not in ("h2", "h3", "h4"):
            continue

        # We hit a new heading — flush accumulated text first
        flush_section_text()
        current_section_paragraphs = []

        text = _heading_text(el)
        level = _heading_level(el)
        kind, confidence = classify_heading(text, game, level)

        if kind == "skip":
            continue

        logger.debug(f"  [{kind}/{confidence}] {text!r} (h{level})")

        if kind == "checkpoint":
            # Determine checkpoint sub-type
            cp_type = _infer_checkpoint_type(text, game)
            items.append({
                "kind": "checkpoint",
                "text": text,
                "type": cp_type,
                "confidence": confidence,
                "source_url": section_url,
            })

        else:  # location
            # Detect if this is a route half (south/north/etc.)
            half_match = _ROUTE_HALF_RE.search(text)
            suffix = half_match.group(0).lower().replace(" ", "_") if half_match else ""

            # Detect HM requirements
            # We'll refine this later once we have the full section text, but emit now
            items.append({
                "kind": "location",
                "text": text,
                "confidence": confidence,
                "suffix": suffix,  # e.g. "south" for Route 204 South
                "source_url": section_url,
            })

    flush_section_text()
    return items


def _infer_checkpoint_type(text: str, game: dict) -> str:
    """Map heading text to checkpoint type: rival | gym | elite4 | champion | boss."""
    t = text.lower()
    if any(n.lower() in t for n in game.get("rivals", [])):
        if any(w in t for w in ["battle", "fight", "vs", "rival"]) or len(t.split()) <= 6:
            return "rival"
    if any(n.lower() in t for n in game.get("elite4", [])):
        return "elite4"
    if any(n.lower() in t for n in game.get("champion", [])):
        # Champion and E4 have overlap; prefer champion if "champion" in text
        if "champion" in t:
            return "champion"
        return "elite4"
    if "elite four" in t or "elite 4" in t:
        return "elite4"
    if "champion" in t:
        return "champion"
    if "gym" in t:
        return "gym"
    if any(n.lower() in t for n in game.get("bosses", [])):
        return "boss"
    return "boss"  # fallback


# ── Checkpoint accumulator ─────────────────────────────────────────────────

def build_checkpoints(flat_items: list[dict], game: dict) -> list[dict]:
    """
    Convert a flat list of location/checkpoint/rod_event items into the final
    checkpoint list, where each checkpoint contains the locations accessible
    before it (i.e. since the previous checkpoint).
    """
    checkpoints = []
    pending_locations: list[dict] = []
    cp_counters: dict[str, int] = {}
    rod_state: set[str] = set()  # rods currently available

    # Inject a synthetic "pre-game" checkpoint at position 0 if the walkthrough
    # starts with locations before the first actual fight.
    first_fight_idx = next(
        (i for i, x in enumerate(flat_items) if x["kind"] == "checkpoint"), None
    )

    for item in flat_items:
        if item["kind"] == "rod_event":
            rod_state.add(item["rod"])
            continue

        if item["kind"] == "checkpoint":
            cp_type = item["type"]
            cp_counters[cp_type] = cp_counters.get(cp_type, 0) + 1
            idx = cp_counters[cp_type]

            cp_id = build_checkpoint_id(cp_type, item["text"], idx)
            cp = {
                "id": cp_id,
                "name": item["text"],
                "type": cp_type,
                "gym_leader": _extract_gym_leader(item["text"], game),
                "badge": None,              # filled by specials.py
                "level_cap": None,          # filled by specials.py / manual
                "_scrape_confidence": item["confidence"],
                "_source_url": item["source_url"],
                "locations": [_finalise_location(loc, rod_state) for loc in pending_locations],
            }
            checkpoints.append(cp)
            pending_locations = []

        elif item["kind"] == "location":
            pending_locations.append({**item, "_rod_state": set(rod_state)})

    # Any trailing locations after the last checkpoint go to a "postgame" group
    if pending_locations:
        cp_counters["postgame"] = cp_counters.get("postgame", 0) + 1
        checkpoints.append({
            "id": "postgame",
            "name": "Post-Game",
            "type": "postgame",
            "gym_leader": None,
            "badge": None,
            "level_cap": None,
            "_scrape_confidence": "low",
            "_source_url": "",
            "locations": [_finalise_location(loc, rod_state) for loc in pending_locations],
        })

    return checkpoints


def _extract_gym_leader(text: str, game: dict) -> str | None:
    """Try to extract the gym leader name from a checkpoint heading."""
    t = text.lower()
    for name in game.get("gym_leaders", []):
        if name.lower() in t:
            return name
    return None


def _finalise_location(item: dict, rod_state: set) -> dict:
    """Convert a raw location item to the output location dict."""
    name = item["text"]
    suffix = item.get("suffix", "")
    loc_id = build_location_id(name, suffix)

    # Infer location type from name
    loc_type = _infer_location_type(name)

    # For fishing locations, check if appropriate rod is available
    if loc_type in ("old_rod", "good_rod", "super_rod"):
        if loc_type not in rod_state:
            # Rod not yet received — skip or flag
            return {
                "id": loc_id,
                "name": name + (f" ({suffix.replace('_', ' ').title()})" if suffix else ""),
                "type": loc_type,
                "access_notes": f"Requires {loc_type.replace('_', ' ').title()} (not yet available at this point)",
                "pokeapi_location_area": None,
                "encounters": [],
                "_scrape_confidence": item["confidence"],
                "_enrich_error": "rod_not_available",
            }

    loc = {
        "id": loc_id,
        "name": name + (f" ({suffix.replace('_', ' ').title()})" if suffix else ""),
        "type": loc_type,
        "access_notes": None,
        "pokeapi_location_area": None,   # filled by enrich.py
        "encounters": [],                 # filled by enrich.py
        "_scrape_confidence": item["confidence"],
    }

    if item["confidence"] == "low":
        loc["_scrape_confidence"] = "low"

    return loc


def _infer_location_type(name: str) -> str:
    """Infer encounter type from location name."""
    t = name.lower()
    if re.search(r"\bold rod\b", t):
        return "old_rod"
    if re.search(r"\bgood rod\b", t):
        return "good_rod"
    if re.search(r"\bsuper rod\b", t):
        return "super_rod"
    if re.search(r"\bsurf\b", t) or re.search(r"\bwater\b", t) and "waterfall" not in t:
        return "surf"
    if re.search(r"\bheadbutt\b", t):
        return "headbutt"
    if re.search(r"\brock smash\b", t):
        return "rock_smash"
    # Default: grass/walk encounter
    return "grass"


# ── Main per-game scrape ───────────────────────────────────────────────────

def scrape_game(game_id: str) -> dict:
    """
    Scrape all walkthrough sections for one game.
    Returns the full scraped structure and writes {game_id}_scraped.yaml.
    """
    game = GAMES[game_id]
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    logger.info(f"=== Scraping {game['name']} ===")

    section_urls = get_section_urls(game)
    if not section_urls:
        logger.error(f"No sections found for {game_id}")
        return {}

    # Collect flat items from all sections in order
    all_items: list[dict] = []
    for url in section_urls:
        logger.info(f"  Section: {url}")
        html = fetch_html(url)
        items = parse_section(html, game, url)
        all_items.extend(items)
        logger.info(f"    → {len(items)} items")

    checkpoints = build_checkpoints(all_items, game)

    result = {
        "game": game_id,
        "name": game["name"],
        "gen": game["gen"],
        "region": game["region"],
        "starters": game["starters"],
        "checkpoints": checkpoints,
        "_scrape_stats": {
            "total_sections": len(section_urls),
            "total_checkpoints": len(checkpoints),
            "total_locations": sum(len(cp["locations"]) for cp in checkpoints),
        },
    }

    out_path = OUTPUT_DIR / f"{game_id}_scraped.yaml"
    with open(out_path, "w", encoding="utf-8") as f:
        yaml.dump(result, f, allow_unicode=True, sort_keys=False, default_flow_style=False)

    logger.info(
        f"  Wrote {out_path.name}: "
        f"{result['_scrape_stats']['total_checkpoints']} checkpoints, "
        f"{result['_scrape_stats']['total_locations']} locations"
    )
    return result


# ── CLI entry point ────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    from utils import setup_logging

    parser = argparse.ArgumentParser(description="Scrape Bulbapedia walkthroughs")
    parser.add_argument("games", nargs="*", default=ALL_GAME_IDS, help="Game IDs to scrape")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    setup_logging(args.verbose)

    for gid in args.games:
        if gid not in GAMES:
            logger.error(f"Unknown game: {gid}")
            sys.exit(1)
        scrape_game(gid)
