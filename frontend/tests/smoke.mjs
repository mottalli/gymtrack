import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const root = resolve('..')
const build = spawn('./gradlew', ['installDist', '--console=plain'], { cwd: root, stdio: 'inherit' })
assert.equal((await once(build, 'exit'))[0], 0, 'Unified build failed')
const directory = await mkdtemp(`${tmpdir()}/gymtrack-e2e-`)
const port = process.env.GYMTRACK_TEST_PORT || '18180'
const url = `http://127.0.0.1:${port}`
const server = spawn('./build/install/gymtrack/bin/gymtrack', [], {
  cwd: root, env: { ...process.env, HOST: '127.0.0.1', PORT: port, GYMTRACK_DB: `${directory}/test.db` },
  stdio: 'pipe',
})
let logs = ''
server.stdout.on('data', data => { logs += data })
server.stderr.on('data', data => { logs += data })
let browser
try {
  let ready = false
  for (let tries = 0; tries < 120; tries++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${logs}`)
    try { ready = (await fetch(`${url}/health`)).ok } catch { /* Wait for Netty. */ }
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  assert.ok(ready, `Backend did not start: ${logs}`)
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await mkdir('screenshots', { recursive: true })
  await page.goto(url)
  await page.locator('.workout-choice').first().waitFor()
  await page.screenshot({ path: 'screenshots/home.png', fullPage: true })
  await page.locator('.workout-choice').first().click()
  await page.getByLabel('Reps', { exact: true }).waitFor()
  const sessionCount = async () => {
    const response = await fetch(`${url}/graphql`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ workoutSessions { id } }' }),
    })
    return (await response.json()).data.workoutSessions.length
  }
  assert.equal(await sessionCount(), 0, 'Opening a workout must not create a session')
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click()
  assert.equal(await page.locator('.history-item').count(), 0)
  assert.equal(await sessionCount(), 0, 'Finishing an empty draft must not create a session')
  await page.getByRole('button', { name: '← Workouts', exact: true }).click()
  await page.locator('.workout-choice').first().click()
  await page.getByLabel('Reps', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Warm-up', { exact: true }).isChecked(), true)
  await page.getByLabel('Warm-up', { exact: true }).uncheck()
  assert.equal(await page.getByLabel('Reps', { exact: true }).inputValue(), '6')
  await page.getByRole('button', { name: 'Increase Reps', exact: true }).click()
  await page.getByLabel('Reps', { exact: true }).fill('6')
  await page.getByLabel('kg', { exact: true }).fill('20')
  await page.getByRole('button', { name: 'Log set', exact: true }).click()
  await page.getByRole('button', { name: 'Edit working set 1', exact: true }).waitFor()
  assert.equal(await sessionCount(), 1, 'The first recorded set creates the session')
  assert.equal(await page.getByLabel('Reps', { exact: true }).inputValue(), '6')
  assert.equal(await page.getByLabel('kg', { exact: true }).inputValue(), '20')
  assert.equal(await page.getByLabel('Warm-up', { exact: true }).isChecked(), true)
  await page.getByLabel('Reps', { exact: true }).fill('10')
  await page.getByLabel('kg', { exact: true }).fill('10')
  await page.getByRole('button', { name: 'Log set', exact: true }).click()
  await page.getByRole('button', { name: 'Edit warm-up set 1', exact: true }).waitFor()
  assert.equal(await page.getByLabel('Warm-up', { exact: true }).isChecked(), false)
  assert.match(await page.locator('.logged-set').first().getAttribute('aria-label'), /warm-up/)
  await page.getByRole('button', { name: 'Edit working set 2', exact: true }).click()
  await page.getByLabel('Reps', { exact: true }).fill('5')
  await page.getByRole('button', { name: 'Save set', exact: true }).click()
  await page.getByRole('button', { name: 'Log set', exact: true }).waitFor()
  await page.screenshot({ path: 'screenshots/workout.png', fullPage: true })
  const nextExercise = page.getByRole('button', { name: 'Done with this exercise? Next →', exact: true })
  await nextExercise.scrollIntoViewIfNeeded()
  assert.ok(await page.evaluate(() => window.scrollY > 0), 'Test starts scrolled down on mobile')
  await nextExercise.click()
  await page.waitForFunction(() => window.scrollY === 0)
  assert.equal(await page.getByLabel('EXERCISE 2 OF 4').inputValue(), '1')
  await page.getByLabel('EXERCISE 2 OF 4').selectOption('3')
  assert.equal(await page.getByRole('spinbutton').count(), 2)
  await page.getByLabel('Reps', { exact: true }).fill('12')
  await page.getByLabel('kg', { exact: true }).fill('15')
  await page.getByRole('button', { name: 'Log set', exact: true }).click()
  await page.getByRole('button', { name: 'Edit warm-up set 1', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click()
  await page.locator('.history-item').first().click()
  await page.getByRole('button', { name: 'Edit working set 2', exact: true }).click()
  await page.getByLabel('Reps', { exact: true }).fill('4')
  await page.getByRole('button', { name: 'Save set', exact: true }).click()
  await page.getByRole('button', { name: 'Log set', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Save workout changes', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: /Workout history/ }).click()
  assert.equal(await page.locator('.history-item').count(), 1)
  const response = await fetch(`${url}/graphql`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ workoutSessions { exercises { exerciseId sets { reps type weightGrams } } } }' }),
  })
  const saved = await response.json()
  const exercises = saved.data.workoutSessions[0].exercises
  assert.equal(exercises.find(ex => ex.exerciseId === 'dumbbell-bench-press').sets.find(set => set.type === 'WORKING').reps, 4)
  assert.equal(exercises.find(ex => ex.exerciseId === 'seated-tricep-press').sets[0].weightGrams, 15000)
  await page.getByRole('button', { name: '← Workouts', exact: true }).click()
  await page.locator('.workout-choice').first().click()
  await page.getByLabel('kg', { exact: true }).waitFor()
  assert.match(await page.locator('.suggestion-note').textContent(), /last working weight/)
  assert.equal(await page.getByLabel('kg', { exact: true }).inputValue(), '0')
  // Network failure must preserve the entered values and allow retry.
  await page.getByLabel('Reps', { exact: true }).fill('6')
  await page.getByLabel('kg', { exact: true }).fill('22.5')
  await page.route('**/graphql', route => route.fulfill({ status: 503, body: 'unavailable' }))
  await page.getByRole('button', { name: 'Log set', exact: true }).click()
  await page.getByText('Set not saved.', { exact: false }).waitFor()
  assert.equal(await sessionCount(), 1, 'A failed first-set save must not create an empty session')
  assert.equal(await page.getByLabel('kg', { exact: true }).inputValue(), '22.5')
  await page.unroute('**/graphql')
  await page.getByRole('button', { name: 'Log set', exact: true }).click()
  await page.getByRole('button', { name: 'Edit warm-up set 1', exact: true }).waitFor()
  assert.equal(await page.getByLabel('Reps', { exact: true }).inputValue(), '6')
  assert.equal(await page.getByLabel('kg', { exact: true }).inputValue(), '22.5')
  await page.getByLabel('Reps', { exact: true }).fill('8')
  await page.getByLabel('kg', { exact: true }).fill('15')
  await page.getByRole('button', { name: 'Log set', exact: true }).click()
  await page.getByRole('button', { name: 'Edit warm-up set 2', exact: true }).waitFor()
  assert.equal(await page.getByLabel('Warm-up', { exact: true }).isChecked(), false)
  assert.equal(await page.getByLabel('Reps', { exact: true }).inputValue(), '6')
  assert.equal(await page.getByLabel('kg', { exact: true }).inputValue(), '20')
  await page.getByLabel('Reps', { exact: true }).fill('5')
  await page.getByLabel('kg', { exact: true }).fill('21.5')
  await page.getByRole('button', { name: 'Log set', exact: true }).click()
  await page.getByRole('button', { name: 'Edit working set 3', exact: true }).waitFor()
  assert.equal(await page.getByLabel('Reps', { exact: true }).inputValue(), '5')
  assert.equal(await page.getByLabel('kg', { exact: true }).inputValue(), '21.5')
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}`)
  }
  // Ongoing sessions survive refresh and are the default home-page action.
  await page.reload()
  await page.getByRole('button', { name: /Resume workout/ }).waitFor()
  assert.match(await page.locator('.workout-choice.recommended').textContent(), /RESUME ONGOING/)
  await page.getByRole('button', { name: /Resume workout/ }).click()
  await page.getByRole('button', { name: 'Edit working set 3', exact: true }).waitFor()
  await page.getByRole('button', { name: '← Workouts', exact: true }).click()
  page.once('dialog', dialog => dialog.accept())
  await page.locator('.workout-choice').nth(1).click()
  const statuses = async () => {
    const response = await fetch(`${url}/graphql`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ workoutSessions { id workoutId isFinished } }' }),
    })
    return (await response.json()).data.workoutSessions
  }
  assert.equal((await statuses()).find(session => !session.isFinished).workoutId, 'day-1',
    'Opening another draft does not finish the ongoing session')
  await page.getByLabel('Reps', { exact: true }).fill('8')
  await page.getByLabel('kg', { exact: true }).fill('40')
  await page.getByRole('button', { name: 'Log set', exact: true }).click()
  await page.getByRole('button', { name: 'Edit warm-up set 1', exact: true }).waitFor()
  const ongoing = (await statuses()).filter(session => !session.isFinished)
  assert.equal(ongoing.length, 1)
  assert.equal(ongoing[0].workoutId, 'day-2')
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click()
  await page.locator('.history-item').first().waitFor()
  assert.equal((await statuses()).filter(session => !session.isFinished).length, 0)
  await page.reload()
  await page.locator('.workout-choice').first().waitFor()
  assert.equal(await page.locator('.resume').count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS: real Ktor + GraphQL + SQLite, logging, defaults, edits, persistence, suggestions, failure recovery, mobile layout')
} catch (error) {
  console.error(logs)
  throw error
} finally {
  await browser?.close()
  server.kill('SIGTERM')
  if (server.exitCode === null) await once(server, 'exit')
  await rm(directory, { recursive: true, force: true })
}
