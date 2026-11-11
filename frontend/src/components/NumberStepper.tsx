import { useId } from 'react'

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
  const adjust = (direction: number) => {
    const next = Number(((value === '' ? 0 : value) + direction * increment).toFixed(2))
    onChange(Math.min(max, Math.max(min, next)))
  }
  return <div className="number-field">
    <label htmlFor={id}>{label}</label>
    <div className="stepper">
      <button type="button" aria-label={`Increase ${label}`} onClick={() => adjust(1)}>+</button>
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
        onChange={event => onChange(event.target.value === '' ? '' : event.target.valueAsNumber)}
      />
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => adjust(-1)}>−</button>
    </div>
  </div>
}
