package gymtrack.database

import org.jetbrains.exposed.sql.Database
import org.sqlite.SQLiteConfig
import org.sqlite.SQLiteDataSource
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.time.Instant

class DatabaseFactory(path: Path) {
    private val dataSource: SQLiteDataSource
    val database: Database

    init {
        Files.createDirectories(path.toAbsolutePath().parent)
        val config = SQLiteConfig().apply {
            enforceForeignKeys(true)
            setBusyTimeout(5000)
            setJournalMode(SQLiteConfig.JournalMode.WAL)
        }
        dataSource = SQLiteDataSource(config).apply { url = "jdbc:sqlite:${path.toAbsolutePath()}" }
        migrate()
        database = Database.connect(dataSource)
    }

    private fun migrate() {
        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                connection.createStatement().use { it.execute(
                    "CREATE TABLE IF NOT EXISTS schema_migration (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)"
                ) }
                for (version in listOf("V001__initial.sql", "V002__ongoing_workout.sql")) {
                    val sql = checkNotNull(javaClass.getResource("/db/migration/$version")) { "Missing migration $version" }.readText()
                    val checksum = MessageDigest.getInstance("SHA-256").digest(sql.toByteArray()).joinToString("") { "%02x".format(it) }
                    val previous = connection.prepareStatement("SELECT checksum FROM schema_migration WHERE version = ?").use {
                        it.setString(1, version)
                        it.executeQuery().use { result -> if (result.next()) result.getString(1) else null }
                    }
                    if (previous != null) {
                        check(previous == checksum) { "Applied migration $version was modified. Add a new migration instead." }
                        continue
                    }
                    // These migrations contain plain SQL, not trigger bodies or semicolons in literals.
                    sql.split(';').map(String::trim).filter(String::isNotEmpty).forEach { statement ->
                        connection.createStatement().use { it.execute(statement) }
                    }
                    connection.prepareStatement("INSERT INTO schema_migration VALUES (?, ?, ?)").use {
                        it.setString(1, version); it.setString(2, checksum); it.setString(3, Instant.now().toString())
                        it.executeUpdate()
                    }
                }
                connection.commit()
            } catch (error: Exception) {
                connection.rollback()
                throw error
            }
        }
    }
}
