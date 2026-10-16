// Browser acceptance for Shifeng's nine core handoff cases (tests/fixtures/qc/export_handoff.py),
// plus an extra-CSV-column round trip. Real page and API, mock off; see README.md here.
// Usage: node app/frontend/acceptance/handoff.mjs HANDOFF_DIR OUT_DIR [COMMIT]
import puppeteer from 'puppeteer-core'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
const [H, OUT, COMMIT = 'unknown'] = process.argv.slice(2)
const PAGE = process.env.FRONTEND_URL || 'http://127.0.0.1:5173/'
const API = (process.env.API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(OUT, { recursive: true })
const J = (f) => JSON.parse(readFileSync(`${H}/${f}`, 'utf8'))
const manifest = J('manifest.json')
const b = await puppeteer.launch({ executablePath: CHROME, headless: true })
// The export check reads the CSV in memory; never let Chrome save files into ~/Downloads.
await (await b.target().createCDPSession()).send('Browser.setDownloadBehavior', { behavior: 'deny' })
const wait = (ms = 500) => new Promise(r => setTimeout(r, ms))
const pct = (p) => p == null ? '—' : `${(p * 100).toFixed(1)}%`
const LABEL = { high: 'High late rate', low: 'Low late rate', no_signal: 'No signal', insufficient_data: 'Insufficient data',
  unreviewed_baseline: 'Baseline not reviewed', provisional_current_day: 'Provisional (today)' }
const rows = []; let allPass = true
const result = (c, check, ok, detail = '') => { rows.push({ c, check, ok, detail }); if (!ok) allPass = false }

async function openPage() {
  const p = await b.newPage(); await p.setViewport({ width: 1100, height: 900 })
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message))
  p.got = []; p.on('response', async r => { if (r.url().endsWith('/analyze') && r.request().method() === 'POST') p.got.push({ status: r.status(), body: await r.json().catch(() => null) }) })
  await p.goto(PAGE, { waitUntil: 'networkidle0' }); await wait()
  return p
}
const setVal = (p, sel, v) => p.$eval(sel, (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }, v)
const click = async (p, t) => { const [h] = await p.$$(`xpath/.//button[contains(., '${t}')]`); if (!h) throw new Error('no button ' + t); await h.click(); await wait(900) }
const text = (p) => p.evaluate(() => document.body.innerText)
const localOf = (iso) => iso.slice(0, 19) // request times are New York local with -04:00

for (const c of manifest.cases.filter(c => c.name !== 'empty')) {
  const req = J(c.files.request), exp = J(c.files.expected)
  const p = await openPage()
  await (await p.$('input[type=file]')).uploadFile(`${H}/${c.files.records}`); await wait()
  await setVal(p, 'input[type=number]', String(req.target_minutes))
  await p.select('.settings select', req.selected_priority)
  await setVal(p, 'input[type=date]', req.baseline_end.slice(0, 10))
  await setVal(p, 'input[type=datetime-local]', localOf(req.as_of))
  await click(p, 'Run analysis')
  await click(p, 'View zone chart')
  if (req.reviewed_zones.includes('A')) { await p.click('label.check input'); await wait(1200) }
  const last = p.got.at(-1)
  result(c.name, 'HTTP 200, response identical to core expected', last?.status === 200 && isDeepStrictEqual(last.body, exp))
  result(c.name, 'reviewed_zones sent as in request', isDeepStrictEqual(last?.body?.meta?.reviewed_zones, req.reviewed_zones))
  const pt = exp.daily_points.find(d => d.date >= '2026-09-21') ?? exp.daily_points[0]
  const cells = await p.evaluate((date) => {
    const tr = [...document.querySelectorAll('tr')].find(r => r.cells[0]?.innerText === date && r.cells[1]?.innerText === 'monitoring')
    return tr ? [...tr.cells].map(td => td.innerText.trim()) : null
  }, pt.date)
  const want = [pt.date, 'monitoring', String(pt.n), String(pt.late), pct(pt.rate), pct(pt.lower), pct(pt.upper)]
  result(c.name, 'daily row shows n, late, rate, limits', isDeepStrictEqual(cells?.slice(0, 7), want), `page ${JSON.stringify(cells?.slice(2, 7))}`)
  result(c.name, `status shown "${LABEL[pt.status]}"`, !!cells && cells[7].includes(LABEL[pt.status]), cells?.[7])
  const t = await text(p)
  const sigOk = exp.signals.length === 0 ? t.includes('No formal signals') : exp.signals.every(s => t.includes(`${s.late} / ${s.n}`)) && !t.includes('No formal signals')
  result(c.name, `formal signals = ${exp.signals.length}`, sigOk)
  const q = exp.quality.selected_priority
  result(c.name, `coverage ${q.usable_rows} usable / ${q.excluded_rows} excluded of ${q.total_rows}`, t.includes(`${q.usable_rows} usable / ${q.excluded_rows} excluded of ${q.total_rows}`))
  result(c.name, 'time zone, target, as_of visible', t.includes('America/New_York') && t.includes(`${req.target_minutes} min`) && !t.includes('Analysis as of\nnot run'))
  result(c.name, 'no MOCK banner, no page errors', !t.includes('MOCK DATA') && p.errs.length === 0, p.errs.join('; '))
  if (c.name === 'small_3_2_1') {
    await click(p, 'Data & Settings')
    result(c.name, 'exclusion reason shown', (await text(p)).includes('on_scene_at is missing'))
  }
  if (c.name === 'k3_boundary') await p.screenshot({ path: `${OUT}/case-${c.name}.png`, fullPage: true })
  await p.close()
}

