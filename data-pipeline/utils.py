"""
Shared utilities: HTTP caching, slug normalisation, fuzzy matching, logging.
"""

import hashlib
import json
import os
import re
import time
import logging
from pathlib import Path

import requests
from rapidfuzz import fuzz, process

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).parent / "cache"
HTML_CACHE = CACHE_DIR / "html"
API_CACHE = CACHE_DIR / "api"

_SESSION = None


def get_session() -> requests.Session:
    global _SESSION
    if _SESSION is None:
        _SESSION = requests.Session()
        _SESSION.headers["User-Agent"] = (
            "SoulLinkTrackerDataPipeline/1.0 (educational; contact via github)"
        )
    return _SESSION


def _cache_key(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()


def fetch_html(url: str, force: bool = False) -> str:
    """Fetch a URL with local HTML caching. Returns HTML string."""
    HTML_CACHE.mkdir(parents=True, exist_ok=True)
    key = _cache_key(url)
    cache_file = HTML_CACHE / f"{key}.html"

    if not force and cache_file.exists():
        logger.debug(f"HTML cache hit: {url}")
        return cache_file.read_text(encoding="utf-8")

    logger.info(f"Fetching HTML: {url}")
    resp = get_session().get(url, timeout=30)
    resp.raise_for_status()
    html = resp.text
    cache_file.write_text(html, encoding="utf-8")
    time.sleep(0.5)  # be polite
    return html


def fetch_json(url: str, force: bool = False) -> dict:
    """Fetch a JSON URL with local caching. Returns parsed dict."""
    API_CACHE.mkdir(parents=True, exist_ok=True)
    key = _cache_key(url)
    cache_file = API_CACHE / f"{key}.json"

    if not force and cache_file.exists():
        logger.debug(f"API cache hit: {url}")
        return json.loads(cache_file.read_text(encoding="utf-8"))

    logger.info(f"Fetching JSON: {url}")
    resp = get_session().get(url, timeout=30)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    data = resp.json()
    cache_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    time.sleep(0.25)
    return data


def slugify(text: str) -> str:
    """Convert a display name to a URL-safe slug: 'Route 201' → 'route-201'."""
    text = text.lower()
    text = re.sub(r"[''']", "", text)          # remove apostrophes
    text = re.sub(r"[^a-z0-9]+", "-", text)   # non-alnum → hyphen
    text = text.strip("-")
    return text


def location_to_area_slug(name: str) -> list[str]:
    """
    Generate candidate PokeAPI location-area slugs for a location name.
    Returns a list of candidates to try (best first).
    e.g. 'Route 201' → ['route-201-area', 'sinnoh-route-201-area']
    """
    base = slugify(name)
    candidates = [
        f"{base}-area",
        base,
        f"{base}-1",
        f"{base}-1f",
        f"{base}-south",
        f"{base}-north",
        f"{base}-east",
        f"{base}-west",
        f"{base}-b1f",
    ]
    return candidates


def fuzzy_match_slug(target: str, choices: list[str], threshold: int = 70) -> str | None:
    """
    Find the best fuzzy match for `target` in `choices`.
    Returns the matched string or None if below threshold.
    """
    if not choices:
        return None
    result = process.extractOne(
        target, choices, scorer=fuzz.token_sort_ratio
    )
    if result and result[1] >= threshold:
        return result[0]
    return None


def normalize_pokemon_name(name: str) -> str:
    """Normalise a Pokémon name to title-case for consistent output."""
    return name.strip().title()


def build_checkpoint_id(kind: str, name: str, index: int) -> str:
    """Generate a stable ID for a checkpoint, e.g. 'gym_1_roark'."""
    slug = slugify(name)
    # Keep only the first meaningful word chunk
    slug = re.sub(r"-+", "_", slug)[:40].strip("_")
    return f"{kind}_{index}_{slug}" if slug else f"{kind}_{index}"


def build_location_id(name: str, suffix: str = "") -> str:
    """Generate a stable ID for a location, e.g. 'route_201' or 'route_204_south'."""
    slug = re.sub(r"-+", "_", slugify(name))
    if suffix:
        return f"{slug}_{slugify(suffix)}"
    return slug


def detect_access_notes(text: str) -> str | None:
    """
    Scan raw section text for HM or rod requirement mentions.
    Returns a short human-readable note or None.
    """
    text_l = text.lower()
    notes = []
    hm_map = {
        "surf": "Requires Surf",
        "cut": "Requires Cut",
        "strength": "Requires Strength",
        "rock smash": "Requires Rock Smash",
        "waterfall": "Requires Waterfall",
        "whirlpool": "Requires Whirlpool",
        "rock climb": "Requires Rock Climb",
        "defog": "Requires Defog",
        "flash": "Requires Flash",
    }
    for kw, note in hm_map.items():
        if kw in text_l and note not in notes:
            notes.append(note)
    return "; ".join(notes) if notes else None


def setup_logging(verbose: bool = False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
