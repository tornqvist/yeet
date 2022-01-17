import { html, render, Component } from '../../rewrite.js'

render(html`
  <div>
    <h1>Hello ${'world'}!</h1>
    ${Component(Counter)}
    ${Component(List)}
  </div>
`, document.getElementById('app'))

function List (state, emit) {
  const list = ['one', 'two', 'three']

  return function () {
    return html`
      <ul>${list.map((num) => Component(ListItem, { num }))}</ul>
      <button onclick=${onclick}>Reverse</button>
    `
  }

  function onclick () {
    list.reverse()
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
