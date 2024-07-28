import { writeFile, readFile, mkdir, stat } from 'fs/promises'
import { PurgeCSS } from 'purgecss'
import concat from 'concat-stream'
import { Readable } from 'stream'
import htmlnano from 'htmlnano'
import posthtml from 'posthtml'
import hstream from 'hstream'
import path from 'path'
import vite from 'vite'

// Build client files
const build = await vite.build({
  mode: 'production',
  build: {
    sourcemap: true
  }
})

// Extract all CSS
const css = build.output
  .filter((file) => file.fileName.endsWith('.css'))
  .reduce((acc, file) => acc + file.source, '')

// Get built html template
const template = await readFile('dist/index.html', 'utf8')

// Build SSR entry
const ssr = await vite.build({
  mode: 'production',
  build: {
    ssr: './ssr.js',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        dir: null,
        file: 'dist/ssr.cjs',
        format: 'cjs'
      }
    }
  }
})

// Import SSR entry
const entry = ssr.output.find((node) => node.isEntry)
const { render, app, routes } = await import(
  path.resolve('dist', entry.fileName)
)

// Render landing page to populate state with root router
const state = { ...app.state, href: '/' }
const pages = { '/': await renderPage(state) }

// Render all other routes
await Promise.all(
  routes(state)
    .filter((href) => !pages[href])
    .map(async function (href) {
      const state = { ...app.state, href }
      pages[href] = await renderPage(state)
    })
)

// Write HTML files to disk
await Promise.all(
  Object.entries(pages)
    .map(async function ([href, html]) {
      const dir = path.resolve('dist', href.replace(/^\//, ''))
      await stat(dir).catch(() => mkdir(dir, { recursive: true }))
      await writeFile(path.resolve(dir, 'index.html'), html)
    })
)

/**
 * Render page with given initial state
 * @param {object} state Root state object
 * @returns {Promise<string>} HTML string
 */
async function renderPage (state) {
  // Render view
  const view = await render(app.partial, state)

  // Extract all CSS used in view
  const purged = await new PurgeCSS()
    .purge({
      content: [{ raw: view, extension: 'html' }],
      css: [{ raw: css }]
    })
    .then((result) => result.reduce((acc, { css }) => acc + css, ''))

  // Create HTML transform pipeline
  const transform = hstream({
    '[rel=stylesheet]': {
      rel: 'preload',
      as: 'style',
      'data-rel': 'stylesheet',
      onload: 'this.rel=this.dataset.rel'
    },
    head: {
      _appendHtml: `
        <title>${state.title}</title>
        ${Object.keys(state.meta)
          .map((key) => `<meta name="${key}" content="${state.meta[key]}">`)
          .join('\n')}
        <style>${purged}</style>
      `
    },
    [app.selector]: {
      _appendHtml: view
    }
  })

  // Process template
  const html = await new Promise(function (resolve, reject) {
    const stream = Readable.from(template)
    stream.on('error', reject)
    stream.pipe(transform).pipe(concat({ encoding: 'string' }, resolve))
  })

  // Minify HTML
  return minify(html)
}

/**
 * Minify HTML
 * @param {string} string HTML input
 * @returns {Promise<string>} Minified HTML
 */
async function minify (string) {
  const transform = posthtml([htmlnano()])
  const { html } = await transform.process(string)
  return html
}
