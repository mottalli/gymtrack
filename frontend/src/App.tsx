import { useEffect, useState } from 'react'
import { newSession, setCount, suggestedWeight } from './domain'
import type { Session } from './domain'
import { deleteWorkoutSession, finishWorkoutSession, loadData, saveSet } from './api'
import type { TrainingPlan } from './api'
import { WorkoutPage } from './components/WorkoutPage'
import './App.css'

export default function App() {
  const [plans, setPlans] = useState<TrainingPlan[]>([])
  const [history, setHistory] = useState<Session[]>([])
  const [planId, setPlanId] = useState('')
  const [screen, setScreen] = useState<'home' | 'workout' | 'history'>('home')
  const [active, setActive] = useState<Session | null>(null)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let live = true
    loadData().then(data => {
      if (live) {
        setPlans(data.plans); setHistory(data.history)
        setActive(previous => previous ?? data.history.find(session => !session.isFinished) ?? null)
        setLoading(false)
      }
    }).catch(error => { if (live) { setError(String(error.message)); setLoading(false) } })
    return () => { live = false }
  }, [reload])
  const ongoing = history.find(session => !session.isFinished)
  const selectedPlan = plans.find(plan => plan.id === planId) ??
    plans.find(plan => plan.workouts.some(workout => workout.id === ongoing?.workoutId)) ?? plans[0]
  const workouts = plans.flatMap(plan => plan.workouts)
  const workout = active?.workoutSnapshot ?? workouts.find(workout => workout.id === active?.workoutId)
  const activePlan = plans.find(plan => plan.workouts.some(workout => workout.id === active?.workoutId))
  const latest = history.find(session => selectedPlan?.workouts.some(workout => workout.id === session.workoutId))
  const latestIndex = selectedPlan?.workouts.findIndex(workout => workout.id === latest?.workoutId) ?? -1
  const ongoingIndex = selectedPlan?.workouts.findIndex(workout => workout.id === ongoing?.workoutId) ?? -1
  const nextIndex = ongoingIndex >= 0 ? ongoingIndex : selectedPlan ? (latestIndex + 1) % selectedPlan.workouts.length : 0
  const remember = (session: Session) => {
    setHistory(previous => [session, ...previous.filter(item => item.id !== session.id)
      .map(item => session.isFinished ? item : { ...item, isFinished: true })].sort((a, b) => b.date.localeCompare(a.date)))
  }
  const resume = (session: Session) => {
    setActive(session); setEditing(session.isFinished); setError(''); setScreen('workout')
  }
  const start = (workoutId: string) => {
    if (ongoing?.workoutId === workoutId) { resume(ongoing); return }
    if (ongoing && !window.confirm('Start another workout? Your ongoing workout will be finished when you record the new workout’s first set.')) return
    const definition = workouts.find(workout => workout.id === workoutId)
    if (!definition) return
    // Drafts exist only in memory until the first set is successfully recorded.
    // Match historical exercises by their shared definition, even across workouts.
    const snapshot = { ...definition, exercises: definition.exercises.map(exercise => ({
      ...exercise, suggestedWeight: suggestedWeight(exercise.id, history, exercise.exerciseId),
    })) }
    setError('')
    setActive({ ...newSession(workoutId), workoutSnapshot: snapshot })
    setEditing(false); setScreen('workout')
  }
  const change = async (next: Session) => {
    if (!active) return
    setBusy(true); setError('')
    try {
      for (const [exerciseId, sets] of Object.entries(next.sets)) {
        const previous = active.sets[exerciseId] ?? []
        const changed = sets.find(set => {
          const original = previous.find(item => item.id === set.id)
          return !original || original.reps !== set.reps || original.weight !== set.weight || original.warmup !== set.warmup
        })
        if (changed) {
          const saved = await saveSet(active, exerciseId, changed, previous.some(set => set.id === changed.id), workouts)
          setActive(saved); remember(saved)
          return
        }
      }
    } catch (error) { setError((error as Error).message); throw error }
    finally { setBusy(false) }
  }
  const finish = async () => {
    if (!active || busy) return
    setBusy(true); setError('')
    try {
      if (active.sessionExerciseIds && !active.isFinished) remember(await finishWorkoutSession(active.id, workouts))
      setActive(null); setScreen('history'); setEditing(false)
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  const deleteSession = async () => {
    if (!active || busy || !editing) return
    setBusy(true); setError('')
    try {
      await deleteWorkoutSession(active.id)
      setHistory(previous => previous.filter(session => session.id !== active.id))
      setActive(null); setEditing(false); setScreen('history')
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  return <div className="app-frame">
    <aside className="desktop-brand"><a href="#home" onClick={event => { event.preventDefault(); if (!busy) setScreen('home') }}>gymtrack<span>↗</span></a><p>A little stronger.<br />One set at a time.</p><small>YOUR TRAINING, SIMPLIFIED</small></aside>
    <main className="phone">
      {error && <div className="storage-error" role="alert">{error}{!plans.length && <button className="text-button" onClick={() => { setError(''); setLoading(true); setReload(value => value + 1) }}>Retry connection</button>}</div>}
      {loading ? <p className="empty-note" role="status">Loading your workouts…</p> : screen === 'workout' && active && workout ?
        <WorkoutPage workout={workout} session={active} history={history} planName={activePlan?.name} busy={busy} editing={editing} onChange={change} onBack={() => setScreen('home')} onFinish={finish} onDelete={deleteSession} /> :
        screen === 'history' ? <>
          <button className="text-button" onClick={() => setScreen('home')}>← Workouts</button>
          <p className="eyebrow history-eyebrow">YOUR TRAINING LOG</p><h1>Past sessions.</h1><p className="muted history-description">Every recorded set is saved. Revisit it anytime.</p>
          {history.length ? history.map(session => <button className="history-item" key={session.id} onClick={() => {
            resume(session)
          }}><span><small>{new Date(session.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</small><strong>{workouts.find(workout => workout.id === session.workoutId)?.name}</strong><small>{setCount(session)} sets recorded{!session.isFinished && ' · Ongoing'}</small></span><span aria-hidden="true">↗</span></button>) :
            <div className="empty"><strong>Your first session starts here.</strong><p>Start a workout and it’ll appear in your log. You can come back and edit any set.</p><button className="primary" onClick={() => setScreen('home')}>Choose a workout <span>→</span></button></div>}
        </> : <>
          <header className="brand"><strong>gymtrack<span>↗</span></strong><span>LET’S GET STRONGER</span></header>
          <div className="home-heading"><p className="eyebrow">{selectedPlan?.name ?? 'YOUR TRAINING'}</p><h1>Your plan.<br />Your pace.</h1><p>Pick your workout. We’ll handle the notebook.</p></div>
          {plans.length > 1 && <div className="exercise-picker"><label htmlFor="plan-select">TRAINING PLAN</label><select id="plan-select" value={selectedPlan.id} onChange={event => setPlanId(event.target.value)}>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></div>}
          {(ongoing ?? active) && <button disabled={busy} className="resume" onClick={() => resume((ongoing ?? active)!)}><span>{ongoing ? 'Resume workout' : editing ? 'Continue editing' : 'Continue unsaved workout'}<strong>{ongoing ? workouts.find(workout => workout.id === ongoing.workoutId)?.name : workout?.name}</strong></span><span>→</span></button>}
          <div className="section-label"><span>YOUR WORKOUTS</span><span>{selectedPlan?.workouts.length ?? 0}-DAY PLAN</span></div>
          <div className="workouts">{selectedPlan?.workouts.map((workout, index) => <button disabled={busy} className={`workout-choice ${index === nextIndex ? 'recommended' : ''}`} onClick={() => void start(workout.id)} key={workout.id}>
            <span className="day">{String(index + 1).padStart(2, '0')}</span><span><small>DAY {index + 1}{workout.id === ongoing?.workoutId ? ' · RESUME ONGOING' : index === nextIndex ? ' · SUGGESTED NEXT' : ''}</small><strong>{workout.name.split(' / ')[1] ?? workout.name}</strong><small>{workout.exercises.length} exercises</small></span><span className="arrow" aria-hidden="true">↗</span>
          </button>)}</div>
          {!plans.length && !error && <p className="empty-note">No training plans are installed.</p>}
          <button className="history-link" onClick={() => setScreen('history')}><span>↶ &nbsp; Workout history</span><span>{history.length} sessions →</span></button>
          <p className="fine-print">Three working sets per exercise, plus optional warm-ups. Recorded sets are saved to the server.</p>
        </>}
      <footer className="app-footer">GYMTRACK <span>ONE SET AT A TIME</span></footer>
    </main>
  </div>
}
