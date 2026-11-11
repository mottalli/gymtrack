# Gymtrack

One-set-at-a-time workout tracking: React + TypeScript, Kotlin/Ktor,
GraphQL Java, SQLite, and JetBrains Exposed SQL DSL.

## Build and run everything

Requires **JDK 21+** and an internet connection for the first build.
Gradle and Node/npm are downloaded at pinned versions; no system Gradle,
Kotlin, Node, or npm installation is required.

```sh
./gradlew run
```

Open **http://localhost:8080**. This is the development command:

- Vite builds the frontend in watch mode, without starting an HTTP server.
- Ktor serves the compiled frontend at `/`, its assets, and GraphQL at `/graphql`
  through the **same port 8080**. No proxy or extra published port is needed.
- Successful frontend rebuilds automatically refresh the browser. This is a full
  page refresh, not React Fast Refresh; unsubmitted in-memory drafts may reset.
- Kotlin source changes automatically recompile and restart the backend.
- Backend resources (GraphQL schema, logging, SQL migrations) are watched too.
- Compiler errors are printed while the previous backend stays available.
- SQLite data is preserved across restarts. Applied migration checksum checks
  still apply: editing an applied migration does **not** reset the database.
- Ctrl+C stops the frontend build watcher, Ktor, and any in-progress compiler process.

Gradle installs managed Node/npm and resolves the same pinned Kotlin compiler
and dependencies used by the release build. The watcher compiles directly
without nesting another Gradle build while `run` holds the project lock.
Frontend/backend source edits need no manual restart. Changes to Gradle
dependencies or build scripts require restarting the development command.

For single-server execution **without file watching**:

```sh
./gradlew runStatic
```

That also serves everything on **http://localhost:8080**, but without watching
files or automatic browser refresh. Release distributions and Docker still
use the bundled frontend and do not start development watchers.

On a remote server, tunnel from your computer:

```sh
ssh -N -L 8080:127.0.0.1:8080 your-server
```

### Configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Ktor listen address |
| `PORT` | `8080` | Ktor HTTP port |
| `GYMTRACK_DB` | `data/gymtrack.db` | SQLite file, relative to working directory unless absolute |

The initial migration includes the supplied Bigger, Leaner, Stronger plan:
Push, Pull, Upper body, and Lower body, each with four exercises in the supplied
order. Dumbbell Close-Grip Bench Press shares one exercise identity across
Push and Upper body. All supplied exercises accept a weight.

Every exercise prescribes three working sets, excluding optional warm-ups.
Exercise-specific rep ranges are the user-provided 4–6 or 6–8 targets, recorded
in `V001__initial.sql` and listed in `REQUIREMENTS.md`.
Plan data is installed transactionally by `V001__initial.sql`, not by a separate
runtime example seeder.

To initialize a database and exit without starting the server:

```sh
./gradlew run --args=--init-db
```

This creates missing schema/data but does not delete an existing database.

This is currently **single-user, without authentication**. Do not expose it
publicly without adding authentication, TLS, and appropriate access controls.
No CORS is enabled. GraphQL accepts JSON POST requests only.

## Database

- Seven domain tables; see [the data model](docs/DATA_MODEL.md).
- Exposed SQL DSL implements repository queries and mutations.
- Versioned SQL migrations run transactionally at startup. Applied checksums
  are verified; add a new migration and register it in `DatabaseFactory.kt`
  rather than editing one already applied.
- SQLite foreign keys, WAL, a busy timeout, and cascade deletion of session data.
- Blocking JDBC/GraphQL execution runs on a serialized IO dispatcher, not Netty threads.
- Weights are exact integer grams, nullable only for reps-only exercises.
- Each successful set mutation commits immediately. Reloading the browser does
  not lose recorded sets. All started sessions appear in history, including empty ones.
- `is_finished` persists completion. “Finish workout” finishes the session.
  Recording another session's first set automatically finishes the previous one;
  a database constraint permits at most one ongoing session.
- V002 preserves existing sessions as finished. Opening a workout creates only
  an in-memory draft until the first set is saved.

Keep the database on a writable persistent local volume. To back up a running
WAL database, use SQLite's backup API/CLI (`.backup`); don't copy only the main
file while writes may be in progress. Alternatively stop the server before backup.

## GraphQL

The schema is in [`backend/src/main/resources/schema.graphqls`](backend/src/main/resources/schema.graphqls).
Schema-first GraphQL Java is wired explicitly from Kotlin; no separate GraphQL
server process is required.

```sh
curl http://localhost:8080/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ trainingPlans { id name workouts { id name } } }"}'
```

Create a session together with its first set (use stable client-generated IDs
for safe retries):

```graphql
mutation {
  recordFirstSet(input: {
    sessionId: "CLIENT_SESSION_UUID"
    id: "CLIENT_SET_UUID"
    workoutId: "day-1"
    workoutExerciseId: "day-1-dumbbell-bench-press"
    reps: 8
    weightGrams: 10000
  }) {
    id
    startedAt
    isFinished
    exercises { id name acceptsWeight defaultSetType }
  }
}
```

Use an exercise's **session exercise ID** from that result to record a set:

