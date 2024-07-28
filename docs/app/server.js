import { readFile } from 'fs/promises'
import { createServer } from 'http'
import concat from 'concat-stream'
import { Readable } from 'stream'
import hstream from 'hstream'
import { on } from 'events'
import vite from 'vite'

const {
  middlewares,
  ssrLoadModule,
  ssrFixStacktrace,
  transformIndexHtml
} = await vite.createServer({
  server: { middlewareMode: 'ssr' }
})

const server = createServer()

server.listen(3000, console.log)

for await (const [req, res] of on(server, 'request')) {
  middlewares(req, res, async function (err) {
    try {
      if (err) throw err

      const template = await readFile('index.html', 'utf8')
      const document = await transformIndexHtml(req.url, template)
      const { app, render } = await ssrLoadModule('./ssr.js')
      const state = { ...app.state }
      const view = await render(app.partial, state)

      // Create HTML transform pipeline
      const transform = hstream({
        head: {
          _appendHtml: `
            <title>${state.title}</title>
            ${Object.keys(state.meta)
              .map((key) => `<meta name="${key}" content="${state.meta[key]}">`)
              .join('\n')}
          `
        },
        [app.selector]: {
          _appendHtml: view
        }
      })

      // Process template
      const html = await new Promise(function (resolve, reject) {
        const stream = Readable.from(document)
        stream.on('error', reject)
        stream.pipe(transform).pipe(concat({ encoding: 'string' }, resolve))
      })

      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html')
      res.end(html)
    } catch (err) {
      ssrFixStacktrace(err)
      throw err
    }
  })
}
