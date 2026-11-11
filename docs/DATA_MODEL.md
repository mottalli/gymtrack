# Data model

```mermaid
erDiagram
    TRAINING_PLAN ||--o{ WORKOUT : contains
    WORKOUT ||--o{ WORKOUT_EXERCISE : prescribes
    EXERCISE ||--o{ WORKOUT_EXERCISE : identifies
    WORKOUT ||--o{ WORKOUT_SESSION : performed_as
    WORKOUT_SESSION ||--o{ SESSION_EXERCISE : contains
    WORKOUT_EXERCISE ||--o{ SESSION_EXERCISE : instantiated_as
    SESSION_EXERCISE ||--o{ LOGGED_SET : records

    TRAINING_PLAN {
        text id PK
        text name
    }
    WORKOUT {
        text id PK
        text training_plan_id FK
        text name
        integer position
    }
    EXERCISE {
        text id PK
        text name
        boolean accepts_weight
    }
    WORKOUT_EXERCISE {
        text id PK
        text workout_id FK
        text exercise_id FK
        integer position
        integer target_reps_min
        integer target_reps_max
        integer planned_working_sets "nullable guidance"
    }
    WORKOUT_SESSION {
        text id PK
        text workout_id FK
        text started_at "UTC ISO-8601 milliseconds"
        boolean is_finished
    }
    SESSION_EXERCISE {
        text id PK
        text workout_session_id FK
        text workout_exercise_id FK
        integer position
        text name_snapshot
        boolean accepts_weight_snapshot
        integer target_reps_min_snapshot
        integer target_reps_max_snapshot
        integer planned_working_sets_snapshot "nullable"
    }
    LOGGED_SET {
        text id PK
        text session_exercise_id FK
        integer position
        text type "WARMUP or WORKING"
        integer reps
        integer weight_grams "nullable"
    }
```

There is no `completed_at`, equipment interpretation, or redundant
`session_exercise.exercise_id`. GraphQL derives exercise identity by joining
`workout_exercise`; snapshots preserve historical presentation/prescriptions.
Positions are zero-based. A session exercise's set type is stored explicitly,
not inferred later from its position.

Weighted exercises require non-negative integer grams; reps-only exercises
reject weights. The repository validates that rule against the session snapshot.
SQLite constraints enforce references, valid types, positive reps, non-negative
weights, and unique positions. Session deletion cascades to its exercises and sets.

`is_finished` persists completion. V002 marks legacy sessions finished and adds a
partial unique index allowing at most one ongoing (`is_finished = 0`) session.
Recording a new session's first set atomically finishes the previous ongoing
session. Explicit finish persists completion; editing past sets never reopens a
session. Drafts are browser-memory only and do not affect the ongoing session.
