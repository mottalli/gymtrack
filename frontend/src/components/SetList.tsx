import type { Exercise, WorkoutSet } from '../domain'

export function SetList({ sets, exercise, onEdit }: {
  sets: WorkoutSet[]
  exercise: Exercise
  onEdit: (set: WorkoutSet) => void
}) {
  let working = 0
  const ordered = [...sets].sort((a, b) => Number(b.warmup) - Number(a.warmup))
  return <section aria-label="Recorded sets">
    <div className="section-label"><span>RECORDED SETS · {sets.length}</span><span>TAP TO EDIT</span></div>
    {ordered.length === 0 ? <p className="empty-note">Nothing recorded yet. Your first set goes here.</p> :
      <ol className="set-list">{ordered.map((set, index) => <li key={set.id}>
        <button className={`logged-set ${set.warmup ? 'is-warmup' : ''}`} onClick={() => onEdit(set)} aria-label={`Edit ${set.warmup ? 'warm-up' : 'working'} set ${index + 1}`}>
          <span className="set-badge">{set.warmup ? 'W' : ++working}</span>
          <strong>{set.reps} reps</strong>
          <span>{exercise.weightUnit ? `${set.weight} ${exercise.weightUnit}` : 'Bodyweight'}</span>
          <span className="edit-arrow" aria-hidden="true">↗</span>
        </button>
      </li>)}</ol>}
  </section>
}
