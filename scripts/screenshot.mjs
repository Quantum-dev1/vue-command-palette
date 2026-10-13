// Captures README media from the built demo (run `npm run build:demo` first, or `npm run screenshot`).
//   docs/screenshot.png        — dark theme, fuzzy query with highlights
//   docs/screenshot-light.png  — light theme, recent items + groups
//   docs/demo.gif              — short interaction recording (requires ffmpeg on PATH; skipped otherwise)
//
// Uses Playwright's Chromium: `npx playwright install chromium`.
import { spawnSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const distDir = join(root, 'demo-dist')
const docsDir = join(root, 'docs')
const tmpVideoDir = join(root, 'test-results', 'video')

if (!existsSync(join(distDir, 'index.html'))) {
  console.error('demo-dist/ not found — run `npm run build:demo` first.')
  process.exit(1)
}
mkdirSync(docsDir, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  let file = join(distDir, decodeURIComponent(url.pathname))
  if (!file.startsWith(distDir)) {
    res.writeHead(403).end()
    return
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file)) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/`

const browser = await chromium.launch()
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

async function still({ file, theme, query, recent }) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 760 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  })
  if (recent) {
    await context.addInitScript((ids) => localStorage.setItem('vcp:recent', JSON.stringify(ids)), recent)
  }
  const page = await context.newPage()
  await page.goto(`${base}?theme=${theme}`)
  await page.click('.search-trigger')
  await page.waitForSelector('.vcp-dialog')
  if (query) await page.keyboard.type(query, { delay: 30 })
  await pause(300)
  // Wait for async sources to settle so the spinner is not captured.
  await page.waitForSelector('.vcp-spinner', { state: 'detached', timeout: 5000 })
  await pause(250)
  await page.screenshot({ path: join(docsDir, file) })
  console.log(`✓ docs/${file}`)
  await context.close()
}

await still({ file: 'screenshot.png', theme: 'dark', query: process.env.SHOT_QUERY ?? 'ma' })
await still({ file: 'screenshot-light.png', theme: 'light', recent: ['copy-install', 'toggle-theme'] })

// ---- animated demo
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0
if (hasFfmpeg) {
  rmSync(tmpVideoDir, { recursive: true, force: true })
  const context = await browser.newContext({
    viewport: { width: 960, height: 600 },
    colorScheme: 'dark',
    recordVideo: { dir: tmpVideoDir, size: { width: 960, height: 600 } },
  })
  const page = await context.newPage()
  await page.goto(`${base}?theme=dark`)
  await pause(700)
  await page.keyboard.press('ControlOrMeta+K')
  await pause(600)
  await page.keyboard.type('gti', { delay: 140 })
  await pause(800)
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('theme', { delay: 110 })
  await pause(500)
  await page.keyboard.press('Enter')
  await pause(600)
  await page.keyboard.press('ArrowDown')
  await pause(350)
  await page.keyboard.press('Enter')
  await pause(900)
  await page.keyboard.press('ControlOrMeta+K')
  await pause(500)
  await page.keyboard.type('accent', { delay: 100 })
  await page.keyboard.press('Enter')
  await pause(500)
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowDown')
    await pause(250)
    await page.keyboard.press('Enter')
    await pause(450)
  }
  await page.keyboard.press('Escape')
  await pause(300)
  await page.keyboard.type('teammate', { delay: 80 })
  await page.keyboard.press('Enter')
  await pause(400)
  await page.keyboard.type('engineer', { delay: 120 })
  await pause(1200)
  await page.keyboard.press('ArrowDown')
  await pause(300)
  await page.keyboard.press('ArrowDown')
  await pause(600)
  await page.keyboard.press('Escape')
  await pause(300)
  await page.keyboard.press('Escape')
  await pause(700)
  await context.close()

  const video = readdirSync(tmpVideoDir).find((f) => f.endsWith('.webm'))
  const out = join(docsDir, 'demo.gif')
  const ff = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      join(tmpVideoDir, video),
      '-vf',
      'fps=15,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
      out,
    ],
    { stdio: 'ignore' },
  )
  console.log(ff.status === 0 ? '✓ docs/demo.gif' : '✗ ffmpeg failed, GIF skipped')
  rmSync(join(root, 'test-results'), { recursive: true, force: true })
} else {
  console.log('ffmpeg not found — skipping docs/demo.gif')
}

await browser.close()
server.close()
