export type ExerciseDemoDefinition = {
  id: string
  name: string
  cue: string
  frontCaption?: string
}

// Metadata only. The standalone SVG files are the source of truth for artwork
// and motion; there is no runtime pose generation.
export const exerciseDemos: ExerciseDemoDefinition[] = [
  { id: 'dumbbell-bench-press', name: 'Dumbbell Bench Press',
    cue: 'Lower beside your chest, then press above your shoulders.', frontCaption: 'Front view · from feet' },
  { id: 'incline-dumbbell-bench-press', name: 'Incline Dumbbell Bench Press (45 deg.)',
    cue: 'Use a 45° bench. Lower with control, then press above your shoulders.' },
  { id: 'dumbbell-close-grip-bench-press', name: 'Dumbbell Close-Grip Bench Press',
    cue: 'Keep the dumbbells close together and elbows tucked as you press.', frontCaption: 'Front view · from feet' },
  { id: 'seated-tricep-press', name: 'Seated Tricep Press',
    cue: 'Hold one dumbbell with both hands. Lower behind your head, then extend overhead.' },
  { id: 'deadlift', name: 'Deadlift',
    cue: 'Keep the bar close. Push through the floor and stand tall without leaning back.' },
  { id: 'one-arm-dumbbell-row', name: 'One-arm Dumbbell row',
    cue: 'Support one hand and knee on the bench. Pull toward your hip; repeat on the other side.' },
  { id: 'bent-over-barbell-row', name: 'Bent-over Barbell Row',
    cue: 'Hold the hip hinge steady. Row toward your lower ribs, then lower with control.' },
  { id: 'alternating-dumbbell-curl', name: 'Alternating Dumbbell Curl',
    cue: 'Curl one arm at a time, keeping your upper arms still and avoiding a swing.' },
  { id: 'seated-dumbbell-press', name: 'Seated Dumbbell Press',
    cue: 'Press from shoulder height to overhead while keeping your torso steady.' },
  { id: 'two-arm-dumbbell-row', name: 'Two-Arm Dumbbell Row',
    cue: 'Hinge at the hips and keep your torso steady. Pull both dumbbells toward your hips.' },
  { id: 'seated-dumbbell-rear-lateral-raise', name: 'Dumbbell Rear Lateral Raise (seated)',
    cue: 'Lean forward while seated. Raise your arms out to the sides with a slight elbow bend.' },
  { id: 'dumbbell-front-squat', name: 'Dumbbell Front Squat',
    cue: 'Keep the dumbbells at your shoulders. Bend at hips and knees, then stand.' },
  { id: 'single-leg-split-squat', name: 'Single Leg Split Squat (Dumbbell)',
    cue: 'With your rear foot supported, lower straight down and push through the front foot. Repeat both sides.' },
  { id: 'dumbbell-romanian-deadlift', name: 'Dumbbell Romanian Deadlift',
    cue: 'Keep a soft knee bend. Move your hips back with weights close, then stand.' },
  { id: 'dumbbell-lunge', name: 'Dumbbell Lunge',
    cue: 'Step forward, plant the front foot, and lower the rear knee with its heel raised. Rise, then step back. Repeat both sides.' },
]

export function findExerciseDemo(exercise: { exerciseId?: string; name: string }): ExerciseDemoDefinition | undefined {
  return exerciseDemos.find(demo => demo.id === exercise.exerciseId) ??
    exerciseDemos.find(demo => demo.name.toLowerCase() === exercise.name.toLowerCase())
}
