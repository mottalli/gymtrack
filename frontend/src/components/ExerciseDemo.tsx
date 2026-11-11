import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { Exercise } from '../domain'
import { findExerciseDemo } from './exerciseDemos'
import { exerciseSvgAssets } from './exerciseSvgAssets'
import './ExerciseDemo.css'

const motionQuery = '(prefers-reduced-motion: reduce)'
function subscribeToMotion(callback: () => void) {
  const query = window.matchMedia(motionQuery)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}
const reducedMotion = () => window.matchMedia(motionQuery).matches

// Only embed trusted, bundled SVG assets, never user-supplied markup. Each
// instance gets unique accessible title/description IDs (including in galleries).
function instanceMarkup(svg: string, prefix: string) {
  return svg.replaceAll('demo-title', `${prefix}-title`).replaceAll('demo-description', `${prefix}-description`)
}

export function ExerciseDemo({ exercise }: { exercise: Exercise }) {
  const demo = findExerciseDemo(exercise)
  const id = useId()
  const reduceMotion = useSyncExternalStore(subscribeToMotion, reducedMotion, () => true)
  const [playOverride, setPlayOverride] = useState<boolean | null>(null)
  const playing = playOverride ?? !reduceMotion
  const side = useRef<HTMLDivElement>(null)
  const front = useRef<HTMLDivElement>(null)
  const assets = demo ? exerciseSvgAssets[demo.id] : undefined
  useEffect(() => {
    const sideSvg = side.current?.querySelector('svg')
    const frontSvg = front.current?.querySelector('svg')
    if (sideSvg && frontSvg) frontSvg.setCurrentTime(sideSvg.getCurrentTime())
    for (const view of [sideSvg, frontSvg]) {
      if (playing) view?.unpauseAnimations()
      else view?.pauseAnimations()
    }
  }, [playing, exercise.id, assets])
  if (!demo || !assets) return null

  return <section className="exercise-demo" aria-label="Exercise demonstration">
    <div className="demo-toolbar">
      <span>MOVEMENT PREVIEW</span>
      <button type="button" onClick={() => setPlayOverride(!playing)} aria-label={playing ? 'Pause demonstration' : 'Play demonstration'}>
        {playing ? 'Ⅱ Pause' : '▶ Play'}
      </button>
    </div>
    <div className="demo-views">
      <figure>
        <div ref={side} dangerouslySetInnerHTML={{ __html: instanceMarkup(assets.side, `${id}-side`) }} />
        <figcaption>Side view</figcaption>
      </figure>
      <figure>
        <div ref={front} dangerouslySetInnerHTML={{ __html: instanceMarkup(assets.front, `${id}-front`) }} />
        <figcaption>{demo.frontCaption ?? 'Front view'}</figcaption>
      </figure>
    </div>
    <p className="demo-cue">{demo.cue}</p>
    <p className="demo-disclaimer">Illustrative motion only. Technique review pending.</p>
  </section>
}
