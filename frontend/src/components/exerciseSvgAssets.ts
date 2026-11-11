import benchSide from '../assets/exercises/dumbbell-bench-press-side.svg?raw'
import benchFront from '../assets/exercises/dumbbell-bench-press-front.svg?raw'
import inclineSide from '../assets/exercises/incline-dumbbell-bench-press-side.svg?raw'
import inclineFront from '../assets/exercises/incline-dumbbell-bench-press-front.svg?raw'
import closeGripSide from '../assets/exercises/dumbbell-close-grip-bench-press-side.svg?raw'
import closeGripFront from '../assets/exercises/dumbbell-close-grip-bench-press-front.svg?raw'
import tricepSide from '../assets/exercises/seated-tricep-press-side.svg?raw'
import tricepFront from '../assets/exercises/seated-tricep-press-front.svg?raw'
import deadliftSide from '../assets/exercises/deadlift-side.svg?raw'
import deadliftFront from '../assets/exercises/deadlift-front.svg?raw'
import oneArmSide from '../assets/exercises/one-arm-dumbbell-row-side.svg?raw'
import oneArmFront from '../assets/exercises/one-arm-dumbbell-row-front.svg?raw'
import barbellRowSide from '../assets/exercises/bent-over-barbell-row-side.svg?raw'
import barbellRowFront from '../assets/exercises/bent-over-barbell-row-front.svg?raw'
import curlSide from '../assets/exercises/alternating-dumbbell-curl-side.svg?raw'
import curlFront from '../assets/exercises/alternating-dumbbell-curl-front.svg?raw'
import pressSide from '../assets/exercises/seated-dumbbell-press-side.svg?raw'
import pressFront from '../assets/exercises/seated-dumbbell-press-front.svg?raw'
import twoArmSide from '../assets/exercises/two-arm-dumbbell-row-side.svg?raw'
import twoArmFront from '../assets/exercises/two-arm-dumbbell-row-front.svg?raw'
import raiseSide from '../assets/exercises/seated-dumbbell-rear-lateral-raise-side.svg?raw'
import raiseFront from '../assets/exercises/seated-dumbbell-rear-lateral-raise-front.svg?raw'
import squatSide from '../assets/exercises/dumbbell-front-squat-side.svg?raw'
import squatFront from '../assets/exercises/dumbbell-front-squat-front.svg?raw'
import splitSide from '../assets/exercises/single-leg-split-squat-side.svg?raw'
import splitFront from '../assets/exercises/single-leg-split-squat-front.svg?raw'
import rdlSide from '../assets/exercises/dumbbell-romanian-deadlift-side.svg?raw'
import rdlFront from '../assets/exercises/dumbbell-romanian-deadlift-front.svg?raw'
import lungeSide from '../assets/exercises/dumbbell-lunge-side.svg?raw'
import lungeFront from '../assets/exercises/dumbbell-lunge-front.svg?raw'

export const exerciseSvgAssets: Record<string, { side: string; front: string }> = {
  'dumbbell-bench-press': { side: benchSide, front: benchFront },
  'incline-dumbbell-bench-press': { side: inclineSide, front: inclineFront },
  'dumbbell-close-grip-bench-press': { side: closeGripSide, front: closeGripFront },
  'seated-tricep-press': { side: tricepSide, front: tricepFront },
  'deadlift': { side: deadliftSide, front: deadliftFront },
  'one-arm-dumbbell-row': { side: oneArmSide, front: oneArmFront },
  'bent-over-barbell-row': { side: barbellRowSide, front: barbellRowFront },
  'alternating-dumbbell-curl': { side: curlSide, front: curlFront },
  'seated-dumbbell-press': { side: pressSide, front: pressFront },
  'two-arm-dumbbell-row': { side: twoArmSide, front: twoArmFront },
  'seated-dumbbell-rear-lateral-raise': { side: raiseSide, front: raiseFront },
  'dumbbell-front-squat': { side: squatSide, front: squatFront },
  'single-leg-split-squat': { side: splitSide, front: splitFront },
  'dumbbell-romanian-deadlift': { side: rdlSide, front: rdlFront },
  'dumbbell-lunge': { side: lungeSide, front: lungeFront },
}
