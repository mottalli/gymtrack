# Gym Workout Tracker — Requirements

## Purpose

Create a phone-friendly web app for tracking gym workouts. Its primary goal is to make recording reps and weights during a workout fast and easy, including correcting previously recorded sets. The user is following a training plan and wants a simpler workout-logging experience than existing apps.

## Scope

- The app is a web app designed primarily for use on a phone.
- Assume an internet connection is available.
- Training plans are provided to the app. Creating or editing plans is out of scope.
- Progress analytics and statistics are out of scope.
- The initial user follows **Bigger, Leaner, Stronger**. The app should accommodate multiple plans, although there may only be one initially.

## Concepts

- **Training plan:** An ordered list of workouts. A plan may contain any number of workouts; for example, four workouts means four workouts in the plan, typically performed per week. The plan suggests an order, but workouts may be performed in a different order.
- **Workout:** A plan-defined workout containing an ordered list of exercises, such as “Day 1 - Push” or “Day 2 - Pull.” The user may skip or visit exercises out of order while logging.
- **Exercise:** An item in a workout with a target rep range and a boolean indicating whether it accepts a weight.
- **Workout session:** A logged occurrence of a workout, with its date and recorded sets. Past sessions remain available for browsing and editing.
- **Set:** A logged number of repetitions and, when applicable, a weight.

## Functional requirements

### Main page and workout selection

- The main page lets the user select a workout from the active training plan.
- The app suggests the next workout according to the plan’s order, while allowing the user to choose any workout.
- The user can access past workout sessions from the app.

### Workout logging

- A workout page guides the user through the workout’s exercises.
- Exercises are presented in plan order, but the user can skip or move between exercises.
- The app supports logging fewer or more sets than the plan calls for. The user can add sets.
- New set controls carry over reps and weight from the last logged set of that exercise, using logging order rather than display order.
- For the first working (non-warm-up) set, pre-fill the maximum target reps and suggested weight, if available. Without a weight suggestion, default weight to 0. This also applies when the user switches an early warm-up to a working set.
- The first warm-up has blank reps and weight 0 when there is no previous set. Editing always loads the recorded values.
- Pre-filled values are not recorded until the user explicitly logs the set.
- Reps and weight inputs have prominent `+ [number] −` controls for quick tap-based entry. Direct number entry remains available.
- Weight controls accept 0, default to 0 when there is no carried-over or recommended weight, and adjust by 0.5 kg per button tap. They cannot decrement below 0. Reps still adjust by 1.
- Pressing and holding either stepper button repeats its action after a short delay and accelerates the repetition rate for longer holds, without changing the individual step size. A tap applies exactly one step, with no extra step on release. Repeating stops on release, pointer cancellation, leaving the button, losing page focus/visibility, disabling the control, or unmounting.
- The user can edit any recorded set, including sets in past workout sessions.
- The user can finish a workout explicitly.
- The home page offers to resume the persisted ongoing workout and highlights its workout by default, including after refresh.
- A session is ongoing until explicitly finished, or until a new session's first set is recorded. Creating the new session automatically finishes the previous ongoing session in the same transaction; at most one ongoing session is allowed.
- Opening an empty draft or a failed first-set save does not finish the ongoing workout. Editing a finished workout does not reopen it.

### Exercise targets and weight suggestions

- The plan specifies a target rep range for each exercise (for example, 4–6 reps for Dumbbell Push Press).
- The target rep range is visible while logging the exercise.
- The app may suggest a single target weight for an exercise based on previous sets of that same exercise, if any.
- The suggested weight is displayed separately and initializes the first working set. It is not recorded until logging. Exact suggestion calculations are not specified here.
- The suggestion should be usable across the exercise’s proper sets in that workout.
- Exercises may be either weight-bearing or reps-only. For reps-only exercises, no weight is required.
- Each exercise declares `accepts_weight`. Weighted exercises require a weight; reps-only exercises do not accept one.
- Equipment and per-dumbbell versus total weight are not modeled. The user chooses a consistent weight convention.

### Warm-up and proper sets

- Warm-up sets and proper (working) sets are distinct types.
- Warm-up sets are optional and there are typically two; the user may log zero, one, or two.
- The first two sets logged for each exercise default to warm-up; subsequent sets default to working sets. The user can override the type, and editing retains the recorded type.
- Warm-up sets are logged with reps and weight when applicable.
- Warm-up sets are always shown before proper sets, regardless of entry order.
- Warm-up sets have a distinct visual treatment, such as a different color, so they are distinguishable from proper sets.
- The plan’s rep-range target applies to proper sets; warm-up set targets are not specified.

### History and editing

