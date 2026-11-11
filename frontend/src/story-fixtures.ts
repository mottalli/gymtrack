import { plan } from './domain'
import type { Session, WorkoutSet } from './domain'

export const sampleExercise = plan.workouts[0].exercises[0]
export const sampleSets: WorkoutSet[] = [
  { id: 'working-1', reps: 6, weight: 20, warmup: false },
  { id: 'warmup-1', reps: 10, weight: 10, warmup: true },
  { id: 'working-2', reps: 5, weight: 20, warmup: false },
]
export const sampleSession: Session = {
  id: 'example-session',
  workoutId: plan.workouts[0].id,
  date: '2026-11-07T10:00:00.000Z',
  isFinished: true,
  sets: { [sampleExercise.id]: sampleSets },
}
