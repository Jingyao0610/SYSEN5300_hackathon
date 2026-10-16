// Browser acceptance for every data/ CSV through the real page and API (mock off).
// Usage (tool running via `bash app/testme.sh`; see README.md here):
//   node app/frontend/acceptance/datasets.mjs EXPECTED_DIR SCREENSHOT_DIR [COMMIT]
// EXPECTED_DIR comes from core_expected.py. Per run it checks import, analysis
// (responses identical to app/qc.py), charts, incident list, export and errors.
import puppeteer from 'puppeteer-core'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'

const [R, OUT, COMMIT = 'unknown'] = process.argv.slice(2)
const DATA = fileURLToPath(new URL('../../../data/', import.meta.url))
const PAGE = process.env.FRONTEND_URL || 'http://127.0.0.1:5173/'
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SHOTS = new Set((process.env.SCREENSHOT_RUNS || 'jingyao-zone_shift-P1,jingyao-edge-P1,hayden-nyc-2').split(','))
mkdirSync(OUT, { recursive: true })

const plan = JSON.parse(readFileSync(`${R}/plan.json`, 'utf8'))
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 300000 })
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms))
const pct = (p) => (p == null ? '—' : `${(p * 100).toFixed(1)}%`)
const LABEL = { high: 'High late rate', low: 'Low late rate', no_signal: 'No signal', insufficient_data: 'Insufficient data',
  unreviewed_baseline: 'Baseline not reviewed', provisional_current_day: 'Provisional (today)' }
const lines = []
let fails = 0
const check = (name, what, ok, detail = '') => {
  if (!ok) fails++
  lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(24)} ${what}${!ok && detail ? `  [${detail}]` : ''}`)
}
const setVal = (p, sel, v) => p.$eval(sel, (el, v) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}, v)
const click = async (p, t) => {
  const [h] = await p.$$(`xpath/.//button[contains(., '${t}')]`)
  if (!h) throw new Error(`no button ${t}`)
  await h.click()
}
const until = async (p, n) => { for (let i = 0; i < 200 && p.got.length < n; i++) await wait(100); await wait(500) }
const text = (p) => p.evaluate(() => document.body.innerText)
const norm = (x) => x.replace(/\r\n/g, '\n').replace(/\n?$/, '\n')

