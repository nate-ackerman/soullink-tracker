// ── Types ─────────────────────────────────────────────────────────────────────

export interface BallInfo {
  id: string
  name: string
  note?: string
}

export interface CatchCalcParams {
  maxHp: number
  currentHp: number
  catchRate: number
  ballBonus: number
  statusBonus: number
  generation: number
}

export interface CatchResult {
  probability: number
  percentDisplay: string
  expectedBalls: number
}

// ── Status bonuses ─────────────────────────────────────────────────────────────
// Gen 3+: multiplicative. Gen 1/2: additive (+25 or +12) but we use the same
// multiplier approximation here since the effective difference is minor.

export const STATUS_BONUSES: Record<string, number> = {
  none:      1,
  sleep:     2.5,    // 2.5× in Gen 3+ (2× in Gen 1/2)
  freeze:    2.5,
  paralysis: 1.5,
  burn:      1.5,
  poison:    1.5,
  toxic:     1.5,
}

export const STATUS_OPTIONS = Object.keys(STATUS_BONUSES).map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}))

// ── Ball catalog ───────────────────────────────────────────────────────────────

const BASE_BALLS: BallInfo[] = [
  { id: 'pokeball',   name: 'Poké Ball' },
  { id: 'greatball',  name: 'Great Ball' },
  { id: 'ultraball',  name: 'Ultra Ball' },
  { id: 'masterball', name: 'Master Ball',  note: '100% catch' },
  { id: 'safariball', name: 'Safari Ball',  note: 'Safari Zone' },
]

// Gen 2 Apricorn balls — also available in HGSS (Gen 4)
const APRICORN_BALLS: BallInfo[] = [
  { id: 'lureball',   name: 'Lure Ball',   note: 'Fishing' },
  { id: 'moonball',   name: 'Moon Ball',   note: 'Moon Stone evo lines' },
  { id: 'loveball',   name: 'Love Ball',   note: 'Opposite gender, same species' },
  { id: 'fastball',   name: 'Fast Ball',   note: 'Speed ≥ 100 or fleeing' },
  { id: 'heavyball',  name: 'Heavy Ball',  note: 'Heavy Pokémon (bonus varies by weight)' },
  { id: 'levelball',  name: 'Level Ball',  note: 'Lower level than yours' },
  { id: 'friendball', name: 'Friend Ball', note: 'Sets happiness to 200' },
]

const GEN3_BALLS: BallInfo[] = [
  { id: 'netball',    name: 'Net Ball',    note: 'vs Water/Bug types' },
  { id: 'diveball',   name: 'Dive Ball',   note: 'Surfing/Diving' },
  { id: 'nestball',   name: 'Nest Ball',   note: 'Low-level (scales by level)' },
  { id: 'repeatball', name: 'Repeat Ball', note: 'Registered in Pokédex' },
  { id: 'timerball',  name: 'Timer Ball',  note: 'Turn-dependent' },
  { id: 'luxuryball', name: 'Luxury Ball' },
]

const GEN4_BALLS: BallInfo[] = [
  { id: 'duskball',   name: 'Dusk Ball',   note: 'Cave or nighttime' },
  { id: 'quickball',  name: 'Quick Ball',  note: 'Turn 1 only' },
  { id: 'healball',   name: 'Heal Ball' },
]

/** Returns the balls legally obtainable in the given game. */
export function getAvailableBalls(gameId: string, gen: number): BallInfo[] {
  const isHGSS = gameId === 'heartgold' || gameId === 'soulsilver'
  if (gen <= 1)  return BASE_BALLS
  if (gen === 2) return [...BASE_BALLS, ...APRICORN_BALLS]
  if (gen === 3) return [...BASE_BALLS, ...GEN3_BALLS]
  if (gen === 4) {
    return isHGSS
      ? [...BASE_BALLS, ...APRICORN_BALLS, ...GEN3_BALLS, ...GEN4_BALLS]
      : [...BASE_BALLS, ...GEN3_BALLS, ...GEN4_BALLS]
  }
  // Gen 5+
  return [...BASE_BALLS, ...GEN3_BALLS, ...GEN4_BALLS]
}

/**
 * Returns the effective ball multiplier for catch rate calculations.
 *
 * @param id    Ball ID string
 * @param level Wild Pokémon level (1–100) — affects Nest Ball
 * @param turns Turns elapsed in battle — affects Timer Ball and Quick Ball
 * @param gen   Game generation (kept for future use; currently unused after formula corrections)
 */
