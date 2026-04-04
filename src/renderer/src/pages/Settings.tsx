import { useState } from 'react'
import { Save, Check, Download, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Switch } from '../components/ui/Switch'
import { useAppStore } from '../store/appStore'
import { useApi } from '../lib/useApi'

function SliderRow({
  label,
  description,
  value,
  min,
  max,
  step,
  onChange,
  displayValue,
}: {
  label: string
  description: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  displayValue: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">{label}</p>
          <p className="text-xs text-text-muted">{description}</p>
        </div>
        <span className="text-sm font-semibold text-accent-teal min-w-[80px] text-right">
          {displayValue}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-accent-teal"
      />
      <div className="flex justify-between text-[10px] text-text-muted">
        <span>{min === 0 ? 'Off' : `${min}${min === 100 ? '%' : ''}`}</span>
        <span>{max}{max >= 100 ? '%' : ''}</span>
      </div>
    </div>
  )
}

export function Settings() {
  const { activeRun, activeRunId, loadRunData, players } = useAppStore()
  const api = useApi()
  const [runName, setRunName] = useState(activeRun?.name ?? '')
  const [maxSharedTypeCount, setMaxSharedTypeCount] = useState(
    activeRun?.ruleset.maxSharedTypeCount ?? 0
  )
  const [maxSameTeamTypeCount, setMaxSameTeamTypeCount] = useState(
    activeRun?.ruleset.maxSameTeamTypeCount ?? 0
  )
  const [trainerLevelModifier, setTrainerLevelModifier] = useState(
    activeRun?.ruleset.trainerLevelModifier ?? 100
  )
  const existingGuaranteed = activeRun?.ruleset.guaranteedEvolutionLevel ?? null
  const [guaranteedEvoEnabled, setGuaranteedEvoEnabled] = useState(existingGuaranteed !== null)
  const [guaranteedEvoLevel, setGuaranteedEvoLevel] = useState(existingGuaranteed ?? 36)
  const [hideNonImportantBattles, setHideNonImportantBattles] = useState(
    activeRun?.ruleset.hideNonImportantBattles ?? false
  )
  const [skipNonImportantLevelCaps, setSkipNonImportantLevelCaps] = useState(
    activeRun?.ruleset.skipNonImportantLevelCaps ?? false
  )
  const [allowFreeProgressionBattle, setAllowFreeProgressionBattle] = useState(
    activeRun?.ruleset.allowFreeProgressionBattle ?? false
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  if (!activeRun) return <div className="p-6 text-text-muted">No active run</div>

  const currentGuaranteed = guaranteedEvoEnabled ? guaranteedEvoLevel : null
  const isDirty =
    runName.trim() !== activeRun.name ||
    maxSharedTypeCount !== (activeRun.ruleset.maxSharedTypeCount ?? 0) ||
    maxSameTeamTypeCount !== (activeRun.ruleset.maxSameTeamTypeCount ?? 0) ||
    trainerLevelModifier !== (activeRun.ruleset.trainerLevelModifier ?? 100) ||
    currentGuaranteed !== (activeRun.ruleset.guaranteedEvolutionLevel ?? null) ||
    hideNonImportantBattles !== (activeRun.ruleset.hideNonImportantBattles ?? false) ||
    skipNonImportantLevelCaps !== (activeRun.ruleset.skipNonImportantLevelCaps ?? false) ||
    allowFreeProgressionBattle !== (activeRun.ruleset.allowFreeProgressionBattle ?? false)

  // When cross-team limit decreases, clamp per-team limit so it never exceeds it
  function handleMaxSharedChange(v: number) {
    setMaxSharedTypeCount(v)
    if (v > 0 && maxSameTeamTypeCount > v) setMaxSameTeamTypeCount(v)
  }

  async function handleSave() {
    if (!runName.trim()) return
    setSaving(true)
    try {
      await api.runs.update(activeRun!.id, {
        name: runName.trim(),
        ruleset: { ...activeRun!.ruleset, maxSharedTypeCount, maxSameTeamTypeCount, trainerLevelModifier, guaranteedEvolutionLevel: currentGuaranteed, hideNonImportantBattles, skipNonImportantLevelCaps, allowFreeProgressionBattle },
      })
      if (activeRunId) await loadRunData(activeRunId)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      const result = await window.api.runs.exportRun(activeRun!.id)
      if (!result.success || !result.data) {
        setExportError(result.error ?? 'Export failed')
        return
      }
      const json = JSON.stringify(result.data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${activeRun!.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.slrun.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setExportError(err.message ?? 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const perTeamSliderMax = maxSharedTypeCount > 0 ? maxSharedTypeCount : 6

  const typeCountDisplay =
    maxSharedTypeCount === 0 ? 'No limit' : `Max ${maxSharedTypeCount}`

  const perTeamDisplay =
    maxSameTeamTypeCount === 0 ? 'No limit' : `Max ${maxSameTeamTypeCount}`

  const modifierDisplay =
    trainerLevelModifier === 100
      ? 'Normal (×1.0)'
      : `+${trainerLevelModifier - 100}% (×${(trainerLevelModifier / 100).toFixed(1)})`

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      {/* Run name */}
      <Card>
        <CardHeader>
          <CardTitle>Run Name</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={runName}
            onChange={(e) => setRunName(e.target.value)}
            placeholder="Run name"
          />
        </CardContent>
      </Card>

      {/* Configurable mid-run rules */}
      <Card>
        <CardHeader>
          <CardTitle>Difficulty Modifiers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {players.length > 1 && (
            <>
              <SliderRow
                label="Max of any single type across all parties"
                description="Limits how many Pokémon of the same type can be in all players' active parties combined. Warnings appear on the Party page and invalid links are blocked in the picker."
                value={maxSharedTypeCount}
                min={0}
                max={6}
                step={1}
                onChange={handleMaxSharedChange}
                displayValue={typeCountDisplay}
              />
              <div className="border-t border-border/50" />
            </>
          )}

          <SliderRow
            label="Max of any single type within one team"
            description="Limits how many Pokémon of the same type any single player can have in their active party. Cannot exceed the cross-team limit above."
            value={maxSameTeamTypeCount}
            min={0}
            max={perTeamSliderMax}
            step={1}
            onChange={setMaxSameTeamTypeCount}
            displayValue={perTeamDisplay}
          />

          <div className="border-t border-border/50" />

          <SliderRow
            label="Trainer level modifier"
            description="Scales all gym leader and trainer ace levels in Battle Prep. Useful for challenge runs against higher-level teams."
            value={trainerLevelModifier}
            min={100}
            max={200}
            step={5}
            onChange={setTrainerLevelModifier}
            displayValue={modifierDisplay}
          />
        </CardContent>
      </Card>

      {/* Evolution rules */}
      <Card>
        <CardHeader>
          <CardTitle>Evolution Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Switch
            id="guaranteed-evo"
            checked={guaranteedEvoEnabled}
            onCheckedChange={setGuaranteedEvoEnabled}
            label="Guaranteed full evolution at level"
            description="When enabled, all Pokémon are displayed as fully evolved once the level cap reaches this threshold."
          />
          {guaranteedEvoEnabled && (
            <div className="flex items-center gap-3 pl-1">
              <label htmlFor="guaranteed-evo-level" className="text-sm text-text-muted whitespace-nowrap">
                Evolve at level
              </label>
              <Input
                id="guaranteed-evo-level"
                type="number"
                min={1}
                max={100}
                value={guaranteedEvoLevel}
                onChange={(e) => setGuaranteedEvoLevel(Math.max(1, Math.min(100, Number(e.target.value))))}
                className="w-24"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Battle settings */}
      <Card>
        <CardHeader>
          <CardTitle>Battle Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Switch
            id="hide-non-important"
            checked={hideNonImportantBattles}
            onCheckedChange={setHideNonImportantBattles}
            label="Hide non-important battles"
            description="Only show Gym Leaders, Elite Four, and the Champion in the battle list. Rivals, bosses, and other fights are hidden."
          />
          <div className="border-t border-border/50" />
          <Switch
            id="skip-non-important-caps"
            checked={skipNonImportantLevelCaps}
            onCheckedChange={setSkipNonImportantLevelCaps}
            label="Apply only important battle level caps"
            description="When the next battle is a rival or boss, apply the next Gym Leader/E4/Champion cap instead of that rival's cap."
          />
          <div className="border-t border-border/50" />
          <Switch
            id="free-progression"
            checked={allowFreeProgressionBattle}
            onCheckedChange={setAllowFreeProgressionBattle}
            label="Free progression"
            description="Allows selecting any uncompleted battle as the upcoming one instead of strictly the next in order."
          />
        </CardContent>
      </Card>

      {/* Export */}
      <Card>
        <CardHeader>
          <CardTitle>Export Run</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-text-muted">
            Save all data for this run to a <code className="text-text-secondary">.json</code> file.
            You can import it on any device using the Import button on the Home screen.
          </p>
          <Button variant="secondary" onClick={handleExport} loading={exporting}>
            <Download className="w-4 h-4" /> Export Run
          </Button>
          {exportError && (
            <p className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {exportError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={!isDirty || saving || !runName.trim()}>
          {saved ? (
            <>
              <Check className="w-4 h-4" /> Saved
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> Save Changes
            </>
          )}
        </Button>
        {!isDirty && !saved && (
          <span className="text-xs text-text-muted">No unsaved changes</span>
        )}
      </div>
    </div>
  )
}