for (const run of plan) {
  const { name, settings: s } = run
  const first = JSON.parse(readFileSync(`${R}/${name}.first.json`, 'utf8'))
  const final = JSON.parse(readFileSync(`${R}/${name}.final.json`, 'utf8'))
  const file = `${DATA}${run.csv}`
  const src = readFileSync(file, 'utf8')
  const nrows = src.trim().split(/\r?\n/).length - 1
  const shot = SHOTS.has(name)

  const p = await b.newPage()
  await p.setViewport({ width: 1200, height: 900 })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  // only real POSTs; a CORS preflight (OPTIONS) has no body
  p.got = []
  p.on('response', async (r) => {
    if (r.url().endsWith('/analyze') && r.request().method() === 'POST') p.got.push({ status: r.status(), body: await r.json().catch(() => null) })
  })
  await p.goto(PAGE, { waitUntil: 'networkidle0' })
  await wait()
  await p.evaluate(() => {
    window.__blobs = []
    const o = URL.createObjectURL
    URL.createObjectURL = (bl) => { window.__blobs.push(bl); return o(bl) }
  })

  // 1. import
  await (await p.$('input[type=file]')).uploadFile(file)
  await wait(1500)
  check(name, `import: page shows ${nrows} rows`, (await text(p)).includes(`${nrows} rows from ${run.csv.split('/').pop()}`))

  // 2. analysis
  await setVal(p, 'input[type=number]', String(s.target_minutes))
  await p.select('.settings select', s.selected_priority)
  await setVal(p, 'input[type=date]', s.baseline_end.slice(0, 10))
  await setVal(p, 'input[type=datetime-local]', s.as_of.slice(0, 19)) // New York local wall time
  await click(p, 'Run analysis')
  await until(p, 1)
  check(name, 'analysis, nothing reviewed: HTTP 200, identical to core', p.got[0]?.status === 200 && isDeepStrictEqual(p.got[0].body, first))
  if (shot) await p.screenshot({ path: `${OUT}/${name}-1-data-settings.png` })
  await click(p, 'View zone chart')
  await wait(800)
  for (const z of run.confirm) {
    await p.select('.panel select', z)
    await wait(300)
    const n = p.got.length
    await p.click('label.check input')
    await until(p, n + 1)
  }
  const last = p.got.at(-1)
  check(name, `analysis after confirming [${run.confirm}]: identical to core`, last?.status === 200 && isDeepStrictEqual(last.body, final))
  const t = await text(p)
  const q = final.quality
  check(name, `coverage shown: all ${q.overall.usable_rows}/${q.overall.excluded_rows}/${q.overall.total_rows}, priority ${q.selected_priority.usable_rows}/${q.selected_priority.excluded_rows}/${q.selected_priority.total_rows} (usable/excluded/total)`,
    t.includes(`${q.overall.usable_rows} usable / ${q.overall.excluded_rows} excluded of ${q.overall.total_rows}`)
    && t.includes(`${q.selected_priority.usable_rows} usable / ${q.selected_priority.excluded_rows} excluded of ${q.selected_priority.total_rows}`))
  const listed = await p.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find((x) => x.innerText.startsWith('Days to review'))
    return h?.parentElement.querySelector('tbody')?.rows.length ?? 0
  })
  check(name, `formal signals listed: ${final.signals.length}`, listed === final.signals.length, `page ${listed}`)

  // 3. every zone: table rows and chart marks
  const rowBad = []
  const chartBad = []
  for (const bz of final.zone_baselines) {
    await p.select('.panel select', bz.zone)
    await wait(400)
    const shown = await p.evaluate(() => [...document.querySelectorAll('tr')]
      .filter((r) => r.cells[1]?.innerText === 'monitoring').map((r) => [...r.cells].slice(0, 8).map((c) => c.innerText.trim())))
    const mon = final.daily_points.filter((d) => d.zone === bz.zone)
    if (shown.length !== mon.length) rowBad.push(`${bz.zone}: ${shown.length} rows vs ${mon.length}`)
    mon.forEach((d, i) => {
      const row = shown[i] || []
      const want = [d.date, 'monitoring', String(d.n), String(d.late), pct(d.rate), pct(d.lower), pct(d.upper)]
      if (!isDeepStrictEqual(row.slice(0, 7), want) || !row[7]?.includes(LABEL[d.status])) rowBad.push(`${bz.zone} ${d.date}: ${row.join('|')}`)
    })
    const c = await p.evaluate(() => {
      const svg = document.querySelector('.chart > svg')
      return svg && { markers: svg.querySelectorAll('.mk').length, limits: svg.querySelectorAll('g.limit').length, center: svg.querySelectorAll('g.center').length }
    })
    const want = { markers: bz.daily.length + mon.filter((d) => d.rate != null).length, limits: mon.filter((d) => d.upper != null).length, center: bz.p_bar == null ? 0 : 1 }
    if (!isDeepStrictEqual(c, want)) chartBad.push(`${bz.zone}: page ${JSON.stringify(c)} want ${JSON.stringify(want)}`)
    if (shot && ['A', 'EDGE', 'BROOKLYN'].includes(bz.zone)) await p.screenshot({ path: `${OUT}/${name}-2-zone-${bz.zone}.png`, fullPage: true })
  }
  check(name, `table: all ${final.daily_points.length} monitoring rows show core n/late/rate/limits/status`, rowBad.length === 0, rowBad.slice(0, 3).join('; '))
  check(name, `charts: ${final.zone_baselines.length} zone(s), one marker per day with a rate, limits per day, p̄ line`, chartBad.length === 0, chartBad.join('; '))

  // 4. incidents and export
  await click(p, 'Incident Review')
  await wait(600)
  check(name, `incident review lists all ${final.late_incidents.length} late responses`, (await text(p)).includes(`${final.late_incidents.length} late response(s) shown.`))
  await click(p, 'Data & Settings')
  await wait(400)
  await click(p, 'Export CSV')
  await wait(800)
  const exported = await p.evaluate(async () => (window.__blobs.length ? await window.__blobs.at(-1).text() : null))
  check(name, 'export: CSV identical to the imported file', exported != null && norm(exported) === norm(src))
  check(name, 'no MOCK banner, no page errors', !(await text(p)).includes('MOCK DATA') && errs.length === 0, errs.join('; '))
  await p.close()
}
await b.close()

const notes = plan.filter((r) => r.listed_but_not_confirmable.length)
  .map((r) => `Note: ${r.name} codebook lists ${r.listed_but_not_confirmable} as reviewed, but their baselines are not usable, so the page cannot confirm them (interfaces section 10); verdicts are unaffected.`)
const out = [`Browser acceptance, all data/ CSVs, real UI + API, mock disabled`, `Commit tested: ${COMMIT}; ${process.env.FRONTEND_URL ? 'page under test given by FRONTEND_URL' : 'local, started with bash app/testme.sh'}`, '',
  ...lines, '', `${lines.length - fails}/${lines.length} checks passed`, ...notes].join('\n') + '\n'
writeFileSync(`${OUT}/RESULTS.txt`, out)
console.log(out)
process.exit(fails ? 1 : 0)
