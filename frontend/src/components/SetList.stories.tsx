import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { SetList } from './SetList'
import { sampleExercise, sampleSets } from '../story-fixtures'

const meta = {
  component: SetList,
  tags: ['ai-generated'],
  args: { exercise: sampleExercise, sets: sampleSets, onEdit: fn() },
} satisfies Meta<typeof SetList>
export default meta
type Story = StoryObj<typeof meta>

export const WithWarmups: Story = {
  play: async ({ canvas }) => {
    const buttons = canvas.getAllByRole('button')
    await expect(buttons[0]).toHaveAccessibleName('Edit warm-up set 1')
  },
}
export const Empty: Story = { args: { sets: [] } }
