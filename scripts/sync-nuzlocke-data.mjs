/**
 * sync-nuzlocke-data.mjs
 *
 * Fetches trainer battle data from domtronn/nuzlocke.data and generates
 * src/renderer/src/data/leagueData.json for the Soul Link tracker app.
 *
 * Run: node scripts/sync-nuzlocke-data.mjs
 */

import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = 'https://raw.githubusercontent.com/domtronn/nuzlocke.data/main/leagues'
const OUT_JSON = join(__dirname, '../src/renderer/src/data/leagueData.json')
const OUT_REPORT = join(__dirname, '../sync-report.txt')

// Maps nuzlocke.data file key → our game IDs (for report only)
const GAME_FILES = {
  rb:   ['red', 'blue'],
  yel:  ['yellow'],
  frlg: ['firered', 'leafgreen'],
  gsc:  ['gold', 'silver', 'crystal'],
  rs:   ['ruby', 'sapphire'],
  em:   ['emerald'],
  dp:   ['diamond', 'pearl'],
  plat: ['platinum'],
  hgss: ['heartgold', 'soulsilver'],
  bw:   ['black', 'white'],
  b2w2: ['black2', 'white2'],
  xy:   ['x', 'y'],
  oras: ['omega-ruby', 'alpha-sapphire'],
  sm:   ['sun', 'moon'],
  usum: ['ultra-sun', 'ultra-moon'],
  swsh: ['sword', 'shield'],
  bdsp: ['brilliant-diamond', 'shining-pearl'],
  sv:   ['scarlet', 'violet'],
}

// ── ID → kind mapping ────────────────────────────────────────────────────────

function classifyId(id) {
  // Gym leaders: --1 through --8
  if (/^--[1-8]$/.test(id)) return 'gym'
  // Kanto revisit gyms in GSC/HGSS: --k1 through --k8
  if (/^--k\d+$/.test(id)) return 'gym'
  // Rivals: --r1, --r2, etc.
  if (/^--r\d+$/.test(id)) return 'rival'
  // Elite Four: --e1 through --e4
  if (/^--e\d+$/.test(id)) return 'elite4'
  // Champion: --c, --c1, --c2
  if (/^--c\d*$/.test(id)) return 'champion'
  // Everything else is a boss (named or numbered)
  return 'boss'
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parseLeagueFile(text) {
  const lines = text.split('\n').map(l => l.trim())
  const battles = []
  let current = null

  for (const line of lines) {
    // Skip comments and blank lines
    if (!line || line.startsWith('#')) continue

    // Trainer header: --id|Name|Specialty|Link[#Location][@Artist@URL]
    if (line.startsWith('--')) {
      if (current) battles.push(current)

      // The link field is parts[3], before any @ (artist) or # (location) suffixes
      const linkRaw = (line.split('|')[3] ?? '').split('@')[0].split('#')[0].trim()

      // Strip inline comments after @ (artist credits)
      const cleanLine = line.split('@')[0].trim()
      // Strip location hints after #
      const withoutLocation = cleanLine.split('#')[0].trim()

      const parts = withoutLocation.split('|')
      const nzId = parts[0]  // e.g. '--1', '--r2', '--archer'
      const name = (parts[1] ?? '').trim()
      const specialty = (parts[2] ?? '').trim().toLowerCase()

      current = {
        nzId,
        kind: classifyId(nzId),
        name,
        specialty,
        ...(linkRaw ? { imageUrl: linkRaw } : {}),
        team: [],
      }
      continue
    }

    // Metadata lines: ==key:value
    if (line.startsWith('==')) {
      // e.g. ==double:true — attach as metadata but don't create a Pokémon
      continue
    }

    // Pokémon line: species|level|moves|ability|item|weakness
    if (current) {
      const parts = line.split('|')
      const species = (parts[0] ?? '').trim().toLowerCase()
      const level = parseInt(parts[1] ?? '0', 10)

      if (!species || isNaN(level) || level <= 0) continue

      const movesRaw = (parts[2] ?? '').trim()
      const abilityRaw = (parts[3] ?? '').trim()
      const itemRaw = (parts[4] ?? '').trim()

      const starterRaw = (parts[5] ?? '').trim().toLowerCase()
      const pokemon = { species, level }

      if (movesRaw) {
        pokemon.moves = movesRaw.split(',').map(m => m.trim()).filter(Boolean)
      }
      if (abilityRaw) {
        pokemon.ability = abilityRaw
      }
      if (itemRaw) {
        pokemon.heldItem = itemRaw
      }
      if (starterRaw) {
        pokemon.starter = starterRaw
      }

      current.team.push(pokemon)
    }
  }

  if (current) battles.push(current)
  return battles
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const output = {}
  const reportLines = ['nuzlocke.data sync report', '='.repeat(40), '']

  for (const [key, gameIds] of Object.entries(GAME_FILES)) {
    const url = `${BASE}/${key}.txt`
    process.stdout.write(`Fetching ${key}.txt ... `)

    let text
    try {
      const res = await fetch(url)
      if (!res.ok) {
        console.log(`SKIP (${res.status})`)
        reportLines.push(`${key}: SKIPPED — HTTP ${res.status}`)
        continue
      }
      text = await res.text()
    } catch (err) {
      console.log(`ERROR (${err.message})`)
      reportLines.push(`${key}: ERROR — ${err.message}`)
      continue
    }

    const battles = parseLeagueFile(text)
    output[key] = battles

    const teamedCount = battles.filter(b => b.team.length > 0).length
    console.log(`OK — ${battles.length} battles, ${teamedCount} with teams`)

    // Report summary per key
    reportLines.push(`${key} (${gameIds.join(', ')}): ${battles.length} battles`)
    for (const b of battles) {
      if (b.team.length === 0) {
        reportLines.push(`  WARN: ${b.nzId} ${b.name} — no Pokémon data`)
      }
    }
  }

  reportLines.push('')
  reportLines.push(`Generated: ${new Date().toISOString()}`)

  writeFileSync(OUT_JSON, JSON.stringify(output, null, 2))
  writeFileSync(OUT_REPORT, reportLines.join('\n'))

  console.log(`\nWrote ${OUT_JSON}`)
  console.log(`Wrote ${OUT_REPORT}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
