import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import { exerciseDemos, findExerciseDemo } from '../src/components/exerciseDemos.ts'

const directory = new URL('../src/assets/exercises/', import.meta.url)

test('every seeded exercise has exactly two standalone SVG assets', async () => {
  const sql = await readFile(new URL('../../backend/src/main/resources/db/migration/V001__initial.sql', import.meta.url), 'utf8')
  const exerciseInsert = sql.split('INSERT INTO exercise (id, name, accepts_weight) VALUES')[1].split(';')[0]
  const ids = [...exerciseInsert.matchAll(/\('([^']+)',/g)].map(match => match[1])
  assert.equal(ids.length, 15)
  assert.deepEqual(exerciseDemos.map(demo => demo.id).sort(), ids.sort())
  assert.deepEqual((await readdir(directory)).filter(file => file.endsWith('.svg')).sort(),
    ids.flatMap(id => [`${id}-side.svg`, `${id}-front.svg`]).sort())
  for (const demo of exerciseDemos) {
    assert.equal(findExerciseDemo({ exerciseId: demo.id, name: 'Historical name' }), demo)
    assert.equal(findExerciseDemo({ name: demo.name }), demo)
  }
  assert.equal(findExerciseDemo({ name: 'Unknown exercise' }), undefined)
})

test('assets are self-contained and contain valid synchronized animation tracks', async () => {
  for (const file of (await readdir(directory)).filter(file => file.endsWith('.svg'))) {
    const svg = await readFile(new URL(file, directory), 'utf8')
    assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    assert.match(svg, /viewBox="0 0 300 220"/)
    assert.match(svg, /<title id="demo-title">/)
    assert.match(svg, /<desc id="demo-description">/)
    assert.doesNotMatch(svg, /<(?:script|foreignObject|image|use|style)\b|(?:href|onload|onclick)=|var\(/i,
      `${file}: SVGs must not depend on external code, resources or styling`)
    const tracks = [...svg.matchAll(/<animate(?:Transform)?\b[^>]*\/>/g)]
    assert.ok(tracks.length > 0, `${file}: missing animation`)
    for (const [track] of tracks) {
      assert.match(track, /dur="4s"/)
      assert.match(track, /repeatCount="indefinite"/)
      const times = track.match(/keyTimes="([^"]+)"/)[1].split(';').map(Number)
      const values = track.match(/values="([^"]+)"/)[1].split(';')
      assert.equal(times.length, values.length, file)
      assert.equal(times[0], 0)
      assert.equal(times.at(-1), 1)
      assert.ok(times.every((time, index) => Number.isFinite(time) && (!index || time > times[index - 1])), file)
      if (track.includes('attributeName="points"')) {
        const coordinates = values.map(value => value.trim().split(/[,\s]+/).map(Number))
        assert.ok(coordinates.every(points => points.length === coordinates[0].length && points.every(Number.isFinite)), file)
      }
    }
  }
})

test('the saved lunge SVG preserves natural leg lengths throughout the repetition', async () => {
  const svg = await readFile(new URL('dumbbell-lunge-side.svg', directory), 'utf8')
  const legs = [...svg.matchAll(/<g class="demo-leg demo-leg-\d"[\s\S]*?<\/g>/g)]
  assert.equal(legs.length, 2)
  for (const [leg] of legs) {
    const values = leg.match(/<animate attributeName="points"[^>]*values="([^"]+)"/)[1].split(';')
    assert.ok(values.length > 10, 'The lunge must retain its staged sequence, not a two-pose morph')
    for (const value of values) {
      const points = value.split(' ').map(point => point.split(',').map(Number))
      for (let joint = 1; joint < 3; joint++) {
        const length = Math.hypot(points[joint][0] - points[joint - 1][0], points[joint][1] - points[joint - 1][1])
        assert.ok(Math.abs(length - 40) < 1, `Leg segment should not stretch: ${length}`)
      }
    }
  }
})
