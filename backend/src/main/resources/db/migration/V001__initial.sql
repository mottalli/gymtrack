CREATE TABLE training_plan (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
);
CREATE TABLE workout (
    id TEXT PRIMARY KEY,
    training_plan_id TEXT NOT NULL REFERENCES training_plan(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE(training_plan_id, position)
);
CREATE TABLE exercise (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    accepts_weight INTEGER NOT NULL CHECK (accepts_weight IN (0, 1))
);
CREATE TABLE workout_exercise (
    id TEXT PRIMARY KEY,
    workout_id TEXT NOT NULL REFERENCES workout(id) ON DELETE RESTRICT,
    exercise_id TEXT NOT NULL REFERENCES exercise(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL CHECK (position >= 0),
    target_reps_min INTEGER NOT NULL CHECK (target_reps_min > 0),
    target_reps_max INTEGER NOT NULL CHECK (target_reps_max >= target_reps_min),
    planned_working_sets INTEGER CHECK (planned_working_sets > 0),
    UNIQUE(workout_id, position)
);
CREATE TABLE workout_session (
    id TEXT PRIMARY KEY,
    workout_id TEXT NOT NULL REFERENCES workout(id) ON DELETE RESTRICT,
    started_at TEXT NOT NULL
);
CREATE TABLE session_exercise (
    id TEXT PRIMARY KEY,
    workout_session_id TEXT NOT NULL REFERENCES workout_session(id) ON DELETE CASCADE,
    workout_exercise_id TEXT NOT NULL REFERENCES workout_exercise(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL CHECK (position >= 0),
    name_snapshot TEXT NOT NULL,
    accepts_weight_snapshot INTEGER NOT NULL CHECK (accepts_weight_snapshot IN (0, 1)),
    target_reps_min_snapshot INTEGER NOT NULL CHECK (target_reps_min_snapshot > 0),
    target_reps_max_snapshot INTEGER NOT NULL CHECK (target_reps_max_snapshot >= target_reps_min_snapshot),
    planned_working_sets_snapshot INTEGER CHECK (planned_working_sets_snapshot > 0),
    UNIQUE(workout_session_id, position),
    UNIQUE(workout_session_id, workout_exercise_id)
);
CREATE TABLE logged_set (
    id TEXT PRIMARY KEY,
    session_exercise_id TEXT NOT NULL REFERENCES session_exercise(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    type TEXT NOT NULL CHECK (type IN ('WARMUP', 'WORKING')),
    reps INTEGER NOT NULL CHECK (reps > 0 AND reps <= 999),
    weight_grams INTEGER CHECK (weight_grams >= 0),
    UNIQUE(session_exercise_id, position)
);
CREATE INDEX session_started_at ON workout_session(started_at DESC, id);
CREATE INDEX session_exercise_definition ON session_exercise(workout_exercise_id);
CREATE INDEX workout_exercise_identity ON workout_exercise(exercise_id);

INSERT INTO training_plan (id, name) VALUES ('bls', 'Bigger, Leaner, Stronger');
INSERT INTO workout (id, training_plan_id, name, position) VALUES
    ('day-1', 'bls', 'Day 1 / Push', 0),
    ('day-2', 'bls', 'Day 2 / Pull', 1),
    ('day-3', 'bls', 'Day 3 / Upper body', 2),
    ('day-4', 'bls', 'Day 4 / Lower body', 3);
INSERT INTO exercise (id, name, accepts_weight) VALUES
    ('dumbbell-bench-press', 'Dumbbell Bench Press', 1),
    ('incline-dumbbell-bench-press', 'Incline Dumbbell Bench Press (45 deg.)', 1),
    ('dumbbell-close-grip-bench-press', 'Dumbbell Close-Grip Bench Press', 1),
    ('seated-tricep-press', 'Seated Tricep Press', 1),
    ('deadlift', 'Deadlift', 1),
    ('one-arm-dumbbell-row', 'One-arm Dumbbell row', 1),
    ('bent-over-barbell-row', 'Bent-over Barbell Row', 1),
    ('alternating-dumbbell-curl', 'Alternating Dumbbell Curl', 1),
    ('seated-dumbbell-press', 'Seated Dumbbell Press', 1),
    ('two-arm-dumbbell-row', 'Two-Arm Dumbbell Row', 1),
    ('seated-dumbbell-rear-lateral-raise', 'Dumbbell Rear Lateral Raise (seated)', 1),
    ('dumbbell-front-squat', 'Dumbbell Front Squat', 1),
    ('single-leg-split-squat', 'Single Leg Split Squat (Dumbbell)', 1),
    ('dumbbell-romanian-deadlift', 'Dumbbell Romanian Deadlift', 1),
    ('dumbbell-lunge', 'Dumbbell Lunge', 1);

-- User-provided prescriptions: three working sets, excluding optional warm-ups.
INSERT INTO workout_exercise
    (id, workout_id, exercise_id, position, target_reps_min, target_reps_max, planned_working_sets)
VALUES
    ('day-1-dumbbell-bench-press', 'day-1', 'dumbbell-bench-press', 0, 4, 6, 3),
    ('day-1-incline-dumbbell-bench-press', 'day-1', 'incline-dumbbell-bench-press', 1, 4, 6, 3),
    ('day-1-dumbbell-close-grip-bench-press', 'day-1', 'dumbbell-close-grip-bench-press', 2, 6, 8, 3),
    ('day-1-seated-tricep-press', 'day-1', 'seated-tricep-press', 3, 6, 8, 3),
    ('day-2-deadlift', 'day-2', 'deadlift', 0, 4, 6, 3),
    ('day-2-one-arm-dumbbell-row', 'day-2', 'one-arm-dumbbell-row', 1, 4, 6, 3),
    ('day-2-bent-over-barbell-row', 'day-2', 'bent-over-barbell-row', 2, 4, 6, 3),
    ('day-2-alternating-dumbbell-curl', 'day-2', 'alternating-dumbbell-curl', 3, 6, 8, 3),
    ('day-3-seated-dumbbell-press', 'day-3', 'seated-dumbbell-press', 0, 4, 6, 3),
    ('day-3-two-arm-dumbbell-row', 'day-3', 'two-arm-dumbbell-row', 1, 6, 8, 3),
    ('day-3-dumbbell-close-grip-bench-press', 'day-3', 'dumbbell-close-grip-bench-press', 2, 6, 8, 3),
    ('day-3-seated-dumbbell-rear-lateral-raise', 'day-3', 'seated-dumbbell-rear-lateral-raise', 3, 6, 8, 3),
    ('day-4-dumbbell-front-squat', 'day-4', 'dumbbell-front-squat', 0, 4, 6, 3),
    ('day-4-single-leg-split-squat', 'day-4', 'single-leg-split-squat', 1, 4, 6, 3),
    ('day-4-dumbbell-romanian-deadlift', 'day-4', 'dumbbell-romanian-deadlift', 2, 6, 8, 3),
    ('day-4-dumbbell-lunge', 'day-4', 'dumbbell-lunge', 3, 6, 8, 3);
