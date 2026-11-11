import { useRef, useState } from 'react'
import type { Session, Workout, WorkoutSet } from '../domain'
import { plan, setCount, suggestedWeight } from '../domain'
import { SetLogger } from './SetLogger'
import { SetList } from './SetList'
import { ExerciseDemo } from './ExerciseDemo'

export type WorkoutPageProps = {
  workout: Workout
  session: Session
  history: Session[]
  editing?: boolean
  planName?: string
  busy?: boolean
  onChange: (session: Session) => void | Promise<void>
  onBack: () => void
  onFinish: () => void
  onDelete: () => void | Promise<void>
}

export function WorkoutPage({ workout, session, history, editing, planName, busy = false, onChange, onBack, onFinish, onDelete }: WorkoutPageProps) {
  const [current, setCurrent] = useState(0)
  const [editSet, setEditSet] = useState<WorkoutSet>()
  const [announcement, setAnnouncement] = useState('')
  const pendingSetId = useRef<string | null>(null)
  const exercise = workout.exercises[current]
  const sets = session.sets[exercise.id] ?? []
  // API presentation order is warm-ups first, not necessarily logging order.
  const previousSet = sets.map((set, index) => ({ set, position: set.position ?? index }))
    .sort((a, b) => b.position - a.position)[0]?.set
  const suggestion = exercise.suggestedWeight !== undefined ? exercise.suggestedWeight : suggestedWeight(exercise.id, history.filter(item => item.id !== session.id))
  const navigate = (index: number) => {
    pendingSetId.current = null
    setCurrent(index)
    setEditSet(undefined)
    setAnnouncement('')
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }
  const saveSet = async (value: Omit<WorkoutSet, 'id'>) => {
    if (!editSet) pendingSetId.current ??= crypto.randomUUID()
    const updated = editSet ? sets.map(s => s.id === editSet.id ? { ...value, id: s.id } : s) :
      [...sets, { ...value, id: pendingSetId.current! }]
    await onChange({ ...session, sets: { ...session.sets, [exercise.id]: updated } })
    pendingSetId.current = null
    setEditSet(undefined)
    setAnnouncement(editSet ? 'Set updated.' : 'Set recorded. Ready for the next one.')
  }
  return <fieldset className="workout-fields" disabled={busy} aria-busy={busy}>
    <header className="workout-header"><button className="text-button" onClick={onBack}>← Workouts</button><span>{editing ? 'EDITING PAST SESSION' : 'TODAY’S SESSION'}</span></header>
    <div className="session-title"><div><p className="eyebrow">{planName ?? plan.name}</p><h1>{workout.name.split(' / ')[0]} {workout.name.includes(' / ') && <span>/ {workout.name.split(' / ')[1]}</span>}</h1></div><span className="session-count"><b>{setCount(session)}</b><small>SETS LOGGED</small></span></div>
    <div className="exercise-picker"><label htmlFor="exercise-select">EXERCISE {current + 1} OF {workout.exercises.length}</label>
      <select id="exercise-select" value={current} onChange={e => navigate(+e.target.value)}>{workout.exercises.map((ex, i) => <option value={i} key={ex.id}>{i + 1}. {ex.name}</option>)}</select>
    </div>
    <nav className="exercise-progress" aria-label="Exercise navigation">{workout.exercises.map((ex, i) =>
      <button key={ex.id} className={i === current ? 'active' : ''} aria-label={`Go to ${ex.name}`} aria-current={i === current ? 'step' : undefined} onClick={() => navigate(i)} />)}</nav>
    <section className="cockpit" aria-labelledby="exercise-title">
      <p className="eyebrow equipment">{exercise.equipment}</p><h2 id="exercise-title">{exercise.name}</h2>
      <ExerciseDemo key={exercise.id} exercise={exercise} />
      <div className="target"><span>REP TARGET<strong>{exercise.repRange}</strong></span><span>{exercise.weightUnit ? <>SUGGESTED WEIGHT<strong>{suggestion ?? '—'} <small>{exercise.weightUnit}</small></strong></> : <>BODYWEIGHT<strong>Reps only</strong></>}</span></div>
      {exercise.weightUnit && <p className="suggestion-note">{suggestion === null ? 'No previous working weight yet.' : 'Your last working weight · progression logic to follow'}</p>}
      <SetLogger key={`${exercise.id}-${editSet?.id ?? `new-${sets.length}`}`} exercise={exercise} setNumber={sets.filter(s => !s.warmup).length + 1} initialSet={editSet} defaultWarmup={sets.length < 2} previousSet={previousSet} firstWorkingSet={!sets.some(set => !set.warmup)} recommendedWeight={suggestion} onSave={saveSet} onCancel={() => setEditSet(undefined)} />
    </section>
    <p className="sr-only" role="status">{announcement}</p>
    {current < workout.exercises.length - 1 ?
      <button className="next-exercise" onClick={() => navigate(current + 1)}>Done with this exercise? Next →</button> :
      <p className="next-exercise">Last exercise. Finish whenever you’re ready.</p>}
    <SetList sets={sets} exercise={exercise} onEdit={set => {
      pendingSetId.current = null
      setEditSet(set)
      document.getElementById('exercise-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }} />
    <div className="finish-area">
      <div className="finish-actions">
        <button className="finish" onClick={onFinish}>{editing ? 'Save workout changes' : 'Finish workout'}<span aria-hidden="true">✓</span></button>
        {editing && <button type="button" className="delete-workout" onClick={() => {
          if (window.confirm('Delete this workout session and all its recorded sets? This cannot be undone.')) void onDelete()
        }}>Delete workout</button>}
      </div>
      <p>Saved sessions can always be edited later.</p>
    </div>
  </fieldset>
}
