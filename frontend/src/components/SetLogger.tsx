import { useState } from 'react'
import type { Exercise, WorkoutSet } from '../domain'
import { NumberStepper } from './NumberStepper'

export type SetLoggerProps = {
  exercise: Exercise
  setNumber: number
  initialSet?: WorkoutSet
  defaultWarmup?: boolean
  previousSet?: WorkoutSet
  firstWorkingSet?: boolean
  recommendedWeight?: number | null
  onSave: (set: Omit<WorkoutSet, 'id'>) => void | Promise<void>
  onCancel?: () => void
}

// The parent keys this component by exercise / new-set count / edited set.
export function SetLogger({ exercise, setNumber, initialSet, defaultWarmup = false, previousSet, firstWorkingSet = false, recommendedWeight, onSave, onCancel }: SetLoggerProps) {
  const defaults = (warmup: boolean): { reps: number | ''; weight: number | '' } => {
    if (initialSet) return { reps: initialSet.reps, weight: initialSet.weight ?? '' }
    if (!warmup && firstWorkingSet) {
      const maximum = Number(exercise.repRange.match(/\d+/g)?.at(-1))
      return { reps: Number.isInteger(maximum) && maximum > 0 ? maximum : '', weight: recommendedWeight ?? '' }
    }
    return { reps: previousSet?.reps ?? '', weight: previousSet?.weight ?? '' }
  }
  const initial = defaults(initialSet?.warmup ?? defaultWarmup)
  const [reps, setReps] = useState<number | ''>(initial.reps)
  const [weight, setWeight] = useState<number | ''>(initial.weight)
  const [warmup, setWarmup] = useState(initialSet?.warmup ?? defaultWarmup)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  return <form className={`set-logger ${warmup ? 'is-warmup' : ''}`} onSubmit={async event => {
    event.preventDefault()
    if (reps === '' || !Number.isInteger(reps) || reps < 1 ||
      (exercise.weightUnit && (weight === '' || !Number.isFinite(weight) || weight < 0))) return
    if (saving) return
    setSaving(true); setSaveError('')
    try {
      await onSave({ reps, weight: exercise.weightUnit ? Number(weight) : null, warmup })
      // Retain logged values. The parent remounts for the next set to apply
      // its type and first-working-set recommendations.
      setWarmup(defaultWarmup)
    } catch {
      setSaveError('Set not saved. Your values are kept here; please try again.')
    } finally { setSaving(false) }
  }}>
    <fieldset disabled={saving} className="workout-fields">
    <div className="logger-heading">
      <span>{initialSet ? 'EDIT RECORDED SET' : warmup ? 'WARM-UP SET' : `WORKING SET ${setNumber}`}</span>
      <label className="warmup-toggle"><input type="checkbox" checked={warmup} onChange={e => {
        const next = e.target.checked
        setWarmup(next)
        if (!initialSet && firstWorkingSet) {
          const values = defaults(next)
          setReps(values.reps); setWeight(values.weight)
        }
      }} /> Warm-up</label>
    </div>
    <NumberStepper label="Reps" value={reps} onChange={setReps} min={1} max={999} integer />
    {exercise.weightUnit && <NumberStepper label={exercise.weightUnit} value={weight} onChange={setWeight} />}
    <button className="primary" type="submit">{initialSet ? 'Save set' : 'Log set'}<span aria-hidden="true">{initialSet ? '✓' : '→'}</span></button>
    {initialSet && <button className="cancel-edit" type="button" onClick={onCancel}>Cancel edit</button>}
    </fieldset>
    {saveError && <p className="storage-error" role="alert">{saveError}</p>}
    <p className="entry-note">{initialSet ? 'Changes update this set only.' : 'Review the values, then log to record.'}</p>
  </form>
}
