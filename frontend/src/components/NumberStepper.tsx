import { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

export type NumberStepperProps = {
  label: string
  value: number | ''
  onChange: (value: number | '') => void
  min?: number
  max?: number
  increment?: number
  integer?: boolean
}

export function NumberStepper({
  label, value, onChange, min = 0, max = 10000, increment = 1, integer = false,
}: NumberStepperProps) {
  const id = useId()
  const latest = useRef({ value, onChange, min, max, increment })
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hold = useRef<{ pointerId: number; button: HTMLButtonElement } | undefined>(undefined)
  useLayoutEffect(() => {
    latest.current = { value, onChange, min, max, increment }
  }, [value, onChange, min, max, increment])

  const adjust = useCallback((direction: number) => {
    const current = latest.current
    const next = Math.min(current.max, Math.max(current.min,
      Number(((current.value === '' ? 0 : current.value) + direction * current.increment).toFixed(2))))
    if (next === current.value) return false
    // Each repeat uses the latest value, not the value when the hold started.
    current.value = next
    current.onChange(next)
    return true
  }, [])
  const stop = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = undefined
    const active = hold.current
    hold.current = undefined
    if (active?.button.hasPointerCapture(active.pointerId)) active.button.releasePointerCapture(active.pointerId)
  }, [])
  useEffect(() => {
    const release = (event: PointerEvent) => {
      if (event.pointerId === hold.current?.pointerId) stop()
    }
    const visibility = () => { if (document.hidden) stop() }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      stop()
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [stop])
  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, direction: number) => {
    if (event.button !== 0 || hold.current) return
    const button = event.currentTarget
    if (button.matches(':disabled')) return
    hold.current = { pointerId: event.pointerId, button }
    try { button.setPointerCapture(event.pointerId) } catch { /* Synthetic events may not have a native pointer. */ }
    const started = performance.now()
    if (!adjust(direction)) { stop(); return }
    const repeat = () => {
      if (!hold.current || button.matches(':disabled') || !button.isConnected || !adjust(direction)) {
        stop()
        return
      }
      // Accelerate the repetition, never the size of an individual step.
      timer.current = setTimeout(repeat, performance.now() - started >= 1500 ? 35 : 90)
    }
    timer.current = setTimeout(repeat, 350)
  }
  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerId !== hold.current?.pointerId) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) stop()
  }
  // Pointer activation applies its step on press. Only keyboard and
  // assistive/programmatic clicks (detail = 0) apply a step on click, so the
  // release click cannot add an extra step after a hold or a fast double tap.
  return <div className="number-field">
    <label htmlFor={id}>{label}</label>
    <div className="stepper">
      <button type="button" aria-label={`Increase ${label}`}
        onPointerDown={event => handlePointerDown(event, 1)}
        onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onPointerLeave={stop}
        onPointerMove={handlePointerMove} onContextMenu={event => event.preventDefault()}
        onClick={event => { if (event.detail === 0) adjust(1) }}>+</button>
      <input
        id={id}
        type="number"
        inputMode={integer ? 'numeric' : 'decimal'}
        step={integer ? 1 : 0.01}
        min={min}
        max={max}
        placeholder="—"
        value={value}
        required
        onKeyDown={event => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            adjust(event.key === 'ArrowUp' ? 1 : -1)
          }
        }}
        onChange={event => onChange(event.target.value === '' ? '' : event.target.valueAsNumber)}
      />
      <button type="button" aria-label={`Decrease ${label}`}
        onPointerDown={event => handlePointerDown(event, -1)}
        onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onPointerLeave={stop}
        onPointerMove={handlePointerMove} onContextMenu={event => event.preventDefault()}
        onClick={event => { if (event.detail === 0) adjust(-1) }}>−</button>
    </div>
  </div>
}