```graphql
mutation {
  logSet(input: {
    sessionExerciseId: "ID_FROM_RECORD_FIRST_SET"
    reps: 6
    weightGrams: 20000
  }) {
    id
    exercises { name sets { id type reps weightGrams } }
  }
}
```

- Omit `type` to default the first two recorded sets per exercise to `WARMUP`,
  subsequent sets to `WORKING`. Explicit overrides are accepted.
- `updateSet` preserves the recorded type when `type` is omitted.
- Omit weight, or send null, for reps-only exercises.
- Optional client-generated set IDs make identical log retries idempotent.
- `finishWorkoutSession(id: ...)` explicitly finishes a session; repeated calls
  are safe. Editing its sets does not reopen it. `isFinished: false` identifies
  the ongoing session in history. The old `startWorkout` mutation is deprecated.
- `workoutSessions` supports `workoutId`, `limit` (1–100), and `offset`.
- Also available: `workoutSession`, `trainingPlan`, `workout`,
  `updateWorkoutSession` (date), `deleteSet`, and `deleteWorkoutSession`.
- Mutation responses return the updated session. Warm-ups are displayed first.
- Suggestions repeat the most recent working weight for the same exercise from
  another session, even across different workouts. Progression maths is deferred.
- Domain validation errors have GraphQL `errors` with `extensions.code`; internal
  failures are logged but do not expose SQL or stack traces to clients.
- Query depth, complexity, and request size are bounded.

## Development and checks

### Docker

Build from the repository root:

```sh
docker build -t gymtrack .
docker volume create gymtrack-data
docker run -d --name gymtrack \
  -p 127.0.0.1:8080:8080 \
  -v gymtrack-data:/data \
  gymtrack
```

The multi-stage image builds both frontend and backend, then runs only the
application and Java runtime as UID/GID 1000. `init.sh` starts Java directly;
there is no password, sudo, shell loop, Gradle build, or Node requirement at
container startup. No existing host database is copied into the image.
Fresh `/data/gymtrack.db` files are initialized by the bundled SQL migration.

Use `docker logs -f gymtrack` to see logs and `docker stop gymtrack` to stop it.
The named volume preserves SQLite data when replacing the container.
For a host bind mount instead, ensure the directory is writable by UID 1000.
`docker run --rm -v gymtrack-data:/data gymtrack --init-db` initializes the
database without starting the server.

Inside the container the app binds to `0.0.0.0`. The example above publishes
only on the host's loopback interface. To expose it on the host network, change
the mapping to `-p 8080:8080` **only on a trusted network or behind an
authenticated proxy**; the application itself has no authentication.

### Local development

```sh
./gradlew test           # API, repository, persistence, HTTP and static frontend tests
./gradlew build          # Backend tests plus frontend compilation and application distributions
./gradlew installDist    # Runnable standalone distribution
./gradlew runStatic      # Production-style local server on port 8080
```

The distribution runs with Java installed, without Gradle or Node:

```sh
GYMTRACK_DB=/persistent/path/gymtrack.db ./build/install/gymtrack/bin/gymtrack
```

`./gradlew run` already manages the frontend build watcher and Ktor together,
serving everything on port 8080. Stop an existing server on that port before
starting it. For optional React Fast Refresh, run Vite separately alongside
`./gradlew runStatic` (this optional workflow uses port 5173):

```sh
cd frontend
npm run dev             # localhost:5173, proxies /graphql to localhost:8080
npm run storybook       # separate terminal, localhost:6006
```

The development supervisor has a headless integration test (no browser needed)
covering source/resource reload, compiler failure recovery, frontend updates,
database persistence, and shutdown. It edits only temporary fixture copies:

```sh
./gradlew prepareDevelopment
node --test scripts/dev.test.mjs
```

Node tools installed by Gradle are under `.gradle/nodejs/`; the existing
server's Node tools can also be added to PATH as documented in
[`frontend/README.md`](frontend/README.md).

```sh
cd frontend
npm test                # Storybook browser tests
npm run lint
npm run test:e2e         # Builds distribution, starts isolated server + temp SQLite, tests real UI/API
```

E2E tests need Playwright Chromium (`npx playwright install chromium`).
They use port 18180 by default (`GYMTRACK_TEST_PORT` overrides it) and do not
touch your normal database. Frontend screenshots are saved to `frontend/screenshots/`.
Old localStorage-only history is not automatically imported.

## Layout

```text
build.gradle.kts                  Unified build, development run and static run tasks
gradlew                          Pinned Gradle wrapper
scripts/dev.mjs                  Development compiler/build watcher and Ktor supervisor
backend/src/main/kotlin/gymtrack/
  Application.kt                 Ktor HTTP server and static frontend
  GraphqlApi.kt                  Schema wiring, bounded queries, error mapping
  WorkoutRepository.kt           Exposed queries, validation and mutations
  database/                      ORM table mappings and migrations
backend/src/main/resources/
  schema.graphqls                API contract
  db/migration/                  Versioned SQL schema
backend/src/test/                 Backend integration tests
frontend/                        React app, API adapter and Storybook
frontend/prototypes/             Archived design studies
```
