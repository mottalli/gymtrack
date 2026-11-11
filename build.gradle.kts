import com.github.gradle.node.npm.task.NpmTask
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import groovy.json.JsonOutput
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

plugins {
    kotlin("jvm") version "2.2.20"
    application
    id("com.github.node-gradle.node") version "7.1.0"
}

repositories { mavenCentral() }

kotlin {
    compilerOptions.jvmTarget.set(JvmTarget.JVM_21)
    sourceSets {
        main { kotlin.srcDir("backend/src/main/kotlin") }
        test { kotlin.srcDir("backend/src/test/kotlin") }
    }
}
java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}
sourceSets {
    main { resources.srcDirs("backend/src/main/resources", layout.buildDirectory.dir("generated/frontend")) }
    test { resources.srcDir("backend/src/test/resources") }
}

val ktorVersion = "3.3.1"
val exposedVersion = "0.61.0"
val developmentCompiler by configurations.creating
dependencies {
    developmentCompiler("org.jetbrains.kotlin:kotlin-compiler-embeddable:2.2.20")
    implementation("io.ktor:ktor-server-netty:$ktorVersion")
    implementation("io.ktor:ktor-server-content-negotiation:$ktorVersion")
    implementation("io.ktor:ktor-serialization-jackson:$ktorVersion")
    implementation("io.ktor:ktor-server-status-pages:$ktorVersion")
    implementation("io.ktor:ktor-server-call-logging:$ktorVersion")
    implementation("com.graphql-java:graphql-java:24.3")
    implementation("org.jetbrains.exposed:exposed-core:$exposedVersion")
    implementation("org.jetbrains.exposed:exposed-jdbc:$exposedVersion")
    implementation("org.xerial:sqlite-jdbc:3.50.3.0")
    implementation("ch.qos.logback:logback-classic:1.5.20")
    testImplementation(kotlin("test-junit5"))
    testRuntimeOnly("org.junit.jupiter:junit-jupiter-engine:5.11.4")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.11.4")
    testImplementation("io.ktor:ktor-server-test-host:$ktorVersion")
}

application {
    mainClass.set("gymtrack.ApplicationKt")
    applicationDefaultJvmArgs = listOf("--enable-native-access=ALL-UNNAMED")
}
tasks.test {
    useJUnitPlatform()
    jvmArgs("--enable-native-access=ALL-UNNAMED")
}

node {
    version.set("22.23.2")
    download.set(true)
    nodeProjectDir.set(file("frontend"))
}
val frontendInstall by tasks.registering(NpmTask::class) {
    args.set(listOf("ci"))
    inputs.files("frontend/package.json", "frontend/package-lock.json")
    outputs.dir("frontend/node_modules")
}
val frontendBuild by tasks.registering(NpmTask::class) {
    dependsOn(frontendInstall)
    args.set(listOf("run", "build"))
    inputs.files(fileTree("frontend/src"), fileTree("frontend/public"))
    inputs.files("frontend/index.html", "frontend/vite.config.ts", "frontend/dev-reload-plugin.ts", "frontend/tsconfig.json", "frontend/tsconfig.app.json", "frontend/tsconfig.node.json", "frontend/package.json", "frontend/package-lock.json")
    outputs.dir("frontend/dist")
}
val packageFrontend by tasks.registering(Sync::class) {
    dependsOn(frontendBuild)
    from("frontend/dist")
    into(layout.buildDirectory.dir("generated/frontend/static"))
}
tasks.processResources { dependsOn(packageFrontend) }
// Keep a conventional single-server runner for production-style local use.
tasks.register<JavaExec>("runStatic") {
    group = "application"
    description = "Build and serve the compiled frontend and backend on one port (no watching)."
    classpath = sourceSets.main.get().runtimeClasspath
    mainClass.set(application.mainClass)
    jvmArgs(application.applicationDefaultJvmArgs)
    workingDir = rootDir
    standardInput = System.`in`
}

val prepareDevelopment by tasks.registering {
    description = "Resolve the managed development tools and write the supervisor configuration."
    dependsOn(frontendInstall)
    doLast {
        val configFile = layout.buildDirectory.file("dev/config.json").get().asFile
        configFile.parentFile.mkdirs()
        configFile.writeText(JsonOutput.toJson(mapOf(
            "root" to rootDir.absolutePath,
            "java" to file(System.getProperty("java.home")).resolve("bin/java").absolutePath,
            "compilerClasspath" to developmentCompiler.asPath,
            "runtimeClasspath" to configurations.runtimeClasspath.get().asPath,
            "jvmArgs" to application.applicationDefaultJvmArgs,
        )))
    }
}
tasks.named<JavaExec>("run") {
    description = "Watch/rebuild frontend and Kotlin; serve everything through Ktor on one port."
    // No nested Gradle build is launched while this task holds the project lock.
    actions.clear()
    classpath = files()
    dependsOn(prepareDevelopment)
    doLast {
        val nodeHome = node.resolvedNodeDir.get().asFile
        val nodeExecutable = if (System.getProperty("os.name").startsWith("Windows")) {
            nodeHome.resolve("node.exe")
        } else nodeHome.resolve("bin/node")
        val command = listOf(
            nodeExecutable.absolutePath, rootDir.resolve("scripts/dev.mjs").absolutePath,
            layout.buildDirectory.file("dev/config.json").get().asFile.absolutePath,
        ) + (args ?: emptyList<String>())
        val process = ProcessBuilder(
            command,
        ).directory(rootDir).redirectInput(ProcessBuilder.Redirect.INHERIT).redirectErrorStream(true).start()
        // inheritIO alone writes to the daemon's log, not the Gradle client.
        val output = thread(isDaemon = true, name = "gymtrack-dev-output") {
            process.inputStream.copyTo(System.out)
        }
        try {
            val status = process.waitFor()
            check(status == 0) { "Development servers exited with status $status." }
        } finally {
            if (process.isAlive) {
                process.destroy()
                if (!process.waitFor(10, TimeUnit.SECONDS)) process.destroyForcibly()
            }
            output.join(1000)
        }
    }
}
