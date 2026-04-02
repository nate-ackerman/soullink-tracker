import { useState, useMemo, useRef, useEffect } from 'react'
import { Tabs, TabContent } from '../components/ui/Tabs'
import { useAppStore } from '../store/appStore'
import { getTypeMatchups, getTypesForGeneration, getTypeColor } from '../data/typeColors'

// ── Type abbreviations for column headers ─────────────────────────────────────

const TYPE_ABBREV: Record<string, string> = {
  normal: 'NOR', fire: 'FIR', water: 'WAT', electric: 'ELE',
  grass: 'GRA', ice: 'ICE', fighting: 'FIG', poison: 'POI',
  ground: 'GRO', flying: 'FLY', psychic: 'PSY', bug: 'BUG',
  rock: 'ROC', ghost: 'GHO', dragon: 'DRA', dark: 'DAR',
  steel: 'STE', fairy: 'FAI',
}

// ── Cell colour by effectiveness value ───────────────────────────────────────

function getCellStyle(val: number): { bg: string; fg: string; label: string } {
  if (val === 2)   return { bg: '#1a4731', fg: '#6ee7b7', label: '2' }
  if (val === 0.5) return { bg: '#4c1010', fg: '#fca5a5', label: '½' }
  if (val === 0)   return { bg: '#111114', fg: '#6b7280', label: '0' }
  return { bg: '', fg: '', label: '' }
}

// ── Type chart matrix ─────────────────────────────────────────────────────────

