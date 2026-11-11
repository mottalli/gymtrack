ALTER TABLE workout_session ADD COLUMN is_finished INTEGER NOT NULL DEFAULT 1 CHECK (is_finished IN (0, 1));

CREATE UNIQUE INDEX one_ongoing_workout ON workout_session(is_finished) WHERE is_finished = 0;
