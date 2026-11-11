// Development supervisor. Uses Gradle-resolved dependencies/compiler without
// starting a nested Gradle build (which would contend for the project lock).
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

const config = JSON.parse(await readFile(process.argv[2], 'utf8'))
config.appArgs = process.argv.slice(3)
const kotlinRoot = path.join(config.root, 'backend/src/main/kotlin')
const resourceRoot = path.join(config.root, 'backend/src/main/resources')
const outputRoot = path.join(config.root, 'build/dev/classes')
const host = process.env.HOST || '127.0.0.1'
const backendPort = process.env.PORT || '8080'
const frontendDirectory = path.join(config.root, 'frontend/dist')
const revisionFile = path.join(config.root, 'build/dev/frontend-revision')
let stopping = false
let backend, frontend, compiler
let activeOutput
let exitCode = 0
const expectedStops = new WeakSet()

function launch(command, args, options = {}) {
  const child = spawn(command, args, { cwd: config.root, stdio: 'inherit', ...options })
  child.on('error', error => {
    console.error(`[dev] Could not start ${command}: ${error.message}`)
    exitCode = 1
    stopping = true
  })
  return child
}
async function exited(child) {
  if (child.exitCode !== null || child.signalCode !== null) return child.exitCode
  return (await once(child, 'exit'))[0]
}
async function stop(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return
  expectedStops.add(child)
  child.kill('SIGTERM')
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5000)
  timeout.unref()
  try { await exited(child) } finally { clearTimeout(timeout) }
}
function shutdown() {
  stopping = true
  // Signal immediately, even when the loop is waiting for compilation.
  for (const child of [compiler, frontend, backend]) {
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  }
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

async function files(root) {
  const result = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const filename = path.join(root, entry.name)
    if (entry.isDirectory()) result.push(...await files(filename))
    else if (entry.isFile()) result.push(filename)
  }
  return result.sort()
}
async function snapshot() {
  const sources = (await files(kotlinRoot)).filter(file => file.endsWith('.kt'))
  const resources = await files(resourceRoot)
  const hash = createHash('sha256')
  for (const file of [...sources, ...resources]) {
    hash.update(file)
    hash.update(await readFile(file))
  }
  return { hash: hash.digest('hex'), sources }
}
async function checkPort(port) {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', error => reject(new Error(`[dev] Cannot listen on ${host}:${port}: ${error.message}. Stop the existing server or change PORT.`)))
    server.listen(Number(port), host, resolve)
  })
  await new Promise(resolve => server.close(resolve))
}
async function rebuild(sources) {
  if (stopping) return false
  const destination = path.join(outputRoot, `${Date.now()}`)
  await mkdir(destination, { recursive: true })
  console.log('[dev] Compiling Kotlin backend…')
  compiler = launch(config.java, [
    ...config.jvmArgs, '-Xmx768m', '-cp', config.compilerClasspath, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
    '-no-stdlib', '-no-reflect', '-jvm-target', '21', '-module-name', 'gymtrack',
    '-classpath', config.runtimeClasspath, '-d', destination, ...sources,
  ])
  const result = await exited(compiler)
  compiler = undefined
  if (result !== 0 || stopping) {
    await rm(destination, { recursive: true, force: true })
    if (!stopping) console.error('[dev] Compilation failed. Keeping the previous backend; fix the error and save again.')
    return false
  }
  await stop(backend)
  if (stopping) return false
  if (activeOutput) await rm(activeOutput, { recursive: true, force: true })
  activeOutput = destination
  backend = launch(config.java, [
    ...config.jvmArgs, '-cp', [destination, resourceRoot, config.runtimeClasspath].join(path.delimiter),
    'gymtrack.ApplicationKt', ...config.appArgs,
  ], { env: {
    ...process.env, HOST: host, PORT: backendPort,
    GYMTRACK_FRONTEND_DIR: frontendDirectory, GYMTRACK_DEV_REVISION_FILE: revisionFile,
  } })
  const running = backend
  running.on('exit', (code, signal) => {
    if (!stopping && !expectedStops.has(running) && code && !signal) console.error(`[dev] Backend exited (${code}). Check the error above; save a backend file to retry.`)
  })
  if (!config.appArgs.length) console.log(`[dev] Backend started (PID ${backend.pid}) on ${host}:${backendPort}.`)
  return true
}

try {
  await mkdir(outputRoot, { recursive: true })
  let current = await snapshot()
  if (config.appArgs.length) {
    // Preserve ./gradlew run --args=--init-db without starting Vite/watchers.
    if (await rebuild(current.sources)) exitCode = (await exited(backend)) ?? 1
    else exitCode = 1
  } else {
    await checkPort(backendPort)
    let frontendReady = false
    frontend = launch(process.execPath, [
      path.join(config.root, 'frontend/node_modules/vite/bin/vite.js'),
      'build', '--watch',
    ], {
      cwd: path.join(config.root, 'frontend'),
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env, GYMTRACK_DEV_WATCH: 'true', GYMTRACK_DEV_REVISION_FILE: revisionFile },
    })
    frontend.on('message', message => {
      if (message?.type === 'gymtrack:frontend-built') frontendReady = true
    })
    frontend.on('exit', code => {
      if (!stopping) {
        console.error(`[dev] Frontend build watcher exited (${code}). Stopping development processes.`)
        exitCode = code || 1
        shutdown()
      }
    })
    console.log('[dev] Building the frontend before starting Ktor…')
    while (!frontendReady && !stopping) await delay(250)
    if (!stopping) await rebuild(current.sources)
    console.log(`[dev] Open http://${host === '0.0.0.0' ? 'localhost' : host}:${backendPort} — frontend and GraphQL use this one Ktor port.`)
    console.log('[dev] Watching frontend, Kotlin, and backend resources. Ctrl+C stops development.')
    while (!stopping) {
      await delay(500)
      let next
      try { next = await snapshot() } catch { continue /* Editor may be replacing a file. */ }
      if (next.hash === current.hash) continue
      await delay(250)
      try { next = await snapshot() } catch { continue }
      current = next
      await rebuild(current.sources)
    }
  }
} finally {
  stopping = true
  await Promise.all([stop(compiler), stop(frontend), stop(backend)])
  if (activeOutput) await rm(activeOutput, { recursive: true, force: true })
}
process.exitCode = exitCode
