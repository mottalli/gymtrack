package gymtrack

import gymtrack.database.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.Instant
import java.time.format.DateTimeFormatterBuilder
import java.util.UUID

typealias Record = Map<String, Any?>
class UserError(message: String, val code: String = "BAD_USER_INPUT") : RuntimeException(message)

class WorkoutRepository(private val database: Database) {
    private fun <T> tx(block: () -> T): T = transaction(database) { block() }
    private fun id() = UUID.randomUUID().toString()
    private fun timestamp(value: String): String = try {
        DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(Instant.parse(value))
    } catch (_: Exception) { throw UserError("startedAt must be an ISO-8601 timestamp with an offset.") }
    private fun missing(entity: String): Nothing = throw UserError("$entity not found.", "NOT_FOUND")

    fun plans(): List<Record> = tx { TrainingPlans.selectAll().orderBy(TrainingPlans.id).map(::planRecord) }
    fun plan(planId: String): Record? = tx { TrainingPlans.selectAll().where { TrainingPlans.id eq planId }.singleOrNull()?.let(::planRecord) }
    fun workout(workoutId: String): Record? = tx { Workouts.selectAll().where { Workouts.id eq workoutId }.singleOrNull()?.let(::workoutRecord) }
    fun session(sessionId: String): Record? = tx { sessionRecord(sessionId) }
    fun sessions(workoutId: String?, limit: Int, offset: Int): List<Record> = tx {
        if (limit !in 1..100 || offset < 0) throw UserError("limit must be 1–100 and offset must be non-negative.")
        val query = WorkoutSessions.selectAll()
        if (workoutId != null) query.where { WorkoutSessions.workoutId eq workoutId }
        query.orderBy(WorkoutSessions.startedAt to SortOrder.DESC, WorkoutSessions.id to SortOrder.ASC)
            .limit(limit).offset(offset.toLong()).map { checkNotNull(sessionRecord(it[WorkoutSessions.id])) }
    }

    private fun planRecord(row: ResultRow): Record = mapOf(
        "id" to row[TrainingPlans.id], "name" to row[TrainingPlans.name],
        "workouts" to Workouts.selectAll().where { Workouts.trainingPlanId eq row[TrainingPlans.id] }
            .orderBy(Workouts.position).map(::workoutRecord),
    )
    private fun workoutRecord(row: ResultRow): Record = mapOf(
        "id" to row[Workouts.id], "name" to row[Workouts.name],
        "trainingPlanId" to row[Workouts.trainingPlanId], "position" to row[Workouts.position],
        "exercises" to (WorkoutExercises innerJoin Exercises).selectAll()
            .where { WorkoutExercises.workoutId eq row[Workouts.id] }.orderBy(WorkoutExercises.position).map { ex ->
                mapOf(
                    "id" to ex[WorkoutExercises.id], "position" to ex[WorkoutExercises.position],
                    "targetRepsMin" to ex[WorkoutExercises.targetRepsMin], "targetRepsMax" to ex[WorkoutExercises.targetRepsMax],
                    "plannedWorkingSets" to ex[WorkoutExercises.plannedWorkingSets],
                    "exercise" to mapOf("id" to ex[Exercises.id], "name" to ex[Exercises.name], "acceptsWeight" to ex[Exercises.acceptsWeight]),
                )
            },
    )

    private fun sessionRecord(sessionId: String): Record? {
        val row = WorkoutSessions.selectAll().where { WorkoutSessions.id eq sessionId }.singleOrNull() ?: return null
        return mapOf(
            "id" to row[WorkoutSessions.id], "workoutId" to row[WorkoutSessions.workoutId], "startedAt" to row[WorkoutSessions.startedAt],
            "isFinished" to row[WorkoutSessions.isFinished],
            "exercises" to SessionExercises.selectAll().where { SessionExercises.workoutSessionId eq sessionId }
                .orderBy(SessionExercises.position).map(::sessionExerciseRecord),
        )
    }