function TypeChart({ generation }: { generation: number }) {
  const types = useMemo(() => getTypesForGeneration(generation), [generation])
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setDims({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const matrix = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    for (const defType of types) {
      const matchups = getTypeMatchups([defType], generation)
      for (const atkType of types) {
        if (!m[atkType]) m[atkType] = {}
        m[atkType][defType] = matchups[atkType] ?? 1
      }
    }
    return m
  }, [types, generation])

  // nCols = types.length (data cols) + 1 (label col, ~2× wide)
  // nRows = types.length (data rows) + 1 (header row)
  // Each cell is square-ish: height ≈ cellSize * 0.72, with 2px gap
  const PADDING = 48
  const nTypes = types.length

  const cellFromWidth = dims.width > 0
    ? Math.floor((dims.width - PADDING) / (nTypes + 2))
    : 40

  const cellFromHeight = dims.height > 0
    ? Math.floor((dims.height - PADDING) / ((nTypes + 1) * 0.74))
    : 40

  const cellSize = Math.max(14, Math.min(cellFromWidth, cellFromHeight))
  const labelColWidth = cellSize * 2
  const cellHeight = Math.round(cellSize * 0.72)
  const cellFont = Math.max(7, Math.round(cellSize * 0.40))
  const labelFont = Math.max(7, Math.round(cellSize * 0.36))

  return (
    <div ref={containerRef} className="p-6 w-full h-full">
      <table
        className="border-collapse"
        style={{ tableLayout: 'fixed', width: labelColWidth + nTypes * cellSize + nTypes * 2 }}
      >
        <colgroup>
          <col style={{ width: labelColWidth }} />
          {types.map((t) => <col key={t} style={{ width: cellSize }} />)}
        </colgroup>
        <thead>
          <tr>
            <th className="p-0 pr-1 pb-px">
              <div
                className="leading-tight text-text-muted text-center whitespace-pre-line"
                style={{ fontSize: Math.max(6, labelFont * 0.75), height: cellHeight, lineHeight: `${cellHeight / 2}px` }}
              >
                {'ATK\n↓ DEF →'}
              </div>
            </th>
            {types.map((defType) => (
              <th key={defType} className="p-0 pb-px px-px">
                <div
                  className="font-bold text-white text-center rounded overflow-hidden"
                  style={{
                    backgroundColor: getTypeColor(defType),
                    fontSize: cellFont,
                    height: cellHeight,
                    lineHeight: `${cellHeight}px`,
                  }}
                >
                  {TYPE_ABBREV[defType] ?? defType.slice(0, 3).toUpperCase()}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {types.map((atkType) => (
            <tr key={atkType}>
              <td className="p-0 pr-1 py-px">
                <div
                  className="font-bold text-white uppercase text-center rounded overflow-hidden"
                  style={{
                    backgroundColor: getTypeColor(atkType),
                    fontSize: labelFont,
                    height: cellHeight,
                    lineHeight: `${cellHeight}px`,
                  }}
                >
                  {atkType.toUpperCase()}
                </div>
              </td>
              {types.map((defType) => {
                const val = matrix[atkType]?.[defType] ?? 1
                const { bg, fg, label } = getCellStyle(val)
                return (
                  <td key={defType} className="px-px py-px">
                    <div
                      className="font-bold text-center rounded"
                      style={{
                        backgroundColor: bg || 'transparent',
                        color: fg || 'transparent',
                        fontSize: cellFont,
                        height: cellHeight,
                        lineHeight: `${cellHeight}px`,
                      }}
                    >
                      {label}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Natures table ─────────────────────────────────────────────────────────────

interface Nature { name: string; up: string | null; down: string | null }

const NATURES: Nature[] = [
  // +Attack
  { name: 'Lonely',   up: 'Attack',   down: 'Defense'  },
  { name: 'Adamant',  up: 'Attack',   down: 'Sp. Atk'  },
  { name: 'Naughty',  up: 'Attack',   down: 'Sp. Def'  },
  { name: 'Brave',    up: 'Attack',   down: 'Speed'    },
  // +Defense
  { name: 'Bold',     up: 'Defense',  down: 'Attack'   },
  { name: 'Impish',   up: 'Defense',  down: 'Sp. Atk'  },
  { name: 'Lax',      up: 'Defense',  down: 'Sp. Def'  },
  { name: 'Relaxed',  up: 'Defense',  down: 'Speed'    },
  // +Sp. Atk
  { name: 'Modest',   up: 'Sp. Atk',  down: 'Attack'   },
  { name: 'Mild',     up: 'Sp. Atk',  down: 'Defense'  },
  { name: 'Rash',     up: 'Sp. Atk',  down: 'Sp. Def'  },
  { name: 'Quiet',    up: 'Sp. Atk',  down: 'Speed'    },
  // +Sp. Def
  { name: 'Calm',     up: 'Sp. Def',  down: 'Attack'   },
  { name: 'Gentle',   up: 'Sp. Def',  down: 'Defense'  },
  { name: 'Careful',  up: 'Sp. Def',  down: 'Sp. Atk'  },
  { name: 'Sassy',    up: 'Sp. Def',  down: 'Speed'    },
  // +Speed
  { name: 'Timid',    up: 'Speed',    down: 'Attack'   },
  { name: 'Hasty',    up: 'Speed',    down: 'Defense'  },
  { name: 'Naive',    up: 'Speed',    down: 'Sp. Def'  },
  { name: 'Jolly',    up: 'Speed',    down: 'Sp. Atk'  },
  // Neutral
  { name: 'Hardy',    up: null,        down: null       },
  { name: 'Docile',   up: null,        down: null       },
  { name: 'Serious',  up: null,        down: null       },
  { name: 'Bashful',  up: null,        down: null       },
  { name: 'Quirky',   up: null,        down: null       },
]

function NaturesTable() {
  return (
    <div className="p-6 overflow-auto h-full">
      <table className="w-full max-w-sm text-sm border-collapse">
        <thead className="sticky top-0 bg-secondary">
          <tr>
            <th className="px-3 py-2 text-left text-xs text-text-muted font-medium">Nature</th>
            <th className="px-3 py-2 text-left text-xs text-text-muted font-medium">+10%</th>
            <th className="px-3 py-2 text-left text-xs text-text-muted font-medium">−10%</th>
          </tr>
        </thead>
        <tbody>
          {NATURES.map((n, i) => (
            <tr key={n.name} className={`border-t border-border ${i > 0 && NATURES[i - 1].up !== n.up ? 'border-t-2 border-t-border' : ''}`}>
              <td className="px-3 py-1.5 text-sm font-medium text-text-primary">{n.name}</td>
              <td className="px-3 py-1.5 text-xs font-semibold text-green-400">
                {n.up ?? <span className="text-text-muted font-normal">—</span>}
              </td>
              <td className="px-3 py-1.5 text-xs font-semibold text-red-400">
                {n.down ?? <span className="text-text-muted font-normal">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const INFO_TABS = [
  { id: 'type-chart', label: 'Type Chart' },
  { id: 'natures',    label: 'Natures'    },
]

export function Info() {
  const { activeRun } = useAppStore()
  const generation = activeRun?.generation ?? 6
  const [activeTab, setActiveTab] = useState('type-chart')

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 68px)' }}>
      <Tabs tabs={INFO_TABS} value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <TabContent value={activeTab} className="flex-1 overflow-hidden h-full overflow-hidden">
          {activeTab === 'natures' ? <NaturesTable /> : <TypeChart generation={generation} />}
        </TabContent>
      </Tabs>
    </div>
  )
}
