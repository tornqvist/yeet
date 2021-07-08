import { html, use, mount, Component } from '../../index.js'
import './style.css'

mount(document.getElementById('app'), Component(App))

const Comments = Component(function Comments (state, emit) {
  const api = use(cache)

  return function * ({ id }) {
    const { error, data } = yield api(`/posts/${id}/comments`)

    if (error) return html`<p>Oops! Something went wrong.</p>`
    if (!data) return html`<p>Loading…</p>`
    return html`
      <ol>
        ${data.map((comment) => html`
          <li>
            <strong>${comment.name}:</strong> ${comment.body}
          </li>
        `)}
      </ol>
    `
  }
})

function Posts (state, emit) {
  const api = use(cache)
  let expanded

  return function * () {
    const { error, data } = yield api('/posts')

    if (error) return html`<p>Oops! Something went wrong.</p>`
    if (!data) return html`<p>Loading…</p>`
    return html`
      <ul>
        ${data.map(function (post) {
          return html`
            <li>
              <h2>${post.title}</h2>
              <p>${post.body}</p>
              ${expanded === post.id
                ? Comments({ id: post.id })
                : html`<button onclick=${onclick}>Show comments</button>`}
            </li>
          `

          function onclick (event) {
            expanded = post.id
            emit('render')
            event.preventDefault()
          }
        })}
      </ul>
    `
  }
}

function App () {
  use(cache)
  return function () {
    return html`
      <div id="app">
        <h1>Posts</h1>
        ${Component(Posts)}
      </div>
    `
  }
}

function cache (state, emitter) {
  if (!state.cache) state.cache = {}

  return function (uri) {
    if (uri in state.cache) return state.cache[uri]

    const url = `https://jsonplaceholder.typicode.com${uri}`
    const promise = window?.fetch(url).then(async function (body) {
      const data = await body.json()
      return { data }
    }, (error) => ({ error })).then(function (res) {
      state.cache[uri] = res
      emitter.emit('render')
      return res
    })

    // Only expose the promise while server side rendering
    return typeof window === 'undefined' ? promise : {}
  }
}
