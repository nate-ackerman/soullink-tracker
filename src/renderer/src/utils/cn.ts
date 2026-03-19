import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** "bulbasaur" → "Bulbasaur", "MR-MIME" → "Mr-mime" */
export function formatPokemonName(name: string | null | undefined): string {
  if (!name) return '?'
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
}