    private fun sessionExerciseRecord(row: ResultRow): Record {
        val sets = LoggedSets.selectAll().where { LoggedSets.sessionExerciseId eq row[SessionExercises.id] }
            .orderBy(LoggedSets.position).map(::setRecord)
        val definition = WorkoutExercises.selectAll().where { WorkoutExercises.id eq row[SessionExercises.workoutExerciseId] }.single()
        val previousWeight = if (row[SessionExercises.acceptsWeightSnapshot]) {
            (LoggedSets innerJoin SessionExercises innerJoin WorkoutExercises innerJoin WorkoutSessions)
                .selectAll().where {
                    (WorkoutExercises.exerciseId eq definition[WorkoutExercises.exerciseId]) and
                        (WorkoutSessions.id neq row[SessionExercises.workoutSessionId]) and
                        (LoggedSets.type eq "WORKING") and LoggedSets.weightGrams.isNotNull()
                }.orderBy(WorkoutSessions.startedAt to SortOrder.DESC, WorkoutSessions.id to SortOrder.ASC, LoggedSets.position to SortOrder.DESC)
                .limit(1).singleOrNull()?.get(LoggedSets.weightGrams)
        } else null
        return mapOf(
            "id" to row[SessionExercises.id], "workoutExerciseId" to row[SessionExercises.workoutExerciseId],
            "exerciseId" to definition[WorkoutExercises.exerciseId], "position" to row[SessionExercises.position],
            "name" to row[SessionExercises.nameSnapshot], "acceptsWeight" to row[SessionExercises.acceptsWeightSnapshot],
            "targetRepsMin" to row[SessionExercises.targetRepsMinSnapshot], "targetRepsMax" to row[SessionExercises.targetRepsMaxSnapshot],
            "plannedWorkingSets" to row[SessionExercises.plannedWorkingSetsSnapshot],
            "suggestedWeightGrams" to previousWeight, "defaultSetType" to if (sets.size < 2) "WARMUP" else "WORKING",
            "sets" to sets.sortedWith(compareBy({ if (it["type"] == "WARMUP") 0 else 1 }, { it["position"] as Int })),
        )
    }

    private fun setRecord(row: ResultRow): Record = mapOf(
        "id" to row[LoggedSets.id], "position" to row[LoggedSets.position],
        "type" to row[LoggedSets.type], "reps" to row[LoggedSets.reps], "weightGrams" to row[LoggedSets.weightGrams],
    )

    fun startWorkout(workoutId: String): Record = tx { createWorkout(workoutId, id()) }

    private fun createWorkout(workoutId: String, sessionId: String, finished: Boolean = true): Record {
        if (Workouts.selectAll().where { Workouts.id eq workoutId }.empty()) missing("Workout")
        WorkoutSessions.insert {
            it[WorkoutSessions.id] = sessionId; it[WorkoutSessions.workoutId] = workoutId
            it[startedAt] = timestamp(Instant.now().toString())
            it[isFinished] = finished
        }
        (WorkoutExercises innerJoin Exercises).selectAll().where { WorkoutExercises.workoutId eq workoutId }
            .orderBy(WorkoutExercises.position).forEach { ex ->
                SessionExercises.insert {
                    it[SessionExercises.id] = id(); it[workoutSessionId] = sessionId
                    it[workoutExerciseId] = ex[WorkoutExercises.id]; it[position] = ex[WorkoutExercises.position]
                    it[nameSnapshot] = ex[Exercises.name]; it[acceptsWeightSnapshot] = ex[Exercises.acceptsWeight]
                    it[targetRepsMinSnapshot] = ex[WorkoutExercises.targetRepsMin]
                    it[targetRepsMaxSnapshot] = ex[WorkoutExercises.targetRepsMax]
                    it[plannedWorkingSetsSnapshot] = ex[WorkoutExercises.plannedWorkingSets]
                }
            }
        return checkNotNull(sessionRecord(sessionId))
    }

    fun recordFirstSet(sessionId: String, workoutId: String, workoutExerciseId: String,
                       setId: String, reps: Int, weight: Int?, type: String?): Record = tx {
        if (sessionId.isBlank() || sessionId.length > 100) throw UserError("Session id must contain 1–100 characters.")
        val existing = WorkoutSessions.selectAll().where { WorkoutSessions.id eq sessionId }.singleOrNull()
        if (existing == null) {
            WorkoutSessions.update({ WorkoutSessions.isFinished eq false }) { it[isFinished] = true }
            createWorkout(workoutId, sessionId, finished = false)
        } else {
            if (existing[WorkoutSessions.workoutId] != workoutId ||
                LoggedSets.selectAll().where { LoggedSets.id eq setId }.empty()) {
                throw UserError("Session id is already in use.", "CONFLICT")
            }
        }
        val exercise = SessionExercises.selectAll().where {
            (SessionExercises.workoutSessionId eq sessionId) and
                (SessionExercises.workoutExerciseId eq workoutExerciseId)
        }.singleOrNull() ?: missing("Session exercise")
        insertSet(exercise[SessionExercises.id], reps, weight, type, setId)
    }

