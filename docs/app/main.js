import { html, use, mount, Component } from 'yeet'
import { Router } from 'yeet-router'
import Page from './page/index.js'
import meta from './meta/store.js'
import { pages } from './pages.js'

export default mount(Component(Main), '#app')

function Main (state, emit) {
  use(meta)

  const router = use(Router)
  for (const [path, load] of Object.entries(pages)) {
    router.on(path, () => Component(Lazy, load))
  }

  return function () {
    return html`
      <nav>
        <ol>
          ${Object.keys(pages).map(function (path) {
            return html`<li><a href="${path}">${path}</a></li>`
          })}
        </ol>
      </nav>
      ${router.current}
    `
  }
}

function Lazy (state, emit) {
  let cached, prev
  return function * (loader) {
    if (prev && prev !== loader) cached = null
    const value = cached ?? (yield loader())
    yield Page({ key: value.body, ...value })
    if (!cached) cached = value
    prev = loader
  }
}
