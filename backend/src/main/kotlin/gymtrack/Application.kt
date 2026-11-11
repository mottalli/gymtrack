package gymtrack

import gymtrack.database.DatabaseFactory
import io.ktor.http.*
import io.ktor.serialization.jackson.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.http.content.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.calllogging.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.statuspages.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.utils.io.readRemaining
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.io.readByteArray
import java.nio.file.Path

data class GraphqlRequest(
    val query: String = "",
    val variables: Map<String, Any?>? = null,
    val operationName: String? = null,
)

fun main(args: Array<String>) {
    require(args.isEmpty() || args.contentEquals(arrayOf("--init-db"))) { "Usage: gymtrack [--init-db]" }
    val host = System.getenv("HOST")?.takeIf { it.isNotBlank() } ?: "127.0.0.1"
    val port = (System.getenv("PORT")?.takeIf { it.isNotBlank() } ?: "8080").toInt()
    val path = Path.of(System.getenv("GYMTRACK_DB")?.takeIf { it.isNotBlank() } ?: "data/gymtrack.db")
    val repository = WorkoutRepository(DatabaseFactory(path).database)
    if (args.contentEquals(arrayOf("--init-db"))) return
    val frontendDirectory = System.getenv("GYMTRACK_FRONTEND_DIR")?.takeIf { it.isNotBlank() }?.let(Path::of)
    val revisionFile = System.getenv("GYMTRACK_DEV_REVISION_FILE")?.takeIf { it.isNotBlank() }?.let(Path::of)
    embeddedServer(Netty, host = host, port = port) {
        gymtrackModule(repository, frontendDirectory, revisionFile)
    }.start(wait = true)
}

fun Application.gymtrackModule(
    repository: WorkoutRepository,
    frontendDirectory: Path? = null,
    developmentRevisionFile: Path? = null,
) {
    install(ContentNegotiation) { jackson() }
    install(CallLogging) {
        filter { call -> call.request.path() != "/__dev/revision" }
    }
    install(StatusPages) {
        exception<Throwable> { call, error ->
            this@gymtrackModule.environment.log.error("HTTP request failed", error)
            call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "An internal error occurred."))
        }
    }
    val api = GraphqlApi(repository)
    val mapper = com.fasterxml.jackson.module.kotlin.jacksonObjectMapper()
    // SQLite has one writer. Keep blocking JDBC work off Netty and serialize API DB operations.
    val databaseDispatcher = Dispatchers.IO.limitedParallelism(1)
    routing {
        get("/health") { call.respond(mapOf("status" to "ok")) }
        post("/graphql") {
            if (!call.request.contentType().match(ContentType.Application.Json)) {
                call.respond(HttpStatusCode.UnsupportedMediaType, mapOf("error" to "Content-Type must be application/json."))
                return@post
            }
            val contentLength = call.request.headers[HttpHeaders.ContentLength]?.toLongOrNull()
            if (contentLength != null && contentLength > 256_000) {
                call.respond(HttpStatusCode.PayloadTooLarge, mapOf("error" to "GraphQL request is too large."))
                return@post
            }
            // Limit actual bytes too; Content-Length may be absent for chunked requests.
            val bytes = call.receiveChannel().readRemaining(256_001).readByteArray()
            if (bytes.size > 256_000) {
                call.respond(HttpStatusCode.PayloadTooLarge, mapOf("error" to "GraphQL request is too large."))
                return@post
            }
            val request = try {
                mapper.readValue(bytes, GraphqlRequest::class.java)
            } catch (_: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Expected a GraphQL JSON request."))
                return@post
            }
            if (request.query.isBlank() || request.query.length > 64_000) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "query must contain 1–64000 characters."))
                return@post
            }
            call.respond(withContext(databaseDispatcher) { api.execute(request.query, request.variables ?: emptyMap(), request.operationName) })
        }
        if (developmentRevisionFile != null) {
            get("/__dev/revision") {
                call.response.header(HttpHeaders.CacheControl, "no-store")
                call.respond(mapOf("revision" to developmentRevisionFile.toFile().readText()))
            }
        }
        // Development reads freshly compiled files from disk. Releases serve
        // bundled assets. Both modes use this same Ktor HTTP server and port.
        if (frontendDirectory != null) {
            staticFiles("/", frontendDirectory.toFile(), index = "index.html") {
                cacheControl { listOf(CacheControl.NoStore(null)) }
            }
        } else {
            staticResources("/", "static", index = "index.html")
        }
    }
}