    private fun validateSet(exercise: ResultRow, reps: Int, weight: Int?) {
        if (reps !in 1..999) throw UserError("reps must be between 1 and 999.")
        if (exercise[SessionExercises.acceptsWeightSnapshot]) {
            if (weight == null || weight < 0) throw UserError("This exercise requires a non-negative weightGrams.")
        } else if (weight != null) throw UserError("This exercise does not accept a weight.")
    }

    fun logSet(sessionExerciseId: String, reps: Int, weight: Int?, type: String?, requestedId: String?): Record =
        tx { insertSet(sessionExerciseId, reps, weight, type, requestedId) }

    private fun insertSet(sessionExerciseId: String, reps: Int, weight: Int?, type: String?, requestedId: String?): Record {
        val exercise = SessionExercises.selectAll().where { SessionExercises.id eq sessionExerciseId }.singleOrNull() ?: missing("Session exercise")
        validateSet(exercise, reps, weight)
        val existing = LoggedSets.selectAll().where { LoggedSets.sessionExerciseId eq sessionExerciseId }.toList()
        val resolvedType = type ?: if (existing.size < 2) "WARMUP" else "WORKING"
        val setId = requestedId ?: id()
        if (setId.isBlank() || setId.length > 100) throw UserError("Set id must contain 1–100 characters.")
        val duplicate = LoggedSets.selectAll().where { LoggedSets.id eq setId }.singleOrNull()
        if (duplicate != null) {
            // Safe retry for a client-generated ID; never overwrite another set.
            if (duplicate[LoggedSets.sessionExerciseId] != sessionExerciseId || duplicate[LoggedSets.reps] != reps ||
                duplicate[LoggedSets.weightGrams] != weight || (type != null && duplicate[LoggedSets.type] != type)) {
                throw UserError("Set id is already in use.", "CONFLICT")
            }
        } else {
            LoggedSets.insert {
                it[LoggedSets.id] = setId; it[LoggedSets.sessionExerciseId] = sessionExerciseId
                it[position] = (existing.maxOfOrNull { row -> row[LoggedSets.position] } ?: -1) + 1
                it[LoggedSets.type] = resolvedType; it[LoggedSets.reps] = reps; it[weightGrams] = weight
            }
        }
        return checkNotNull(sessionRecord(exercise[SessionExercises.workoutSessionId]))
    }

    fun updateSet(setId: String, reps: Int, weight: Int?, type: String?): Record = tx {
        val set = LoggedSets.selectAll().where { LoggedSets.id eq setId }.singleOrNull() ?: missing("Set")
        val exercise = SessionExercises.selectAll().where { SessionExercises.id eq set[LoggedSets.sessionExerciseId] }.single()
        validateSet(exercise, reps, weight)
        LoggedSets.update({ LoggedSets.id eq setId }) {
            it[LoggedSets.reps] = reps; it[weightGrams] = weight
            if (type != null) it[LoggedSets.type] = type
        }
        checkNotNull(sessionRecord(exercise[SessionExercises.workoutSessionId]))
    }

    fun updateSession(sessionId: String, startedAt: String): Record = tx {
        val normalized = timestamp(startedAt)
        if (WorkoutSessions.update({ WorkoutSessions.id eq sessionId }) { it[WorkoutSessions.startedAt] = normalized } == 0) missing("Session")
        checkNotNull(sessionRecord(sessionId))
    }
    fun deleteSet(setId: String): Boolean = tx { LoggedSets.deleteWhere { id eq setId } > 0 }
    fun finishSession(sessionId: String): Record = tx {
        if (WorkoutSessions.update({ WorkoutSessions.id eq sessionId }) { it[isFinished] = true } == 0) missing("Session")
        checkNotNull(sessionRecord(sessionId))
    }
    fun deleteSession(sessionId: String): Boolean = tx { WorkoutSessions.deleteWhere { id eq sessionId } > 0 }
}
