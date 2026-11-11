import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { ExerciseDemo } from './ExerciseDemo'
import { exerciseDemos } from './exerciseDemos'

const meta = {
  component: ExerciseDemo,
  tags: ['ai-generated'],
  args: { exercise: {
    id: 'day-1-dumbbell-bench-press', exerciseId: 'dumbbell-bench-press',
    name: 'Dumbbell Bench Press', equipment: 'Weighted exercise', weightUnit: 'kg', repRange: '4–6',
  } },
} satisfies Meta<typeof ExerciseDemo>
export default meta
type Story = StoryObj<typeof meta>

export const BenchPress: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getAllByRole('img')).toHaveLength(2)
    await expect(canvas.getByRole('img', { name: /side view/ })).toBeVisible()
    await expect(canvas.getByRole('img', { name: /front view/ })).toBeVisible()
    // Either initial state is valid: reduced-motion users start paused.
    const play = canvas.queryByRole('button', { name: 'Play demonstration' })
    if (play) await userEvent.click(play)
    const illustrations = canvas.getAllByRole('img') as unknown as SVGSVGElement[]
    for (const illustration of illustrations) {
      await expect(illustration.querySelectorAll('animate, animateTransform')).toHaveLength(4)
    }
    await userEvent.click(canvas.getByRole('button', { name: 'Pause demonstration' }))
    for (const illustration of illustrations) await expect(illustration.animationsPaused()).toBe(true)
    await userEvent.click(canvas.getByRole('button', { name: 'Play demonstration' }))
    for (const illustration of illustrations) await expect(illustration.animationsPaused()).toBe(false)
  },
}
export const UnsupportedExercise: Story = {
  args: { exercise: { ...meta.args.exercise, exerciseId: 'unknown-exercise', name: 'Unknown exercise' } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument()
  },
}

const movementStory = (id: string): Story => {
  const motion = exerciseDemos.find(motion => motion.id === id)!
  return {
    args: { exercise: { ...meta.args.exercise, id, exerciseId: id, name: motion.name } },
    play: async ({ canvas, userEvent }) => {
      const views = canvas.getAllByRole('img') as unknown as SVGSVGElement[]
      await expect(views).toHaveLength(2)
      const play = canvas.queryByRole('button', { name: 'Play demonstration' })
      if (play) await userEvent.click(play)
      for (const view of views) {
        await expect(view.querySelectorAll('animate, animateTransform').length).toBeGreaterThan(0)
        await expect(view.animationsPaused()).toBe(false)
      }
      await userEvent.click(canvas.getByRole('button', { name: 'Pause demonstration' }))
      for (const view of views) await expect(view.animationsPaused()).toBe(true)
      // A shared control pauses both projections at the same point in a rep.
      await expect(Math.abs(views[0].getCurrentTime() - views[1].getCurrentTime())).toBeLessThan(.05)
    },
  }
}

export const InclineBenchPress = movementStory('incline-dumbbell-bench-press')
export const CloseGripBenchPress = movementStory('dumbbell-close-grip-bench-press')
export const SeatedTricepPress = movementStory('seated-tricep-press')
export const Deadlift = movementStory('deadlift')
export const OneArmRow = movementStory('one-arm-dumbbell-row')
export const BarbellRow = movementStory('bent-over-barbell-row')
export const AlternatingCurl = movementStory('alternating-dumbbell-curl')
export const SeatedPress = movementStory('seated-dumbbell-press')
export const TwoArmRow = movementStory('two-arm-dumbbell-row')
export const RearLateralRaise = movementStory('seated-dumbbell-rear-lateral-raise')
export const FrontSquat = movementStory('dumbbell-front-squat')
export const SplitSquat = movementStory('single-leg-split-squat')
export const RomanianDeadlift = movementStory('dumbbell-romanian-deadlift')
export const Lunge = movementStory('dumbbell-lunge')

export const AllExercises: Story = {
  render: () => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 340px))', gap: 20 }}>
    {exerciseDemos.map(motion => <div key={motion.id}>
      <h3 style={{ fontSize: 16, letterSpacing: 0 }}>{motion.name}</h3>
      <ExerciseDemo exercise={{ ...meta.args.exercise, id: motion.id, exerciseId: motion.id, name: motion.name }} />
    </div>)}
  </div>,
}
