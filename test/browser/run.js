import { nodeResolve } from '@rollup/plugin-node-resolve'
import { rollup } from 'rollup'
import Chrome from 'puppeteer'

const FAIL = 'FAIL'

rollup({
  input: './test/browser/index.js',
  plugins: [nodeResolve({ browser: true })]
}).then((bundle) => bundle.generate({
  dir: 'output',
  format: 'iife'
})).then(async function ({ output }) {
  const debug = Boolean(process.env.DEBUG)
  const browser = await Chrome.launch({
    devtools: debug
  })
  const page = await browser.newPage()
  if (debug) await page.waitForTimeout(2000)

  const logs = []
  let failed = false
  page.on('console', async function (msg) {
    const promise = Promise.all(msg.args().map((arg) => arg.jsonValue()))
    logs.push(promise)
    const args = await promise
    const hasForeignObject = args.some((value) => typeof value !== 'string')
    if (hasForeignObject) return console.log(...args)
    failed = failed || args.some((str) => str.includes(FAIL))
    process.stdout.write(args.join(''))
  })

  for (const chunk of output) {
    if (chunk.type === 'asset') continue
    await page.addScriptTag({ content: chunk.code })
  }

  await Promise.all(logs)
  await page.close()
  await browser.close()
  process.exit(failed ? 1 : 0)
}).catch(function () {
  process.exit(1)
})
