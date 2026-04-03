import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Play, Trash2, Calendar, Users, ChevronRight, Gamepad2, Upload, AlertCircle, ToggleLeft, ToggleRight, Globe, Copy, Check, Link2, Share2, Loader2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Switch } from '../components/ui/Switch'
import { Badge } from '../components/ui/Badge'
import { useAppStore } from '../store/appStore'
import { GAMES, GAMES_BY_GEN } from '../data/games'
import type { Run, Ruleset } from '../types'
import { runIdToJoinCode } from '../lib/supabase'

const PLAYER_COLORS = [
  { value: '#ef4444', label: 'Red' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#22c55e', label: 'Green' },
  { value: '#a855f7', label: 'Purple' },
  { value: '#f97316', label: 'Orange' },
  { value: '#ec4899', label: 'Pink' }
]

const DEFAULT_RULESET: Ruleset = {
  playerCount: 2,
  typeOverlap: true,
  dupeClause: true,
  speciesClause: true,
  nicknameRequired: true,
  sharedLives: true,
  customRules: []
}

interface WizardData {
  name: string
  game: string
  playerCount: 2 | 3 | 4
  players: { name: string; color: string }[]
  ruleset: Ruleset
}

function RunCard({ run, onSelect, onDelete, onToggleStatus, onConvert, converting }: {
  run: Run; onSelect: () => void; onDelete: () => void; onToggleStatus: () => void
  onConvert: () => void; converting: boolean
}) {
  const statusVariant: 'success' | 'danger' | 'info' =
    run.status === 'active' ? 'success' : run.status === 'failed' ? 'danger' : 'info'
  const joinCode = run.collaborative ? runIdToJoinCode(run.id) : null
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <Card className="hover:border-border-light transition-colors cursor-pointer group">
        <CardContent className="flex items-center gap-4 py-3">
          <div className="flex-1 min-w-0" onClick={onSelect}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-text-primary truncate">{run.name}</span>
              <Badge variant={statusVariant}>{run.status}</Badge>
              {joinCode && (
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-accent-teal/20 text-accent-teal border border-accent-teal/30 font-mono font-semibold">
                  <Globe className="w-2.5 h-2.5" /> {joinCode}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <Gamepad2 className="w-3 h-3" />
                {GAMES.find((g) => g.id === run.game)?.name ?? run.game}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {run.ruleset.playerCount} players
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(run.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="sm" onClick={onSelect}>
              <Play className="w-3.5 h-3.5" /> Open
            </Button>
            {!run.collaborative && (
              <Button
                variant="ghost" size="sm"
                onClick={(e) => { e.stopPropagation(); onConvert() }}
                disabled={converting}
                title="Convert to shared run"
                className="text-text-muted hover:text-accent-teal"
              >
                {converting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
              </Button>
            )}
            <Button
              variant="ghost" size="sm"
              onClick={(e) => { e.stopPropagation(); onToggleStatus() }}
              title={run.status === 'active' ? 'Mark as failed' : 'Mark as active'}
              className={run.status === 'active' ? 'text-text-muted hover:text-orange-400' : 'text-text-muted hover:text-green-400'}
            >
              {run.status === 'active' ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDelete() }} className="text-red-400 hover:text-red-300">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
          <ChevronRight className="w-4 h-4 text-text-muted shrink-0 group-hover:text-text-secondary transition-colors" onClick={onSelect} />
        </CardContent>
      </Card>
    </motion.div>
  )
}

export function Home() {
  const navigate = useNavigate()
  const { setActiveRun, createCollaborativeRun, convertToCollaborative, joinRun } = useAppStore()
  const [runs, setRuns] = useState<Run[]>([])
  const [showWizard, setShowWizard] = useState(false)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [collaborative, setCollaborative] = useState(false)
  const [createdJoinCode, setCreatedJoinCode] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [convertingRunId, setConvertingRunId] = useState<string | null>(null)
  const [wizardData, setWizardData] = useState<WizardData>({
    name: '',
    game: '',
    playerCount: 2,
    players: [
      { name: 'Player 1', color: '#ef4444' },
      { name: 'Player 2', color: '#3b82f6' }
    ],
    ruleset: { ...DEFAULT_RULESET }
  })

  useEffect(() => {
    loadRuns()
  }, [])

  async function loadRuns() {
    try {
      const data = await window.api.runs.getAll()
      setRuns(data)
    } catch (err) {
      console.error('Failed to load runs', err)
    }
  }

  function handleImportRun() {
    setImportError(null)
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      setImporting(true)
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        const result = await window.api.runs.importRun(data)
        if (result.success && result.run) {
          await loadRuns()
          setActiveRun(result.run.id)
          navigate('/dashboard')
        } else {
          setImportError(result.error ?? 'Import failed')
        }
      } catch (err: any) {
        setImportError(err.message ?? 'Import failed — invalid file')
      } finally {
        setImporting(false)
      }
    }
    input.click()
  }

  async function handleDeleteRun(id: string) {
    if (!confirm('Delete this run? This cannot be undone.')) return
    await window.api.runs.delete(id)
    loadRuns()
  }

  async function handleToggleRunStatus(run: Run) {
    const next = run.status === 'active' ? 'failed' : 'active'
    await window.api.runs.update(run.id, { status: next })
    loadRuns()
  }

  async function handleConvertRun(run: Run) {
    if (!confirm(`Convert "${run.name}" to a shared run? All data will be uploaded to the cloud and synced in real time. This cannot be undone.`)) return
    setConvertingRunId(run.id)
    try {
      const code = await convertToCollaborative(run.id)
      await loadRuns()
      setCreatedJoinCode(code)
    } catch (err: any) {
      alert(err.message ?? 'Failed to convert run')
    } finally {
      setConvertingRunId(null)
    }
  }

  async function handleSelectRun(run: Run) {
    setActiveRun(run.id)
    navigate('/dashboard')
  }

  async function handleCreateRun() {
    if (!wizardData.name || !wizardData.game) return
    setLoading(true)
    try {
      const generation = GAMES.find((g) => g.id === wizardData.game)?.generation ?? 1
      const players = wizardData.players.slice(0, wizardData.playerCount)
      const ruleset = { ...wizardData.ruleset, playerCount: wizardData.playerCount }

      let runId: string

      if (collaborative) {
        runId = await createCollaborativeRun({ name: wizardData.name, game: wizardData.game, generation, ruleset, players })
        setCreatedJoinCode(runIdToJoinCode(runId))
      } else {
        const run = await window.api.runs.create({ name: wizardData.name, game: wizardData.game, generation, ruleset })
        for (let i = 0; i < players.length; i++) {
          await window.api.players.create({ run_id: run.id, name: players[i].name, position: i, color: players[i].color })
        }
        runId = run.id
      }

      setShowWizard(false)
      setStep(1)
      setCollaborative(false)
      setWizardData({
        name: '', game: '', playerCount: 2,
        players: [{ name: 'Player 1', color: '#ef4444' }, { name: 'Player 2', color: '#3b82f6' }],
        ruleset: { ...DEFAULT_RULESET }
      })
      await loadRuns()

      if (!collaborative) {
        setActiveRun(runId)
        navigate('/dashboard')
      }
      // If collaborative, stay on Home and show the join code modal
    } catch (err) {
      console.error('Failed to create run', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoinRun() {
    if (!joinCode.trim()) return
    setJoinLoading(true)
    setJoinError(null)
    try {
      const runId = await joinRun(joinCode)
      await loadRuns()
      setShowJoinModal(false)
      setJoinCode('')
      setActiveRun(runId)
      navigate('/dashboard')
    } catch (err: any) {
      setJoinError(err.message ?? 'Failed to join run')
    } finally {
      setJoinLoading(false)
    }
  }

  function copyJoinCode(code: string) {
    navigator.clipboard.writeText(code)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  function updatePlayerCount(count: 1 | 2 | 3 | 4) {
    const players: { name: string; color: string }[] = []
    for (let i = 0; i < count; i++) {
      players.push(
        wizardData.players[i] ?? { name: `Player ${i + 1}`, color: PLAYER_COLORS[i]?.value ?? '#888888' }
      )
    }
    setWizardData((d) => ({ ...d, playerCount: count, players }))
  }

  const gameOptions = Object.entries(GAMES_BY_GEN).flatMap(([gen, games]) =>
    games.map((g) => ({ value: g.id, label: g.name, group: `Generation ${gen}` }))
  )

  const canProceed = step === 1 ? !!wizardData.name && !!wizardData.game : true

  return (
    <div className="min-h-full bg-secondary p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Soul Link Tracker</h1>
            <p className="text-sm text-text-muted mt-0.5">Nuzlocke Run Manager</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleImportRun} loading={importing}>
              <Upload className="w-4 h-4" /> Import
            </Button>
            <Button variant="secondary" onClick={() => { setShowJoinModal(true); setJoinError(null); setJoinCode('') }}>
              <Link2 className="w-4 h-4" /> Join Run
            </Button>
            <Button onClick={() => { setShowWizard(true); setStep(1) }}>
              <Plus className="w-4 h-4" /> New Run
            </Button>
          </div>
        </div>

        {importError && (
          <div className="mb-4 flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{importError}</span>
            <button onClick={() => setImportError(null)} className="ml-auto text-red-400/60 hover:text-red-400">✕</button>
          </div>
        )}

        {/* Runs list */}
        {runs.length === 0 ? (
          <div className="text-center py-16">
            <Gamepad2 className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-40" />
            <p className="text-text-secondary font-medium">No runs yet</p>
            <p className="text-text-muted text-sm mt-1">Create your first Soul Link run to get started</p>
            <Button className="mt-4" onClick={() => { setShowWizard(true); setStep(1) }}>
              <Plus className="w-4 h-4" /> Create Run
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-text-muted uppercase tracking-wider mb-3">
              {runs.length} run{runs.length !== 1 ? 's' : ''}
            </p>
            <AnimatePresence>
              {runs.map((run) => (
                <RunCard
                  key={run.id}
                  run={run}
                  onSelect={() => handleSelectRun(run)}
                  onDelete={() => handleDeleteRun(run.id)}
                  onToggleStatus={() => handleToggleRunStatus(run)}
                  onConvert={() => handleConvertRun(run)}
                  converting={convertingRunId === run.id}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Join Run Modal */}
      <Modal open={showJoinModal} onOpenChange={(o) => { if (!o) setShowJoinModal(false) }} title="Join a Collaborative Run" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-text-muted">Enter the 8-character code shared by the run host.</p>
          <Input
            label="Join Code"
            placeholder="e.g. A1B2C3D4"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') handleJoinRun() }}
            className="font-mono tracking-widest"
          />
          {joinError && (
            <p className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {joinError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setShowJoinModal(false)}>Cancel</Button>
            <Button onClick={handleJoinRun} loading={joinLoading} disabled={joinCode.trim().length < 6}>
              Join Run
            </Button>
          </div>
        </div>
      </Modal>

      {/* Post-creation join code modal */}
      <Modal open={!!createdJoinCode} onOpenChange={(o) => { if (!o) { setCreatedJoinCode(null); setCodeCopied(false) } }} title="Run Created!" size="sm">
        {createdJoinCode && (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">Share this code with your co-players so they can join.</p>
            <div className="flex items-center gap-2 bg-elevated rounded-lg px-4 py-3 border border-border">
              <span className="font-mono text-2xl font-bold tracking-widest text-accent-teal flex-1 text-center">{createdJoinCode}</span>
              <button onClick={() => copyJoinCode(createdJoinCode)} className="text-text-muted hover:text-text-primary transition-colors">
                {codeCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-text-muted text-center">You can always find this code on the run card and in Settings.</p>
            <div className="flex justify-end">
              <Button onClick={() => {
                const runs2 = runs.find((r) => runIdToJoinCode(r.id) === createdJoinCode)
                setCreatedJoinCode(null)
                if (runs2) { setActiveRun(runs2.id); navigate('/dashboard') }
              }}>
                Open Run
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Run Wizard */}
      <Modal
        open={showWizard}
        onOpenChange={(open) => { if (!open) { setShowWizard(false); setStep(1) } }}
        title={`New Run — Step ${step} of 2`}
        size="md"
      >
        <div className="space-y-4">
          {/* Step indicator */}
          <div className="flex gap-1.5">
            {[1, 2].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? 'bg-accent-teal' : 'bg-border'}`}
              />
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-text-primary">Basic Info</h3>
              <Input
                label="Run Name"
                placeholder={wizardData.playerCount === 1 ? "e.g. 'Emerald Nuzlocke'" : "e.g. 'Emerald Soul Link with Jake'"}
                value={wizardData.name}
                onChange={(e) => setWizardData((d) => ({ ...d, name: e.target.value }))}
              />
              <Select
                label="Game"
                placeholder="Select a game..."
                options={gameOptions}
                value={wizardData.game}
                onChange={(e) => setWizardData((d) => ({ ...d, game: e.target.value }))}
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text-secondary">Number of Players</label>
                <div className="flex gap-2">
                  {([1, 2, 3, 4] as const).map((n) => (
                    <button
                      key={n}
                      onClick={() => updatePlayerCount(n)}
                      className={`flex-1 py-2 rounded text-sm font-medium border transition-colors ${
                        wizardData.playerCount === n
                          ? 'bg-accent-teal/20 border-accent-teal text-accent-teal'
                          : 'bg-input border-border text-text-secondary hover:border-border-light'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {wizardData.playerCount > 1 && (
                <div className="border-t border-border/50 pt-3">
                  <Switch
                    id="collaborative"
                    checked={collaborative}
                    onCheckedChange={setCollaborative}
                    label="Collaborative run"
                    description="Sync this run to the cloud so others can join with a code and see updates in real time."
                  />
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-text-primary">Player Setup</h3>
              {wizardData.players.map((player, i) => (
                <div key={i} className="flex items-end gap-3">
                  <div className="flex-1">
                    <Input
                      label={`Player ${i + 1} Name`}
                      value={player.name}
                      onChange={(e) => {
                        const players = [...wizardData.players]
                        players[i] = { ...players[i], name: e.target.value }
                        setWizardData((d) => ({ ...d, players }))
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text-secondary">Color</label>
                    <div className="flex gap-1.5">
                      {PLAYER_COLORS.map((c) => (
                        <button
                          key={c.value}
                          title={c.label}
                          onClick={() => {
                            const players = [...wizardData.players]
                            players[i] = { ...players[i], color: c.value }
                            setWizardData((d) => ({ ...d, players }))
                          }}
                          className={`w-6 h-6 rounded-full border-2 transition-all ${
                            player.color === c.value ? 'border-white scale-110' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: c.value }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

<div className="flex justify-between pt-2">
            {step > 1 ? (
              <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            ) : (
              <div />
            )}
            {step < 2 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed}>
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button onClick={handleCreateRun} loading={loading} disabled={!wizardData.name || !wizardData.game}>
                Create Run
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
