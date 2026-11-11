package gymtrack.database

import org.jetbrains.exposed.sql.Table

object TrainingPlans : Table("training_plan") {
    val id = varchar("id", 100)
    val name = text("name")
    override val primaryKey = PrimaryKey(id)
}
object Workouts : Table("workout") {
    val id = varchar("id", 100)
    val trainingPlanId = reference("training_plan_id", TrainingPlans.id)
    val name = text("name")
    val position = integer("position")
    override val primaryKey = PrimaryKey(id)
}
object Exercises : Table("exercise") {
    val id = varchar("id", 100)
    val name = text("name")
    val acceptsWeight = bool("accepts_weight")
    override val primaryKey = PrimaryKey(id)
}
object WorkoutExercises : Table("workout_exercise") {
    val id = varchar("id", 100)
    val workoutId = reference("workout_id", Workouts.id)
    val exerciseId = reference("exercise_id", Exercises.id)
    val position = integer("position")
    val targetRepsMin = integer("target_reps_min")
    val targetRepsMax = integer("target_reps_max")
    val plannedWorkingSets = integer("planned_working_sets").nullable()
    override val primaryKey = PrimaryKey(id)
}
object WorkoutSessions : Table("workout_session") {
    val id = varchar("id", 100)
    val workoutId = reference("workout_id", Workouts.id)
    val startedAt = text("started_at")
    val isFinished = bool("is_finished")
    override val primaryKey = PrimaryKey(id)
}
object SessionExercises : Table("session_exercise") {
    val id = varchar("id", 100)
    val workoutSessionId = reference("workout_session_id", WorkoutSessions.id)
    val workoutExerciseId = reference("workout_exercise_id", WorkoutExercises.id)
    val position = integer("position")
    val nameSnapshot = text("name_snapshot")
    val acceptsWeightSnapshot = bool("accepts_weight_snapshot")
    val targetRepsMinSnapshot = integer("target_reps_min_snapshot")
    val targetRepsMaxSnapshot = integer("target_reps_max_snapshot")
    val plannedWorkingSetsSnapshot = integer("planned_working_sets_snapshot").nullable()
    override val primaryKey = PrimaryKey(id)
}
object LoggedSets : Table("logged_set") {
    val id = varchar("id", 100)
    val sessionExerciseId = reference("session_exercise_id", SessionExercises.id)
    val position = integer("position")
    val type = varchar("type", 10)
    val reps = integer("reps")
    val weightGrams = integer("weight_grams").nullable()
    override val primaryKey = PrimaryKey(id)
}
