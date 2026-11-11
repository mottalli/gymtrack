import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
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
export const Weight: Story = { args: { label: 'kg / dumbbell', value: 20, min: 0, integer: false, max: 10000 } }
export const FractionalWeight: Story = { args: { label: 'kg total', value: 22.5, min: 0, integer: false, increment: 2.5, max: 10000 } }
export const ZeroWeight: Story = {
  args: { label: 'kg total', value: 0, min: 0, integer: false },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Decrease kg total' }))
    await expect(canvas.getByRole('spinbutton')).toHaveValue(0)
  },
}
