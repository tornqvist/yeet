import { html, ref, mount, Component } from '../../index.js'

mount(Component(App), document.body)

function App (state, emit) {
  const input = ref()
  let name = 'World'

  return function () {
    return html`
      <h1>${html`Hello <strong>${name}</strong>!`}</h1>
      <input value="${name}" ref=${input}>
      <button onclick=${onclick}>Set name</button>
      ${Component(Counter)}
      ${Component(List)}
    `
  }

  function onclick () {
    name = input.current.value
    emit('render')
  }
}

function List (state, emit) {
  const list = ['one', 'two', 'three', 'four', 'five']

  return function () {
    return html`
      <ul>${list.map((num) => Component(ListItem, { num }))}</ul>
      <button onclick=${onclick}>Shuffle</button>
    `
  }

  function onclick () {
    list.sort(() => Math.random() - 0.5)
    emit('render')
  }
}

function ListItem () {
  let prev = null
  return function * ({ num }) {
    yield html`<li>${num} (${prev})</li>`
    prev = num
  }
}

function Output () {
  let prev = 'none'
  return function * ({ count }) {
    if (count % 2 === 0) yield new Promise((resolve) => setTimeout(resolve, 1000))
    yield html`Result: <output>${count} (${prev})</output>`
    prev = count
  }
}

function Counter (state, emit) {
  let count = 0

  return function () {
    return html`
      <div>
        ${Component(Output, { count })}<br>
        <button onclick=${onclick} value="${count + 1}">Increase</button>
        <button onclick=${onclick} value="${count - 1}" disabled=${count === 0}>Decrease</button>
      </div>
    `
  }

  function onclick () {
    count = +this.value
    emit('render')
  }
}
