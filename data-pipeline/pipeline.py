"""
Pipeline orchestrator — runs all steps in sequence.

Usage:
  python pipeline.py                       # all games, all steps
  python pipeline.py platinum              # single game, all steps
  python pipeline.py red blue --steps scrape enrich
  python pipeline.py --steps compile       # compile only (no game arg needed)
  python pipeline.py platinum --force      # re-fetch all cached HTML/JSON

Steps: scrape | enrich | specials | validate | compile
"""

import argparse
import logging
import sys
from pathlib import Path

from games_config import GAMES, ALL_GAME_IDS
from utils import setup_logging

logger = logging.getLogger(__name__)

ALL_STEPS = ["scrape", "enrich", "specials", "validate", "compile"]


def run_pipeline(game_ids: list[str], steps: list[str], force: bool = False):
    # Lazy imports so individual modules can also be run standalone
    if "scrape" in steps:
        from scrape import scrape_game
        for gid in game_ids:
            logger.info(f"\n{'=' * 60}")
            scrape_game(gid)

    if "enrich" in steps:
        from enrich import enrich_game
        for gid in game_ids:
            logger.info(f"\n{'=' * 60}")
            enrich_game(gid)

    if "specials" in steps:
        from specials import process_specials
        for gid in game_ids:
            logger.info(f"\n{'=' * 60}")
            process_specials(gid)

    if "validate" in steps:
        from validate import validate_all
        logger.info(f"\n{'=' * 60}")
        ok = validate_all(game_ids)
        if not ok:
            logger.error("Validation failed. Review errors above before compiling.")
            # Don't exit — still compile so you can review the output
            # sys.exit(1)

    if "compile" in steps:
        from compile import compile_all
        logger.info(f"\n{'=' * 60}")
        compile_all(game_ids)


def main():
    parser = argparse.ArgumentParser(
        description="Soul Link Tracker encounter data pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python pipeline.py                            # all 20 games, all steps
  python pipeline.py platinum                   # one game, all steps
  python pipeline.py red blue yellow            # gen 1 only
  python pipeline.py --steps scrape             # scrape only (no PokeAPI calls)
  python pipeline.py platinum --steps enrich    # enrich only (scrape already done)
  python pipeline.py --steps compile            # compile existing enriched YAMLs
  python pipeline.py platinum -v                # verbose logging
        """,
    )
    parser.add_argument(
        "games",
        nargs="*",
        default=[],
        help="Game IDs to process (default: all). E.g. platinum red blue",
    )
    parser.add_argument(
        "--steps",
        nargs="+",
        choices=ALL_STEPS,
        default=ALL_STEPS,
        metavar="STEP",
        help=f"Steps to run (default: all). Choices: {', '.join(ALL_STEPS)}",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-fetch all cached HTML and API responses",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    setup_logging(args.verbose)

    # Resolve game list
    if args.games:
        invalid = [g for g in args.games if g not in GAMES]
        if invalid:
            logger.error(f"Unknown game ID(s): {invalid}")
            logger.info(f"Valid IDs: {', '.join(ALL_GAME_IDS)}")
            sys.exit(1)
        game_ids = args.games
    else:
        game_ids = ALL_GAME_IDS

    # Compile doesn't need game-level iteration the same way
    # but we pass the list so it knows which YAMLs to include
    logger.info(
        f"Pipeline: games={game_ids}, steps={args.steps}, force={args.force}"
    )

    run_pipeline(game_ids, args.steps, force=args.force)
    logger.info("\nDone.")


if __name__ == "__main__":
    main()
