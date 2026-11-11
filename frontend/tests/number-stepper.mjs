import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'

// A real browser exercises native mouse/touch sequences and timer cleanup.
// No app server or database is started.
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React, {useState} from 'react'
    import {createRoot} from 'react-dom/client'
    import {NumberStepper} from './src/components/NumberStepper.tsx'
    import './src/index.css'
    import './src/App.css'
    function Fixture() {
      const [weight, setWeight] = useState(0)
      const [visible, setVisible] = useState(true)
      const [disabled, setDisabled] = useState(false)
      window.stepperChanges = window.stepperChanges || []
      window.setStepperVisible = setVisible
      window.setStepperDisabled = setDisabled
      return <main style={{width:300,padding:16}}>
        <fieldset disabled={disabled}>
          {visible && <NumberStepper label="kg" value={weight} onChange={value => {
            window.stepperChanges.push(value); setWeight(value)
          }} min={0} max={50} increment={0.5} />}
        </fieldset>
      </main>
    }
    createRoot(document.getElementById('root')).render(<Fixture />)
  ` },
  bundle: true, write: false, outdir: 'stepper-test', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
})
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>')
  await page.addStyleTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.css')).text })
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.js')).text })
  const input = page.getByRole('spinbutton', { name: 'kg' })
  const plus = page.getByRole('button', { name: 'Increase kg' })
  const minus = page.getByRole('button', { name: 'Decrease kg' })
  await plus.waitFor()
  const value = async () => Number(await input.inputValue())
  const wait = milliseconds => page.waitForTimeout(milliseconds)
  const press = async button => {
    const box = await button.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
  }
  const stable = async () => {
    const before = await value()
    await wait(450)
    assert.equal(await value(), before, 'No repeat or extra release click after stopping')
  }
  // Short taps, quick double clicks, keyboard and programmatic activation.
  await plus.click()
  assert.equal(await value(), .5)
  await plus.dblclick({ delay: 30 })
  assert.equal(await value(), 1.5, 'Two fast clicks add exactly two steps')
  await plus.tap()
  assert.equal(await value(), 2, 'A touch tap is not counted again by its click')
  await plus.focus()
  await page.keyboard.press('Enter')
  assert.equal(await value(), 2.5)
  await page.keyboard.press('Space')
  assert.equal(await value(), 3)
  await minus.evaluate(button => button.click())
  assert.equal(await value(), 2.5)
  await input.fill('0')
  // A mouse hold repeats, then speeds up without changing the 0.5 kg step.
  await page.evaluate(() => { window.stepperChanges = [] })
  await press(plus)
  await wait(1100)
  const early = await value()
  assert.ok(early >= 3, 'Holding repeats beyond the initial press')
  await wait(1100)
  const late = await value()
  assert.ok(late - early > early, 'Longer holds accelerate the repeat rate')
  await page.mouse.up()
  await stable()
  const changes = await page.evaluate(() => window.stepperChanges)
  changes.slice(1).forEach((next, index) => assert.equal(next - changes[index], .5))
  // Decrement and clamping at both ends.
  await input.fill('1')
  await press(minus)
  await wait(650)
  await page.mouse.up()
  assert.equal(await value(), 0)
  await stable()
  await input.fill('49')
  await press(plus)
  await wait(650)
  await page.mouse.up()
  assert.equal(await value(), 50)
  await stable()
  // Leaving a captured button stops immediately.
  await input.fill('0')
  await press(plus)
  await wait(500)
  await page.mouse.move(380, 800)
  await stable()
  await page.mouse.up()
  // Native touch hold and cancellation (not just synthetic click tests).
  const cdp = await page.context().newCDPSession(page)
  const box = await plus.boundingBox()
  const touch = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await input.fill('0')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] })
  await wait(750)
  assert.ok(await value() >= 2, 'Native touch hold repeats')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await stable()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] })
  await wait(450)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await stable()
  // Disabling, losing focus, and unmounting must clear pending repeats.
  await press(plus)
  await page.evaluate(() => window.setStepperDisabled(true))
  await stable()
  await page.mouse.up()
  await page.evaluate(() => window.setStepperDisabled(false))
  await press(plus)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await stable()
  await page.mouse.up()
  await press(plus)
  await page.evaluate(() => window.setStepperVisible(false))
  await input.waitFor({ state: 'detached' })
  const savedChanges = await page.evaluate(() => window.stepperChanges.length)
  await wait(500)
  assert.equal(await page.evaluate(() => window.stepperChanges.length), savedChanges)
  await page.mouse.up()
  assert.deepEqual(errors, [])
  console.log('PASS: tap, double tap, keyboard, accelerating hold, touch, release/cancel/leave, bounds and cleanup')
} finally { await browser.close() }
