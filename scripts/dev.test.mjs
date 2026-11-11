import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const root = fileURLToPath(new URL('../', import.meta.url))
const configuration = JSON.parse(await readFile(path.join(root, 'build/dev/config.json'), 'utf8'))

async function freePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
async function waitFor(check, detail) {
  for (let i = 0; i < 180; i++) {
    if (await check()) return
    await delay(500)
  }
  throw new Error(`Timed out: ${detail}`)
}
async function available(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok } catch { return false }
}
async function graphql(url, query) {
  const response = await fetch(`${url}/graphql`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
  })
  const result = await response.json()
  assert.equal(result.errors, undefined, JSON.stringify(result))
  return result.data
}

test('development reloads backend/frontend, survives compile errors, preserves SQLite, and shuts down', { timeout: 300000 }, async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'gymtrack-dev-'))
  const backendPort = await freePort()
  const backendUrl = `http://127.0.0.1:${backendPort}`
  let child, logs = ''
  try {
    // All edits and database writes are isolated from the real working tree.
    await cp(path.join(root, 'backend/src/main'), path.join(fixture, 'backend/src/main'), { recursive: true })
    const frontend = path.join(fixture, 'frontend')
    await mkdir(frontend)
    await symlink(path.join(root, 'frontend/node_modules'), path.join(frontend, 'node_modules'), 'dir')
    await writeFile(path.join(frontend, 'index.html'), '<html><head><link rel="stylesheet" href="/test.css"></head><body>Dev fixture</body></html>')
    await writeFile(path.join(frontend, 'test.css'), 'body { color: blue; }')
    await cp(path.join(root, 'frontend/dev-reload-plugin.ts'), path.join(frontend, 'dev-reload-plugin.ts'))
    await writeFile(path.join(frontend, 'vite.config.mjs'), "import { developmentReload } from './dev-reload-plugin.ts'; export default {plugins:[developmentReload()]}")
    const configFile = path.join(fixture, 'config.json')
    await writeFile(configFile, JSON.stringify({ ...configuration, root: fixture }))
    child = spawn(process.execPath, [path.join(root, 'scripts/dev.mjs'), configFile], {
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(backendPort), GYMTRACK_DB: path.join(fixture, 'test.db') },
      stdio: 'pipe',
    })
    child.stdout.on('data', data => { logs += data })
    child.stderr.on('data', data => { logs += data })
    const launches = () => [...logs.matchAll(/Backend started \(PID (\d+)\)/g)].length
    await waitFor(() => available(`${backendUrl}/health`), 'initial Kotlin compilation/server startup')
    const originalHtml = await (await fetch(backendUrl)).text()
    assert.match(originalHtml, /Dev fixture/)
    assert.match(originalHtml, /\/__dev\/revision/)
    assert.doesNotMatch(originalHtml, /@vite\/client/, 'Ktor serves compiled files, not a Vite dev page')
    const reloadScript = [...originalHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
      .map(match => match[1]).find(script => script.includes('/__dev/revision'))
    let poll, browserReloads = 0
    runInNewContext(reloadScript, {
      setInterval: callback => { poll = callback },
      fetch: (url, options) => fetch(new URL(url, backendUrl), options),
      location: { reload: () => { browserReloads++ } },
    })
    await poll()
    assert.equal(browserReloads, 0, 'Initial compiled version does not cause a reload loop')
    const initialRevision = (await (await fetch(`${backendUrl}/__dev/revision`)).json()).revision
    const started = await graphql(backendUrl, 'mutation { startWorkout(workoutId: "day-1") { id exercises { id } } }')
    const id = started.startWorkout.exercises[0].id
    await graphql(backendUrl, `mutation { logSet(input: {sessionExerciseId: "${id}", reps: 6, weightGrams: 20000}) { id } }`)

    const originalLaunches = launches()
    await writeFile(path.join(frontend, 'test.css'), 'body { color: red; }')
    await waitFor(async () => (await (await fetch(`${backendUrl}/__dev/revision`)).json()).revision !== initialRevision, 'frontend rebuild publishes reload revision')
    const updatedHtml = await (await fetch(backendUrl)).text()
    const updatedRevision = (await (await fetch(`${backendUrl}/__dev/revision`)).json()).revision
    assert.ok(updatedHtml.includes(updatedRevision), 'Reload script and revision endpoint agree after rebuild')
    await poll()
    assert.equal(browserReloads, 1, 'The served reload script refreshes the browser after a rebuild')
    const cssUrl = updatedHtml.match(/href="([^"]+\.css)"/)?.[1]
    assert.ok(cssUrl, 'Compiled CSS is linked in the HTML')
    assert.match(await (await fetch(new URL(cssUrl, backendUrl))).text(), /color:red/, 'Ktor serves freshly compiled CSS')
    assert.equal(launches(), originalLaunches, 'Frontend edits do not restart Kotlin')

    const probe = path.join(fixture, 'backend/src/main/kotlin/gymtrack/ReloadProbe.kt')
    await writeFile(probe, 'package gymtrack\ninternal val reloadProbe = 1\n')
    await waitFor(async () => launches() > originalLaunches && await available(`${backendUrl}/health`), 'Kotlin save triggers restart')
    const secondLaunches = launches()
    await writeFile(probe, 'package gymtrack\ninternal val reloadProbe =\n')
    await waitFor(() => logs.includes('Compilation failed. Keeping the previous backend'), 'compile error is reported')
    assert.equal(launches(), secondLaunches)
    assert.ok(await available(`${backendUrl}/health`), 'Previous backend remains available on compiler failure')
    await writeFile(probe, 'package gymtrack\ninternal val reloadProbe = 2\n')
    await waitFor(async () => launches() > secondLaunches && await available(`${backendUrl}/health`), 'fixed Kotlin automatically recompiles')
    const thirdLaunches = launches()
    await writeFile(path.join(fixture, 'backend/src/main/resources/reload-probe.txt'), 'resource update')
    await waitFor(async () => launches() > thirdLaunches && await available(`${backendUrl}/health`), 'resource save triggers restart')
    const saved = await graphql(backendUrl, '{ workoutSessions { exercises { sets { reps weightGrams } } } }')
    assert.equal(saved.workoutSessions.length, 1)
    assert.equal(saved.workoutSessions[0].exercises[0].sets[0].weightGrams, 20000)
    child.kill('SIGTERM')
    await once(child, 'exit')
    await waitFor(async () => !await available(`${backendUrl}/health`), 'Ktor stops')
  } catch (error) {
    console.error(logs)
    throw error
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
      await once(child, 'exit')
    }
    await rm(fixture, { recursive: true, force: true })
  }
})

test('an occupied backend port fails before starting Vite or the compiler', async () => {
  const blocker = createServer()
  blocker.listen(0, '127.0.0.1')
  await once(blocker, 'listening')
  const port = blocker.address().port
  let output = ''
  try {
    const child = spawn(process.execPath, [path.join(root, 'scripts/dev.mjs'), path.join(root, 'build/dev/config.json')], {
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
      stdio: 'pipe',
    })
    child.stdout.on('data', data => { output += data })
    child.stderr.on('data', data => { output += data })
    assert.equal((await once(child, 'exit'))[0], 1)
    assert.match(output, /Stop the existing server/)
    assert.doesNotMatch(output, /Compiling Kotlin backend/)
  } finally {
    await new Promise(resolve => blocker.close(resolve))
  }
})
