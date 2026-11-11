import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, waitFor } from 'storybook/test'
import { NumberStepper } from './NumberStepper'

const meta = {
  component: NumberStepper,
  tags: ['ai-generated'],
  args: { label: 'Reps', value: '', min: 1, max: 999, integer: true, onChange: fn() },
  render: function Controlled(args) {
    const [value, setValue] = useState<number | ''>(args.value)
    return <NumberStepper {...args} value={value} onChange={next => { setValue(next); args.onChange(next) }} />
  },
} satisfies Meta<typeof NumberStepper>
export default meta
type Story = StoryObj<typeof meta>

export const BlankReps: Story = {
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole('spinbutton', { name: 'Reps' })
    await expect(input).toHaveValue(null)
    await userEvent.click(canvas.getByRole('button', { name: 'Increase Reps' }))
    await expect(input).toHaveValue(1)
    await userEvent.click(canvas.getByRole('button', { name: 'Decrease Reps' }))
    await expect(input).toHaveValue(1)
  },
}
export const Weight: Story = { args: { label: 'kg / dumbbell', value: 20, min: 0, integer: false, increment: 0.5, max: 10000 } }
export const FractionalWeight: Story = { args: { label: 'kg total', value: 22.5, min: 0, integer: false, increment: 0.5, max: 10000 } }
export const ZeroWeight: Story = {
  args: { label: 'kg total', value: 0, min: 0, integer: false, increment: 0.5 },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Decrease kg total' }))
    await expect(canvas.getByRole('spinbutton')).toHaveValue(0)
    await userEvent.click(canvas.getByRole('button', { name: 'Increase kg total' }))
    await expect(canvas.getByRole('spinbutton')).toHaveValue(0.5)
    await userEvent.click(canvas.getByRole('spinbutton'))
    await userEvent.keyboard('{ArrowUp}')
    await expect(canvas.getByRole('spinbutton')).toHaveValue(1)
    await userEvent.keyboard('{ArrowDown}')
    await expect(canvas.getByRole('spinbutton')).toHaveValue(0.5)
    await userEvent.click(canvas.getByRole('button', { name: 'Increase kg total' }))
    await expect(canvas.getByRole('spinbutton')).toHaveValue(1)
    await userEvent.click(canvas.getByRole('button', { name: 'Decrease kg total' }))
    await expect(canvas.getByRole('spinbutton')).toHaveValue(0.5)
  },
}

export const PressAndHoldWeight: Story = {
  args: { label: 'kg', value: 0, min: 0, max: 50, integer: false, increment: 0.5 },
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole('spinbutton') as HTMLInputElement
    await userEvent.pointer({ keys: '[MouseLeft>]', target: canvas.getByRole('button', { name: 'Increase kg' }) })
    try {
      await expect(input).toHaveValue(0.5)
      await waitFor(() => expect(input.valueAsNumber).toBeGreaterThan(0.5), { timeout: 1500 })
    } finally {
      await userEvent.pointer({ keys: '[/MouseLeft]' })
    }
  },
}
