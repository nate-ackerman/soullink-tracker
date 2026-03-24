import type { ChainLink } from '../api/pokeapi'

/**
 * Walks an evolution chain starting from `currentSpeciesName` and returns
 * the final evolution stage, ignoring trigger type (level-up, trade, stone, etc.).
 * When a species has branched evolutions the first branch is followed.
 */
export function resolveFullEvolution(chain: ChainLink, currentSpeciesName: string): string {
  function findNode(link: ChainLink, name: string): ChainLink | null {
    if (link.species.name === name) return link
    for (const next of link.evolves_to) {
      const found = findNode(next, name)
      if (found) return found
    }
    return null
  }

  const startNode = findNode(chain, currentSpeciesName)
  if (!startNode) return currentSpeciesName

  function walkToEnd(link: ChainLink): string {
    if (link.evolves_to.length === 0) return link.species.name
    return walkToEnd(link.evolves_to[0])
  }

  return walkToEnd(startNode)
}

/**
 * Walks an evolution chain starting from `currentSpeciesName` and returns
 * the species name the Pokémon would be at the given level cap,
 * following only level-up triggered evolutions where min_level <= levelCap.
 *
 * If the species isn't found in the chain (e.g. alternate form), returns
 * the original name unchanged.
 */
export function resolveEvolutionAtLevel(
  chain: ChainLink,
  currentSpeciesName: string,
  levelCap: number,
): string {
  function findNode(link: ChainLink, name: string): ChainLink | null {
    if (link.species.name === name) return link
    for (const next of link.evolves_to) {
      const found = findNode(next, name)
      if (found) return found
    }
    return null
  }

  const startNode = findNode(chain, currentSpeciesName)
  if (!startNode) return currentSpeciesName

  function walkForward(link: ChainLink): string {
    for (const next of link.evolves_to) {
      const levelUpDetail = next.evolution_details.find(
        (d) => d.trigger.name === 'level-up' && d.min_level !== null && d.min_level <= levelCap,
      )
      if (levelUpDetail) return walkForward(next)
    }
    return link.species.name
  }

  return walkForward(startNode)
}
