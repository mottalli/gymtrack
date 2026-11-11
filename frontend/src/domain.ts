export type Exercise = {
  id: string
  exerciseId?: string
  name: string
  equipment: string
  weightUnit: string | null
  repRange: string
  suggestedWeight?: number | null
  plannedWorkingSets?: number | null
}

export type Workout = { id: string; name: string; exercises: Exercise[] }
export type WorkoutSet = { id: string; reps: number; weight: number | null; warmup: boolean; position?: number }
export type Session = {
  id: string
  workoutId: string
  date: string
  isFinished: boolean
  sets: Record<string, WorkoutSet[]>
  sessionExerciseIds?: Record<string, string>
  workoutSnapshot?: Workout
}

const exercises: Exercise[] = [
  { id: 'push-press', name: 'Dumbbell push press', equipment: 'Two dumbbells', weightUnit: 'kg / dumbbell', repRange: '4–6' },
  { id: 'bench-press', name: 'Barbell bench press', equipment: 'Barbell', weightUnit: 'kg total', repRange: '4–6' },
  { id: 'lateral-raise', name: 'Dumbbell lateral raise', equipment: 'Two dumbbells', weightUnit: 'kg / dumbbell', repRange: '8–10' },
  { id: 'push-up', name: 'Push-up', equipment: 'Bodyweight', weightUnit: null, repRange: '8–12' },
]

// Frontend fixtures only, not an authoritative BLS program.
export const plan = {
  name: 'Bigger, Leaner, Stronger',
  workouts: ['Push', 'Pull', 'Legs', 'Upper'].map((name, index): Workout => ({
    id: `day-${index + 1}`, name: `Day ${index + 1} / ${name}`, exercises,
  })),
}

export function newSession(workoutId: string): Session {
  return { id: crypto.randomUUID(), workoutId, date: new Date().toISOString(), isFinished: false, sets: {} }
}

export function setCount(session: Session) {
  return Object.values(session.sets).reduce((sum, sets) => sum + sets.length, 0)
}

// Repeat the last working weight as a placeholder until progression maths is defined.
export function suggestedWeight(exerciseId: string, history: Session[], sharedExerciseId?: string): number | null {
  const sessions = [...history].sort((a, b) => b.date.localeCompare(a.date))
  for (const session of sessions) {
    const matchingId = sharedExerciseId
      ? session.workoutSnapshot?.exercises.find(exercise => exercise.exerciseId === sharedExerciseId)?.id ?? exerciseId
      : exerciseId
    const set = session.sets[matchingId]?.findLast(set => !set.warmup && set.weight !== null)
    if (set) return set.weight
  }
  return null
}
