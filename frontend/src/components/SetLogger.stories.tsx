import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { SetLogger } from './SetLogger'
import { plan } from '../domain'
import { sampleExercise, sampleSets } from '../story-fixtures'

const meta = {
  component: SetLogger,
  tags: ['ai-generated'],
  args: { exercise: sampleExercise, setNumber: 1, onSave: fn(), onCancel: fn() },
} satisfies Meta<typeof SetLogger>
export default meta
type Story = StoryObj<typeof meta>

export const NewWorkingSet: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await expect(canvas.getByLabelText('Reps')).toHaveValue(null)
    await expect(canvas.getByLabelText('kg / dumbbell')).toHaveValue(0)
    await userEvent.type(canvas.getByLabelText('Reps'), '6')
    await userEvent.type(canvas.getByLabelText('kg / dumbbell'), '20')
    await userEvent.click(canvas.getByRole('button', { name: 'Log set' }))
    await expect(args.onSave).toHaveBeenCalledWith({ reps: 6, weight: 20, warmup: false })
    await expect(canvas.getByLabelText('Reps')).toHaveValue(6)
    await expect(canvas.getByLabelText('kg / dumbbell')).toHaveValue(20)
  },
}
export const Warmup: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByLabelText('Warm-up'))
    await expect(canvas.getByText('WARM-UP SET')).toBeInTheDocument()
    await userEvent.type(canvas.getByLabelText('Reps'), '10')
    await userEvent.type(canvas.getByLabelText('kg / dumbbell'), '10')
    await userEvent.click(canvas.getByRole('button', { name: 'Log set' }))
    await expect(args.onSave).toHaveBeenCalledWith({ reps: 10, weight: 10, warmup: true })
  },
}
export const RepsOnly: Story = {
  args: { exercise: plan.workouts[0].exercises[3] },
  play: async ({ canvas, userEvent, args }) => {
    await expect(canvas.getAllByRole('spinbutton')).toHaveLength(1)
    await userEvent.type(canvas.getByLabelText('Reps'), '12')
    await userEvent.click(canvas.getByRole('button', { name: 'Log set' }))
    await expect(args.onSave).toHaveBeenCalledWith({ reps: 12, weight: null, warmup: false })
  },
}
export const EditRecordedSet: Story = {
  args: { initialSet: sampleSets[0], setNumber: 2, defaultWarmup: true },
  play: async ({ canvas, userEvent, args }) => {
    // Editing retains the recorded type, even if the next new set defaults to warm-up.
    await expect(canvas.getByLabelText('Warm-up')).not.toBeChecked()
    const cancel = canvas.getByRole('button', { name: 'Cancel edit' })
    await expect(getComputedStyle(cancel).backgroundColor).toBe('rgb(180, 35, 50)')
    await userEvent.click(cancel)
    await expect(args.onCancel).toHaveBeenCalledOnce()
    await expect(args.onSave).not.toHaveBeenCalled()
  },
}

export const DefaultWarmup: Story = {
  args: { defaultWarmup: true },
  play: async ({ canvas, userEvent, args }) => {
    await expect(canvas.getByLabelText('Warm-up')).toBeChecked()
    await expect(canvas.getByText('WARM-UP SET')).toBeInTheDocument()
    await userEvent.click(canvas.getByLabelText('Warm-up'))
    await userEvent.type(canvas.getByLabelText('Reps'), '6')
    await userEvent.type(canvas.getByLabelText('kg / dumbbell'), '20')
    await userEvent.click(canvas.getByRole('button', { name: 'Log set' }))
    await expect(args.onSave).toHaveBeenCalledWith({ reps: 6, weight: 20, warmup: false })
  },
}

export const CssCheck: Story = {
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Log set' })
    // .primary resolves --accent (#3258e6) from the app's shared stylesheet.
    await expect(getComputedStyle(button).backgroundColor).toBe('rgb(50, 88, 230)')
  },
}

export const FirstWorkingSet: Story = {
  args: { firstWorkingSet: true, recommendedWeight: 22.5, previousSet: sampleSets[1] },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Reps')).toHaveValue(6)
    await expect(canvas.getByLabelText('kg / dumbbell')).toHaveValue(22.5)
  },
}
export const CarryOverPreviousSet: Story = {
  args: { previousSet: sampleSets[0], setNumber: 2 },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Reps')).toHaveValue(6)
    await expect(canvas.getByLabelText('kg / dumbbell')).toHaveValue(20)
  },
}

export const ZeroWeightSet: Story = {
  args: { firstWorkingSet: true },
  play: async ({ canvas, userEvent, args }) => {
    const weight = canvas.getByLabelText('kg / dumbbell')
    await expect(weight).toHaveValue(0)
    await userEvent.click(canvas.getByRole('button', { name: 'Increase kg / dumbbell' }))
    await expect(weight).toHaveValue(0.5)
    await userEvent.click(canvas.getByRole('button', { name: 'Decrease kg / dumbbell' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Decrease kg / dumbbell' }))
    await expect(weight).toHaveValue(0)
    await userEvent.click(canvas.getByRole('button', { name: 'Log set' }))
    await expect(args.onSave).toHaveBeenCalledWith({ reps: 6, weight: 0, warmup: false })
  },
}

export const CarryOverZeroWeight: Story = {
  args: { previousSet: { ...sampleSets[0], weight: 0 }, setNumber: 2 },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('kg / dumbbell')).toHaveValue(0)
  },
}

export const EditZeroWeight: Story = {
  args: { initialSet: { ...sampleSets[0], weight: 0 } },
  play: async ({ canvas, userEvent, args }) => {
    await expect(canvas.getByLabelText('kg / dumbbell')).toHaveValue(0)
    await userEvent.click(canvas.getByRole('button', { name: 'Save set' }))
    await expect(args.onSave).toHaveBeenCalledWith({ reps: 6, weight: 0, warmup: false })
  },
}
