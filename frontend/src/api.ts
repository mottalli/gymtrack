import type { Exercise, Session, Workout, WorkoutSet } from './domain'

export type TrainingPlan = { id: string; name: string; workouts: Workout[] }
type Definition = {
  id: string; position: number; targetRepsMin: number; targetRepsMax: number; plannedWorkingSets: number | null
  exercise: { id: string; name: string; acceptsWeight: boolean }
}
type ApiSessionExercise = {
  id: string; workoutExerciseId: string; exerciseId: string; position: number
  name: string; acceptsWeight: boolean; targetRepsMin: number; targetRepsMax: number
  plannedWorkingSets: number | null; suggestedWeightGrams: number | null
  sets: { id: string; position: number; reps: number; weightGrams: number | null; type: 'WARMUP' | 'WORKING' }[]
}
type ApiSession = { id: string; workoutId: string; startedAt: string; isFinished: boolean; exercises: ApiSessionExercise[] }

const sessionFields = `
  id workoutId startedAt isFinished
  exercises {
    id workoutExerciseId exerciseId position name acceptsWeight
    targetRepsMin targetRepsMax plannedWorkingSets suggestedWeightGrams
    sets { id position reps weightGrams type }
  }
`
async function request<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch('/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!response.ok) throw new Error(`Server request failed (HTTP ${response.status}).`)
  const result: { data?: T; errors?: { message: string }[] } = await response.json()
  if (result.errors?.length) throw new Error(result.errors.map(error => error.message).join(' '))
  if (!result.data) throw new Error('The server returned no data.')
  return result.data
}
function exerciseView(id: string, name: string, acceptsWeight: boolean, min: number, max: number, planned: number | null, exerciseId: string): Exercise {
  return {
    id, exerciseId, name, equipment: acceptsWeight ? 'Weighted exercise' : 'Reps only',
    weightUnit: acceptsWeight ? 'kg' : null, repRange: `${min}–${max}`, plannedWorkingSets: planned,
  }
}
export function sessionView(value: ApiSession, workouts: Workout[]): Session {
  const workout = workouts.find(workout => workout.id === value.workoutId)
  if (!workout) throw new Error('The workout for this session was not found.')
  return {
    id: value.id, workoutId: value.workoutId, date: value.startedAt, isFinished: value.isFinished,
    sessionExerciseIds: Object.fromEntries(value.exercises.map(ex => [ex.workoutExerciseId, ex.id])),
    workoutSnapshot: { ...workout, exercises: value.exercises.map(ex => ({
      ...exerciseView(ex.workoutExerciseId, ex.name, ex.acceptsWeight, ex.targetRepsMin, ex.targetRepsMax, ex.plannedWorkingSets, ex.exerciseId),
      suggestedWeight: ex.suggestedWeightGrams === null ? null : ex.suggestedWeightGrams / 1000,
    })) },
    sets: Object.fromEntries(value.exercises.map(ex => [ex.workoutExerciseId, ex.sets.map(set => ({
      id: set.id, position: set.position, reps: set.reps, weight: set.weightGrams === null ? null : set.weightGrams / 1000,
      warmup: set.type === 'WARMUP',
    }))])),
  }
}
export async function loadData(): Promise<{ plans: TrainingPlan[]; history: Session[] }> {
  const data = await request<{ trainingPlans: { id: string; name: string; workouts: { id: string; name: string; exercises: Definition[] }[] }[] }>(`
    query { trainingPlans { id name workouts { id name exercises {
      id position targetRepsMin targetRepsMax plannedWorkingSets exercise { id name acceptsWeight }
    } } } }
  `)
  const plans = data.trainingPlans.map(plan => ({
    id: plan.id, name: plan.name, workouts: plan.workouts.map(workout => ({
      id: workout.id, name: workout.name, exercises: workout.exercises.map(ex =>
        exerciseView(ex.id, ex.exercise.name, ex.exercise.acceptsWeight, ex.targetRepsMin, ex.targetRepsMax, ex.plannedWorkingSets, ex.exercise.id)),
    })),
  }))
  const history: Session[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await request<{ workoutSessions: ApiSession[] }>(`
      query History($offset: Int!) { workoutSessions(limit: 100, offset: $offset) { ${sessionFields} } }
    `, { offset })
    history.push(...page.workoutSessions.map(session => sessionView(session, plans.flatMap(plan => plan.workouts))))
    if (page.workoutSessions.length < 100) break
  }
  return { plans, history }
}
export async function startWorkout(workoutId: string, workouts: Workout[]): Promise<Session> {
  const data = await request<{ startWorkout: ApiSession }>(`
    mutation Start($id: ID!) { startWorkout(workoutId: $id) { ${sessionFields} } }
  `, { id: workoutId })
  return sessionView(data.startWorkout, workouts)
}
export async function deleteWorkoutSession(id: string): Promise<void> {
  await request<{ deleteWorkoutSession: boolean }>(`
    mutation DeleteSession($id: ID!) { deleteWorkoutSession(id: $id) }
  `, { id })
}
export async function finishWorkoutSession(id: string, workouts: Workout[]): Promise<Session> {
  const data = await request<{ finishWorkoutSession: ApiSession }>(`
    mutation Finish($id: ID!) { finishWorkoutSession(id: $id) { ${sessionFields} } }
  `, { id })
  return sessionView(data.finishWorkoutSession, workouts)
}
export async function saveSet(session: Session, exerciseId: string, set: WorkoutSet, existing: boolean, workouts: Workout[]): Promise<Session> {
  const input = { reps: set.reps, weightGrams: set.weight === null ? null : Math.round(set.weight * 1000), type: set.warmup ? 'WARMUP' : 'WORKING' }
  if (!session.sessionExerciseIds) {
    const data = await request<{ recordFirstSet: ApiSession }>(`
      mutation FirstSet($input: FirstSetInput!) { recordFirstSet(input: $input) { ${sessionFields} } }
    `, { input: { ...input, sessionId: session.id, id: set.id, workoutId: session.workoutId, workoutExerciseId: exerciseId } })
    return sessionView(data.recordFirstSet, workouts)
  }
  if (existing) {
    const data = await request<{ updateSet: ApiSession }>(`
      mutation Update($id: ID!, $input: UpdateSetInput!) { updateSet(id: $id, input: $input) { ${sessionFields} } }
    `, { id: set.id, input })
    return sessionView(data.updateSet, workouts)
  }
  const sessionExerciseId = session.sessionExerciseIds?.[exerciseId]
  if (!sessionExerciseId) throw new Error('Session exercise was not found.')
  const data = await request<{ logSet: ApiSession }>(`
    mutation Log($input: LogSetInput!) { logSet(input: $input) { ${sessionFields} } }
  `, { input: { ...input, id: set.id, sessionExerciseId } })
  return sessionView(data.logSet, workouts)
}
