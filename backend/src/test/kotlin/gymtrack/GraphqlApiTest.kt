package gymtrack

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import gymtrack.database.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.jetbrains.exposed.sql.selectAll
import java.nio.file.Files
import kotlin.test.*

class GraphqlApiTest {
    private val directory = Files.createTempDirectory("gymtrack-test-")
    private val path = directory.resolve("test.db")
    private val factory = DatabaseFactory(path)
    private val repository = WorkoutRepository(factory.database)
    private val api = GraphqlApi(repository)
    private val sessionFields = """
        id workoutId startedAt isFinished
        exercises { id workoutExerciseId exerciseId name acceptsWeight targetRepsMin targetRepsMax
          plannedWorkingSets defaultSetType suggestedWeightGrams sets { id position type reps weightGrams } }
    """.trimIndent()

    @AfterTest fun cleanUp() {
        Files.walk(directory).use { files -> files.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
    }
    @Suppress("UNCHECKED_CAST")
    private fun execute(query: String, variables: Map<String, Any?> = emptyMap()): Record {
        val result = api.execute(query, variables)
        assertNull(result["errors"], result.toString())
        return result["data"] as Record
    }
    @Suppress("UNCHECKED_CAST")
    private fun start(workout: String = "day-1"): Record =
        execute("mutation { startWorkout(workoutId: \"$workout\") { $sessionFields } }")["startWorkout"] as Record
    @Suppress("UNCHECKED_CAST")
    private fun exercises(session: Record) = session["exercises"] as List<Record>
    @Suppress("UNCHECKED_CAST")
    private fun sets(exercise: Record) = exercise["sets"] as List<Record>
    @Suppress("UNCHECKED_CAST")
    private fun log(exercise: Record, reps: Int = 6, weight: Int? = 20000, type: String? = null, id: String? = null): Record =
        execute("mutation(\$input: LogSetInput!) { logSet(input: \$input) { $sessionFields } }",
            mapOf("input" to mapOf("sessionExerciseId" to exercise["id"], "reps" to reps, "weightGrams" to weight, "type" to type, "id" to id)))["logSet"] as Record

    @Test fun `plans and session snapshots match the model`() {
        val plans = execute("{ trainingPlans { id workouts { id exercises { plannedWorkingSets exercise { acceptsWeight } } } } }")
        assertTrue(plans.toString().contains("acceptsWeight"))
        val session = start()
        assertEquals(4, exercises(session).size)
        assertEquals(3, exercises(session).first()["plannedWorkingSets"])
        assertEquals("WARMUP", exercises(session).first()["defaultSetType"])
        assertTrue(exercises(session).all { it["acceptsWeight"] == true })
        assertFalse(session.containsKey("completedAt"))
    }
    @Test fun `initial migration installs the supplied workouts and exercise order`() {
        val expected = listOf(
            listOf("Dumbbell Bench Press", "Incline Dumbbell Bench Press (45 deg.)", "Dumbbell Close-Grip Bench Press", "Seated Tricep Press"),
            listOf("Deadlift", "One-arm Dumbbell row", "Bent-over Barbell Row", "Alternating Dumbbell Curl"),
            listOf("Seated Dumbbell Press", "Two-Arm Dumbbell Row", "Dumbbell Close-Grip Bench Press", "Dumbbell Rear Lateral Raise (seated)"),
            listOf("Dumbbell Front Squat", "Single Leg Split Squat (Dumbbell)", "Dumbbell Romanian Deadlift", "Dumbbell Lunge"),
        )
        val sessions = expected.indices.map { start("day-${it + 1}") }
        expected.forEachIndexed { index, names -> assertEquals(names, exercises(sessions[index]).map { it["name"] }) }
        val repRanges = listOf(
            listOf(4 to 6, 4 to 6, 6 to 8, 6 to 8),
            listOf(4 to 6, 4 to 6, 4 to 6, 6 to 8),
            listOf(4 to 6, 6 to 8, 6 to 8, 6 to 8),
            listOf(4 to 6, 4 to 6, 6 to 8, 6 to 8),
        )
        sessions.forEachIndexed { day, session ->
            exercises(session).forEachIndexed { index, exercise ->
                assertEquals(repRanges[day][index].first, exercise["targetRepsMin"])
                assertEquals(repRanges[day][index].second, exercise["targetRepsMax"])
                assertEquals(3, exercise["plannedWorkingSets"])
            }
        }
        assertEquals(15, sessions.flatMap { exercises(it) }.map { it["exerciseId"] }.toSet().size)
        assertEquals(exercises(sessions[0])[2]["exerciseId"], exercises(sessions[2])[2]["exerciseId"])
        assertEquals("Day 3 / Upper body", repository.workout("day-3")?.get("name"))
        assertEquals("Day 4 / Lower body", repository.workout("day-4")?.get("name"))
    }
    @Test fun `first two sets default to warmup and retries are idempotent`() {
        val exercise = exercises(start()).first()
        log(exercise, id = "client-1")
        log(exercise, id = "client-1")
        log(exercise, id = "client-2")
        val result = log(exercise, id = "client-3")
        val logged = sets(exercises(result).first())
        assertEquals(listOf("WARMUP", "WARMUP", "WORKING"), logged.map { it["type"] })
        assertEquals("WORKING", exercises(result).first()["defaultSetType"])
        val updated = execute("""mutation { updateSet(id: "client-3", input: {reps: 5, weightGrams: 22500}) { $sessionFields } }""")
        assertTrue(updated.toString().contains("22500"))
    }
    @Test fun `first set creates a session atomically and retries do not duplicate it`() {
        val mutation = "mutation(\$input: FirstSetInput!) { recordFirstSet(input: \$input) { $sessionFields } }"
        val input = mapOf(
            "sessionId" to "draft-session", "id" to "first-set", "workoutId" to "day-1",
            "workoutExerciseId" to "day-1-dumbbell-bench-press", "reps" to 8, "weightGrams" to 10000,
        )
        assertTrue(repository.sessions(null, 100, 0).isEmpty())
        for (invalid in listOf(
            input + ("reps" to 0),
            input + ("weightGrams" to null),
            input + ("workoutExerciseId" to "day-2-deadlift"),
        )) {
            assertNotNull(api.execute(mutation, mapOf("input" to invalid))["errors"])
            assertNull(repository.session("draft-session"))
            transaction(factory.database) {
                assertEquals(0L, WorkoutSessions.selectAll().count())
                assertEquals(0L, SessionExercises.selectAll().count())
                assertEquals(0L, LoggedSets.selectAll().count())
            }
        }
        repeat(2) { execute(mutation, mapOf("input" to input)) }
        val saved = checkNotNull(repository.session("draft-session"))
        assertEquals(1, repository.sessions(null, 100, 0).size)
        assertEquals(4, exercises(saved).size)
        assertEquals(1, exercises(saved).sumOf { sets(it).size })
        assertEquals("WARMUP", sets(exercises(saved).first()).first()["type"])
        assertNotNull(api.execute(mutation, mapOf("input" to (input + ("reps" to 9))))["errors"])
        log(exercises(saved).first(), reps = 6, weight = 12000, id = "second-set")
        assertEquals(2, sets(exercises(checkNotNull(repository.session("draft-session"))).first()).size)
    }
    @Test fun `only one workout stays ongoing and finish is persisted`() {
        fun first(sessionId: String, reps: Int = 6, workout: String = "day-1"): Record =
            execute("mutation(\$input: FirstSetInput!) { recordFirstSet(input: \$input) { $sessionFields } }",
                mapOf("input" to mapOf(
                    "sessionId" to sessionId, "id" to "$sessionId-set", "workoutId" to workout,
                    "workoutExerciseId" to "$workout-dumbbell-bench-press", "reps" to reps, "weightGrams" to 10000,
                )))["recordFirstSet"] as Record
        first("one")
        assertEquals(false, repository.session("one")?.get("isFinished"))
        assertFailsWith<AssertionError> { first("invalid", reps = 0) }
        assertNull(repository.session("invalid"))
        assertEquals(false, repository.session("one")?.get("isFinished"), "Failed saves must not finish the ongoing workout")
        first("two")
        assertEquals(true, repository.session("one")?.get("isFinished"))
        assertEquals(false, repository.session("two")?.get("isFinished"))
        first("one") // Retrying an old request must not reopen it or finish the new one.
        assertEquals(true, repository.session("one")?.get("isFinished"))
        assertEquals(false, repository.session("two")?.get("isFinished"))
        val reopened = WorkoutRepository(DatabaseFactory(path).database)
        assertEquals("two", reopened.sessions(null, 100, 0).single { it["isFinished"] == false }["id"])
        repeat(2) {
            execute("""mutation { finishWorkoutSession(id: "two") { id isFinished } }""")
        }
        assertTrue(repository.sessions(null, 100, 0).all { it["isFinished"] == true })
        log(exercises(checkNotNull(repository.session("one"))).first(), id = "past-edit")
        assertEquals(true, repository.session("one")?.get("isFinished"), "Editing must not reopen a finished workout")
        assertNotNull(api.execute("""mutation { finishWorkoutSession(id: "missing") { id } }""")["errors"])
        first("three")
        java.sql.DriverManager.getConnection("jdbc:sqlite:$path").use { connection ->
            assertFailsWith<java.sql.SQLException> {
                connection.createStatement().use { it.executeUpdate("UPDATE workout_session SET is_finished = 0 WHERE id = 'one'") }
            }
        }
        assertTrue(repository.deleteSession("three"))
        assertTrue(repository.sessions(null, 100, 0).all { it["isFinished"] == true })
    }

    @Test fun `ongoing migration preserves legacy sessions as finished`() {
        val legacyPath = directory.resolve("legacy.db")
        val sql = checkNotNull(javaClass.getResource("/db/migration/V001__initial.sql")).readText()
        val checksum = java.security.MessageDigest.getInstance("SHA-256").digest(sql.toByteArray())
            .joinToString("") { "%02x".format(it) }
        java.sql.DriverManager.getConnection("jdbc:sqlite:$legacyPath").use { connection ->
            connection.createStatement().use { statement ->
                sql.split(';').map(String::trim).filter(String::isNotEmpty).forEach { statement.execute(it) }
                statement.execute("CREATE TABLE schema_migration (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)")
                statement.execute("INSERT INTO schema_migration VALUES ('V001__initial.sql', '$checksum', '2026-01-01T00:00:00.000Z')")
                statement.execute("INSERT INTO workout_session VALUES ('legacy', 'day-1', '2026-01-01T00:00:00.000Z')")
            }
        }
        val migrated = WorkoutRepository(DatabaseFactory(legacyPath).database)
        assertEquals(true, migrated.session("legacy")?.get("isFinished"))
        assertEquals(1, migrated.plans().size)
        assertEquals(1, WorkoutRepository(DatabaseFactory(legacyPath).database).sessions(null, 100, 0).size)
    }
    @Test fun `explicit set types are retained and warmups sort first`() {
        val exercise = exercises(start()).first()
        val first = log(exercise, type = "WORKING", id = "working")
        assertEquals("WARMUP", exercises(first).first()["defaultSetType"])
        execute("""mutation { updateSet(id: "working", input: {reps: 4, weightGrams: 20000}) { id } }""")
        val second = log(exercise, type = "WARMUP", id = "warmup")
        assertEquals(listOf("warmup", "working"), sets(exercises(second).first()).map { it["id"] })
        assertEquals("WORKING", sets(exercises(second).first()).last()["type"])
    }
    @Test fun `invalid weights reps and references produce safe errors`() {
        // Reps-only support is tested independently of the real, all-weighted plan.
        transaction(factory.database) {
            Exercises.update({ Exercises.id eq "seated-tricep-press" }) { it[acceptsWeight] = false }
        }
        val session = start()
        val weighted = exercises(session).first()
        val bodyweight = exercises(session).last()
        for (input in listOf(
            mapOf("sessionExerciseId" to weighted["id"], "reps" to 0, "weightGrams" to 10),
            mapOf("sessionExerciseId" to weighted["id"], "reps" to 6),
            mapOf("sessionExerciseId" to weighted["id"], "reps" to 6, "weightGrams" to -1),
            mapOf("sessionExerciseId" to bodyweight["id"], "reps" to 6, "weightGrams" to 10),
            mapOf("sessionExerciseId" to "missing", "reps" to 6),
        )) {
            val result = api.execute("mutation(\$input: LogSetInput!) { logSet(input: \$input) { id } }", mapOf("input" to input))
            assertNotNull(result["errors"])
            assertFalse(result.toString().contains("SELECT"))
        }
        val valid = log(bodyweight, weight = null)
        assertNull(sets(exercises(valid).last()).first()["weightGrams"])
        assertNotNull(api.execute("{ workoutSessions(limit: 101) { id } }")["errors"])
    }
    @Test fun `history and suggestions persist across database reopen and across workouts`() {
        val exercise = exercises(start())[2]
        log(exercise, type = "WORKING", weight = 22500)
        val second = start("day-3")
        assertEquals(22500, exercises(second)[2]["suggestedWeightGrams"])
        val reopened = WorkoutRepository(DatabaseFactory(path).database)
        assertEquals(1, reopened.plans().size)
        assertEquals(2, reopened.sessions(null, 50, 0).size)
        assertEquals(22500, exercises(checkNotNull(reopened.session(second["id"] as String)))[2]["suggestedWeightGrams"])
    }
    @Test fun `snapshots survive plan changes and deletion cascades`() {
        val original = start()
        val exercise = exercises(original).first()
        log(exercise, id = "to-delete")
        transaction(factory.database) {
            Exercises.update({ Exercises.id eq "dumbbell-bench-press" }) { it[name] = "Changed exercise name" }
            WorkoutExercises.update({ WorkoutExercises.id eq "day-1-dumbbell-bench-press" }) { it[targetRepsMin] = 5 }
        }
        val old = checkNotNull(repository.session(original["id"] as String))
        assertEquals("Dumbbell Bench Press", exercises(old).first()["name"])
        assertEquals(4, exercises(old).first()["targetRepsMin"])
        assertEquals("Changed exercise name", exercises(start()).first()["name"])
        assertTrue(repository.deleteSession(original["id"] as String))
        assertNull(repository.session(original["id"] as String))
        assertFalse(repository.deleteSet("to-delete"))
    }
    @Test fun `session date edits normalize UTC and pagination and missing records are validated`() {
        val session = start()
        val sessionId = session["id"] as String
        val edited = execute(
            "mutation(\$id: ID!) { updateWorkoutSession(id: \$id, startedAt: \"2026-01-10T11:30:00+02:00\") { startedAt } }",
            mapOf("id" to sessionId),
        )
        assertContains(edited.toString(), "2026-01-10T09:30:00.000Z")
        assertNotNull(api.execute("""mutation { updateWorkoutSession(id: "$sessionId", startedAt: "invalid") { id } }""")["errors"])
        assertNotNull(api.execute("{ workoutSessions(offset: -1) { id } }")["errors"])
        assertNull(execute("""{ workoutSession(id: "missing") { id } }""")["workoutSession"])
        assertFalse(SessionExercises.columns.any { it.name == "exercise_id" })
        assertFalse(WorkoutSessions.columns.any { it.name == "completed_at" })
    }
    @Test fun `modified migration history is refused rather than silently ignored`() {
        java.sql.DriverManager.getConnection("jdbc:sqlite:$path").use { connection ->
            connection.createStatement().use { it.executeUpdate("UPDATE schema_migration SET checksum = 'changed'") }
        }
        assertFailsWith<IllegalStateException> { DatabaseFactory(path) }
    }
    @Test fun `HTTP serves GraphQL and the frontend on the same server`() = testApplication {
        application { gymtrackModule(repository) }
        assertEquals(HttpStatusCode.OK, client.get("/health").status)
        val index = client.get("/")
        assertEquals(HttpStatusCode.OK, index.status)
        assertContains(index.bodyAsText(), "Gymtrack")
        val response = client.post("/graphql") {
            contentType(ContentType.Application.Json)
            setBody("""{"query":"{ trainingPlans { id } }"}""")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val result = jacksonObjectMapper().readTree(response.bodyAsText())
        assertEquals("bls", result["data"]["trainingPlans"][0]["id"].asText())
        val invalid = client.post("/graphql") { contentType(ContentType.Application.Json); setBody("not json") }
        assertEquals(HttpStatusCode.BadRequest, invalid.status)
        assertEquals(HttpStatusCode.UnsupportedMediaType, client.post("/graphql") {
            contentType(ContentType.Text.Plain); setBody("""{"query":"{ trainingPlans { id } }"}""")
        }.status)
        val tooLarge = client.post("/graphql") {
            contentType(ContentType.Application.Json)
            setBody("""{"query":"""" + " ".repeat(256_001) + """"}""")
        }
        assertEquals(HttpStatusCode.PayloadTooLarge, tooLarge.status)
        assertEquals(HttpStatusCode.NotFound, client.get("/api/missing").status)
        assertEquals(HttpStatusCode.NotFound, client.get("/__dev/revision").status)
    }
    @Test fun `development serves updated compiled files and GraphQL on the same port`() = testApplication {
        val frontend = Files.createDirectory(directory.resolve("frontend"))
        val index = frontend.resolve("index.html")
        val revision = directory.resolve("revision")
        Files.writeString(index, "<html>Development build one</html>")
        Files.writeString(revision, "revision-one")
        application { gymtrackModule(repository, frontend, revision) }
        val first = client.get("/")
        assertEquals(HttpStatusCode.OK, first.status)
        assertContains(first.bodyAsText(), "Development build one")
        assertContains(first.headers[HttpHeaders.CacheControl].orEmpty(), "no-store")
        Files.writeString(index, "<html>Development build two</html>")
        Files.writeString(revision, "revision-two")
        assertContains(client.get("/").bodyAsText(), "Development build two")
        assertContains(client.get("/__dev/revision").bodyAsText(), "revision-two")
        assertEquals(HttpStatusCode.OK, client.post("/graphql") {
            contentType(ContentType.Application.Json)
            setBody("""{"query":"{ trainingPlans { id } }"}""")
        }.status)
    }
}