export function getBallBonus(id: string, level: number, turns: number, gen: number): number {
  switch (id) {
    case 'pokeball':   return 1
    case 'greatball':  return 1.5
    case 'ultraball':  return 2
    case 'masterball': return 255  // treated as auto-catch
    case 'safariball': return 1.5

    // Apricorn balls (Gen 2 / HGSS)
    case 'lureball':   return 3    // ×3 when fishing
    case 'moonball':   return 4    // ×4 vs Moon Stone evo lines
    case 'loveball':   return 8    // ×8 same species opposite gender
    case 'fastball':   return 4    // ×4 vs Pokémon with Speed ≥ 100 or that flee
    case 'heavyball':  return 1    // bonus is additive to catch rate (weight-dependent) — shown as 1× here
    case 'levelball':  return 2    // simplified ×2 (actual: ×2/4/8 depending on level ratio)
    case 'friendball': return 1    // no catch rate bonus

    // Gen 3 balls  (bonuses per dragonflycave.com/mechanics/gen-iii-iv-capturing/)
    case 'netball':    return 3        // ×3 vs Water/Bug types; ×1 otherwise (shown at ×3)
    case 'diveball':   return 3.5      // ×3.5 underwater/fishing; ×1 otherwise (shown at ×3.5)
    case 'nestball':   return Math.max(1, Math.floor((40 - level) / 10))
    case 'repeatball': return 3        // ×3 if registered in Pokédex; ×1 otherwise
    case 'timerball':  return Math.min(4, Math.floor((turns + 10) / 10))  // maxes at turn 30
    case 'luxuryball': return 1

    // Gen 4 balls
    case 'duskball':   return 3.5      // ×3.5 in caves/night; ×1 otherwise (shown at ×3.5)
    case 'quickball':  return turns === 1 ? 4 : 1  // ×4 on turn 1 only
    case 'healball':   return 1

    default: return 1
  }
}

// ── Core catch formula ─────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val))
}

export function calculateCatchProbability(params: CatchCalcParams): CatchResult {
  const { maxHp, currentHp, catchRate, ballBonus, statusBonus, generation } = params

  let probability: number

  if (generation <= 2) {
    // Gen 1/2: HP-scaled formula, approximated with 2 shake checks.
    const a = ((3 * maxHp - 2 * currentHp) * catchRate * ballBonus * statusBonus) / (3 * maxHp)
    const X = Math.max(1, a)
    if (X >= 255) return { probability: 1, percentDisplay: '100.00%', expectedBalls: 1 }
    const p = clamp(X / 255, 0, 1)
    probability = clamp(p * p, 0, 1)
  } else {
    // Gen 3/4+ — formula per dragonflycave.com/mechanics/gen-iii-iv-capturing/
    //
    // Step 1: X = ((3M - 2H) * C * B * S) / (3M), minimum 1
    const a = ((3 * maxHp - 2 * currentHp) * catchRate * ballBonus * statusBonus) / (3 * maxHp)
    const X = Math.max(1, a)
    //
    // Step 2: if X >= 255, auto-catch
    if (X >= 255) return { probability: 1, percentDisplay: '100.00%', expectedBalls: 1 }
    //
    // Step 3: Y = 65535 / sqrt(sqrt(255 / X))
    //         Each shake check: random(0–65535) must be < Y  →  P(shake) = Y / 65536
    //         4 shake checks  →  P(catch) = (Y / 65536)^4
    const Y = 65535 / Math.sqrt(Math.sqrt(255 / X))
    probability = clamp(Math.pow(Y / 65536, 4), 0, 1)
  }

  const expectedBalls = probability > 0 ? 1 / probability : Infinity

  return {
    probability,
    percentDisplay: `${(probability * 100).toFixed(2)}%`,
    expectedBalls: Math.round(expectedBalls * 10) / 10,
  }
}

export function calculateAllBalls(
  params: Omit<CatchCalcParams, 'ballBonus'> & { level: number; turns: number },
  balls: BallInfo[]
): Array<BallInfo & CatchResult & { ballBonus: number }> {
  const { level, turns, generation, ...rest } = params
  return balls.map((ball) => {
    const ballBonus = getBallBonus(ball.id, level, turns, generation)
    const result = calculateCatchProbability({ ...rest, ballBonus, generation })
    return { ...ball, ...result, ballBonus }
  })
}
