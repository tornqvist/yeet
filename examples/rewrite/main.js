import { html, render, Component } from '../../rewrite.js'

render(html`
  <div>
    <h1>Hello ${'world'}!</h1>
    ${Component(Counter)}
    <ul>
      ${['one', 'two', 'three'].map((num) => html`<li>${num}</li>`)}
    </ul>
  </div>
`, document.getElementById('app'))

function Wrapper () {
  return function () {
    return Component(Test)
  }
}

function Test (state, emit) {
  return function * () {
    yield new Promise((resolve) => setTimeout(resolve, 2000))
    return html`<button onclick=${() => emit('render')}>Again</button>`
  }
}

function Output () {
  let prev = 'none'
  return function * ({ count }) {
    // if (count && count % 5 === 0) {
    //   yield new Promise((resolve) => setTimeout(resolve, 2000))
    // }
    // if (count % 2 === 0) return null
    if (count % 2 === 0) yield new Promise((resolve) => setTimeout(resolve, 2000))
    yield html`<output>${count} (${prev})</output>`
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
