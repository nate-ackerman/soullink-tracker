import { useState, useMemo } from 'react'
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
  if (val === 2)   return { bg: '#1a4731', fg: '#6ee7b7', label: '2' }   // green
  if (val === 0.5) return { bg: '#4c1010', fg: '#fca5a5', label: '½' }   // dark red
  if (val === 0)   return { bg: '#111114', fg: '#6b7280', label: '0' }   // near-black
  return { bg: '', fg: '', label: '' }                                    // 1× — blank
}

// ── Type chart matrix ─────────────────────────────────────────────────────────

function TypeChart({ generation }: { generation: number }) {
  const types = useMemo(() => getTypesForGeneration(generation), [generation])

  // Build matrix[attackType][defType] using getTypeMatchups per defending type
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

  return (
    <div className="p-4 overflow-auto">
      <table className="border-collapse" style={{ minWidth: 'max-content' }}>
        <thead>
          <tr>
            {/* Corner label */}
            <th className="p-0 pr-1 pb-1">
              <div className="text-[8px] leading-tight text-text-muted text-center px-1 py-0.5 whitespace-pre-line">
                {'ATK\n↓ DEF →'}
              </div>
            </th>
            {/* Defending type headers */}
            {types.map((defType) => (
              <th key={defType} className="p-0 pb-1 px-px">
                <div
                  className="text-[9px] font-bold text-white text-center rounded"
                  style={{ backgroundColor: getTypeColor(defType), minWidth: 30, padding: '3px 2px' }}
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
              {/* Attacking type label */}
              <td className="p-0 pr-1 py-px">
                <div
                  className="text-[10px] font-bold text-white uppercase text-right rounded"
                  style={{ backgroundColor: getTypeColor(atkType), padding: '3px 8px', whiteSpace: 'nowrap' }}
                >
                  {atkType.toUpperCase()}
                </div>
              </td>
              {/* Effectiveness cells */}
              {types.map((defType) => {
                const val = matrix[atkType]?.[defType] ?? 1
                const { bg, fg, label } = getCellStyle(val)
                return (
                  <td
                    key={defType}
                    className="px-px py-px"
                  >
                    <div
                      className="text-[10px] font-bold text-center rounded"
                      style={{
                        backgroundColor: bg || 'transparent',
                        color: fg || 'transparent',
                        width: 30,
                        height: 22,
                        lineHeight: '22px',
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

// ── Page ──────────────────────────────────────────────────────────────────────

const INFO_TABS = [
  { id: 'type-chart', label: 'Type Chart' },
]

export function Info() {
  const { activeRun } = useAppStore()
  const generation = activeRun?.generation ?? 6
  const [activeTab, setActiveTab] = useState('type-chart')

  return (
    <div className="flex flex-col">
      <Tabs tabs={INFO_TABS} value={activeTab} onValueChange={setActiveTab}>
        <TabContent value={activeTab}>
          <TypeChart generation={generation} />
        </TabContent>
      </Tabs>
    </div>
  )
}
