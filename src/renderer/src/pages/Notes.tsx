import { useState, useEffect, useRef } from 'react'
import { Plus, FileText, Trash2, Filter } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { useAppStore } from '../store/appStore'
import { useApi } from '../lib/useApi'
import type { Note } from '../types'
import { getGameById } from '../data/games'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function Notes() {
  const { activeRun, notes, catches, players, refreshNotes, activeRunId } = useAppStore()
  const api = useApi()
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [filterBy, setFilterBy] = useState<'all' | 'route' | 'pokemon' | 'player'>('all')
  const [filterValue, setFilterValue] = useState('')
  const [content, setContent] = useState('')
  const [saveTimer, setSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const gameInfo = activeRun ? getGameById(activeRun.game) : null

  useEffect(() => {
    if (selectedNote) setContent(selectedNote.content)
  }, [selectedNote?.id])

  async function handleNewNote() {
    if (!activeRun) return
    const note = await api.notes.create({
      run_id: activeRun.id,
      content: 'New note...'
    })
    await refreshNotes()
    setSelectedNote(note as Note)
  }

  async function handleDelete(id: string) {
    await api.notes.delete(id)
    if (selectedNote?.id === id) setSelectedNote(null)
    await refreshNotes()
  }

  function handleContentChange(val: string) {
    setContent(val)
    if (saveTimer) clearTimeout(saveTimer)
    if (selectedNote) {
      setSaveTimer(
        setTimeout(async () => {
          await api.notes.update(selectedNote.id, val)
          await refreshNotes()
        }, 800)
      )
    }
  }

  function getFilteredNotes(): Note[] {
    let filtered = notes
    if (filterBy === 'route' && filterValue) {
      filtered = filtered.filter((n) => n.route_id === filterValue)
    } else if (filterBy === 'pokemon' && filterValue) {
      filtered = filtered.filter((n) => n.catch_id === filterValue)
    } else if (filterBy === 'player' && filterValue) {
      filtered = filtered.filter((n) => n.player_id === filterValue)
    }
    return filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }

  function getNoteSummary(note: Note): string {
    const lines = note.content.split('\n')
    return lines[0].slice(0, 60) + (note.content.length > 60 ? '...' : '')
  }

  const filtered = getFilteredNotes()

  if (!activeRun) return <div className="p-6 text-text-muted">No active run</div>

  return (
    <div className="flex h-full">
      {/* Left panel: filter + list */}
      <div className="w-64 border-r border-border flex flex-col shrink-0">
        <div className="p-3 border-b border-border space-y-2">
          <Button variant="secondary" size="sm" className="w-full" onClick={handleNewNote}>
            <Plus className="w-3.5 h-3.5" /> New Note
          </Button>
          <div className="flex gap-1">
            {(['all', 'route', 'pokemon', 'player'] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFilterBy(f); setFilterValue('') }}
                className={`flex-1 py-1 rounded text-[10px] border transition-colors capitalize ${
                  filterBy === f
                    ? 'bg-elevated border-border-light text-text-primary'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          {filterBy !== 'all' && (
            <select
              className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none"
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
            >
              <option value="">All {filterBy}s</option>
              {filterBy === 'route' && gameInfo?.routes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
              {filterBy === 'pokemon' && catches.map((c) => (
                <option key={c.id} value={c.id}>{c.nickname ?? c.pokemon_name ?? c.id}</option>
              ))}
              {filterBy === 'player' && players.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-xs text-text-muted">No notes</p>
            </div>
          ) : (
            filtered.map((note) => (
              <button
                key={note.id}
                onClick={() => setSelectedNote(note)}
                className={`w-full text-left px-3 py-2.5 border-b border-border transition-colors group ${
                  selectedNote?.id === note.id ? 'bg-elevated' : 'hover:bg-elevated/50'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <p className="text-xs text-text-primary line-clamp-2 flex-1">
                    {getNoteSummary(note)}
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(note.id) }}
                    className="p-0.5 opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 transition-all shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-[10px] text-text-muted mt-0.5">{formatDate(note.updated_at)}</p>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {note.route_id && (
                    <span className="text-[10px] bg-elevated px-1 rounded text-text-muted">
                      {gameInfo?.routes.find((r) => r.id === note.route_id)?.name ?? note.route_id}
                    </span>
                  )}
                  {note.catch_id && (
                    <span className="text-[10px] bg-elevated px-1 rounded text-text-muted">
                      {catches.find((c) => c.id === note.catch_id)?.nickname ?? 'Pokémon'}
                    </span>
                  )}
                  {note.player_id && (
                    <span className="text-[10px] bg-elevated px-1 rounded text-text-muted">
                      {players.find((p) => p.id === note.player_id)?.name ?? 'Player'}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel: editor */}
      <div className="flex-1 flex flex-col">
        {!selectedNote ? (
          <div className="flex-1 flex items-center justify-center text-text-muted">
            <div className="text-center">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Select a note or create a new one</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="text-xs text-text-muted">
                Last edited {formatDate(selectedNote.updated_at)}
              </span>
              <span className="text-xs text-accent-teal">Auto-saves</span>
            </div>
            <textarea
              ref={textareaRef}
              className="flex-1 bg-transparent text-text-primary text-sm p-4 resize-none focus:outline-none font-mono leading-relaxed"
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Start writing your note..."
            />
          </>
        )}
      </div>
    </div>
  )
}
