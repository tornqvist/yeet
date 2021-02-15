import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, mount, Component } from '../../../index.js'

const api = suite('api')
const reuse = suite('reuse')

api('can mount', function () {
  const div = document.createElement('div')
  mount(Component(Main), div)
  assert.is(div.outerHTML, '<div>Hello world!</div>')

  function Main (state, emit) {
    return html`<div>Hello world!</div>`
  }
})

reuse('immediate child component', function () {
  const div = document.createElement('div')
  let init = 0

  mount(foo(), div)
  assert.is(div.textContent.trim(), '1')

  const child = div.firstElementChild

  mount(bar(), div)
  assert.is(div.textContent.trim(), '2')
  assert.is(div.firstElementChild, child)

  assert.is(init, 1)

  function Counter (state, emit) {
    init++
    let value = 0
    return function () {
      return html`<output>${++value}</output>`
    }
  }

  function foo () {
    return html`<div>${Component(Counter)}</div>`
  }

  function bar () {
    return html`<div>${Component(Counter)}</div>`
  }
})

reuse('nested child component', function () {
  const div = document.createElement('div')
  let init = 0

  mount(foo(), div)

  const parent = div.firstElementChild
  const counter = parent.firstElementChild
  assert.is(counter.textContent, '1')

  mount(bar(), div)

  assert.is(div.firstElementChild, parent)
  assert.is(div.firstElementChild.firstElementChild, counter)
  assert.is(counter.textContent, '2')

  assert.is(init, 2)

  function Parent () {
    init++
    return function () {
      return html`<div>${Component(Counter)}</div>`
    }
  }

  function Counter (state, emit) {
    init++
    let value = 0
    return function () {
      return html`<output>${++value}</output>`
    }
  }

  function foo () {
    return html`<div>${Component(Parent)}</div>`
  }

  function bar () {
    return html`<div>${Component(Parent)}</div>`
  }
})

reuse('not possible for unkeyed partial', function () {
  const div = document.createElement('div')
  let init = 0

  mount(foo(), div)

  const counter = div.firstElementChild.firstElementChild
  assert.is(counter.textContent, '1')

  mount(bar(), div)

  assert.is.not(div.firstElementChild.firstElementChild, counter)
  assert.is(div.firstElementChild.firstElementChild.textContent, '1')
  assert.is(init, 2)

  function Counter (state, emit) {
    init++
    let value = 0
    return function () {
      return html`<output>${++value}</output>`
    }
  }

  function foo () {
    return html`<div>${html`<div>${Component(Counter)}</div>`}</div>`
  }

  function bar () {
    return html`<div>${html`<div>${Component(Counter)}</div>`}</div>`
  }
})

api.run()
reuse.run()
