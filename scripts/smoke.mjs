// npm run smoke — one whole session in a real browser, on the dev server with the in-memory store (no accounts).
// A host makes a deck from a template and goes live; a phone (touch, phone-sized) joins, answers a poll and sends a
// reaction; the host reveals the results and ends the session. Each step prints PASS or FAIL; any FAIL exits 1.
// First run: `npx playwright install chromium`. Screenshots: SHOTS=some/folder npm run smoke
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const server = await createServer({ server: { host: '127.0.0.1', port: 5317, strictPort: false }, logLevel: 'error' })
await server.listen()
const B = server.resolvedUrls.local[0].replace(/\/$/, '')
const browser = await chromium.launch()
let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const until = async (fn, ms = 6000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await fn().catch(() => false)) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}
// The library's cards are one big button each, so click where the button is, as a person would.
const press = async (page, locator) => {
  const box = await locator.boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}
const brandLeak = async (page) => /surprisal/i.test(await page.locator('body').innerText())

try {
  const host = await browser.newPage({ viewport: { width: 1440, height: 810 } })
  host.on('dialog', (d) => d.accept())
  await host.goto(`${B}/live/host`)
  await host.getByText('Make the room talk back.').waitFor()
  check('host library opens', true)
  check('host library has no Surprisal branding', !(await brandLeak(host)))
  if (shots) await host.screenshot({ path: `${shots}/1-host-library.png` })

  await press(host, host.locator('.lv-tile', { hasText: 'Webinar' }).getByRole('button', { name: 'Use template' }))
  await host.getByRole('button', { name: 'Go live' }).click()
  await host.waitForURL(/code=[A-Z]{4}/)
  const code = new URL(host.url()).searchParams.get('code')
  check('the deck goes live', /^[A-Z]{4}$/.test(code), code)
  check('the presenter shows the join code', await until(async () => (await host.locator('.lv-joincard-code').innerText()) === code))

  const hosting = await host.evaluate((code) => JSON.parse(localStorage.getItem('live_kit_hosting')).find((h) => h.code === code), code)
  const transferred = await browser.newContext()
  const console = await transferred.newPage()
  let titleLookups = 0
  await console.route((url) => url.pathname === '/api/live' && url.searchParams.get('op') === 'state' && !url.searchParams.has('h'),
    (route) => { titleLookups++; return route.continue() })
  await console.goto(`${B}/live/host?code=${code}&view=console#k=${hosting.token}`)
  check('hand-over removes the host key from the address', await until(async () => new URL(console.url()).hash === ''))
  check('hand-over remembers the deck title', await until(() => console.evaluate(({ code, title }) =>
    JSON.parse(localStorage.getItem('live_kit_hosting') ?? '[]').some((h) => h.code === code && h.title === title), hosting)))
  check('hand-over looks up the title once', titleLookups === 1)
  await console.goto(`${B}/live/host`)
  check('the hand-over session card shows its deck title', await until(async () =>
    await console.locator('.lv-tile', { hasText: code }).locator('h2').textContent({ timeout: 500 }) === hosting.title))
  if (shots) {
    await console.screenshot({ path: `${shots}/4-handover-library-dark.png` })
    await console.getByRole('button', { name: 'Switch light and dark' }).click()
    await console.screenshot({ path: `${shots}/5-handover-library-light.png` })
  }
  await transferred.close()

  const offlineTransfer = await browser.newContext()
  const offlineConsole = await offlineTransfer.newPage()
  let failedLookup = false
  const handoverErrors = []
  offlineConsole.on('pageerror', (error) => handoverErrors.push(error))
  const isTitleLookup = (url) => url.pathname === '/api/live' && url.searchParams.get('op') === 'state' && !url.searchParams.has('h')
  await offlineConsole.route(isTitleLookup, async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' })
    failedLookup = true
  })
  const titleFailure = offlineConsole.waitForResponse((response) => isTitleLookup(new URL(response.url())) && response.status() === 503)
  await offlineConsole.goto(`${B}/live/host?code=${code}&view=console#k=${hosting.token}`)
  await (await titleFailure).finished()
  await offlineConsole.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  check('a failed title lookup keeps the adopted session', failedLookup && handoverErrors.length === 0 && await until(() => offlineConsole.evaluate((code) =>
    JSON.parse(localStorage.getItem('live_kit_hosting') ?? '[]').some((h) => h.code === code && h.title === 'Live session'), code)))
  check('a failed title lookup still removes the host key', new URL(offlineConsole.url()).hash === '')
  await offlineTransfer.close()

  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const phone = await phoneCtx.newPage()
  await phone.goto(`${B}/live?c=${code}`)
  await phone.getByLabel(/your name/i).fill('Ana')
  await phone.getByRole('button', { name: 'Join' }).tap()
  check('the phone joins', await until(async () => (await phone.locator('.lv-joinform').count()) === 0))
  check('the name falls onto the pile on the screen', await until(async () => (await host.locator('.lv-pile-name', { hasText: 'Ana' }).count()) === 1))
  check('the phone has no Surprisal branding', !(await brandLeak(phone)))
  if (shots) {
    await host.waitForTimeout(1500)
    await host.screenshot({ path: `${shots}/2-presenter-doors.png` })
  }

  await host.mouse.move(700, 400)
  await host.getByRole('button', { name: 'Next slide' }).click()
  const option = phone.getByRole('radio', { name: /Curious/ })
  check('the poll reaches the phone', await until(async () => (await option.count()) === 1))
  await option.tap()
  check('the screen counts the answer, results held back', await until(async () => (await host.locator('.lv-tally b').innerText()) === '1'))
  await host.mouse.move(700, 400)
  await host.getByRole('button', { name: 'Reveal results' }).click()
  const state = () => fetch(`${B}/api/live?op=state&code=${code}`).then((r) => r.json())
  check('Reveal results shows them', await until(async () => (await state()).results?.total === 1))
  check('the presenter button now says Hide results', await until(async () => (await host.getByRole('button', { name: 'Hide results' }).count()) === 1))

  await phone.locator('.lv-rx button').first().tap()
  check('the phone says the reaction was sent', await until(async () => ((await phone.locator('.lv-rx-note').textContent()) ?? '').includes('Sent to the screen')))
  check('the reaction rises on the screen', await until(async () => (await host.locator('.lv-reaction').count()) > 0))
  if (shots) await phone.screenshot({ path: `${shots}/3-phone-results.png` })

  await host.mouse.move(700, 420)
  await host.getByRole('button', { name: 'End' }).click()
  check('the phone shows the end screen', await until(async () => (await phone.getByText('Thank you for joining.').count()) === 1))
  check('the report opens after End', await until(async () => (await host.getByRole('button', { name: 'Report' }).count()) === 1))
} catch (e) {
  check('the session ran to the end', false, String(e).split('\n')[0])
} finally {
  await browser.close()
  await server.close()
}
console.log(failed ? `\n${failed} step(s) failed` : '\nAll steps passed')
process.exit(failed ? 1 : 0)