// empty: UI blocks an empty list (no priority to choose); HTTP checked directly
{
  const c = manifest.cases.find(c => c.name === 'empty'); const req = J(c.files.request), exp = J(c.files.expected)
  const p = await openPage()
  await (await p.$('input[type=file]')).uploadFile(`${H}/${c.files.records}`); await wait()
  await setVal(p, 'input[type=date]', '2026-09-21'); await click(p, 'Run analysis')
  const t = await text(p)
  result('empty', 'UI: header-only CSV loads 0 rows, Run asks for a priority, nothing sent', t.includes('No records loaded.') && t.includes('Choose a priority.') && p.got.length === 0)
  const http = await p.evaluate(async ([url, body]) => { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() } }, [`${API}/analyze`, req])
  result('empty', 'HTTP: 200, identical to core expected (empty_input)', http.status === 200 && isDeepStrictEqual(http.body, exp))
  await p.close()
}

// extra CSV columns: sent to the API without a 422 and kept on export
{
  const src = readFileSync(`${H}/small_3_2_1.records.csv`, 'utf8').trim().split(/\r?\n/)
  const csv = [src[0] + ',station,"crew, lead"', ...src.slice(1).map((l, i) => `${l},N${i + 1},"Lee, ""J"""`)].join('\n') + '\n'
  writeFileSync(`${OUT}/extra.csv`, csv)
  const req = J('small_3_2_1.request.json'), exp = J('small_3_2_1.expected.json')
  const p = await openPage()
  await p.evaluate(() => { window.__blobs = []; const o = URL.createObjectURL; URL.createObjectURL = (bl) => { window.__blobs.push(bl); return o(bl) } })
  await (await p.$('input[type=file]')).uploadFile(`${OUT}/extra.csv`); await wait()
  await setVal(p, 'input[type=date]', '2026-09-21'); await setVal(p, 'input[type=datetime-local]', localOf(req.as_of))
  await click(p, 'Run analysis')
  result('extra columns', 'API accepts records with extra keys; result identical to small case', p.got.at(-1)?.status === 200 && isDeepStrictEqual(p.got.at(-1).body, exp))
  result('extra columns', 'page lists the kept columns', (await text(p)).includes('kept for export, not analysed: station, crew, lead'))
  await click(p, 'Export CSV')
  const exported = await p.evaluate(async () => await window.__blobs.at(-1).text())
  result('extra columns', 'export keeps both extra columns and their values', exported === csv, exported.split('\n')[1])
  await p.close()
}
await b.close()
const fmt = rows.map(r => `${r.ok ? 'PASS' : 'FAIL'}  ${r.c.padEnd(14)} ${r.check}${r.ok || !r.detail ? '' : `  [${r.detail}]`}`)
const out = [`Browser acceptance, nine handoff cases + extra columns, real UI + API, mock disabled`, `Commit tested: ${COMMIT}; ${process.env.FRONTEND_URL ? 'page under test given by FRONTEND_URL' : 'local, started with bash app/testme.sh'}`, '',
  ...fmt, '', `${rows.filter(r => r.ok).length}/${rows.length} checks passed`].join('\n') + '\n'
writeFileSync(`${OUT}/RESULTS.txt`, out); console.log(out)
process.exit(allPass ? 0 : 1)
