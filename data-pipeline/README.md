# Soul Link Tracker — Encounter Data Pipeline

Generates `encounters.json` with all wild/gift/trade/static encounter locations
for Gen 1–5 games, grouped by the checkpoint (gym/rival/boss/E4/champion) they
precede.

## Setup

```bash
cd data-pipeline
pip install -r requirements.txt
```

## Quick start

```bash
# Run all 5 steps for all 20 games (~30–60 min first run, cached after)
python pipeline.py

# Single game (recommended for testing)
python pipeline.py platinum

# Gen 1 only
python pipeline.py red blue yellow

# Specific steps only
python pipeline.py platinum --steps scrape enrich
python pipeline.py --steps compile         # compile existing YAMLs

# Verbose logging
python pipeline.py platinum -v
```

## Pipeline steps

| Step | Script | Input | Output |
|------|--------|-------|--------|
| `scrape` | `scrape.py` | Bulbapedia HTML | `output/{game}_scraped.yaml` |
| `enrich` | `enrich.py` | scraped YAML + PokeAPI | `output/{game}_enriched.yaml` |
| `specials` | `specials.py` | enriched YAML + Bulbapedia | updates enriched YAML |
| `validate` | `validate.py` | enriched YAML | console report |
| `compile` | `compile.py` | all enriched YAMLs | `output/encounters.json` |

All HTTP responses are cached in `cache/html/` and `cache/api/`.
Re-runs only hit the network for new URLs.

## Output schema

```yaml
game: platinum
name: "Pokémon Platinum"
gen: 4
region: sinnoh
starters: [Turtwig, Chimchar, Piplup]
checkpoints:
  - id: rival_1_barry
    name: "Barry (Route 201)"
    type: rival        # rival | gym | elite4 | champion | boss | postgame
    gym_leader: null
    badge: null
    level_cap: null    # fill in manually or from game data
    locations:
      - id: starter
        name: "Starter Pokémon"
        type: starter  # grass | surf | old_rod | good_rod | super_rod |
                       # gift | egg | static | trade | headbutt | rock_smash | starter
        access_notes: null
        pokeapi_location_area: null
        encounters:
          - pokemon: Turtwig
            method: starter
            is_choice: true

      - id: route_201
        name: "Route 201"
        type: grass
        access_notes: null
        pokeapi_location_area: "sinnoh-route-201-area"
        encounters:
          - pokemon: Starly
            level: 2
            level_max: 4
            method: walk
            chance: 50
```

## Error flags to review after running

After the pipeline completes, search the output YAMLs for these flags:

- `_enrich_error: no_area_found` — PokeAPI slug resolution failed; set `pokeapi_location_area` manually
- `_enrich_error: no_encounters_for_version` — area found but no encounters for this version
- `_scrape_confidence: low` — heading classification was ambiguous; review ordering
- `_unmatched_specials` — gift/trade couldn't be placed in a checkpoint; add manually

## Accuracy expectations

- **Checkpoint ordering**: ~70–80% correct automatically. Review `_scrape_confidence: low` items.
- **PokeAPI slugs**: ~60–70% exact match, ~20% fuzzy (check `_enrich_note: fuzzy-matched`).
- **Gifts/trades**: Parsed from Bulbapedia tables; placement is fuzzy-matched. Always verify.
- **Rod gating**: Detected from walkthrough text patterns. May miss some.

The output is a starting point for manual review — not a finished product.

## Manual correction workflow

1. Run the pipeline for one game:
   `python pipeline.py platinum -v`

2. Open `output/platinum_enriched.yaml` in your editor.

3. Search for `_enrich_error`, `_scrape_confidence: low`, `_unmatched_specials`.

4. Fix ordering, add missing slugs, move misplaced specials.

5. Run `python pipeline.py platinum --steps validate` to re-check.

6. Once satisfied, compile:
   `python pipeline.py --steps compile`

## Adding the data to the tracker

Once `encounters.json` is generated and manually reviewed, copy or symlink it into
`src/renderer/src/data/encounters.json` and import it in the game data layer.