- The user can browse past workout sessions.
- Selecting a workout opens an in-memory draft only. No session is persisted or added to history until its first set is recorded.
- The first set and session are saved atomically, with safe retries. Leaving or finishing an empty draft creates no session; a failed first-set save retains the input without leaving an empty session.
- The user can edit any past workout or set.
- While editing a past session, a red **Delete workout** button appears to the right of **Save workout changes**.
- Deleting requires confirmation that the action cannot be undone. It deletes only that session and all its session exercises and recorded sets, preserving plan/workout/exercise definitions.
- After successful deletion, return to history with the deleted session removed. Failed deletion keeps the session available and displays an error.
- Analytics, charts, and progress summaries are not required.

## UX priorities

- All 15 unique provided exercises include lightweight, animated SVG movement previews, reused wherever the same exercise appears.
- Store each side/front illustration as a standalone, self-contained `.svg` file in `frontend/src/assets/exercises/`. These files are the editable source of truth for geometry, styling, and SMIL tracks; React embeds them inline for playback controls rather than generating the artwork.
- Previews show compact, synchronized side and front SVG views side by side, including on phones. Flat bench front views look from the feet.
- Previews provide shared pause/play controls, start paused for reduced-motion preferences, and are illustrative rather than validated technique instruction.

- Selected visual direction: blue and white. Compare alternative interaction
  models within this shared palette rather than using color alone to distinguish them.

1. Make entering reps and (where applicable) weight for the current set quick and easy on a phone.
2. Make it clear which exercise, set type, and target rep range the user is logging.
3. Keep suggestions visually separate from logged values.
4. Make adding sets, navigating exercises, finishing a workout, and correcting past entries straightforward.

## Out of scope

- Creating or editing training plans, workouts, or exercises in the app.
- Progress statistics or analytics.
- Requiring offline operation.
- Defining the formula for calculating suggested weights.

## Agreed implementation architecture

- Kotlin / Ktor backend with a GraphQL API and an SQLite database accessed through Exposed SQL DSL.
- `./gradlew run` watches/rebuilds compiled frontend files and automatically recompiles/restarts Kotlin after source/resource changes. Ktor serves the frontend, static assets, and GraphQL through the same port 8080. Browser refresh after a frontend rebuild requires no separate frontend server or WebSocket port.
- `./gradlew runStatic` builds and serves the compiled frontend and backend on one Ktor port. Release packages and Docker retain this single-server behavior.
- SQLite stores weights as integer grams; the frontend displays kilograms.
- `workout_exercise.planned_working_sets` is optional guidance, not a limit.
- `workout_session` stores `started_at` and `is_finished`, but no `completed_at`. A partial unique index enforces at most one unfinished session. Existing sessions predating completion tracking are migrated as finished.
- `session_exercise` references `workout_exercise`; exercise identity is derived through that relation, not stored again.
- Session exercises snapshot their name, weight acceptance, rep targets, and planned set count to preserve history.

## Provided exercise lists

Use all four listed exercises per workout, in this order. All accept weight.

| Workout | Exercises |
| --- | --- |
| Day 1 - Push | Dumbbell Bench Press; Incline Dumbbell Bench Press (45 deg.); Dumbbell Close-Grip Bench Press; Seated Tricep Press |
| Day 2 - Pull | Deadlift; One-arm Dumbbell row; Bent-over Barbell Row; Alternating Dumbbell Curl |
| Day 3 - Upper body | Seated Dumbbell Press; Two-Arm Dumbbell Row; Dumbbell Close-Grip Bench Press; Dumbbell Rear Lateral Raise (seated) |
| Day 4 - Lower body | Dumbbell Front Squat; Single Leg Split Squat (Dumbbell); Dumbbell Romanian Deadlift; Dumbbell Lunge |

Dumbbell Close-Grip Bench Press is the same exercise across both workouts.
Every exercise prescribes **three working sets**, excluding optional warm-ups.

| Exercise | Target reps |
| --- | --- |
| Dumbbell Bench Press | 4–6 |
| Incline Dumbbell Bench Press (45 deg.) | 4–6 |
| Dumbbell Close-Grip Bench Press (both workouts) | 6–8 |
| Seated Tricep Press | 6–8 |
| Deadlift | 4–6 |
| One-arm Dumbbell row | 4–6 |
| Bent-over Barbell Row | 4–6 |
| Alternating Dumbbell Curl | 6–8 |
| Seated Dumbbell Press | 4–6 |
| Two-Arm Dumbbell Row | 6–8 |
| Dumbbell Rear Lateral Raise (seated) | 6–8 |
| Dumbbell Front Squat | 4–6 |
| Single Leg Split Squat (Dumbbell) | 4–6 |
| Dumbbell Romanian Deadlift | 6–8 |
| Dumbbell Lunge | 6–8 |
