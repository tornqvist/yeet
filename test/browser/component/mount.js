import { test } from 'uvu'
import * as assert from 'uvu/assert'
import { html, mount, Component } from '../../../index.js'

test('can mount', function () {
  const div = document.createElement('div')
  mount(Component(Main), div)
  assert.is(div.outerHTML, '<div>Hello world!</div>')

  function Main (state, emit) {
    return html`<div>Hello world!</div>`
  }
})

test('maintain state between mounts', function () {
  const div = document.createElement('div')
  let init = 0

  mount(foo(), div)
  assert.is(div.childElementCount, 1)
  assert.is(div.textContent.trim(), 'value: 1')

  const child = div.firstElementChild

  mount(bar(), div)
  assert.is(div.childElementCount, 1)
  assert.is(div.textContent.trim(), 'value: 2')
  assert.is(div.firstElementChild, child)

  assert.is(init, 1)

  function MyComponent (state, emit) {
    init++
    let value = 0
    return function () {
      return html`<output>value: ${++value}</output>`
    }
  }

  function foo () {
    return html`
      <div>
        ${Component(MyComponent)}
      </div>
    `
  }

  function bar () {
    return html`
      <div>
        ${Component(MyComponent)}
      </div>
    `
  }
})

test.run()
