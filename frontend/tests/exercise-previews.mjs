import assert from 'node:assert/strict'
import { mkdir, readFile, readdir } from 'node:fs/promises'
import { build } from 'esbuild'
import { chromium } from 'playwright'

// Bundle a self-contained gallery: no app server or database is started.
const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'jsx',
    contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import { ExerciseDemo } from './src/components/ExerciseDemo.tsx'
      import { exerciseDemos } from './src/components/exerciseDemos.ts'
      import './src/index.css'
      import './src/App.css'
      createRoot(document.getElementById('root')).render(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,300px),1fr))',gap:16,padding:12}}>
          {exerciseDemos.map(motion => <article key={motion.id} style={{minWidth:0}}>
            <h2 style={{fontSize:16,letterSpacing:0}}>{motion.name}</h2>
            <ExerciseDemo exercise={{id:motion.id,exerciseId:motion.id,name:motion.name}} />
          </article>)}
        </div>
      )
    `,
  },
  bundle: true, write: false, outdir: 'preview-test', format: 'iife', jsx: 'automatic',
  loader: { '.svg': 'text' },
  define: { 'process.env.NODE_ENV': '"production"' },
})
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, reducedMotion: 'reduce' })
  const errors = []
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
  // Verify the files really work independently, with no application CSS.
  const assetDirectory = new URL('../src/assets/exercises/', import.meta.url)
  const files = (await readdir(assetDirectory)).filter(file => file.endsWith('.svg'))
  const documents = await Promise.all(files.map(file => readFile(new URL(file, assetDirectory), 'utf8')))
  const standalone = await browser.newPage()
  await standalone.setContent('<!doctype html><main></main>')
  const valid = await standalone.evaluate(documents => {
    const parser = new DOMParser()
    return documents.map(text => {
      const document = parser.parseFromString(text, 'image/svg+xml')
      const svg = document.documentElement
      if (document.querySelector('parsererror') || svg.namespaceURI !== 'http://www.w3.org/2000/svg') return false
      const imported = window.document.importNode(svg, true)
      window.document.querySelector('main').append(imported)
      return getComputedStyle(imported.querySelector('.demo-body')).stroke === 'rgb(50, 88, 230)'
    })
  }, documents)
  assert.equal(files.length, 30)
  assert.ok(valid.every(Boolean), 'All SVGs parse as standalone XML and retain their colors without app CSS')
  await standalone.close()
  await page.setContent('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Exercise previews</title></head><body><main id="root"></main></body></html>')
  await page.addStyleTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.css')).text })
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.js')).text })
  await page.waitForFunction(() => document.querySelectorAll('svg[role="img"]').length === 30)
  await page.waitForFunction(() => [...document.querySelectorAll('svg[role="img"]')].every(svg => svg.animationsPaused()))
  assert.equal(await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(element => element.id)
    return new Set(ids).size === ids.length
  }), true, 'Inline copies have unique accessible title and description IDs')
  const geometry = () => [...document.querySelectorAll('svg[role="img"]')].map(svg =>
    [...svg.querySelectorAll('polyline')].map(line =>
      [...Array(line.animatedPoints.numberOfItems)].map((_, index) => {
        const point = line.animatedPoints.getItem(index)
        return [point.x, point.y]
      })))
  await page.evaluate(() => document.querySelectorAll('svg[role="img"]').forEach(svg => svg.setCurrentTime(0)))
  const initial = await page.evaluate(geometry)
  await mkdir('screenshots', { recursive: true })
  await page.screenshot({ path: 'screenshots/all-exercises-start.png', fullPage: true })
  await page.evaluate(() => document.querySelectorAll('svg[role="img"]').forEach(svg => svg.setCurrentTime(1.6)))
  const extended = await page.evaluate(geometry)
  initial.forEach((pose, index) => assert.notDeepEqual(pose, extended[index], `View ${index} must visibly animate`))
  await page.screenshot({ path: 'screenshots/all-exercises-lift.png', fullPage: true })
  const curl = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Alternating Dumbbell Curl', exact: true }) })
  const curlPhases = await curl.locator('svg').nth(1).evaluate(svg => {
    const arms = [...svg.querySelectorAll('.demo-near-arm>polyline')]
    return [.8, 2.8].map(time => {
      svg.setCurrentTime(time)
      return arms.map(arm => {
        const wrist = arm.animatedPoints.getItem(2)
        const rest = arm.points.getItem(2)
        return Math.abs(wrist.y - rest.y) > 10
      })
    })
  })
  assert.deepEqual(curlPhases, [[true, false], [false, true]], 'Curls alternate rather than lifting both arms together')
  const tricep = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Seated Tricep Press', exact: true }) })
  const overhead = await tricep.locator('svg').first().evaluate(svg => {
    const weight = svg.querySelector('.demo-dumbbell')
    const head = svg.querySelector('.demo-body circle')
    const arm = svg.querySelector('.demo-near-arm polyline')
    const upperArm = () => [0, 1].map(index => {
      const point = arm.animatedPoints.getItem(index)
      return [point.x, point.y]
    })
    svg.setCurrentTime(0)
    const lowerX = weight.transform.animVal.getItem(0).matrix.e
    const before = upperArm()
    svg.setCurrentTime(1.6)
    return {
      behind: lowerX + 14 < head.cx.baseVal.value - 12,
      overhead: weight.transform.animVal.getItem(0).matrix.f < head.cy.baseVal.value - 12,
      before, after: upperArm(),
      layeredBehind: Boolean(weight.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING),
    }
  })
  assert.ok(overhead.behind && overhead.overhead && overhead.layeredBehind, 'Triceps press travels behind, not across, the head')
  assert.deepEqual(overhead.before, overhead.after, 'Triceps upper arm stays fixed')
  const row = page.locator('article').filter({ has: page.getByRole('heading', { name: 'One-arm Dumbbell row', exact: true }) })
  for (const bench of await row.locator('.demo-flat-support-bench').all()) {
    assert.equal(await bench.locator('rect').getAttribute('y'), '153')
    assert.equal(await bench.getAttribute('transform'), null, 'The row bench must not be tilted')
    assert.match(await bench.locator('path').getAttribute('d'), /^M\d+ 164V200M\d+ 164V200$/,
      'Only vertical legs extend from the flat pad; no inclined backrest')
  }
  assert.equal(await row.locator('.demo-flat-support-bench').count(), 2)
  const lunge = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Dumbbell Lunge', exact: true }) })
  const contacts = await lunge.locator('svg').first().evaluate(svg => {
    const coordinates = selector => {
      const points = svg.querySelector(selector).animatedPoints
      return Array.from({ length: points.numberOfItems }, (_, index) => {
        const point = points.getItem(index)
        return [Math.round(point.x * 100) / 100, Math.round(point.y * 100) / 100]
      })
    }
    return [.28, .48, .56, .76].map(phase => {
      svg.setCurrentTime(phase * 4)
      return { front: coordinates('.demo-leg-0>polyline:nth-child(2)'), rear: coordinates('.demo-leg-1>polyline:nth-child(2)') }
    })
  })
  for (const contact of contacts) {
    assert.deepEqual(contact.front, [[224, 198], [238, 198]], 'Leading foot must not slide during the descent/ascent')
    assert.deepEqual(contact.rear, [[136, 184], [150, 198]], 'Rear toes stay planted with the heel raised')
  }
  for (const article of await page.locator('article').all()) {
    await article.getByRole('button', { name: 'Play demonstration' }).click()
    assert.equal(await article.locator('svg').evaluateAll(views => views.every(svg => !svg.animationsPaused())), true)
    await article.getByRole('button', { name: 'Pause demonstration' }).click()
    const times = await article.locator('svg').evaluateAll(views => views.map(svg => svg.getCurrentTime()))
    assert.ok(Math.abs(times[0] - times[1]) < .05, 'The two views stay synchronized')
  }
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}px`)
    assert.equal(await page.locator('.demo-views').evaluateAll(views => views.every(view => {
      const [side, front] = view.children
      return Math.abs(side.getBoundingClientRect().top - front.getBoundingClientRect().top) < 1
    })), true, `Views remain side by side at ${width}px`)
  }
  // A focused contact sheet makes all phases available for visual review.
  await page.setViewportSize({ width: 1100, height: 900 })
  await page.evaluate(() => {
    const source = [...document.querySelectorAll('article')].find(article => article.querySelector('h2').textContent === 'Dumbbell Lunge')
    const gallery = document.createElement('div')
    Object.assign(gallery.style, { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', padding: '16px' })
    for (const [label, phase] of [['Stand', 0], ['Step forward', .18], ['Plant front foot', .28], ['Lower', .48], ['Rise', .76], ['Return', .96]]) {
      const copy = source.cloneNode(true)
      copy.querySelector('h2').textContent = label
      copy.querySelectorAll('button').forEach(button => button.remove())
      gallery.append(copy)
      copy.dataset.phase = String(phase)
    }
    document.getElementById('root').replaceChildren(gallery)
    for (const copy of gallery.children) {
      for (const svg of copy.querySelectorAll('svg')) {
        svg.pauseAnimations()
        svg.setCurrentTime(Number(copy.dataset.phase) * 4)
      }
    }
  })
  await page.screenshot({ path: 'screenshots/lunge-phases.png', fullPage: true })
  assert.deepEqual(errors, [])
  console.log('PASS: all 15 exercises, 30 animated views, reduced motion, synchronized controls, mobile layout')
} finally {
  await browser.close()
}
