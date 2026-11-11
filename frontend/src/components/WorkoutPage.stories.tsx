import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, spyOn } from 'storybook/test'
import { WorkoutPage } from './WorkoutPage'
import { plan } from '../domain'
import { sampleSession } from '../story-fixtures'

const meta = {
  component: WorkoutPage,
  tags: ['ai-generated'],
  parameters: { layout: 'fullscreen' },
  args: { workout: plan.workouts[0], session: { ...sampleSession, id: 'current-session', sets: {} }, history: [sampleSession], onChange: fn(), onBack: fn(), onFinish: fn(), onDelete: fn() },
  render: function Controlled(args) {
    const [session, setSession] = useState(args.session)
    return <main className="phone"><WorkoutPage {...args} session={session} onChange={next => { setSession(next); args.onChange(next) }} /></main>
  },
} satisfies Meta<typeof WorkoutPage>
export default meta
type Story = StoryObj<typeof meta>

export const ReadyToTrain: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole('button', { name: 'Delete workout' })).not.toBeInTheDocument()
    for (let index = 0; index < 3; index++) {
      const warmup = canvas.getByLabelText('Warm-up')
      if (index < 2) await expect(warmup).toBeChecked()
      else await expect(warmup).not.toBeChecked()
      await expect(canvas.getByLabelText('Reps')).toHaveValue(index === 0 ? null : index === 1 ? 10 : 6)
      await expect(canvas.getByLabelText('kg / dumbbell')).toHaveValue(index === 0 ? null : index === 1 ? 10 : 20)
      await userEvent.clear(canvas.getByLabelText('Reps'))
      await userEvent.clear(canvas.getByLabelText('kg / dumbbell'))
      await userEvent.type(canvas.getByLabelText('Reps'), index === 0 ? '10' : index === 1 ? '8' : '5')
      await userEvent.type(canvas.getByLabelText('kg / dumbbell'), index === 0 ? '10' : index === 1 ? '12.5' : '22.5')
      await userEvent.click(canvas.getByRole('button', { name: 'Log set' }))
    }
    await expect(canvas.getAllByRole('button', { name: /Edit warm-up set/ })).toHaveLength(2)
    await expect(canvas.getAllByRole('button', { name: /Edit working set/ })).toHaveLength(1)
    await expect(canvas.getByLabelText('Reps')).toHaveValue(5)
    await expect(canvas.getByLabelText('kg / dumbbell')).toHaveValue(22.5)
    await userEvent.selectOptions(canvas.getByRole('combobox'), '1')
    await expect(canvas.getByLabelText('Warm-up')).toBeChecked()
    await userEvent.selectOptions(canvas.getByRole('combobox'), '0')
    await expect(canvas.getByLabelText('Warm-up')).not.toBeChecked()
  },
}
export const NoPreviousPerformance: Story = {
  args: { history: [] },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByLabelText('Warm-up'))
    await expect(canvas.getByLabelText('Reps')).toHaveValue(6)
    await expect(canvas.getByLabelText('kg / dumbbell')).toHaveValue(null)
  },
}
export const MidWorkout: Story = { args: { session: sampleSession } }
export const EditingPastSession: Story = {
  args: { session: sampleSession, editing: true },
  play: async ({ canvas, userEvent, args }) => {
    const confirm = spyOn(window, 'confirm').mockReturnValue(false)
    try {
      await expect(canvas.getByRole('button', { name: /Save workout changes/ })).toBeVisible()
      await userEvent.click(canvas.getByRole('button', { name: 'Delete workout' }))
      await expect(confirm).toHaveBeenCalledWith(expect.stringContaining('cannot be undone'))
      await expect(args.onDelete).not.toHaveBeenCalled()
      confirm.mockReturnValue(true)
      await userEvent.click(canvas.getByRole('button', { name: 'Delete workout' }))
      await expect(args.onDelete).toHaveBeenCalledTimes(1)
    } finally { confirm.mockRestore() }
  },
}

export const DeletingPastSession: Story = {
  args: { session: sampleSession, editing: true, busy: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Delete workout' })).toBeDisabled()
  },
}

export const LastLoggedNotLastDisplayed: Story = {
  args: { session: { ...sampleSession, sets: {
    'push-press': [
      { id: 'warmup', reps: 10, weight: 12.5, warmup: true, position: 1 },
      { id: 'working', reps: 5, weight: 20, warmup: false, position: 0 },
    ],
  } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Reps')).toHaveValue(10)
    await expect(canvas.getByLabelText('kg / dumbbell')).toHaveValue(12.5)
  },
}

export const FirstWorkingRepsOnly: Story = {
  args: { history: [] },
  play: async ({ canvas, userEvent }) => {
    await userEvent.selectOptions(canvas.getByRole('combobox'), '3')
    await userEvent.click(canvas.getByLabelText('Warm-up'))
    await expect(canvas.getByLabelText('Reps')).toHaveValue(12)
    await expect(canvas.getAllByRole('spinbutton')).toHaveLength(1)
  },
}

export const ZeroRecommendedWeight: Story = {
  args: { workout: { ...plan.workouts[0], exercises: [{ ...plan.workouts[0].exercises[0], suggestedWeight: 0 }] } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByLabelText('Warm-up'))
    await expect(canvas.getByLabelText('kg / dumbbell')).toHaveValue(0)
  },
}
