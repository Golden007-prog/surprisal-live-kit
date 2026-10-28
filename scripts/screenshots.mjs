// npm run screenshots — makes the README images in docs/media from a real session on the dev server.
// Run it again after you brand the app, and the README shows your colours and logo.
// Needs Playwright's Chromium (npx playwright install chromium). The demo GIF also needs ffmpeg; without it, the GIF is skipped.
//
// ONLY=hero,slides,phone,gif,social makes a subset. SHEET=some/file.png also writes a contact sheet of the stills.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { DEMO_DECK, PEOPLE, demoRoom } from './demo.mjs'

const OUT = 'docs/media'
const ONLY = new Set((process.env.ONLY || 'hero,slides,phone,gif,social').split(','))
const JOIN_HOST = process.env.VITE_JOIN_HOST || 'live.example.com'
process.env.VITE_JOIN_HOST = JOIN_HOST // the presenter shows this address, not 127.0.0.1
mkdirSync(OUT, { recursive: true })

const server = await createServer({ server: { host: '127.0.0.1', port: 5318, strictPort: false }, logLevel: 'error' })
await server.listen()
const B = server.resolvedUrls.local[0].replace(/\/$/, '')
const browser = await chromium.launch()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const slideIndex = (id) => DEMO_DECK.slides.findIndex((s) => s.id === id)
const dataUri = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`
const kb = (f) => `${Math.round(statSync(f).size / 1024)} KB`

async function presenter(room, theme, viewport = { width: 1440, height: 810 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: theme })
  await ctx.addInitScript((t) => localStorage.setItem('live_kit_theme', JSON.stringify(t)), theme)
  const page = await ctx.newPage()
  page.on('dialog', (d) => d.accept())
  await page.goto(room.presenterUrl())
  await page.locator('.lv-stage').waitFor()
  await sleep(3500) // let the controls fade (the stage goes idle without a pointer)
  return { ctx, page }
}

async function phone(code, theme, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, colorScheme: theme })
  const page = await ctx.newPage()
  await page.goto(`${B}/live?c=${code}`)
  await page.getByLabel(/your name/i).fill(name)
  await page.getByRole('button', { name: 'Join' }).tap()
  await page.locator('.lv-joinform').waitFor({ state: 'detached' })
  return { ctx, page }
}

/** Show slide `id` with its results, as the host would after Reveal results. */
async function show(room, id, wait = 4500) {
  await room.control({ action: 'goto', index: slideIndex(id) })
  if (!['content', 'leaderboard'].includes(DEMO_DECK.slides[slideIndex(id)].kind)) await room.control({ action: 'results', on: true })
  await sleep(wait)
}

/** A static page rendered to a PNG: how the hero, the social card and the contact sheet are drawn. */
async function compose(html, size, file) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 })
  await page.setContent(html, { waitUntil: 'load' })
  await page.screenshot({ path: file })
  await page.close()
}

const FRAME = {
  dark: { bg: '#0e0e0d', glow: 'rgba(227,179,26,0.10)', bar: '#1b1b19', line: '#2c2b28', dot: '#3a3935', url: '#8b877e' },
  light: { bg: '#ece6da', glow: 'rgba(227,179,26,0.18)', bar: '#f7f3ea', line: '#d8d0c0', dot: '#cfc6b4', url: '#7a7366' },
}
const windowFrame = (src, f, w) => `
  <div style="width:${w}px;border:1px solid ${f.line};background:${f.bar};box-shadow:0 40px 90px rgba(0,0,0,.28)">
    <div style="height:38px;display:flex;align-items:center;gap:8px;padding:0 16px;border-bottom:1px solid ${f.line}">
      <i style="width:11px;height:11px;border-radius:50%;background:${f.dot}"></i><i style="width:11px;height:11px;border-radius:50%;background:${f.dot}"></i><i style="width:11px;height:11px;border-radius:50%;background:${f.dot}"></i>
      <span style="margin-left:18px;font:13px ui-monospace,Menlo,monospace;color:${f.url}">${JOIN_HOST}/live/host</span>
    </div>
    <img src="${src}" style="display:block;width:100%">
  </div>`
const phoneFrame = (src, w) => `
  <div style="width:${w}px;padding:${w * 0.035}px;border-radius:${w * 0.16}px;background:#111;box-shadow:0 40px 80px rgba(0,0,0,.35),inset 0 0 0 2px #2a2a2a">
    <img src="${src}" style="display:block;width:100%;border-radius:${w * 0.13}px">
  </div>`

const made = []
try {
  const stills = []
  if (ONLY.has('hero') || ONLY.has('slides') || ONLY.has('phone') || ONLY.has('social')) {
    const room = demoRoom(B)
    await room.create({ ...DEMO_DECK, title: 'Team offsite' })
    console.log(`room ${room.code}: filling it with ${PEOPLE.length} people (about a minute)…`)
    await room.playAll()
    if (room.problems.length) console.log('demo problems:', room.problems.slice(0, 5).join(' | '))
    const tmp = join(tmpdir(), `live-kit-shots-${room.code}`)
    mkdirSync(tmp, { recursive: true })

    for (const theme of ['dark', 'light']) {
      if (!ONLY.has('hero') && !ONLY.has('social') && !(theme === 'dark' && (ONLY.has('slides') || ONLY.has('phone')))) continue
      const p = await presenter(room, theme)
      const m = await phone(room.code, theme, 'Luca')

      // The hero: the poll revealed on the screen, reactions rising, and the phone that just voted.
      await show(room, 'coffee', 500)
      await m.page.getByRole('radio', { name: /Flat white/ }).tap()
      await sleep(3800)
      await m.page.locator('.lv-rx button').first().tap()
      await Promise.all(PEOPLE.slice(0, 7).map((x, i) => sleep(i * 160).then(() => room.react(x, ['👏', '❤️', '🤯', '👏', '😂'][i % 5]))))
      await sleep(1700)
      await p.page.screenshot({ path: join(tmp, `screen-${theme}.png`) })
      await m.page.screenshot({ path: join(tmp, `phone-${theme}.png`) })

      if (theme === 'dark' && ONLY.has('phone')) {
        // Three phone moments: joining, a word cloud entry, the quiz.
        const j = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, colorScheme: 'dark' })
        const jp = await j.newPage()
        await jp.goto(`${B}/live?c=${room.code}`)
        await jp.getByLabel(/your name/i).fill('Luca')
        await sleep(600)
        await jp.screenshot({ path: `${OUT}/phone-join.png` })
        await j.close()
        await room.control({ action: 'goto', index: slideIndex('cloud') })
        await sleep(2500)
        await m.page.screenshot({ path: `${OUT}/phone-wordcloud.png` })
        await room.control({ action: 'goto', index: slideIndex('ready2') })
        await sleep(2500)
        await m.page.screenshot({ path: `${OUT}/phone-poll.png` })
        made.push(`${OUT}/phone-join.png`, `${OUT}/phone-wordcloud.png`, `${OUT}/phone-poll.png`)
      }

      if (theme === 'dark' && ONLY.has('slides')) {
        const SLIDES = [['coffee', 'poll'], ['cloud', 'wordcloud'], ['podium', 'podium', 6000], ['grid', 'grid'], ['claim2', 'agree'], ['fix', 'ranking'],
          ['better', 'open'], ['qa', 'qa'], ['points', 'points']]
        for (const [id, name, wait] of SLIDES) {
          await show(room, id, wait)
          const file = `${OUT}/slide-${name}.png`
          await p.page.screenshot({ path: file })
          made.push(file)
          stills.push(file)
        }
      }
      await p.ctx.close()
      await m.ctx.close()
    }

    for (const theme of ['dark', 'light']) {
      if (!ONLY.has('hero')) break
      const f = FRAME[theme]
      const file = `${OUT}/hero-${theme}.png`
      await compose(`<body style="margin:0;background:${f.bg};background-image:radial-gradient(60% 70% at 70% 40%,${f.glow},transparent)">
        <div style="position:relative;width:2400px;height:1300px">
          <div style="position:absolute;left:90px;top:100px">${windowFrame(dataUri(join(tmp, `screen-${theme}.png`)), f, 1880)}</div>
          <div style="position:absolute;left:1900px;top:300px">${phoneFrame(dataUri(join(tmp, `phone-${theme}.png`)), 430)}</div>
        </div></body>`, { width: 2400, height: 1300 }, file)
      made.push(file)
    }

    if (ONLY.has('social')) {
      const f = FRAME.dark
      const file = `${OUT}/social-preview.png`
      await compose(`<body style="margin:0;background:${f.bg};background-image:radial-gradient(70% 90% at 85% 30%,${f.glow},transparent);font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
        <div style="position:relative;width:1280px;height:640px;overflow:hidden">
          <div style="position:absolute;left:72px;top:118px;width:440px;color:#f3efe6">
            <div style="font:600 15px ui-monospace,Menlo,monospace;letter-spacing:.14em;color:#e3b31a">OPEN SOURCE · MIT</div>
            <div style="font-size:64px;font-weight:700;line-height:1.02;margin-top:22px;letter-spacing:-.02em">${process.env.VITE_BRAND_NAME || 'Surprisal<br>Live Kit'}</div>
            <div style="font-size:25px;line-height:1.35;margin-top:26px;color:#c9c3b6">Live polls, word clouds, quizzes and Q&amp;A. Phones join with a code. Host it yourself.</div>
          </div>
          <div style="position:absolute;left:560px;top:118px">${windowFrame(dataUri(join(tmp, 'screen-dark.png')), f, 640)}</div>
          <div style="position:absolute;left:1060px;top:210px">${phoneFrame(dataUri(join(tmp, 'phone-dark.png')), 170)}</div>
        </div></body>`, { width: 1280, height: 640 }, file)
      made.push(file)
    }
    rmSync(tmp, { recursive: true, force: true })
  }

  if (ONLY.has('gif')) {
    let ffmpeg = true
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    } catch {
      ffmpeg = false
      console.log('ffmpeg not found: skipping the GIF')
    }
    if (ffmpeg) {
      // One short session, start to finish: names fall onto the pile, a phone votes, the host reveals, the room reacts.
      const room = demoRoom(B)
      const ids = ['doors', 'coffee', 'cloud']
      await room.create({ title: 'Team meeting', slides: DEMO_DECK.slides.filter((s) => ids.includes(s.id)).map((s) => (s.id === 'doors' ? { ...s, title: 'Good morning, team.', eyebrow: 'Monday meeting' } : s)) })
      const vid = join(tmpdir(), `live-kit-video-${room.code}`)
      mkdirSync(vid, { recursive: true })
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, colorScheme: 'dark', recordVideo: { dir: vid, size: { width: 1600, height: 900 } } })
      const page = await ctx.newPage()
      const t0 = Date.now() // the video starts with the page
      const scale = 0.79
      await page.setContent(`<body style="margin:0;background:${FRAME.dark.bg};background-image:radial-gradient(60% 70% at 70% 40%,${FRAME.dark.glow},transparent);overflow:hidden">
        <iframe id="screen" src="${room.presenterUrl()}" style="position:absolute;left:40px;top:${(900 - 810 * scale) / 2}px;width:1440px;height:810px;border:0;transform:scale(${scale});transform-origin:0 0;box-shadow:0 30px 70px rgba(0,0,0,.4)"></iframe>
        <div style="position:absolute;left:1210px;top:56px;width:340px;padding:12px;border-radius:54px;background:#111;box-shadow:0 30px 60px rgba(0,0,0,.45),inset 0 0 0 2px #2a2a2a">
          <div style="width:316px;height:${844 * (316 / 390)}px;border-radius:44px;overflow:hidden">
            <iframe id="phone" src="${B}/live?c=${room.code}" style="width:390px;height:844px;border:0;transform:scale(${316 / 390});transform-origin:0 0"></iframe>
          </div>
        </div></body>`)
      const screen = page.frameLocator('#screen')
      const ph = page.frameLocator('#phone')
      await screen.locator('.lv-stage').waitFor()
      await ph.getByLabel(/your name/i).waitFor()
      await sleep(3000)
      const start = (Date.now() - t0) / 1000
      for (const [i, x] of PEOPLE.slice(0, 9).entries()) {
        await room.join(x)
        if (i === 3) {
          await ph.getByLabel(/your name/i).fill('Luca')
          await ph.getByRole('button', { name: 'Join' }).click()
        }
        await sleep(380)
      }
      await sleep(1200)
      await room.control({ action: 'goto', index: 1 })
      await sleep(1300)
      await ph.getByRole('radio', { name: /Flat white/ }).click()
      const voters = PEOPLE.slice(0, 9)
      for (const [i, x] of voters.entries()) {
        await room.answer(x, 'coffee', { choice: [1, 2, 1, 0, 3, 1, 2, 1, 4][i] })
        await sleep(170)
      }
      await sleep(900)
      await room.control({ action: 'results', on: true })
      await sleep(1700)
      await ph.locator('.lv-rx button').first().click()
      await Promise.all(voters.map((x, i) => sleep(i * 140).then(() => room.react(x, ['👏', '❤️', '🤯', '👏', '😂', '👏', '❤️', '🤔', '👏'][i]))))
      await sleep(2600)
      const end = (Date.now() - t0) / 1000
      await ctx.close()
      const webm = join(vid, readdirSync(vid).find((f) => f.endsWith('.webm')))
      const file = `${OUT}/demo.gif`
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(start), '-t', String(end - start), '-i', webm,
        '-vf', 'fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', file])
      rmSync(vid, { recursive: true, force: true })
      made.push(file)
    }
  }

  if (process.env.SHEET && stills.length) {
    await compose(`<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(3,640px);gap:8px;padding:8px">
      ${stills.map((s) => `<img src="${dataUri(s)}" style="width:640px">`).join('')}</body>`, { width: 640 * 3 + 32, height: 370 * Math.ceil(stills.length / 3) + 16 }, process.env.SHEET)
  }
  for (const f of made) console.log(`${f}  ${kb(f)}`)
} finally {
  await browser.close()
  await server.close()
}
